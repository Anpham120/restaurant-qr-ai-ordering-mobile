# -*- coding: utf-8 -*-
"""Golden test đầu-cuối: hỏi như khách thật, qua ĐỦ chuỗi gọi.

    quét QR -> phiên bàn -> phiên chat -> backend .NET -> dịch vụ AI -> mô hình
    -> câu trả lời -> thẻ giỏ gợi ý -> giỏ hàng thật

Ba tập kia dừng ở các chặng khác nhau và **không tập nào bắt được** ba lỗi tìm ra ngày 2026-07-30,
lúc 132/132 ca, 82/82 lượt, 244 test và CI 4/4 đều xanh. Cả ba lỗi có chung tính chất: mọi tên món
và con số trong câu trả lời đều CÓ THẬT trong thực đơn — nên mọi phép kiểm chống bịa đều xanh — mà
khách đọc ra một điều SAI.

Cần stack đang chạy, và MỘT mã QR cho bước thêm vào giỏ. Phiên chat của mỗi hội thoại là phiên
trắng (xem docstring lớp `Khach`), nên bộ này chạy lại được vô hạn và không đốt bàn nào:

    export GOLDEN_QR_TOKEN=<mã QR của một bàn>
    python ai/evaluation/run_golden_e2e.py
    python ai/evaluation/run_golden_e2e.py --api http://127.0.0.1:5000 --chi-tiet

Phần CHẤM ĐIỂM của bộ này có test riêng chạy được KHÔNG cần stack — `test_golden_e2e.py`. Bộ đo mà
logic chấm sai sẽ báo xanh trên hệ thống đang sai, và đó là kiểu hỏng tệ nhất.

Mã thoát: 0 nếu mọi lượt đạt, 1 nếu có lượt đỏ, 2 nếu KHÔNG gọi được stack.

Mã 2 khác mã 1 có chủ đích: "chưa dựng stack" không phải "hệ thống sai", và trộn hai thứ đó lại là
cách một bộ đo tự vô hiệu hóa — nó sẽ xanh trên máy không có gì chạy.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
GOLDEN_PATH = HERE / "golden_e2e.json"

# Phép đo này cần backend + Postgres + dịch vụ AI đang chạy, nên notebook KHÔNG tính lại
# được và phải ĐỌC số từ tệp. Xem docstring của `results.py`.
import results  # noqa: E402
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"

# Cụm nói lên là ngoài phạm vi. Dùng chung định nghĩa với thước đo một lượt để hai bộ không lệch
# nhau về nghĩa của chữ "từ chối".
REFUSE_PHRASES = ("mình chỉ hỗ trợ", "ngoài phạm vi", "không cung cấp", "mình không hỗ trợ")
NO_DATA_PHRASES = ("chưa có dữ liệu", "chưa có món đó", "thực đơn của nhà hàng chưa có")
CLARIFY_PHRASES = ("cho mình biết", "bạn muốn", "bạn cho mình biết")
# Cụm riêng của nhánh so sánh. Nhánh này nêu hai món và sinh hai thẻ giỏ, nên nếu không nhận riêng
# thì luật "hai thẻ trở lên là danh sách" đọc nó thành `list`.
COMPARE_PHRASES = ("chênh nhau", "nhẹ ví hơn")

SO_TIEN = re.compile(r"\d[\d.,]*")


class KhongGoiDuocStack(RuntimeError):
    """Không nói chuyện được với backend. Khác hoàn toàn với 'hệ thống trả lời sai'."""


class Khach:
    """Một khách. Gọi ĐÚNG những endpoint mà frontend gọi, không phải đường nội bộ.

    Phiên chat luôn MỚI, và đó là điều làm bộ này chạy lại được
    -------------------------------------------------------------
    Bản đầu mở phiên chat qua `tableSessionId`, và `DbChatStore.CreateOrGetSession` **trả lại phiên
    cũ** cho cùng phiên bàn (đúng thiết kế: khách quét lại QR giữa bữa thì không mất ngữ cảnh). Nên
    mỗi hội thoại phải ăn một bàn sạch, và bộ này **chỉ chạy được một lần trên mỗi cơ sở dữ liệu** —
    lần chạy thứ hai hết bàn. Đó là khiếm khuyết của bộ đo, không phải của hệ thống.

    Không truyền `tableSessionId` thì `CreateOrGetSession` luôn tạo phiên mới. Nên phiên chat của
    mỗi hội thoại là phiên trắng, không giới hạn số lần chạy, và không đốt bàn nào.

    Phiên bàn chỉ cần cho bước THÊM VÀO GIỎ, và bước đó không phụ thuộc bộ nhớ chat của bàn: thẻ giỏ
    đến từ câu trả lời, còn giỏ hàng chỉ nhận `menuItemId` cộng `delta`. Nên một bàn dùng lại được
    qua nhiều lần chạy.
    """

    def __init__(self, api: str, qr_token: str | None = None) -> None:
        self.api = api.rstrip("/")
        self.table_session_id: str | None = None
        self.table_session_token: str | None = None
        if qr_token:
            ts = self._call("/api/table-sessions", "POST", {"qrToken": qr_token})
            self.table_session_id = ts.get("sessionId") or ts.get("id")
            # Giỏ hàng cần TOKEN của phiên bàn, không phải id phiên. Bản đầu của tôi gửi id và nhận
            # 401 `TABLE_SESSION_TOKEN_INVALID` — đúng chuyện bộ này tồn tại để bắt, chỉ có điều
            # lần này nó bắt tôi.
            self.table_session_token = ts.get("tableSessionToken")
            if not self.table_session_id or not self.table_session_token:
                raise KhongGoiDuocStack(f"phiên bàn thiếu id hoặc token: {sorted(ts)}")
        # KHÔNG gửi `tableSessionId`: xem docstring — đó là điều kiện để phiên chat luôn trắng.
        cs = self._call("/api/chat/sessions", "POST", {})
        if cs.get("reused"):
            raise KhongGoiDuocStack(
                "phiên chat bị DÙNG LẠI dù không truyền `tableSessionId` — bộ nhớ hội thoại trước "
                "còn nguyên và kết quả không đọc được"
            )
        self.chat_session_id = cs["chatSessionId"]
        self.token = cs["accessToken"]

    def _call(self, path: str, method: str = "GET", body: dict | None = None,
              headers: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{self.api}{path}", data=data, method=method)
        req.add_header("Content-Type", "application/json")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raise KhongGoiDuocStack(
                f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:200]}"
            ) from e
        except (urllib.error.URLError, OSError) as e:
            raise KhongGoiDuocStack(f"{method} {path} -> {e}") from e

    def hoi(self, cau: str) -> dict:
        r = self._call(
            f"/api/chat/sessions/{self.chat_session_id}/messages",
            "POST", {"content": cau}, {"X-Chat-Session-Token": self.token},
        )
        return r["message"]

    def hoi_stream(self, cau: str) -> dict:
        """Hỏi qua đường SSE — ĐÂY là đường khách thật đi.

        `ChatbotPage.tsx` gọi `sendMessageStream` TRƯỚC, chỉ lùi về `sendMessage` khi stream lỗi.
        Nên nếu chỉ kiểm đường gọi thường thì đường chính của khách không được kiểm — và hai đường
        đi qua hai nhánh khác nhau ở backend.
        """
        body = json.dumps({"content": cau}).encode()
        req = urllib.request.Request(
            f"{self.api}/api/chat/sessions/{self.chat_session_id}/messages/stream",
            data=body, method="POST",
        )
        req.add_header("Content-Type", "application/json")
        req.add_header("X-Chat-Session-Token", self.token)
        req.add_header("Accept", "text/event-stream")
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                raw = resp.read().decode()
        except urllib.error.HTTPError as e:
            raise KhongGoiDuocStack(
                f"stream -> HTTP {e.code}: {e.read().decode()[:200]}"
            ) from e
        except (urllib.error.URLError, OSError) as e:
            raise KhongGoiDuocStack(f"stream -> {e}") from e

        # Lấy khung dữ liệu CUỐI có `message`: các khung trước là token rời.
        cuoi: dict | None = None
        for dong in raw.splitlines():
            if not dong.startswith("data:"):
                continue
            phan = dong[5:].strip()
            if not phan or phan == "[DONE]":
                continue
            try:
                goi = json.loads(phan)
            except ValueError:
                continue
            if isinstance(goi, dict) and goi.get("message"):
                cuoi = goi["message"]
        if cuoi is None:
            raise KhongGoiDuocStack(
                f"stream không có khung nào chứa `message`; {len(raw)} byte, "
                f"đầu: {raw[:200]!r}"
            )
        return cuoi

    def them_vao_gio(self, menu_item_id: str, so_luong: int) -> dict:
        # Trường là `delta`, không phải `quantity`: endpoint này CỘNG THÊM vào giỏ, và backend từ
        # chối delta bằng 0 (`CART_DELTA_INVALID`). Bản đầu của tôi gửi `quantity` — backend đọc
        # `Delta` là 0 và trả 400. Cùng lớp lỗi mà cả bộ này tồn tại để bắt: hợp đồng thật khác
        # hợp đồng tôi tưởng, và chỉ có gọi thật mới lộ ra.
        return self._call(
            f"/api/table-sessions/{self.table_session_id}/cart/items",
            "POST", {"menuItemId": menu_item_id, "delta": so_luong},
            {"X-Table-Session-Token": self.table_session_token},
        )

    def xem_gio(self) -> dict:
        return self._call(
            f"/api/table-sessions/{self.table_session_id}/cart", "GET", None,
            {"X-Table-Session-Token": self.table_session_token},
        )


def thu_ready(ai_url: str) -> dict | None:
    """Đọc `/ready` của dịch vụ AI. `None` nếu không gọi được — và chỗ gọi phải NÓI RA điều đó."""
    try:
        with urllib.request.urlopen(f"{ai_url.rstrip('/')}/ready", timeout=5) as r:
            return json.loads(r.read().decode())
    except (urllib.error.URLError, OSError, ValueError):
        return None


def load_menu() -> list[dict]:
    return json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))["items"]


def suy_ra_kind(text: str, so_the_gio: int) -> str:
    """Đọc dạng đáp án từ những gì KHÁCH nhận được.

    `ChatMessageResponse` chỉ có `Content` và `SuggestedCartActions` — backend KHÔNG chuyển tiếp
    trường `kind` của dịch vụ AI, vì nó không thuộc hợp đồng khách. Nên bộ này phải suy ra, và đó là
    một hạn chế thật: `cases.json` so `kind` trực tiếp và chính xác hơn.

    Suy ra từ SỐ THẺ GIỎ và cụm mở đầu, **không** từ việc đếm tên món trong văn bản. Bản đầu đếm tên
    món và nó đọc sai một câu tri thức: câu ghép đồ uống nhắc "Trà đào cam sả" và "trà sen" trong văn
    xuôi, hai tên món, nên nó bị đọc thành danh sách. Đếm tên món trong văn xuôi không phân biệt được
    "đây là các món tôi gợi ý" với "tôi đang nói VỀ các món này".

    Việc đếm tên món vẫn giữ ở chỗ khác, và ở đó nó đúng: phép kiểm an toàn `forbid_tags_any`. Một
    món hải sản nhắc trong văn xuôi vẫn là món hải sản đã lọt tới mắt khách dị ứng.
    """
    # DẠNG ĐÁP ÁN đọc từ ĐOẠN ĐẦU, không đọc từ cả câu trả lời.
    #
    # Từ khi nhánh tri thức trích nhiều đoạn, một câu trả lời gồm đoạn TRẢ LỜI cộng đoạn BỔ TRỢ. Dạng
    # đáp án là tính chất của đoạn trả lời; đoạn bổ trợ chỉ là ngữ cảnh thêm.
    #
    # Đo được ngay khi bật trích 2 đoạn — lượt `khach-hoi-nhan-va-gioi-han` #1:
    #
    #     hỏi     "Nhãn 'ít calo' dựa trên gì?"
    #     đoạn 1  "…Nhãn 'ít calo' là đánh giá cảm quan của người nhập liệu, không phải kết quả
    #              phân tích…"                                     <- TRẢ LỜI ĐÚNG câu hỏi, dạng `fact`
    #     đoạn 2  tài liệu `dietary_limits`, có chứa cụm "chưa có dữ liệu" về một chuyện KHÁC
    #
    # Đọc cả hai đoạn thì cụm ở đoạn 2 thắng và lượt bị chấm `no_data` — trong khi đoạn 1 trả lời
    # đúng điều được hỏi. Đây là lỗi THƯỚC ĐO, cùng lớp với lỗi đã ghi ở đoạn dưới, và cùng nguyên
    # nhân: khớp cụm ở BẤT KỲ ĐÂU trong văn bản.
    #
    # Vì sao sửa ở đây là đúng chứ không phải nới cho qua: các nhánh trả `no_data` và `refuse` thật
    # (`policy:*`) đều sinh câu MỘT ĐOẠN từ khuôn mẫu, nên đọc đoạn đầu không làm lỏng chúng — kiểm
    # được bằng chính ba lượt còn lại của hội thoại này, cả ba vẫn chấm đúng.
    sach = text.split("\n\n", 1)[0].lower()

    # `refuse` và `no_data` đòi KHÔNG CÓ THẺ GIỎ, không chỉ đòi cụm từ.
    #
    # Đây là một BẤT BIẾN của hệ thống, không phải một phép nới: `cart.py` chỉ sinh thẻ ở nhánh
    # `filter`, `compare`, `item_detail`. Nhánh `no_data` và `refuse` KHÔNG BAO GIỜ có thẻ. Nên một
    # câu trả lời CÓ thẻ giỏ không thể thuộc hai dạng đó, dù nó mở đầu bằng cụm gì.
    #
    # Vì sao cần: khi đường sinh bật, mô hình mở đầu câu bằng một lời rào rồi vẫn nêu đủ món —
    #
    #     "Mình chưa có dữ liệu về tình trạng còn món theo thời gian thực, nhưng thực đơn hiện có
    #      Canh khổ qua nhồi nấm giá 55.000đ, …"
    #
    # Bản đầu đọc cụm "chưa có dữ liệu" ở bất kỳ đâu trong câu và kết luận `no_data`, nên một câu trả
    # lời ĐÚNG bị chấm sai. Đây là lỗi THƯỚC ĐO, và dự án đã sai thước đo trước khi sai hệ thống bốn
    # lần — nên phải kiểm giả thuyết "thước đo sai" trước giả thuyết "hệ thống sai".
    if not so_the_gio:
        if any(p in sach for p in REFUSE_PHRASES):
            return "refuse"
        if any(p in sach for p in NO_DATA_PHRASES):
            return "no_data"
    # `compare` phải xét TRƯỚC `list`: câu so sánh nêu hai món và sinh hai thẻ giỏ, nên luật
    # "hai thẻ trở lên là danh sách" đọc nó thành `list`. Nhận bằng cụm riêng của nhánh so sánh.
    if any(p in sach for p in COMPARE_PHRASES):
        return "compare"
    if "mời bạn tham khảo" in sach or "những món này" in sach or so_the_gio >= 2:
        return "list"
    if any(p in sach for p in CLARIFY_PHRASES) and not so_the_gio:
        return "clarify"
    return "fact"


def dong_tien(gia: int) -> str:
    return f"{gia:,}".replace(",", ".") + "đ"


def cham_the_gio(the: list[dict], text: str, by_id: dict, exp: dict) -> list[str]:
    """Bảy bất biến của thẻ giỏ, áp cho MỌI lượt — không lượt nào được miễn.

    Áp cho mọi lượt chứ không khai từng lượt, vì tiêu chí khai lẻ là chỗ sinh ra lượt không được
    kiểm: quên khai một lượt thì lượt đó xanh mà không đo gì. Cùng lý do `answer_metric.py` áp 6
    phép kiểm giỏ cho cả 140 ca.

    Bất biến số 4 là bất biến đáng nhất: **thẻ giỏ phải là món trợ lý VỪA TƯ VẤN**. Ba bất biến
    đầu chỉ nói thẻ giỏ trỏ vào món có thật với giá đúng — chúng vẫn xanh nếu trợ lý tư vấn món A
    rồi bỏ món B vào thẻ. Khách bấm "thêm vào giỏ" là tin rằng nó thêm đúng món vừa được gợi ý.
    """
    do: list[str] = []
    for a in the:
        mid, ten = a.get("menuItemId"), a.get("name")
        # 1. Món phải TỒN TẠI trong thực đơn.
        mon = by_id.get(mid)
        if mon is None:
            do.append(f"GIỎ: thẻ trỏ vào món không có trong thực đơn: {mid!r} ({ten!r})")
            continue
        # 2. Tên trong thẻ phải khớp thực đơn — không phải tên do đâu đó sinh ra.
        if ten != mon["name"]:
            do.append(f"GIỎ: tên thẻ {ten!r} khác tên thực đơn {mon['name']!r}")
        # 3. Giá phải là giá thực đơn.
        if int(a.get("price") or 0) != int(mon["price"]):
            do.append(
                f"GIỎ: giá thẻ {a.get('price')} khác giá thực đơn {mon['price']} "
                f"của {mon['name']}"
            )
        # 4. Món trong thẻ phải là món CÂU TRẢ LỜI VỪA NÊU.
        if mon["name"] not in text:
            do.append(
                f"GIỎ: thẻ có {mon['name']!r} nhưng câu trả lời KHÔNG nêu món đó — "
                "khách bấm thêm vào giỏ là tin nó thêm đúng món vừa được tư vấn"
            )
        # 5. Số lượng phải là số dương.
        if int(a.get("quantity") or 0) < 1:
            do.append(f"GIỎ: số lượng {a.get('quantity')!r} của {mon['name']}")
        # 6. Luôn cần khách xác nhận — AI không tự đặt món.
        if a.get("requiresCustomerConfirmation") is not True:
            do.append(f"GIỎ: {mon['name']} không đòi khách xác nhận")
        # Lý do phải nêu ràng buộc, không được rỗng.
        if not (a.get("reason") or "").strip():
            do.append(f"GIỎ: {mon['name']} không có lý do gợi ý")
        # Nhãn khách nêu cần tránh KHÔNG được có trong thẻ. Chốt an toàn.
        for tag in exp.get("cart_forbid_tags_any", []):
            if tag in mon["tags"]:
                do.append(f"AN TOÀN GIỎ: {mon['name']} mang `{tag}`")

    # 7. Nhánh chưa hiểu câu hỏi thì KHÔNG được gợi ý đặt món.
    if exp.get("no_cart") and the:
        do.append(f"GIỎ: lượt này không được có thẻ, mà có {[a.get('name') for a in the]}")

    # 8. CHIỀU NGƯỢC của bất biến 4: món câu trả lời NÊU RA phải BẤM ĐƯỢC.
    #
    # Bất biến 4 đòi *thẻ ⊆ món được nêu*. Nó im lặng với chiều còn lại, và chiều còn lại đã hỏng
    # thật: hỏi stack thật thì câu trả lời nêu SÁU món còn thẻ giỏ có BA — `MAX_CART_ACTIONS = 3`
    # trong khi `answer.LIST_SIZE = 6`. Khách đọc sáu lựa chọn và bấm chọn được ba.
    #
    # Đây là dạng nhẹ của đúng vấn đề "trả lời một kiểu, thẻ giỏ một kiểu", và 103/103 không thấy nó.
    # Bài học lặp lại lần thứ hai trong dự án: **một bất biến một chiều chỉ canh một nửa.**
    #
    # Chỉ áp khi lượt này CÓ thẻ — lượt tri thức không có thẻ và không cần có, và nó vẫn nhắc tên món
    # trong văn xuôi ("Trà đào cam sả hoặc trà sen: vị chua nhẹ cắt được vị đậm"). Áp cho lượt không
    # thẻ là đòi thẻ ở nhánh cấm sinh thẻ.
    if the and not exp.get("no_cart"):
        trong_the = {a.get("name") for a in the}
        thieu = [m["name"] for m in mon_theo_thu_tu(text, list(by_id.values()))
                 if m["name"] not in trong_the]
        if thieu:
            do.append(
                f"GIỎ: câu trả lời nêu {thieu} mà KHÔNG có thẻ để bấm — khách đọc được nhiều lựa "
                "chọn hơn số lựa chọn bấm được, nên phần dư phải gõ tay"
            )
    return do


def mon_theo_thu_tu(text: str, items: list[dict]) -> list[dict]:
    """Món câu trả lời nêu tên, THEO ĐÚNG THỨ TỰ xuất hiện trong câu.

    Thứ tự là thông tin: khách nói "món thứ hai" là trỏ vào món thứ hai họ ĐỌC THẤY. Tra bằng vị
    trí của tên món trong văn bản, không bằng thứ tự thực đơn.

    Tên món dài trước: "Phở bò tái nạm" chứa "Phở bò"? Không, nhưng nguyên tắc vẫn giữ — nếu một
    tên món là tiền tố của tên khác thì tên dài phải thắng, cùng cơ chế mà `understand.py` dùng.
    """
    thay: list[tuple[int, dict]] = []
    da_an: list[tuple[int, int]] = []
    for m in sorted(items, key=lambda x: -len(x["name"])):
        vi = text.find(m["name"])
        if vi < 0:
            continue
        het = vi + len(m["name"])
        if any(vi >= a and het <= b for a, b in da_an):
            continue
        da_an.append((vi, het))
        thay.append((vi, m))
    return [m for _, m in sorted(thay, key=lambda t: t[0])]


def cham_luot(msg: dict, exp: dict, items: list[dict], by_id: dict,
              by_name: dict, truoc: list[dict] | None = None) -> tuple[list[str], str]:
    truoc = truoc or []
    text = msg.get("content") or ""
    the = msg.get("suggestedCartActions") or []
    # Món câu trả lời NÊU TÊN — tra bằng tên thực đơn, không đoán. Dùng cho phép kiểm an toàn và
    # đếm số món, KHÔNG dùng để đọc dạng đáp án (xem `suy_ra_kind`).
    neu_ten = mon_theo_thu_tu(text, items)
    kind = suy_ra_kind(text, len(the))
    do: list[str] = []

    if exp.get("kind") and kind != exp["kind"]:
        do.append(f"dạng đáp án đọc ra là `{kind}`, cần `{exp['kind']}`")

    # --- nhóm danh mục: món ăn KHÁC đồ uống ------------------------------------------
    #
    # Đây là ràng buộc mà chủ dự án nêu thẳng: "không phải bảo tư vấn món mà cứ đưa bia, sinh tố
    # xoài, nước rau má vào". Nó không đo được bằng nhãn — `cat_drink` là DANH MỤC, không phải nhãn
    # — nên nó cần tiêu chí riêng.
    for cat in exp.get("forbid_category_any", []):
        xau = [m["name"] for m in neu_ten if m["categoryId"] == cat]
        if xau:
            do.append(f"nêu món thuộc nhóm `{cat}` mà lượt này không được có: {xau}")
    chi = exp.get("only_categories")
    if chi:
        ngoai = [f"{m['name']} ({m['categoryId']})" for m in neu_ten
                 if m["categoryId"] not in chi]
        if ngoai:
            do.append(f"nêu món ngoài {chi}: {ngoai}")

    # --- tham chiếu ngược ------------------------------------------------------------
    #
    # Bản CHẶT: chốt đúng món ở đúng VỊ TRÍ của lượt trước, không chỉ "có nhắc món nào của lượt
    # trước". Bản lỏng đã cho ca đạt SAI LÝ DO ba lần trong dự án này: câu "món thứ hai có hải sản
    # không?" mà hệ thống KHÔNG hiểu sẽ liệt kê lại danh sách cũ, và danh sách đó chứa món của lượt
    # trước nên tiêu chí lỏng thỏa — dù hệ thống chẳng hiểu "thứ hai" là gì.
    dat = exp.get("refers_to_position")
    if dat is not None:
        k, vi_tri = dat["turn"], dat["index"]
        if k > len(truoc):
            do.append(f"ca viết sai: trỏ vào lượt {k} nhưng chỉ có {len(truoc)} lượt trước")
        else:
            ds = truoc[k - 1]["items"]
            if len(ds) < vi_tri:
                do.append(
                    f"ca viết sai: lượt {k} chỉ nêu {len(ds)} món nên vị trí {vi_tri} không có"
                )
            else:
                can = ds[vi_tri - 1]
                if can["name"] not in text:
                    do.append(
                        f"phải nói về {can['name']!r} (món thứ {vi_tri} của lượt {k}), "
                        f"câu trả lời nêu {[m['name'] for m in neu_ten][:3]}"
                    )
                # Và KHÔNG được liệt kê lại cả danh sách: đó là cách lách tiêu chí.
                elif len(neu_ten) > 2:
                    do.append(
                        f"nêu {len(neu_ten)} món cho một câu hỏi về MỘT món — liệt kê lại danh "
                        "sách cũ là cách qua tiêu chí mà không hiểu tham chiếu"
                    )

    k = exp.get("must_not_repeat_turn")
    if k is not None:
        if k > len(truoc):
            do.append(f"ca viết sai: trỏ vào lượt {k} nhưng chỉ có {len(truoc)} lượt trước")
        else:
            cu = {m["id"] for m in truoc[k - 1]["items"]}
            lap = [m["name"] for m in neu_ten if m["id"] in cu]
            if lap:
                do.append(f"gợi lại món đã nêu ở lượt {k}: {lap}")

    if exp.get("min_items") is not None and len(neu_ten) < exp["min_items"]:
        do.append(f"nêu {len(neu_ten)} món, cần ít nhất {exp['min_items']}")

    # `max_items` — chữ ký CẤU TRÚC của câu so sánh, thay cho `kind: compare`.
    #
    # Vì sao cần một tiêu chí mới thay vì sửa `suy_ra_kind`: backend KHÔNG chuyển tiếp trường `kind`
    # của dịch vụ AI (nó không thuộc hợp đồng khách), nên bộ này phải suy dạng từ văn bản. Khi đường
    # sinh bật, mô hình viết câu so sánh mà không dùng cụm nào của khuôn mẫu:
    #
    #     "Nếu bạn thích vị bò đậm đà hơn, Phở bò tái nạm là lựa chọn phù hợp, giá 75.000đ. Nếu muốn
    #      vị thanh nhẹ hơn, Phở gà ta có nước dùng trong…"
    #
    # Đó là một câu so sánh ĐÚNG, và không cụm từ nào phân biệt được nó với một câu liệt kê. Suy dạng
    # từ văn xuôi tự do là việc không làm được, nên đừng cố.
    #
    # Cái phân biệt được, và nó là điều THẬT SỰ quan trọng với khách: câu so sánh nói về ĐÚNG hai món
    # khách nêu, không kéo món thứ ba vào. `max_items: 2` cộng `must_name_items` hai món pin chặt
    # điều đó — chặt HƠN `kind`, vì `kind` không nói gì về việc có món lạ hay không.
    if exp.get("max_items") is not None and len(neu_ten) > exp["max_items"]:
        do.append(
            f"nêu {len(neu_ten)} món ({[m['name'] for m in neu_ten]}), "
            f"nhiều nhất được {exp['max_items']} — câu so sánh không được kéo món thứ ba vào"
        )

    if exp.get("min_chars") is not None and len(text) < exp["min_chars"]:
        do.append(f"câu trả lời {len(text)} ký tự, cần ít nhất {exp['min_chars']}")

    for tag in exp.get("forbid_tags_any", []):
        xau = [m["name"] for m in neu_ten if tag in m["tags"]]
        if xau:
            do.append(f"AN TOÀN: câu trả lời nêu món mang `{tag}`: {xau}")

    cum = exp.get("must_say_any")
    if cum and not any(c.lower() in text.lower() for c in cum):
        do.append(f"không có cụm nào trong {cum} — câu trả lời không nói ra phạm vi của nó")

    for c in exp.get("must_not_say_any", []):
        if c.lower() in text.lower():
            do.append(f"câu trả lời có cụm {c!r} mà lượt này KHÔNG được có")

    if exp.get("max_price") is not None:
        qua = [f"{m['name']} {dong_tien(m['price'])}" for m in neu_ten
               if m["price"] > exp["max_price"]]
        if qua:
            do.append(f"vượt ngân sách {dong_tien(exp['max_price'])}: {qua}")

    # Cực trị: chốt GIÁ, không chốt món. Có 5 món cùng giá 95.000đ, nên chốt món là chốt vào thứ
    # tự phá hòa của bảng xếp hạng — tiêu chí đó đỏ khi hệ thống hoàn toàn đúng.
    if exp.get("must_name_priciest"):
        cao = max(m["price"] for m in items)
        if dong_tien(cao) not in text:
            do.append(f"phải nêu giá món đắt nhất thực đơn ({dong_tien(cao)})")
    tran = exp.get("must_name_priciest_within")
    if tran is not None:
        trong = [m for m in items if m["price"] <= tran]
        cao = max(m["price"] for m in trong)
        if dong_tien(cao) not in text:
            do.append(
                f"phải nêu giá món đắt nhất trong {dong_tien(tran)} ({dong_tien(cao)}); "
                f"món rẻ nhất là {dong_tien(min(m['price'] for m in trong))}"
            )

    # Nhận CẢ chuỗi và danh sách: câu so sánh cần giá của HAI món, và tách thành hai khóa thì hai
    # khóa đó phải cùng nghĩa — một khóa nhận danh sách gọn hơn và không lệch nghĩa được.
    can_gia = exp.get("must_state_price_of")
    if can_gia is not None:
        for ten_mon in ([can_gia] if isinstance(can_gia, str) else can_gia):
            mon = by_name.get(ten_mon)
            if mon is None:
                do.append(f"ca viết sai: thực đơn không có món {ten_mon!r}")
            elif dong_tien(mon["price"]) not in text:
                do.append(f"phải nêu giá thật {dong_tien(mon['price'])} của {ten_mon}")

    for ten_mon in exp.get("must_name_items", []):
        if ten_mon not in by_name:
            do.append(f"ca viết sai: thực đơn không có món {ten_mon!r}")
        elif ten_mon not in text:
            do.append(f"phải nhắc {ten_mon!r}")

    for nhan in exp.get("require_tags_all", []):
        thieu = [m["name"] for m in neu_ten if nhan not in m["tags"]]
        if thieu:
            do.append(f"món nêu ra phải có nhãn `{nhan}`, những món này không có: {thieu}")

    # Không tên món nào ngoài thực đơn được xuất hiện như một món của nhà hàng. Kiểm bằng thẻ giỏ
    # và bằng số tiền, hai thứ tra được — không quét tên món tự do, vì cách đó bắt oan.
    if exp.get("no_invented_item_names"):
        gia_that = {m["price"] for m in items}
        so = [int(s.replace(".", "").replace(",", "")) for s in SO_TIEN.findall(text)
              if s.replace(".", "").replace(",", "").isdigit()
              and len(s.replace(".", "").replace(",", "")) >= 4]
        la = [t for t in so if t not in gia_that]
        if la:
            do.append(f"số tiền không phải giá thực đơn: {la}")

    do += cham_the_gio(the, text, by_id, exp)
    return do, kind


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api", default="http://127.0.0.1:5000", help="gốc URL backend")
    p.add_argument("--ai", default="http://127.0.0.1:8001",
                   help="gốc URL dịch vụ AI, chỉ để đọc `/ready` và in cấu hình đang đo")
    p.add_argument("--chi-tiet", action="store_true", help="in mọi câu trả lời")
    p.add_argument("--chi", default="", metavar="CHUOI",
                   help="chỉ chạy hội thoại có id CHỨA chuỗi này. Dùng khi cần xem kỹ một nhóm; "
                        "một lần chạy đầy đủ vẫn là điều kiện chấp nhận.")
    args = p.parse_args(argv)

    data = json.loads(GOLDEN_PATH.read_text(encoding="utf-8-sig"))
    items = load_menu()
    by_id = {m["id"]: m for m in items}
    by_name = {m["name"]: m for m in items}
    hoi_thoais = data["conversations"]
    if args.chi:
        hoi_thoais = [c for c in hoi_thoais if args.chi in c["id"]]
        print(f"CHỈ chạy {len(hoi_thoais)} hội thoại có id chứa {args.chi!r} — "
              "đây KHÔNG phải một lần chạy đầy đủ.\n")

    # MỘT mã QR, dùng cho bước THÊM VÀO GIỎ. Phiên chat của mọi hội thoại là phiên trắng — xem
    # docstring lớp `Khach` — nên không hội thoại nào cần bàn riêng và bộ này chạy lại được vô hạn.
    #
    # Mã QR không nằm trong repo: nó là bí mật của bàn và luân chuyển khi đóng phiên.
    qr = (os.environ.get("GOLDEN_QR_TOKEN") or "").strip()
    can_gio = [c["id"] for c in hoi_thoais
               if any(t.get("expect", {}).get("add_first_cart_item_to_cart") for t in c["turns"])]
    if can_gio and not qr:
        print(
            f"Thiếu GOLDEN_QR_TOKEN. {len(can_gio)} hội thoại có bước thêm vào giỏ thật "
            f"({', '.join(can_gio)}), và bước đó cần một phiên bàn.\n\n"
            "  Chỉ cần MỘT mã, và dùng lại được qua nhiều lần chạy: giỏ hàng chỉ nhận `menuItemId`\n"
            "  cộng `delta`, không phụ thuộc bộ nhớ chat của bàn.\n\n"
            "    docker compose -f deploy/docker-compose.java.yml exec -T postgres \\\n"
            "      psql -U restaurant_user -d restaurant_qr -t -A \\\n"
            "      -c \"select qr_token from restaurant_tables order by table_code limit 1;\"\n\n"
            "    export GOLDEN_QR_TOKEN=<mã>"
        )
        return 2

    # CẤU HÌNH ĐANG ĐO — in trước mọi con số.
    #
    # Vì sao bắt buộc: cùng một bộ 100 lượt cho hai kết quả rất khác nhau tùy dịch vụ AI đang chạy
    # đường tất định hay đường sinh, và tùy `LLM_API_KEY` có rỗng hay không. Đã trả giá một lần cho
    # việc thiếu dòng này: một lần chạy 42 lượt được báo là "qua mô hình thật" trong khi khóa rỗng
    # nên mọi lượt đi đường tất định — `/ready.model_configured` lúc đó không kiểm khóa.
    #
    # Không gọi được `/ready` thì NÓI RA, không im lặng chạy tiếp rồi báo một con số không nhãn.
    cau_hinh = thu_ready(args.ai)
    print("CẤU HÌNH DỊCH VỤ AI đang đo:")
    if cau_hinh is None:
        print(f"  KHÔNG đọc được {args.ai}/ready — không biết đang đo cấu hình nào.")
    else:
        for khoa in ("retriever", "generation_enabled", "model_configured", "model_key_set",
                     "knowledge_docs", "knowledge_chunks"):
            if khoa in cau_hinh:
                print(f"  {khoa:20} {cau_hinh[khoa]}")
        if not cau_hinh.get("model_configured"):
            print("  => Mô hình KHÔNG được gọi trong lần chạy này. Con số dưới đây là con số của")
            print("     ĐƯỜNG TẤT ĐỊNH, và không được gán nhãn 'có mô hình'.")
        elif not cau_hinh.get("generation_enabled"):
            print("  => Mô hình chỉ ĐỌC câu hỏi thành nhãn; chữ vẫn do khuôn mẫu dựng.")
        else:
            print("  => Đường SINH đang bật: chữ khách đọc do mô hình viết, qua lớp xác minh.")
    print()

    print(f"GOLDEN ĐẦU-CUỐI — {args.api}")
    print(f"  {len(hoi_thoais)} hội thoại / {sum(len(c['turns']) for c in hoi_thoais)} lượt")
    print("  mỗi hội thoại một phiên chat TRẮNG; một phiên bàn cho bước thêm vào giỏ\n")

    tong = dat = 0
    hong: list[str] = []
    for hoi_thoai in hoi_thoais:
        can = any(t.get("expect", {}).get("add_first_cart_item_to_cart")
                  for t in hoi_thoai["turns"])
        try:
            khach = Khach(args.api, qr if can else None)
        except KhongGoiDuocStack as e:
            print(f"KHÔNG GỌI ĐƯỢC STACK: {e}")
            print("\n  Dựng stack rồi chạy lại:")
            print("    docker compose -f deploy/docker-compose.java.yml up -d")
            return 2

        duong = hoi_thoai.get("transport", "post")
        print(f"[{hoi_thoai['id']}]  phiên chat {khach.chat_session_id}"
              f"{'  (qua SSE)' if duong == 'stream' else ''}")
        truoc: list[dict] = []
        for j, turn in enumerate(hoi_thoai["turns"], 1):
            tong += 1
            try:
                msg = (khach.hoi_stream(turn["user"]) if duong == "stream"
                       else khach.hoi(turn["user"]))
            except KhongGoiDuocStack as e:
                print(f"  lượt {j}: KHÔNG GỌI ĐƯỢC — {e}")
                return 2
            exp = turn.get("expect", {})
            do, kind = cham_luot(msg, exp, items, by_id, by_name, truoc)
            # Ghi lại món của lượt này THEO THỨ TỰ, để `refers_to_position` và
            # `must_not_repeat_turn` của lượt sau có cái mà trỏ vào.
            truoc.append({"items": mon_theo_thu_tu(msg.get("content") or "", items)})

            # Bấm THÊM VÀO GIỎ thật. Đây là chặng cuối, và nó kiểm điều mà không mảng JSON nào
            # kiểm được: thẻ giỏ có đi qua được đường xác thực và ràng buộc của backend hay không.
            if exp.get("add_first_cart_item_to_cart"):
                the = msg.get("suggestedCartActions") or []
                if not the:
                    do.append("GIỎ: lượt này phải có thẻ để bấm thêm vào giỏ, mà không có thẻ nào")
                else:
                    a = the[0]
                    try:
                        khach.them_vao_gio(a["menuItemId"], int(a.get("quantity") or 1))
                        gio = khach.xem_gio()
                    except KhongGoiDuocStack as e:
                        do.append(f"GIỎ: thêm vào giỏ thật THẤT BẠI — {e}")
                    else:
                        trong_gio = [i.get("menuItemId") for i in (gio.get("items") or [])]
                        if a["menuItemId"] not in trong_gio:
                            do.append(
                                f"GIỎ: đã gọi thêm {a['name']} nhưng giỏ thật không có "
                                f"({trong_gio})"
                            )
                        else:
                            print(f"    + đã thêm {a['name']} vào giỏ thật, giỏ có "
                                  f"{len(trong_gio)} món")

            if do:
                hong.append(f"{hoi_thoai['id']} lượt {j}: {turn['user']!r}")
                print(f"  [ĐỎ] lượt {j}: {turn['user']}")
                for x in do:
                    print(f"        - {x}")
                print(f"        câu trả lời: {(msg.get('content') or '')[:180]}")
            else:
                dat += 1
                print(f"  [ok]  lượt {j} ({kind}): {turn['user']}")
                if args.chi_tiet:
                    print(f"        {(msg.get('content') or '')[:180]}")
                    the = msg.get("suggestedCartActions") or []
                    if the:
                        print(f"        thẻ giỏ: {[a.get('name') for a in the]}")
        print()

    print(f"  lượt : {tong}")
    print(f"  đạt  : {dat}/{tong}  ({dat / tong * 100:.1f}%)" if tong else "  không lượt nào")
    print(f"  đỏ   : {len(hong)}")

    # Ghi TRƯỚC khi rẽ nhánh đỏ/xanh. Chỉ ghi ở nhánh xanh thì lần chạy có đỏ không để lại số nào,
    # mà đúng lần đó mới là lần cần phân tích — mục "case sai không sửa được nữa" đọc chính
    # `luot_do` dưới đây.
    #
    # Chỉ ghi khi chạy ĐẦY ĐỦ. Một lần chạy `--chi` cho 6 lượt rồi ghi đè kết quả 103 lượt là làm
    # notebook in "6/6 = 100%" — đúng số, sai điều đang được nói.
    if not args.chi:
        duong_ket_qua = results.ghi(
            # MỘT tệp bằng chứng cho MỖI cấu hình, không phải một tệp cho lần chạy gần nhất.
            #
            # Đường sinh bật và tắt là HAI hành vi khác nhau — một bên chữ do khuôn mẫu dựng, một bên
            # do mô hình viết. Ghi chung một tệp thì lần chạy sau xóa bằng chứng của cấu hình trước,
            # và cổng deploy (`verify_deploy_config.py`) không còn gì để đối chiếu cho cấu hình nó
            # sắp dựng.
            #
            # Đã suýt xảy ra: đo với đường sinh BẬT, còn production mặc định TẮT — tức không có bằng
            # chứng nào cho đúng cấu hình sắp deploy. Cổng bắt được, và đó là lý do nó tồn tại.
            #
            # Hậu tố suy từ CHÍNH `/ready` của dịch vụ đang đo, không từ biến môi trường của máy chạy
            # bộ đo: hai chỗ đó lệch nhau được, và cái đúng là cái dịch vụ báo.
            "golden_e2e_sinh" if (cau_hinh or {}).get("generation_enabled") else "golden_e2e",
            {
                "luot": tong,
                "dat": dat,
                "do": len(hong),
                "luot_do": hong,
            },
            {
                "ngay": datetime.date.today().isoformat(),
                "api": args.api,
                "ready": cau_hinh or "KHÔNG đọc được /ready",
                "hoi_thoai": len(hoi_thoais),
            },
        )
        print(f"  đã ghi {duong_ket_qua.relative_to(REPO_ROOT)}")

    if hong:
        print("\nlượt đỏ:")
        for h in hong:
            print(f"  {h}")
        return 1
    print("\nMọi lượt đạt qua ĐỦ chuỗi gọi: QR -> phiên bàn -> phiên chat -> backend -> "
          "dịch vụ AI -> thẻ giỏ -> giỏ hàng thật.")
    # KHÔNG nói "qua mô hình": bộ này chạy được cả khi không có mô hình, và trong CI thì đúng là
    # không có (`LLM_BASE_URL` trỏ vào cổng chết). Đo được: 42/42 đạt ở cả hai cấu hình. Trạng thái
    # mô hình do `wait_for_stack.py` in ra — chỗ đọc được nó thật.
    print("Lớp mô hình có được chạy hay không: xem dòng `mô hình` của wait_for_stack.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
