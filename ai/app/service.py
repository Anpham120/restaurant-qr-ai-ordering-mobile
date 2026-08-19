# -*- coding: utf-8 -*-
"""Dịch vụ HTTP — lớp vỏ mỏng quanh phần đã đo được.

Vì sao tệp này là LỚP VỎ, không phải một tầng nữa
--------------------------------------------------
Mọi con số của dự án (122/122 tất định, 122/122 có mô hình, 0 lỗi an toàn) đo trên `understand`
→ `session` → `answer`. Nếu `service.py` thêm bất kỳ quyết định nào về nội dung câu trả lời thì
những con số đó **không còn nói về thứ khách nhận được**.

Nên tệp này chỉ làm bốn việc, và không việc nào chạm vào nội dung:

    1. xác thực token
    2. đọc bộ nhớ phiên từ payload  ->  gọi ba hàm đã có  ->  ghi bộ nhớ ra payload
    3. dịch `Reply` sang đúng tên trường backend đang đọc
    4. không bao giờ để một lỗi nội bộ thành 500 cho khách

Có một test đòi đúng điều đó: 5 câu chạy qua HTTP phải cho **cùng `text` và cùng `items`** với
khi gọi `respond()` trực tiếp.

Vì sao hợp đồng khách hàng không đổi
------------------------------------
Backend .NET đọc JSON của AI **hoàn toàn bằng `TryGetProperty`**, nên mọi trường đều optional.
Dịch vụ này trả **tập trường nhỏ hơn** với **đúng tên cũ** — không phá hợp đồng, không sửa
`ChatContracts.cs`, không sửa frontend.

Cố ý KHÔNG trả `accepted_menu_item_ids` và `added_to_cart_menu_item_ids`: backend đã bỏ qua chúng
(`ApplyAiSessionUpdates` ghi rõ hai trường đó thuộc backend). Không gửi thì ranh giới quyền rõ hơn
là gửi rồi bị bỏ — **AI đề xuất, khách xác nhận, backend quyết.**

Vì sao lỗi nội bộ KHÔNG được thành 500
--------------------------------------
Khách đang ngồi ở bàn và vừa gõ một câu. Trả 500 là khách thấy màn hình lỗi; trả câu "mình chưa
có dữ liệu, bạn hỏi nhân viên giúp nhé" là khách vẫn được phục vụ. Dự án đã mắc đúng lỗi này một
lần theo hướng ngược: `urllib.request.Request(...)` nằm ngoài khối `try` nên thiếu cấu hình là
**sập**, trong khi tài liệu khẳng định nó thoái hóa êm.

Bài học đã ghi: **khẳng định về hành vi khi lỗi thì phải có test cho đúng đường lỗi đó.** Nên ở
đây có test tiêm lỗi vào `respond()` và đòi HTTP 200 kèm câu chuyển nhân viên.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request as HttpRequest
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from answer import (STAFF_NOTE, Reply, doan_tri_thuc_lien_quan, ham_nong_truy_hoi,
                    load_facts, respond, trang_thai_truy_hoi)
from cart import CartError, build_cart, cart_payload
from generate import write_reply
from intent import CAM_ON, CHAO_HOI, NGOAI_PHAM_VI, cau_xac_nhan_da_bo
from llm_understand import enrich, load_env
from rag.chunker import all_chunks, load_all
from session import MEMORY_VERSION, SessionState, merge_into_request, session_updates, update_state
from understand import understand

APP_DIR = Path(__file__).resolve().parent
MENU_PATH = APP_DIR.parents[1] / "data" / "menu-dataset.json"
KNOWLEDGE_PATH = APP_DIR.parent / "knowledge"

SERVICE_VERSION = "rebuild-1"

# Câu trả lời khi có lỗi nội bộ. Cùng câu chữ với nhánh `no_data` của `answer.py`, để khách không
# phân biệt được "hệ thống lỗi" với "chưa có dữ liệu" — họ không cần phân biệt, và câu này giữ họ
# ở đúng đường tiếp theo là hỏi nhân viên.
FALLBACK_TEXT = f"Mình chưa có dữ liệu về việc này ạ. {STAFF_NOTE}"


class MenuCache:
    """Thực đơn nạp một lần, nạp lại khi admin sửa món.

    Là một lớp chứ không phải biến toàn cục để `/v1/cache/invalidate` có chỗ bám và test có chỗ
    thay. Nạp thất bại thì `items` rỗng — và `/ready` sẽ báo chưa sẵn sàng, thay vì dịch vụ nhận
    lưu lượng rồi trả lời sai.
    """

    def __init__(self) -> None:
        self.items: list[dict] = []
        # Bảng tra `cat_vegetarian` -> "Món chay", cho câu lý do của thẻ giỏ. Là BẢNG TRA TÊN,
        # không phải danh sách món, nên nó không mở lại đường lọc thứ hai.
        self.category_names: dict[str, str] = {}
        self.loaded_at: float | None = None
        self.error: str | None = None
        self.reload()

    def reload(self) -> None:
        try:
            data = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
            self.items = data["items"]
            self.category_names = {c["categoryId"]: c["name"] for c in data.get("categories", [])}
            self.loaded_at = time.time()
            self.error = None
        except (OSError, ValueError, KeyError) as exc:
            self.items = []
            self.category_names = {}
            # TÊN LOẠI ra ngoài, CHI TIẾT vào log.
            #
            # `self.error` đi vào `/ready.menu_error`, và `/ready` KHÔNG đòi token — bất kỳ ai tới
            # được cổng 8001 đều đọc được. Phần `{exc}` của `OSError` chứa ĐƯỜNG DẪN TỆP trên máy
            # chủ, nên chuỗi đầy đủ là rò rỉ thật. CodeQL báo đúng.
            #
            # Không bỏ trường đi: mất trường là mất khả năng chẩn đoán, và `/v1/cache/invalidate` trả
            # số món SAU khi nạp chính vì "trả {ok: true} thì một lần nạp thất bại nhìn giống một lần
            # thành công". Tên loại đủ để phân biệt `FileNotFoundError` với `JSONDecodeError` với
            # `KeyError` — tức đủ để biết phải sửa gì — mà không mang đường dẫn nào.
            self.error = type(exc).__name__
            print(f"[menu] nạp thất bại: {type(exc).__name__}: {exc}", flush=True)


MENU = MenuCache()

# Chỉ mục truy hồi toàn kho, dựng NGAY lúc nạp module — không để khách đầu tiên trả giá.
#
# Đặt ở mức module chứ không trong một `startup` hook để nó cũng chạy khi test import `service`:
# một chỉ mục chỉ được hâm nóng ở đường chạy thật mà không ở đường test là một chỗ hai đường lệch
# nhau, và lệch ở đúng phần đắt nhất.
try:
    RETRIEVER_NAME = ham_nong_truy_hoi()
except Exception as exc:  # noqa: BLE001 — kho hỏng KHÔNG được làm dịch vụ không khởi động được
    RETRIEVER_NAME = f"lỗi: {type(exc).__name__}"


def _knowledge_counts() -> tuple[int, int]:
    """(số tài liệu, số đoạn). Dùng cho `/ready`, và lỗi ở đây không được làm `/ready` sập."""
    try:
        docs = load_all(KNOWLEDGE_PATH)
        return len(docs), len(all_chunks(KNOWLEDGE_PATH))
    except Exception:  # noqa: BLE001 — `/ready` phải trả lời được cả khi kho tri thức hỏng
        return 0, 0


def require_token(
    x_internal_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> None:
    """Xác thực token nội bộ. Nhận HAI cách gửi, vì bên gọi thật dùng cách thứ hai.

        Authorization: Bearer <token>    backend .NET gửi thế này
                                         (`ChatAiProvider.TryAddInternalAuthorization`)
        X-Internal-Token: <token>        hợp đồng dịch vụ, dùng bởi test và công cụ nội bộ

    Bản đầu chỉ đọc `X-Internal-Token`, nên mọi lượt chat từ backend nhận **401** và khách thấy
    "Xin lỗi, hệ thống hơi chậm". Không test nào bắt được — mọi test đều tự gửi
    `X-Internal-Token`, tức chúng kiểm hợp đồng tôi TƯỞNG, không kiểm hợp đồng bên gọi DÙNG.

    Đây là lỗi tích hợp thứ ba cùng một lớp trong lần chạy thật này (`message` vs `question`, hình
    dạng `session_state`, và header token). Bài học chung: **hợp đồng do BÊN GỌI định, không do
    bên nhận định** — và cách duy nhất biết bên gọi gửi gì là đọc mã của nó hoặc chạy thật.

    Token trống trong môi trường thì TỪ CHỐI mọi yêu cầu (503), không cho qua. Cấu hình thiếu mà
    mở cửa là cách một dịch vụ nội bộ thành công khai mà không ai biết.
    """
    expected = os.environ.get("AI_INTERNAL_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="AI_INTERNAL_TOKEN chưa được cấu hình")

    supplied = x_internal_token
    if supplied is None and authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer":
            supplied = value.strip()

    if supplied != expected:
        raise HTTPException(status_code=401, detail="token không hợp lệ")


class ChatTurnIn(BaseModel):
    """Một lượt. Dịch vụ chỉ DÙNG ba thứ, nhưng phải NHẬN được hình dạng backend gửi.

    `ChatRequestV2Payload` của backend có 24 trường, trong đó `promotions`, `orders`,
    `catalog_version` hiện luôn rỗng. Dịch vụ **bỏ qua** phần không dùng thay vì từ chối, vì
    backend là bên gọi và hợp đồng gọi do bên gọi định — bắt backend đổi tên trường để khớp dịch
    vụ mới là phá hợp đồng khách hàng, đúng thứ bản dựng lại cam kết không làm.

    Trường câu hỏi nhận CẢ HAI tên:

        message     backend .NET gửi tên này (`ChatRequestV2Payload.Message`, snake_case)
        question    tên của hợp đồng dịch vụ, dùng bởi test và công cụ nội bộ

    Bản đầu chỉ nhận `question`, nên backend gọi thật bị **422** — và không test nào bắt được vì
    mọi test đều tự gửi `question`. Chỉ chạy thật mới thấy.
    """

    model_config = {"populate_by_name": True, "extra": "ignore"}

    # `alias="message"` để backend gửi `message` là khớp; `question` vẫn dùng được nhờ
    # `populate_by_name`.
    question: str = Field(min_length=1, max_length=2000, alias="message")
    session_state: dict[str, Any] | None = None
    use_model: bool = True
    # Bật/tắt đường SINH riêng với đường HIỂU. Hai việc khác nhau và rủi ro khác nhau:
    #
    #   use_model      mô hình đọc câu hỏi thành nhãn. Nó không viết chữ, nên nó không bịa được.
    #   use_generation mô hình VIẾT chữ cho khách. Bảo đảm "không bịa" chuyển sang lớp xác minh.
    #
    # `None` nghĩa là "bên gọi không nói", và lúc đó biến môi trường `AI_ENABLE_GENERATION` quyết.
    #
    # Vì sao cần cả hai đường: backend .NET KHÔNG gửi trường này (`ChatRequestV2Payload` không có
    # nó), nên nếu chỉ có trường payload thì đường sinh không bao giờ bật được qua backend — tức
    # khả năng đó không đo được đầu-cuối, và một khả năng không đo được thì không đáng có.
    #
    # Mặc định TẮT ở cả hai đường. Đó là chủ ý, và lý do là một CON SỐ: đo trên mô hình thật, đường
    # sinh mất khoảng 40 giây mỗi lượt. Với khách đang ngồi ở bàn thì đó là không dùng được. Nên
    # đường sinh là thứ phải BẬT tường minh sau khi ai đó xem con số đó và chấp nhận nó.
    use_generation: bool | None = None

    # Backend gửi danh sách món KHÔNG được gợi ý lại (nó tự quản `GetExcludedMenuItemIds`). Nhận
    # để tôn trọng, thay vì bỏ qua rồi gợi lại đúng món khách vừa từ chối.
    excluded_menu_item_ids: list[str] = Field(default_factory=list)


app = FastAPI(title="AI tư vấn đặt món", version=SERVICE_VERSION)


@app.get("/health")
def health() -> dict[str, Any]:
    """Sống chưa. KHÔNG kiểm dữ liệu — đó là việc của `/ready`.

    Trộn hai thứ này là lỗi thường gặp: nếu `/health` cũng kiểm dữ liệu thì một lỗi dữ liệu sẽ
    làm orchestrator khởi động lại container, mà khởi động lại không sửa được lỗi dữ liệu.
    """
    return {"ok": True, "service": "ai", "version": SERVICE_VERSION}


@app.get("/ready")
def ready() -> dict[str, Any]:
    """Đã nạp xong dữ liệu chưa, và nạp được bao nhiêu.

    Báo **con số**, không chỉ `true/false`. Một dịch vụ trả `ready: true` với 0 món trong thực đơn
    là dịch vụ sẽ trả lời sai mọi câu — và đó đúng là lỗi đã xảy ra ở bản cũ theo dạng khác: kho
    tri thức nằm ngoài phạm vi `COPY` của Dockerfile nên trong container mọi chủ đề chính sách
    trả "chưa có dữ liệu", im lặng.
    """
    docs, chunks = _knowledge_counts()
    facts = load_facts()
    env = load_env()
    ok = bool(MENU.items) and bool(facts)
    return {
        "ready": ok,
        "menu_items": len(MENU.items),
        "menu_error": MENU.error,
        "knowledge_docs": docs,
        "knowledge_chunks": chunks,
        "verbatim_topics": len(facts),
        "model": env.get("LLM_MODEL") or None,
        # PHẢI gồm cả khóa. Bản trước chỉ kiểm URL và tên mô hình, nên container chạy với
        # `LLM_API_KEY=` rỗng vẫn báo `model_configured: true` — và một phép đo đầu-cuối đã bị kết
        # luận là "có mô hình thật" trong khi mọi lượt đi đường tất định.
        #
        # Ba trường riêng thay vì một cờ: khi nó báo `false` thì phải biết THIẾU CÁI GÌ, nếu không
        # thì người vận hành đọc `false` rồi vẫn phải mở container ra xem.
        "model_configured": bool(
            env.get("LLM_BASE_URL") and env.get("LLM_MODEL") and env.get("LLM_API_KEY")
        ),
        "model_base_url_set": bool(env.get("LLM_BASE_URL")),
        "model_key_set": bool(env.get("LLM_API_KEY")),
        # Trạng thái tầng truy hồi ĐANG chạy, không phải phương pháp tốt nhất đã đo.
        #
        # Ba trường, không phải một, và trường thứ ba có mặt vì một lỗi IM LẶNG đã xảy ra thật:
        #
        #   retriever                     bộ đang chạy. Embedding thắng ở cả hai bài toán và cả hai
        #                                 tập niêm phong, nên nay nó là bộ trong production.
        #   retriever_chunks              số đoạn trong chỉ mục. Đối chiếu với con số mà
        #                                 `python -m rag.precompute` in lúc build: hai số lệch nhau
        #                                 nghĩa là đệm vector KHÔNG khớp.
        #   retriever_vectors_from_cache  đệm có được dùng hay không. `False` ở đây nghĩa là container
        #                                 mã hóa lại 370 đoạn mỗi lần khởi động — hệ thống vẫn ĐÚNG,
        #                                 chỉ mất thêm ~60 giây, và không log nào nói gì. Đã mất một
        #                                 vòng đo để tìm ra, nên nó phải đọc được từ ngoài.
        #
        # Một hệ thống âm thầm chạy bản kém hơn bản đã đo là hệ thống mà báo cáo và thực tế nói hai
        # chuyện khác nhau.
        **trang_thai_truy_hoi(),
        # Đường sinh đang bật hay tắt. Có mặt vì hai cấu hình cho hai hành vi rất khác nhau — một
        # bên câu trả lời do khuôn mẫu dựng, một bên do mô hình viết — và người đọc `/ready` phải
        # biết mình đang xem cái nào.
        "generation_enabled": _bat_duong_sinh(None),
        "memory_version": MEMORY_VERSION,
    }


def _y_dinh_duoi_dai(merged):
    """Hỏi mô hình về ý định, CHỈ với câu mà mọi cơ chế tất định đều không nhận ra.

    Trả về `Request` mới nếu mô hình đọc được ý định xã giao; ngược lại trả nguyên bản.

    Vì sao điều kiện phải hẹp đến thế: mỗi lần gọi tốn ~8,6 giây. Gọi cho mọi lượt là bắt khách chờ
    8 giây để nghe một lời chào, và bắt cả những lượt mã tất định đã trả lời đúng phải chờ theo.

    Vì sao lớp này KHÔNG gán nhãn lọc: 14 tín hiệu `already_understood` của `llm_understand` tồn tại
    vì mỗi cái tương ứng một ca đỏ thật khi mô hình được giao việc gán nhãn. Ở đây mô hình chỉ được
    nói khách đang LÀM GÌ.
    """
    from dataclasses import replace as _replace

    from intent import HOI_MON, XOA_RANG_BUOC, doc_y_dinh_bang_mo_hinh

    if merged.y_dinh != HOI_MON:
        return merged
    # Câu đã có ràng buộc thì nhánh lọc lo được — không hỏi mô hình.
    if (
        merged.require_tags or merged.prefer_tags or merged.avoid_tags or merged.categories
        or merged.named_items or merged.policy_topic or merged.knowledge_topic
        or merged.budget_max is not None or merged.off_topic or merged.asks_price
        or merged.asks_extreme is not None or merged.is_comparison or merged.asks_suggestion
    ):
        return merged

    y = doc_y_dinh_bang_mo_hinh(merged.text, load_env(), use_cache=True)
    if y.ten == HOI_MON or y.nguon != "mo_hinh":
        return merged
    # Mô hình KHÔNG được tự bỏ ràng buộc dị nguyên. Đó là chốt an toàn quan trọng nhất của bộ nhớ
    # phiên, và một mô hình đọc nhầm phủ định sẽ hạ nó xuống mà không ai thấy. Đường tất định (danh
    # sách cụm rõ ràng) vẫn là đường DUY NHẤT bỏ được dị nguyên.
    if y.ten == XOA_RANG_BUOC:
        return merged
    return _replace(merged, y_dinh=y.ten)


def _run_turn(turn: ChatTurnIn) -> dict[str, Any]:
    """Một lượt trọn vẹn. Đây là chỗ DUY NHẤT trong tệp này gọi vào phần đã đo được.

    Thứ tự cố định: hiểu → hợp nhất bộ nhớ → (mô hình đọc thêm) → trả lời → ghi bộ nhớ.

    Mô hình chạy SAU khi hợp nhất bộ nhớ, không phải trước. Nếu chạy trước thì nó thấy một yêu
    cầu thiếu ràng buộc đã nhớ, và nó có thể "bổ sung" lại chính cái vừa bị bỏ — tức bộ nhớ mất
    tác dụng theo một đường rất khó thấy.
    """
    state = SessionState.from_payload(turn.session_state)
    merged = merge_into_request(understand(turn.question, MENU.items), state)

    # Món backend nói đừng gợi lại. Cộng vào bộ nhớ chứ không lọc riêng, để chỉ có MỘT chỗ quyết
    # định "món nào đã xem" — hai chỗ sẽ lệch nhau.
    if turn.excluded_menu_item_ids:
        state.suggested_item_ids = list(
            dict.fromkeys([*turn.excluded_menu_item_ids, *state.suggested_item_ids])
        )

    outcome = None
    # Lượt XÃ GIAO không gọi mô hình.
    #
    # `understand()` đã nhận ra "xin chào" bằng danh sách cụm, và `respond()` trả câu chào có sẵn —
    # nên lần gọi mô hình ở đây không đổi được gì. Nhưng nó vẫn tốn: đo trên staging, một lời chào
    # mất **5,0 giây**, và khách nhìn màn hình chờ 5 giây để nghe "Dạ em chào anh/chị".
    #
    # `enrich()` gọi mô hình khi mã tất định chưa rút được ràng buộc nào — và một lời chào thì đúng
    # là không có ràng buộc nào, nên nó rơi thẳng vào điều kiện đó. Đây là chỗ điều kiện "chưa hiểu
    # gì" và "không có gì để hiểu" trùng hình dạng mà khác hẳn ý nghĩa.
    _xa_giao = merged.y_dinh in (CHAO_HOI, CAM_ON, NGOAI_PHAM_VI)
    if turn.use_model and not _xa_giao:
        # Không bọc `try` ở đây: `enrich()` tự thoái hóa êm và trả `LlmOutcome` kể cả khi gọi
        # thất bại. Bọc thêm một lớp `try` sẽ che mất lý do thất bại khỏi `decision.model`.
        outcome = enrich(merged, load_env(), use_cache=True)

        # ĐUÔI DÀI của lớp ý định. Chỉ hỏi mô hình khi danh sách cụm không nhận ra VÀ mã tất định
        # cũng không rút được ràng buộc nào — tức đúng những câu sắp bị trả lời bằng một đoạn tri
        # thức gần nhất ("nhà hàng đông không bạn").
        #
        # Điều kiện hẹp là điều làm lớp này dùng được: câu đã hiểu không tốn thêm giây nào, nên độ
        # trễ 8,6s chỉ rơi vào phần đuôi. Và mô hình ở đây KHÔNG được gán nhãn lọc, nên nó không lặp
        # lại được lớp lỗi đã làm 14 tín hiệu `already_understood` phải tồn tại.
        merged = _y_dinh_duoi_dai(merged)

    reply = respond(merged, MENU.items)

    # Thẻ giỏ sinh từ ĐÚNG danh sách món `respond()` đã chọn, không lọc lại. `cart.build_cart`
    # cố tình không nhận thực đơn nên nó không thể trở thành đường chọn món thứ hai.
    #
    # `CartError` nghĩa là lọc fail-closed đã hỏng — món mang nhãn cần tránh lọt qua
    # `answer.select()`. Không bắt nó ở đây: để nó nổi lên `chat()` và thành `internal_error`,
    # tức khách nhận câu chuyển nhân viên chứ KHÔNG nhận thẻ giỏ chứa món gây dị ứng.
    by_id = {m["id"]: m for m in MENU.items}
    chosen = [by_id[i] for i in reply.items if i in by_id]
    cart = build_cart(merged, chosen, reply.branch, reply.kind, MENU.category_names)

    # ĐƯỜNG SINH — mô hình viết lại CHỮ, không đổi món.
    #
    # Thứ tự ở đây là điều quan trọng nhất của cả khâu: `reply.items`, `cart`, và `new_state` đã
    # được tính TRƯỚC khi mô hình được gọi, và chúng KHÔNG bị ghi lại sau đó. Nên dù mô hình viết
    # gì, khách vẫn chỉ đặt được đúng những món bộ lọc đã chọn, và bộ nhớ phiên vẫn ghi đúng danh
    # sách đó.
    #
    # Chỉ chữ đổi. Đó là ranh giới làm cho việc bật đường sinh có thể chấp nhận được.
    gen = None
    if _bat_duong_sinh(turn.use_generation):
        # Món khách ĐÃ xem ở lượt trước — để câu sinh mở đúng cách thay vì giới thiệu lại như mới.
        #
        # Lấy từ `state` (bộ nhớ TRƯỚC lượt này), không từ `new_state`: cái sau đã gồm món của chính
        # lượt này, và đưa nó vào là bảo mô hình "đừng nhắc lại" đúng những món nó đang phải nhắc.
        _theo_id = {i["id"]: i for i in MENU.items}
        _da_neu = [_theo_id[i] for i in state.last_listed_ids if i in _theo_id]
        gen = write_reply(
            merged, chosen, MENU.items, reply.branch, load_env(),
            knowledge=_tri_thuc_kem(merged),
            da_neu_truoc=_da_neu,
        )
        if gen.text:
            # Câu XÁC NHẬN đã bỏ ràng buộc phải SỐNG QUA đường sinh.
            #
            # `answer.respond()` ghép câu đó vào đầu bản khuôn mẫu, rồi dòng dưới THAY toàn bộ
            # `text` bằng câu sinh — nên bật đường sinh làm biến mất đúng câu ấy. Đo được trên
            # staging ngay lượt đầu:
            #
            #     tắt sinh:  "Dạ em đã bỏ điều kiện 2–3 người theo yêu cầu của anh/chị. Mời bạn…"
            #     bật sinh:  "Nếu muốn món ăn nhẹ kiểu Sài Gòn, Bánh mì pate…"     <- MẤT
            #
            # Đây không phải chuyện văn phong. Toàn bộ lý do câu xác nhận tồn tại là: hạ một hàng
            # rào an toàn thì khách phải THẤY nó được hạ, để sửa được nếu hệ thống hiểu sai. Mất nó
            # là quay về "im lặng bỏ ràng buộc" — thứ mà cả cơ chế xóa ràng buộc được thiết kế để
            # tránh.
            #
            # Ghép ở đây chứ không nhờ mô hình viết: một câu bảo đảm an toàn không được phụ thuộc
            # vào việc mô hình có chịu viết nó hay không. Cùng nguyên tắc với `verify()` —
            # **prompt là lời nhờ, mã mới là bảo đảm.**
            _xac_nhan = cau_xac_nhan_da_bo(list(getattr(merged, "da_bo_rang_buoc", ()) or ()))
            reply = replace(reply, text=_xac_nhan + gen.text, branch=f"{reply.branch}+gen")
            # THU HẸP thẻ giỏ về những món câu sinh THẬT SỰ nêu.
            #
            # Thẻ giỏ dựng từ 6 món bộ lọc chọn, còn văn xuôi nêu 2–3 món. Nên khách đọc về 2 món
            # rồi thấy 3 thẻ cho món khác — golden 103 lượt bắt được 36 lượt vì đúng lý do này, và
            # nó là bất biến "thẻ giỏ phải là món vừa tư vấn" đang làm việc.
            #
            # Phép GIAO, không phải phép thay: tập nguồn vẫn là `chosen`, nên mô hình KHÔNG thêm
            # được món nào vào giỏ — nó chỉ bỏ bớt. Bảo đảm "giỏ chỉ chứa món bộ lọc đã chọn" giữ
            # nguyên, và mọi thẻ còn lại là món khách vừa đọc.
            #
            # Rỗng thì để rỗng: một câu sinh không nêu món nào thì không có gì để khách bấm, và một
            # thẻ giỏ cho món khách chưa đọc tệ hơn không có thẻ.
            neu_ten = [m for m in chosen if m["name"] in gen.text]
            cart = [a for a in cart if a.menu_item_id in {m["id"] for m in neu_ten}]

    new_state = update_state(state, merged, reply.items, reply.kind, reply.branch)
    return _to_payload(reply, new_state, outcome, cart, gen)


def _bat_duong_sinh(yeu_cau: bool | None) -> bool:
    """Bên gọi nói gì thì theo; không nói thì theo `AI_ENABLE_GENERATION`. Mặc định TẮT.

    Đọc biến môi trường ở MỖI lượt chứ không đọc một lần lúc nạp module: đọc một lần thì đổi công
    tắc phải khởi động lại dịch vụ, và với một khả năng đang được đánh giá thì bật/tắt phải nhanh.
    Chi phí một lần đọc `os.environ` không đáng kể cạnh 40 giây gọi mô hình.
    """
    if yeu_cau is not None:
        return yeu_cau
    return os.environ.get("AI_ENABLE_GENERATION", "").strip().lower() in ("1", "true", "yes")


def _tri_thuc_kem(merged: Any) -> str:
    """Đoạn tri thức liên quan, để câu sinh nêu lý do dựa trên tri thức nhà hàng chứ không tự nghĩ.

    Đây là chỗ RAG gặp LLM: đoạn được truy hồi trở thành ngữ cảnh cho câu sinh. Không có nó thì mô
    hình chỉ có danh sách món và nó sẽ tự nghĩ ra lý do — đúng chỗ dễ bịa nhất.

    Trả chuỗi rỗng khi không tra được. Rỗng thì câu sinh vẫn viết được từ danh sách món; nó chỉ nêu
    lý do nhạt hơn, và đó là thoái hóa êm chứ không phải lỗi.
    """
    try:
        tim = doan_tri_thuc_lien_quan(merged.text)
    except Exception:  # noqa: BLE001 - truy hồi hỏng KHÔNG được làm sập luồng trả lời khách
        return ""
    return tim[0] if tim else ""


def _to_payload(
    reply: Reply, state: SessionState, outcome: Any, cart: list[Any] | None = None,
    gen: Any = None,
) -> dict[str, Any]:
    """Dịch `Reply` sang đúng tên trường backend đang đọc. Không quyết định gì về nội dung."""
    return {
        "ok": True,
        "provider_available": True,
        "content": reply.text,
        "suggested_cart_actions": cart_payload(cart or []),
        "guardrail_flags": _flags(reply, state),
        "suggest_staff_handoff": reply.kind in ("no_data", "refuse") or bool(state.avoid_tags),
        "session_updates": {
            **session_updates(state, reply.items),
            "session_state": state.to_payload(),
        },
        "decision": {
            "kind": reply.kind,
            "branch": reply.branch,
            "asks_back": reply.asks_back,
            # Kết quả đường SINH, cho người vận hành. `violations` là chi tiết KỸ THUẬT nên nó
            # ở đây chứ không bao giờ vào `content` — cùng nguyên tắc với `decision.error`.
            "generation": None if gen is None else {
                "called": gen.called,
                "used": bool(gen.text),
                "reason": gen.reason,
                "violations": gen.violations,
                "used_item_ids": gen.used,
            },
            "model": None if outcome is None else {
                "used": outcome.used,
                "ok": outcome.ok,
                "reason": outcome.reason,
                "latency_ms": outcome.latency_ms,
                "added_require": outcome.added_require,
                "added_prefer": outcome.added_prefer,
                "added_avoid": outcome.added_avoid,
                "dropped": outcome.dropped,
            },
        },
    }


def _flags(reply: Reply, state: SessionState) -> list[str]:
    """Cờ cho backend ghi log. Sinh từ trạng thái thật, không phải từ ý định."""
    flags: list[str] = []
    if state.avoid_tags:
        flags.append("allergen_filter_applied")
    if reply.kind == "no_data":
        flags.append("no_data")
    if reply.kind == "refuse":
        flags.append("out_of_scope")

    # Gắn cờ theo `kind`, KHÔNG theo `asks_back` — và đây là chỗ tôi đã lặp lại đúng một lỗi cũ
    # của dự án trước khi chạy thật phát hiện ra.
    #
    # `asks_back` bật ở HAI trường hợp khác nhau: nhánh `clarify` (chưa hiểu câu hỏi, phải hỏi
    # lại) và nhánh `filter` (đã liệt kê món RỒI MỜI THÊM). Gộp hai thứ đó lại thì câu "Món nào
    # không cay?" — trả 6 món kèm 3 thẻ giỏ — bị gắn cờ là câu hỏi lại.
    #
    # Bản cũ mắc đúng lỗi này ở THƯỚC ĐO: "tỷ lệ hỏi lại đọc ra 43% vì câu trả lời liệt kê món
    # rồi mời thêm bị tính là hỏi lại". Nó đã được sửa ở bước 3, và tôi mang nó trở lại trong
    # phần cờ log — nơi hậu quả giống hệt: người vận hành đọc log sẽ thấy một con số sai.
    if reply.kind == "clarify":
        flags.append("asked_clarifying_question")
    return flags


@app.post("/v1/chat", dependencies=[Depends(require_token)])
def chat(turn: ChatTurnIn) -> dict[str, Any]:
    """Trả lời một lượt.

    Bắt `Exception` rộng là CÓ CHỦ Ý ở đây, và chỉ ở đây. Khách đang ngồi ở bàn: trả 500 là họ
    thấy màn hình lỗi, còn trả câu chuyển nhân viên là họ vẫn được phục vụ. Lý do thật nằm trong
    `decision.error` để người vận hành đọc log, không nằm trong câu khách thấy.
    """
    try:
        return _run_turn(turn)
    except Exception as exc:  # noqa: BLE001 — xem docstring
        # TÊN LOẠI + MÃ THAM CHIẾU ra ngoài, CHI TIẾT đầy đủ vào log.
        #
        # Chỗ này khác `/ready` ở mức nguy hiểm: nó đòi token nội bộ, và backend KHÔNG chuyển tiếp
        # `decision` cho khách (`SendChatMessageResponse` không có trường đó). Nên chi tiết chỉ tới
        # một bên gọi đã xác thực.
        #
        # Vẫn sửa, vì "chỉ tới bên đã xác thực" là một lớp bảo vệ dựa vào cấu hình, không dựa vào cấu
        # trúc: `AI_INTERNAL_TOKEN` bị đặt sai hay backend bị đổi để chuyển tiếp `decision` thì rò rỉ
        # ngay, và không phép kiểm nào đỏ. Mã tham chiếu bỏ được cả đường đó mà không mất gì:
        # người vận hành tra mã trong log của dịch vụ AI và thấy nguyên vẹn chi tiết.
        #
        # Điều KHÔNG đổi, và nó là cam kết cũ của dự án: chi tiết lỗi không bao giờ vào `content` —
        # khách vẫn nhận đúng câu "mình chưa có dữ liệu, bạn hỏi nhân viên giúp nhé".
        ma = uuid.uuid4().hex[:8]
        print(f"[chat] lỗi nội bộ ref={ma}: {type(exc).__name__}: {exc}", flush=True)
        return {
            "ok": False,
            "provider_available": False,
            "content": FALLBACK_TEXT,
            "suggested_cart_actions": [],
            "guardrail_flags": ["internal_error"],
            "suggest_staff_handoff": True,
            "session_updates": {},
            "decision": {"kind": "no_data", "branch": "internal_error",
                         "error": f"{type(exc).__name__} ref={ma}"},
        }


@app.post("/v1/chat/stream", dependencies=[Depends(require_token)])
def chat_stream(turn: ChatTurnIn) -> StreamingResponse:
    """Cùng nội dung với `/v1/chat`, phát dạng SSE.

    Câu trả lời được tính **trọn vẹn trước** rồi mới phát ra từng đoạn. Không phải streaming thật,
    và nói rõ ở đây thay vì để người đọc mã tự đoán: câu trả lời là kết quả của phép lọc tất định
    nên nó có sẵn ngay, không có gì để streaming dần. Endpoint này tồn tại vì frontend đã gọi nó.

    Phát theo TỪ, không theo ký tự — tiếng Việt có dấu tổ hợp nên cắt giữa ký tự sẽ hiện ra ô
    vuông trên màn hình khách.

    KHUNG SSE PHẢI CÓ DÒNG `event:`, và tên khung do BÊN GỌI định
    ------------------------------------------------------------
    Bản đầu phát `data: {"delta": ...}` rồi `data: {"done": true, ...}`, **không có dòng `event:`**.
    Backend đọc SSE ở `ChatAiProvider.GenerateStreamAsync` và nó bỏ qua mọi dòng `data:` khi chưa
    thấy dòng `event:` (`string.IsNullOrWhiteSpace(eventName)` → `continue`). Nên **toàn bộ stream bị
    hủy**, `finalPayload` là null, và khách nhận "Xin lỗi, hệ thống hơi chậm."

    Hậu quả không nhỏ: `ChatbotPage.tsx` gọi `sendMessageStream` TRƯỚC rồi mới lùi về `sendMessage`,
    nên đây là đường CHÍNH của khách. Mọi câu trả lời thật đi qua dịch vụ AI đều thành câu xin lỗi.

    Không test nào bắt được, vì cả hai bên đều tự nhất quán với chính mình:
      * `test_service.py` kiểm stream phát cùng nội dung với `/v1/chat` — đúng, theo khung TỰ ĐỊNH.
      * `ChatAiProviderV2ContractTests` kiểm bộ đọc của backend — đúng, theo khung backend chờ.
    Hai khung khác nhau, và không tập nào nối hai bên lại. Golden test đầu-cuối là chỗ bắt được.

    Đây đúng bài học đã ghi ở `require_token` phía trên: **hợp đồng do BÊN GỌI định, không do bên
    nhận.** Nên sửa ở đây, không sửa bộ đọc của backend.

    Ba tên khung backend hiểu: `token` (có `data.text`), `final` (cả payload), `done`.
    """
    payload = chat(turn)

    def stream():
        for word in str(payload["content"]).split(" "):
            yield f"event: token\ndata: {json.dumps({'text': word + ' '}, ensure_ascii=False)}\n\n"
        yield f"event: final\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        yield 'event: done\ndata: {"ok": true}\n\n'

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/v1/cache/invalidate", dependencies=[Depends(require_token)])
def invalidate() -> dict[str, Any]:
    """Nạp lại thực đơn sau khi admin sửa món.

    Trả về số món SAU khi nạp, để người gọi biết việc nạp có thật sự thành công — trả `{"ok": true}`
    thì một lần nạp thất bại nhìn giống một lần nạp thành công.
    """
    MENU.reload()
    return {"ok": MENU.error is None, "menu_items": len(MENU.items), "error": MENU.error}


@app.post("/v1/model-check", dependencies=[Depends(require_token)])
def model_check() -> dict[str, Any]:
    """Mô hình có GỌI ĐƯỢC không — bằng một lần gọi THẬT, không bằng cách đọc lại cấu hình.

    Vì sao cần một endpoint riêng thay vì một trường trong `/ready`
    ---------------------------------------------------------------
    `/ready` báo `model_configured: true` khi có đủ URL, tên mô hình và khóa. Ba thứ đó là **đã cấu
    hình**, không phải **gọi được** — và khoảng cách giữa hai điều đó vừa nuốt trọn một tính năng:

        staging  0,5–1,0s, câu khuôn mẫu     mọi lần gọi mô hình thất bại rồi âm thầm rơi về tất định
        cục bộ   5,5–9,6s, câu sinh tự nhiên  cùng mã, cùng câu hỏi

    `LLM_BASE_URL` của staging trỏ vào `http://127.0.0.1:20128/v1` — một dịch vụ trên chính VPS. Nó
    không chạy, và **không có gì báo**: `/ready` vẫn xanh, health check vẫn xanh, golden vẫn 103/103
    (golden chạy được không cần mô hình, có chủ ý). Đúng lớp thoái hóa im lặng mà cả dự án chống, và
    lần này nó nằm trong chính `/ready`.

    Vì sao KHÔNG nhét phép gọi này vào `/ready`: `/ready` bị healthcheck của Docker gọi mỗi 30 giây.
    Một lần gọi mô hình tốn 5–9 giây, nên làm vậy là tự tạo tải và tự làm chậm chính phép kiểm sống.

    Nên nó là một endpoint RIÊNG, gọi MỘT lần lúc deploy. Có token vì nó tiêu tiền mô hình.
    """
    env = load_env()
    if not (env.get("LLM_BASE_URL") and env.get("LLM_MODEL") and env.get("LLM_API_KEY")):
        return {"ok": False, "configured": False, "reason": "thiếu LLM_BASE_URL/LLM_MODEL/LLM_API_KEY"}

    # Dùng đúng đường gọi mà hệ thống thật dùng, và TẮT cache: cache trả lời được thì phép kiểm này
    # xanh trong khi mạng đứt — tức nó kiểm cache, không kiểm mô hình.
    from llm_understand import call_model

    bat_dau = time.time()
    try:
        parsed = call_model("Mình dị ứng hải sản", env, use_cache=False)
    except Exception as exc:  # noqa: BLE001 — phép kiểm KHÔNG được làm sập dịch vụ
        return {"ok": False, "configured": True, "reason": f"{type(exc).__name__}",
                "latency_ms": int((time.time() - bat_dau) * 1000)}

    ms = int((time.time() - bat_dau) * 1000)
    if parsed is None:
        return {"ok": False, "configured": True, "latency_ms": ms,
                "reason": "gọi thất bại hoặc trả về thứ không phân tích được",
                "base_url_set": bool(env.get("LLM_BASE_URL"))}
    return {"ok": True, "configured": True, "latency_ms": ms, "model": env.get("LLM_MODEL")}
