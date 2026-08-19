# -*- coding: utf-8 -*-
"""Mô hình VIẾT câu trả lời — nhưng chỉ trên ngữ cảnh đã đưa vào, và có lớp xác minh.

Vì sao khâu này tồn tại, và nó đổi điều gì
------------------------------------------
Đề bài (`00-problem-statement.md` mục 3) phân ba loại câu và nói rõ mô hình sinh thuộc về đâu:

    loại A  tra cứu thực đơn   "KHÔNG được để mô hình sinh trả lời"
    loại B  tri thức nhà hàng  đoạn nguyên văn, mô hình không chạm chữ
    loại C  suy luận/diễn đạt  "Đây là nơi mô hình sinh có giá trị thật"

Cho tới trước tệp này, loại C cũng được trả bằng khuôn mẫu. Nên bảo đảm "không bịa món, không bịa
giá" là bảo đảm **cấu trúc**: mô hình không có đường ghi chữ cho khách, nên nó không thể bịa.

Tệp này đổi điều đó, và phải nói thẳng cái giá: bảo đảm chuyển từ **cấu trúc** sang **xác minh**.
Mạnh, đo được, nhưng không còn là bất khả. Ba việc giữ nó ở mức chấp nhận được:

1. **Mô hình KHÔNG chọn món.** Danh sách món do `answer.select()` lọc theo nhãn quyết định, và đo
   được là lọc theo nhãn thắng dứt khoát: 8/8 đúng so với RAG sai 6–7/8. Mô hình chỉ VIẾT về những
   món đã được chọn.
2. **Xác minh trước khi gửi.** Tám phép kiểm ở `verify()` dưới đây. Vi phạm bất kỳ phép nào thì câu
   sinh bị BỎ và hệ thống dùng lại câu khuôn mẫu — không sửa, không thử lại.
3. **Thẻ giỏ vẫn tất định.** Nó dựng từ `reply.items`, không từ chữ mô hình viết. Nên dù một câu
   sinh lọt qua xác minh mà vẫn sai, khách không đặt được món không tồn tại.

Điều lớp này KHÔNG bắt được, nói ra chứ không giấu
--------------------------------------------------
Một tên món **hoàn toàn bịa** — không có trong thực đơn dưới bất kỳ dạng nào — thì phép so chuỗi
với thực đơn không phát hiện được. Ta bắt được: món thật nằm ngoài danh sách đã đưa, giá không có
trong thực đơn, và món mang nhãn khách cần tránh. Ta không bắt được "Bò sốt tiêu đen Hoàng Gia".

Giảm nhẹ chứ không xóa được: thẻ giỏ và `reply.items` vẫn tất định nên món bịa không đặt được, và
`golden_e2e` có phép kiểm số tiền trên câu trả lời thật. Đây là rủi ro còn lại của việc làm đúng đề
bài, và nó là lý do nhánh này chỉ chạy cho loại C.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from understand import Request

# Nhánh nào được phép sinh. CHỈ loại C — suy luận và diễn đạt.
#
# `filter` và `compare` là hai nhánh mà đề bài xếp vào loại C: chọn nhiều tiêu chí, hoặc cần diễn
# đạt. Mọi nhánh khác là tra cứu (loại A) hoặc tri thức nguyên văn (loại B), và đề bài cấm sinh ở
# loại A. `no_data`, `refuse`, `clarify` cũng không sinh: chưa hiểu câu hỏi thì không có gì để viết
# cho hay hơn, và một câu từ chối do mô hình viết là chỗ dễ rò rỉ nhất.
BRANCHES_ALLOWED = frozenset({"filter", "compare"})

# Cụm mở đường hỏi nhân viên. Phép kiểm thứ 8 đòi một trong những cụm này khi khách nêu điều cần
# tránh — xem `verify()`.
#
# Danh sách này TRÙNG `STAFF_PHRASES` của `ai/evaluation/answer_metric.py`, và sự trùng đó là bắt
# buộc: thước đo chấm ĐỎ khi câu trả lời thiếu cụm, còn phép kiểm ở đây BỎ câu sinh khi thiếu cụm.
# Hai danh sách lệch nhau thì có câu sinh qua được phép kiểm rồi bị thước đo chấm đỏ — tức hệ thống
# tự tin vào một điều thước đo không đồng ý.
#
# KHÔNG import từ `answer_metric`: `ai/app` là mã lúc chạy, `ai/evaluation` là bộ đo, và mã lúc chạy
# import bộ đo nghĩa là bộ đo phải có mặt trong ảnh Docker. Nên hai chỗ khai riêng, và
# `test_generate.py` có một test đối chiếu hai danh sách — trùng được ÉP, không phải được nhớ.
STAFF_PHRASES = (
    "nhân viên",
    "phục vụ",
    "nhà hàng xác nhận",
    "hỏi lại bếp",
    "bếp xác nhận",
    "gọi nhân viên",
)

# Số tiền trong câu trả lời. Dùng để kiểm mọi con số tiền đều là giá THẬT của món đã đưa vào.
MONEY_IN_TEXT = re.compile(r"\d[\d.]*(?=\s*đ)")

# Lời khai SỐ LƯỢNG món: "6 món lẩu", "có 3 món". Đo được ngay lần chạy thật đầu tiên: mô hình viết
# "Nhà hàng có 6 món lẩu" trong khi thực đơn có 7 — một con số bịa mà ba phép kiểm đầu không chạm
# tới, vì nó không phải tên món, không phải giá, và không phải nhãn.
#
# Cách chặn hẹp và chắc: mô hình KHÔNG được nêu số lượng. Nó không cần — nó đang viết về một danh
# sách đã đưa, và khách đọc thấy danh sách đó. Số lượng duy nhất đúng là số món trong danh sách,
# nên mọi con số khác là sai.
# Không dùng biên từ ở đây: tiếng Việt có dấu, và biên từ của `re` dựa trên `\w` nên nó cắt
# sai ở ký tự có dấu. Dùng lookahead cho khoảng trắng, dấu câu, hoặc hết chuỗi.
COUNT_IN_TEXT = re.compile(
    r"(\d+)\s*(?:món|loại|nồi|ly|phần)(?=[\s,.;:!?)]|$)", re.IGNORECASE
)

# Khóa nhãn nội bộ trong chữ khách đọc: `allergen:peanut`, `spice:none`. Khách không biết chúng là
# gì, và đây là rò rỉ biểu diễn nội bộ — cùng loại với rò rỉ chỉ dẫn, chỉ nhẹ hơn.
#
# Đo được ở golden 103 lượt: "Thực đơn không ghi nhận allergen:peanut ở món này, nhưng có ghi nhận
# allergen:gluten." Nguyên nhân là prompt đưa nhãn dạng khóa để mô hình biết thuộc tính món, và mô
# hình dùng lại đúng chuỗi đó.
NHAN_KHOA_TRONG_TEXT = re.compile(
    r"\b(?:allergen|spice|diet|region|method|flavour|health|party|price|season|occasion|"
    r"audience|ingredient|promo|serving|meal):[a-z_]+"
)

PROMPT = """Bạn viết câu trả lời cho khách trong nhà hàng Việt Nam, dựa TRÊN DỮ LIỆU ĐƯỢC ĐƯA.

QUY TẮC BẮT BUỘC:
1. Chỉ được nhắc những món có trong DANH SÁCH MÓN dưới đây. Không được nhắc món nào khác.
2. Giá phải viết đúng như trong danh sách. Không được làm tròn, không được đổi.
3. Không được nói món nào "an toàn" cho người dị ứng. Chỉ được nói thực đơn CÓ hoặc KHÔNG ghi nhận.
4. Không được thêm thông tin không có trong dữ liệu: không calo, không thời gian nấu, không nguồn
   gốc nguyên liệu, không khuyến mãi.
5. KHÔNG được viết ra mã nhãn kỹ thuật như `allergen:peanut`, `spice:none`, `diet:vegan`. Khách
   không hiểu chúng. Hãy viết bằng tiếng Việt thường: "thực đơn không ghi nhận đậu phộng", "món
   này không cay".
6. Bạn PHẢI nhắc TẤT CẢ các món trong danh sách, kèm giá của từng món. Không được bỏ món nào.
   Khách cần thấy đủ lựa chọn để bấm chọn; một câu văn hay mà thiếu món là câu trả lời thiếu.
7. KHÔNG được nêu số lượng món ("có 6 món lẩu", "3 loại"). Bạn chỉ thấy một phần thực đơn, nên mọi
   con số đếm bạn viết ra đều có thể sai.
8. Nếu khách đã nêu điều cần tránh (dị ứng, không ăn được thứ gì), câu trả lời PHẢI mời khách nhắc
   nhân viên để bếp xác nhận lại. Đây KHÔNG phải câu khách sáo: nhãn dị nguyên của thực đơn chỉ phủ
   một phần món, nên "thực đơn không ghi nhận" KHÔNG đồng nghĩa "món này an toàn". Bỏ câu đó là để
   khách tin một điều hệ thống không biết.
9. TRÌNH BÀY: mỗi món MỘT DÒNG, bắt đầu bằng "- ", kèm giá ngay sau tên. Phần giải thích viết
   thành câu ở TRÊN hoặc DƯỚI danh sách, không trộn vào giữa các dòng món. Ví dụ:

       Với bàn hai người, mình gợi ý mấy món chia chung được:
       - Bánh xèo miền Tây (85.000đ)
       - Lẩu chua cá lăng (320.000đ)
       Cả hai đều không cay và đủ cho hai người ạ.

   Khách đọc trên điện thoại giữa lúc đang đói. Một đoạn liền sáu món buộc họ tự tách ra để so giá;
   gạch đầu dòng làm việc đó thay họ, và giá thẳng hàng thì so được bằng mắt.
10. Viết tiếng Việt tự nhiên, giọng thân thiện nhưng không quảng cáo. Phần chữ giải thích giữ 2–4
   câu — danh sách đã dài, thêm văn dài nữa thì khách không đọc.
11. Nêu LÝ DO món phù hợp với điều khách nói, không chỉ liệt kê tên.

Trả về JSON đúng dạng:
{{"text": "câu trả lời", "used_item_ids": ["mã món đã nhắc"]}}

KHÁCH HỎI: {question}

ĐIỀU KHÁCH ĐÃ NÓI: {constraints}
{ngu_canh}

DANH SÁCH MÓN (chỉ được nhắc những món này):
{items}
{knowledge}"""


@dataclass
class GenOutcome:
    """Kết quả một lần sinh. `text` là None nghĩa là dùng lại câu khuôn mẫu."""

    text: str | None = None
    used: list[str] = field(default_factory=list)
    # Vì sao bị bỏ, hoặc vì sao không gọi. Đi vào `decision` cho người vận hành, KHÔNG vào câu
    # khách đọc — cùng nguyên tắc với `decision.error` của dịch vụ.
    reason: str = ""
    violations: list[str] = field(default_factory=list)
    called: bool = False


def _mo_ta_rang_buoc(request: Request) -> str:
    """Điều khách đã nói, dạng chữ đọc được — để mô hình nêu LÝ DO đúng thứ khách nêu."""
    phan: list[str] = []
    if request.wants != "any":
        phan.append("muốn " + ("món ăn" if request.wants == "food" else "đồ uống"))
    if request.budget_max:
        moc = f"{request.budget_max:,}".replace(",", ".") + "đ"
        phan.append(f"ngân sách {'dưới' if request.budget_strict else 'tầm'} {moc}")
    if request.avoid_tags:
        phan.append("cần tránh: " + ", ".join(request.avoid_tags))
    if request.require_tags:
        # Nhãn ghép `spice:mild|medium|hot` đưa thẳng vào prompt thì mô hình đọc ra một chuỗi kỹ
        # thuật và có thể chép nguyên vào câu cho khách. Dịch sang "cay nhẹ hoặc cay vừa hoặc cay
        # đậm" trước, dùng đúng bảng `label_vi` mà `_mo_ta_mon()` dùng.
        phan.append("yêu cầu: " + ", ".join(_yeu_cau_doc_duoc(t) for t in request.require_tags))
    if request.prefer_tags:
        phan.append("thích: " + ", ".join(request.prefer_tags))
    return "; ".join(phan) or "chưa nêu ràng buộc cụ thể"


def _mo_ta_ngu_canh(request: Request, da_neu: list[dict]) -> str:
    """Ngữ cảnh HỘI THOẠI — thứ lớp sinh trước đây hoàn toàn không biết.

    Vì sao cần: prompt cũ chỉ có bốn thứ (câu hỏi, ràng buộc, danh sách món, tri thức). Không có
    lượt trước, không có món đã gợi, không có ý định. Nên khi khách nói "tư vấn thêm đi", mô hình
    viết một đoạn văn hay về **đúng những món vừa nêu** — nó không có cách nào biết là đang lặp.

    Nguyên tắc: **phát hiện bằng mã, diễn đạt bằng mô hình.** Lặp là một phép so tập hợp — chính
    xác, tốn 0 giây, test được. Hỏi mô hình "bạn có đang lặp không" thì tốn một lần gọi, không tất
    định, và không viết test được. Nên mô hình được BÁO, không được HỎI.

    Cái nó dùng thông tin này để làm: mở câu đúng cách — "Ngoài những món vừa rồi, còn…" thay vì
    "Mời bạn tham khảo…" như chưa từng nói gì.
    """
    from intent import XIN_THEM

    phan: list[str] = []
    if request.y_dinh == XIN_THEM:
        phan.append(
            "Khách vừa xin gợi ý THÊM. Hãy mở câu bằng ý 'ngoài những món vừa rồi' — đừng viết như "
            "đây là lần đầu tư vấn."
        )
    if request.da_bo_rang_buoc:
        phan.append(
            "Khách vừa yêu cầu BỎ một điều kiện, và hệ thống đã bỏ. Câu trả lời đã có sẵn phần xác "
            "nhận việc đó ở đầu, bạn KHÔNG cần nhắc lại."
        )
    if da_neu:
        ten = ", ".join(i["name"] for i in da_neu[:8])
        phan.append(f"Những món khách ĐÃ xem ở lượt trước (đừng giới thiệu lại như mới): {ten}.")
    return "\n".join(f"- {p}" for p in phan)


_NHAN_VI: dict[str, str] | None = None


def _yeu_cau_doc_duoc(tag: str) -> str:
    """Một nhãn yêu cầu, viết bằng tiếng Việt. Nhận cả nhãn ghép có dấu `|`."""
    nhan = _nhan_tieng_viet()
    if "|" not in tag:
        return nhan.get(tag, tag)
    nhom, cac_muc = tag.split(":", 1)
    ten = [nhan.get(f"{nhom}:{m}", f"{nhom}:{m}") for m in cac_muc.split("|")]
    return " hoặc ".join(t.lower() for t in ten)


def _nhan_tieng_viet() -> dict[str, str]:
    """Bảng `spice:none` -> "Không cay", ĐỌC TỪ `menu-tags.json`.

    Vì sao đọc từ dữ liệu chứ không viết bảng thứ tư: dự án đã có ba bảng tên tiếng Việt viết tay
    (`answer._ALLERGEN_VI`, `answer._SPICE_VI`, `intent._TEN_VI`), và mỗi bảng viết tay là một chỗ
    trôi khỏi dữ liệu. `menu-tags.json` có sẵn `label_vi` cho đủ **85 nhãn** — nó đã là nguồn.

    Hỏng thì trả `{}` và phần gọi rơi về nhãn thô: xấu nhưng không sập, cùng nguyên tắc với
    `load_facts()`.
    """
    global _NHAN_VI
    if _NHAN_VI is None:
        try:
            duong = Path(__file__).resolve().parents[2] / "data" / "menu-tags.json"
            data = json.loads(duong.read_text(encoding="utf-8-sig"))
            _NHAN_VI = {
                k: v["label_vi"]
                for k, v in (data.get("tags") or {}).items()
                if isinstance(v, dict) and v.get("label_vi")
            }
        except (OSError, ValueError, KeyError, TypeError):
            _NHAN_VI = {}
    return _NHAN_VI


# Tối đa bao nhiêu nhãn "phụ" cho mỗi món — xem `_mo_ta_mon`.
#
# Hai, không phải ba: một câu tư vấn nêu ba đặc điểm cho mỗi món trong danh sách sáu món là mười tám
# mệnh đề, và khách đọc trên điện thoại giữa lúc đang đói. Con số này là PHÁN ĐOÁN, không phải phép
# đo — ghi rõ để ai đổi nó biết mình đang đổi một phán đoán chứ không phải một kết quả.
SO_NHAN_PHU = 2


def _nhom_khach_hoi(request) -> frozenset[str]:
    """Những NHÓM nhãn khách đã nhắc tới ở lượt này (`spice`, `diet`, `region`...).

    Theo NHÓM chứ không theo nhãn: khách xin "món cay" thì mức cay của mọi món trong danh sách đều
    đáng nói, kể cả món `spice:mild` khi họ hỏi `spice:hot` — đó chính là thứ giúp họ chọn.
    """
    return frozenset(
        t.split(":", 1)[0]
        for t in (*request.require_tags, *request.prefer_tags, *request.avoid_tags)
        if ":" in t
    )


def _mo_ta_mon(items: list[dict], giu: frozenset[str] = frozenset()) -> str:
    """Mô tả món cho mô hình đọc — nhãn bằng TIẾNG VIỆT, và CHỈ nhãn đáng nói.

    Ba mức, theo đúng thứ tự quan trọng:

        1. DỊ NGUYÊN — luôn nói. Khách cần biết kể cả khi không hỏi, và đây là chỗ duy nhất trong
           mô tả có hậu quả sức khỏe.
        2. NHÓM KHÁCH HỎI (`giu`) — luôn nói.
        3. Còn lại — tối đa `SO_NHAN_PHU` nhãn, và chỉ những nhãn PHÂN BIỆT ĐƯỢC.

    Vì sao có mức 3: bản trước đưa **mọi** nhãn, nên mô hình đọc lại mọi nhãn. Khách hỏi "tráng
    miệng có gì" và nhận một bản kê:

        "Bánh flan caramel 30.000đ, có sữa và trứng, không cay; Bánh chuối nướng 30.000đ, có gluten
         và sữa, không cay; Chè bưởi 35.000đ, không cay, phong cách miền Nam."

    Không câu nào sai. Cái sai là **không câu nào trả lời điều được hỏi**.

    Bản trước đưa nhãn thô, và mô hình lặp lại chúng nguyên xi vào câu tiếng Việt gửi khách. Đo được
    trên stack thật:

        "Canh khổ qua nhồi nấm giá 55.000đ vì món được nấu **simmered** và không cay"

    Không phải lỗi của mô hình: nó được đưa chữ `method:simmered` và không có gì khác để gọi tên cách
    chế biến ấy. Đưa đúng chữ thì nó dùng đúng chữ.

    Vì sao lọc thêm nhãn KHÔNG PHÂN BIỆT
    ------------------------------------
    `spice` phủ 91/91 món, và **5 danh mục có toàn bộ 7/7 món là `spice:none`** — Cà phê & Trà,
    Nước ép & Sinh tố, Tráng miệng, Trái cây tươi, Bia & Rượu. Nên mô hình được đưa "không cay" cho
    một ly nước ép, và nó nói đúng thứ được đưa:

        "Nước mía Sài Gòn giá 25.000đ, không cay"
        "Bánh flan caramel 30.000đ, có sữa và trứng, không cay"

    Câu không sai, nhưng vô nghĩa: không ly nước ép nào cay, nên "không cay" không giúp khách chọn
    giữa chúng. Một câu tư vấn nói toàn điều hiển nhiên thì đọc như máy.

    **Một nhãn chỉ đáng nói khi nó PHÂN BIỆT** — và phân biệt là chuyện của DANH SÁCH đang trả lời,
    không phải của danh mục. Nhãn mà mọi món trong danh sách đều mang thì mang đúng 0 bit thông tin
    cho lần trả lời này. Tính theo danh sách còn đúng ở ca trộn loại: một ly nước ép nêu cạnh Bún bò
    Huế thì "không cay" lại có nghĩa, và nó được giữ.

    `giu` — nhãn KHÁCH ĐÃ HỎI, không bao giờ bị lọc. Khách xin món không cay thì câu trả lời phải
    nói được "không cay như bạn cần"; im lặng ở đúng chỗ khách vừa hỏi là bỏ mất lý do của câu.

    Chỉ lọc phần MÔ TẢ đưa mô hình đọc. `verify()` và bộ lọc vẫn thấy đủ nhãn — bỏ nhãn khỏi hai chỗ
    đó là hạ một hàng rào, còn bỏ khỏi mô tả chỉ là thôi nói một câu thừa.
    """
    vi = _nhan_tieng_viet()
    QUAN_TAM = ("spice:", "allergen:", "diet:", "region:", "method:")
    # Thứ tự ƯU TIÊN khi phải cắt bớt — nhóm nào giúp khách chọn nhiều hơn thì giữ trước.
    #
    # Không dùng thứ tự bảng chữ cái: `spice:` xếp CUỐI, nên giới hạn hai nhãn cắt đúng độ cay —
    # thứ khách quan tâm nhất sau dị nguyên — để giữ lại cách chế biến và vùng miền. Test bắt được
    # ngay: "Bún bò Huế | Nấu, Miền Trung" trong khi món này **cay đậm**.
    UU_TIEN = {"spice": 0, "diet": 1, "method": 2, "region": 3}

    # Nhãn mà MỌI món trong danh sách đều mang. Danh sách một món thì không có gì để so, nên không
    # lọc gì — mô tả một món phải đủ.
    chung: set[str] = set()
    if len(items) > 1:
        chung = set.intersection(*(set(i["tags"]) for i in items))

    dong: list[str] = []
    for i in items:
        gia = f"{i['price']:,}".replace(",", ".") + "đ"
        # Ba mức, theo đúng thứ tự quan trọng — xem docstring.
        buoc: list[str] = []
        phu: list[tuple[int, str]] = []
        for t in sorted(i["tags"]):
            if not t.startswith(QUAN_TAM):
                continue
            nhom = t.split(":", 1)[0]
            if nhom == "allergen" or nhom in giu:
                buoc.append(vi.get(t, t))
            elif t not in chung:
                phu.append((UU_TIEN.get(nhom, 9), vi.get(t, t)))
        nhan = buoc + [ten for _, ten in sorted(phu)[:SO_NHAN_PHU]]
        phan = [f"- {i['id']}", i["name"], gia]
        if nhan:
            phan.append(", ".join(nhan))
        dong.append(" | ".join(phan))
    return "\n".join(dong)


def verify(text: str, used: list[str], allowed: list[dict], all_items: list[dict],
           avoid_tags: list[str], budget_max: int | None = None) -> list[str]:
    """Mười phép kiểm. Trả về danh sách vi phạm — rỗng nghĩa là câu sinh dùng được.

    Áp cho MỌI câu sinh, không khai từng ca: một phép kiểm chỉ chạy ở vài chỗ là một phép kiểm không
    bảo đảm gì.
    """
    loi: list[str] = []
    cho_phep = {i["id"] for i in allowed}
    ten_cho_phep = {i["name"] for i in allowed}
    gia_cho_phep = {i["price"] for i in allowed}

    # 1. Mã món mô hình khai đã dùng phải nằm trong danh sách đưa vào.
    la = sorted(set(used) - cho_phep)
    if la:
        loi.append(f"khai dùng món ngoài danh sách: {la}")

    # 2. KHÔNG được nhắc món thật nào NGOÀI danh sách. Đây là phép kiểm bắt được kiểu sai nguy hiểm
    #    nhất mà so chuỗi bắt được: mô hình lôi một món thật khác vào, đúng tên đúng giá, nhưng món
    #    đó không qua bộ lọc — nên nó có thể mang nhãn khách cần tránh.
    ngoai = sorted(i["name"] for i in all_items
                   if i["name"] in text and i["name"] not in ten_cho_phep)
    if ngoai:
        loi.append(f"nhắc món ngoài danh sách đã lọc: {ngoai}")

    # 3. Mọi số tiền phải là giá THẬT của một món đã đưa vào — HOẶC chính con số khách vừa nêu.
    #
    # Ngoại lệ thứ hai là bản sửa của một phép chặn OAN, đo được trên stack thật:
    #
    #     khách: "Có món chay nào dưới 60 nghìn không?"
    #     sinh : bị BỎ, lý do "số tiền 60.000đ không phải giá của món nào trong danh sách"
    #
    # Mô hình không bịa gì — nó nhắc lại đúng ngân sách khách vừa nói, và nhắc lại ràng buộc là điều
    # một câu tư vấn tốt NÊN làm. Phép kiểm chặn nó, nên câu sinh bị bỏ và khách nhận lại khuôn mẫu.
    #
    # Đây là lớp lỗi "thước đo phạt hành vi đúng" mà dự án đã gặp: một phép kiểm quá chặt không làm
    # hệ thống an toàn hơn, nó chỉ làm đường tốt hơn không bao giờ được dùng.
    #
    # Vẫn chặn đúng thứ cần chặn: một con số KHÔNG phải giá món và KHÔNG phải điều khách nói thì vẫn
    # là số bịa. `budget_max` là con số duy nhất khách nêu mà hệ thống đọc được thành số.
    gia_cho_phep_va_khach_neu = set(gia_cho_phep)
    if budget_max is not None:
        gia_cho_phep_va_khach_neu.add(budget_max)
    for so in MONEY_IN_TEXT.findall(text):
        try:
            gia = int(so.replace(".", ""))
        except ValueError:
            continue
        if gia >= 1000 and gia not in gia_cho_phep_va_khach_neu:
            loi.append(f"số tiền {so}đ không phải giá của món nào trong danh sách")

    # 4. KHÔNG được nêu số lượng, trừ khi con số trùng số món trong danh sách.
    #
    # Đo được ở lần chạy thật đầu: "Nhà hàng có 6 món lẩu" — thực đơn có 7. Ba phép kiểm trên không
    # chạm tới vì nó không phải tên món, không phải giá, không phải nhãn. Đây là lớp bịa thứ tư, và
    # nó là lớp khó thấy nhất vì con số nghe rất tự nhiên.
    for so in COUNT_IN_TEXT.findall(text):
        try:
            n = int(so)
        except ValueError:
            continue
        if n != len(allowed):
            loi.append(
                f"nêu số lượng {n} món — mô hình chỉ thấy {len(allowed)} món nên mọi con số đếm "
                "khác đều có thể sai"
            )

    # 5. KHÔNG được in khóa nhãn nội bộ. Rò rỉ biểu diễn nội bộ vào chữ khách đọc.
    khoa = sorted(set(NHAN_KHOA_TRONG_TEXT.findall(text)))
    if khoa:
        loi.append(f"in mã nhãn kỹ thuật vào câu khách đọc: {khoa}")

    # 6. PHẢI nhắc ĐỦ mọi món trong danh sách.
    #
    # Đo được: golden 103 lượt với đường sinh cho 84/103, và gần hết phần đỏ còn lại là văn xuôi nêu
    # 2–3 món trong khi bộ lọc chọn 6. Hệ quả với khách có hai mặt, và cả hai đều xấu:
    #
    #   thiếu lựa chọn  khách chỉ thấy 2 món thay vì 6, tức mất 4 món họ có thể muốn
    #   lệch thẻ giỏ    thẻ giỏ dựng từ 6 món -> phải thu hẹp còn 2, nên "trả lời một kiểu, thẻ giỏ
    #                   một kiểu" chỉ hết bằng cách BỎ BỚT thẻ, chứ không phải bằng cách trả đủ
    #
    # Đòi nhắc đủ giải cả hai cùng lúc: thẻ giỏ khớp văn xuôi mà không phải bỏ món nào, và khách thấy
    # đủ lựa chọn. Mô hình bỏ sót món thì câu sinh bị BỎ và khuôn mẫu — vốn luôn nêu đủ — được dùng.
    thieu = sorted(i["name"] for i in allowed if i["name"] not in text)
    if thieu:
        loi.append(f"KHÔNG nhắc đủ món trong danh sách, thiếu: {thieu}")

    # 6b. KHÔNG được nhắc CÙNG MỘT MÓN hai lần.
    #
    # Đo được trên bản chạy thật, ngay lượt đầu của một khách:
    #
    #     "Món phụ gợi ý gồm Gà hấp lá chanh giá 280.000đ vì không cay, Gà rô ti kiểu Việt giá
    #      320.000đ vì không cay, và **Gà hấp lá chanh** giá 280.000đ vì có cách chế biến hấp nhẹ"
    #
    # Tám phép kiểm cũ đều cho qua: tên món đúng, giá đúng, không thiếu món, không thừa món. Không
    # phép nào hỏi "có món nào nêu HAI LẦN không" — nên câu lặp đi thẳng tới khách.
    #
    # Đây là bản sao của phép kiểm 6 ở chiều ngược lại. Phép 6 hỏi "đã nêu đủ chưa"; thiếu một câu
    # hỏi "có nêu thừa không", và một bất biến chỉ canh một chiều thì chỉ canh được một nửa — lớp
    # lỗi đã lặp lại nhiều lần trong dự án này.
    lap = sorted(i["name"] for i in allowed if text.count(i["name"]) > 1)
    if lap:
        loi.append(f"nhắc lặp cùng một món trong một câu: {lap}")

    # 6c. DANH SÁCH TỪ BA MÓN TRỞ LÊN PHẢI GẠCH ĐẦU DÒNG.
    #
    # Prompt đã dặn (quy tắc 9), nhưng **prompt là lời nhờ, mã mới là bảo đảm** — cùng nguyên tắc
    # với câu xác nhận bỏ ràng buộc và câu mời hỏi nhân viên. Mô hình không chịu gạch thì câu sinh
    # bị bỏ, và bản khuôn mẫu vốn luôn gạch được dùng. Khách nhận đúng thứ đã hứa dù đường nào chạy.
    #
    # Ngưỡng BA món: một hai món thì viết thành câu đọc tự nhiên hơn, và ép gạch đầu dòng ở đó là
    # bắt một câu tư vấn trở thành cái bảng. Đau đầu bắt đầu từ ba dòng trở lên.
    if len(allowed) >= 3:
        so_dong = sum(1 for d in text.splitlines() if d.strip().startswith(("-", "•", "*")))
        if so_dong < 2:
            loi.append(
                f"{len(allowed)} món mà không gạch đầu dòng — khách phải tự tách một đoạn liền "
                "để so giá"
            )

    # 7. Nhãn khách cần tránh: không món nào được nhắc mang nhãn đó. CHỐT AN TOÀN.
    #    Đây là phép kiểm cuối cùng trước khi chữ tới khách, và nó lặp lại điều bộ lọc đã làm —
    #    lặp có chủ ý: bộ lọc chọn món, còn phép này kiểm chữ, và hai thứ đó lệch nhau được.
    for tag in avoid_tags:
        xau = sorted(i["name"] for i in all_items
                     if i["name"] in text and tag in i["tags"])
        if xau:
            loi.append(f"AN TOÀN: nhắc món mang `{tag}`: {xau}")

    # 8. Khách đã nêu điều cần tránh -> câu trả lời PHẢI mở đường hỏi nhân viên. CHỐT AN TOÀN.
    #
    # Vì sao phép kiểm này tồn tại, và nó là phép kiểm đắt giá nhất trong tám
    # ---------------------------------------------------------------------
    # Đo trên 76 ca loại C với mô hình thật: đường tất định 76/76, đường sinh **61/76**. Và 14 trong
    # 15 ca tụt là ca DỊ NGUYÊN — `S-allergen-*` và `P-allergy-*`.
    #
    # Chúng tụt vì đúng một lý do: thước đo có `must_offer_staff` với `safety=True`, và câu sinh BỎ
    # câu "bạn nhắc nhân viên khi gọi món để bếp xác nhận". Khuôn mẫu luôn thêm câu đó khi có
    # `avoid_tags`; mô hình viết văn mượt hơn và bỏ nó đi.
    #
    # Nên với đường sinh, "0 lỗi an toàn" của đường tất định thành **14 lỗi an toàn**. Đó không phải
    # một con số để báo cáo — đó là một lỗi phải sửa.
    #
    # Vì sao câu đó KHÔNG phải văn vẻ mà là NỘI DUNG: nhãn dị nguyên phủ **44/91 món**, nên "thực đơn
    # không ghi nhận thành phần bạn cần tránh" KHÔNG đồng nghĩa "món này an toàn". Câu mời hỏi nhân
    # viên là chỗ duy nhất trong câu trả lời nói ra giới hạn đó. Bỏ nó là để khách tin một điều hệ
    # thống không biết.
    #
    # `PROMPT` cũng đã yêu cầu điều này, nhưng yêu cầu trong prompt là **đề nghị**, không phải bảo
    # đảm — đúng bài học của cả bước 6: an toàn không được phụ thuộc việc mô hình chịu nghe.
    if avoid_tags and not any(p in text.lower() for p in STAFF_PHRASES):
        loi.append(
            "AN TOÀN: khách nêu điều cần tránh mà câu trả lời KHÔNG mở đường hỏi nhân viên "
            f"(cần một trong {list(STAFF_PHRASES)})"
        )
    return loi


def write_reply(request: Request, chosen: list[dict], all_items: list[dict], branch: str,
                env: dict[str, str], knowledge: str = "", *,
                da_neu_truoc: list[dict] | None = None, call=None) -> GenOutcome:
    """Nhờ mô hình viết câu trả lời cho loại C. Trả `GenOutcome` với `text=None` nếu không dùng được.

    `call` cho phép test thay đường gọi mạng bằng một hàm giả — cùng cách `llm_understand` làm, và
    đó là lý do 26 test của nó chạy được không cần mạng.
    """
    if branch not in BRANCHES_ALLOWED:
        return GenOutcome(reason=f"nhánh `{branch}` không sinh (chỉ {sorted(BRANCHES_ALLOWED)})")
    if not chosen:
        return GenOutcome(reason="không có món nào để viết về")

    _ngu_canh = _mo_ta_ngu_canh(request, da_neu_truoc or [])
    prompt = PROMPT.format(
        question=request.text,
        constraints=_mo_ta_rang_buoc(request),
        ngu_canh=f"\nNGỮ CẢNH HỘI THOẠI:\n{_ngu_canh}" if _ngu_canh else "",
        # Nhãn khách ĐÃ HỎI thì không được lọc mất — xem `_mo_ta_mon`.
        items=_mo_ta_mon(chosen, _nhom_khach_hoi(request)),
        knowledge=f"\nTRI THỨC LIÊN QUAN:\n{knowledge}" if knowledge else "",
    )
    goi = call or _call_model
    parsed = goi(prompt, env)
    if parsed is None:
        return GenOutcome(reason="mô hình không trả về JSON dùng được", called=True)

    text = parsed.get("text")
    used = parsed.get("used_item_ids") or []
    if not isinstance(text, str) or not text.strip():
        return GenOutcome(reason="`text` rỗng hoặc sai kiểu", called=True)
    if not isinstance(used, list) or not all(isinstance(x, str) for x in used):
        return GenOutcome(reason="`used_item_ids` sai kiểu", called=True)

    loi = verify(text, used, chosen, all_items, list(request.avoid_tags),
                 request.budget_max)
    if loi:
        # BỎ câu sinh, không sửa và không thử lại. Sửa là đoán ý mô hình; thử lại là để một câu sai
        # có cơ hội thứ hai trong lúc khách đang chờ, và câu khuôn mẫu đã đúng sẵn.
        return GenOutcome(reason="không qua xác minh", violations=loi, called=True)
    return GenOutcome(text=" ".join(text.split()), used=used, called=True)


def _call_model(prompt: str, env: dict[str, str]) -> dict | None:
    """Gọi mô hình. Cùng đường mạng với `llm_understand.call_model`, khác prompt và khác cache.

    KHÔNG dùng cache: câu sinh phụ thuộc danh sách món, mà danh sách món phụ thuộc thực đơn và ràng
    buộc — nên khóa cache phải gồm cả hai, và một cache như vậy gần như không bao giờ trúng. Thà
    không cache còn hơn có một cache trúng 2% mà làm người đọc tin phép đo là tái lập được.
    """
    base_url = env.get("LLM_BASE_URL", "").strip()
    model = env.get("LLM_MODEL", "")
    if not base_url or not env.get("LLM_API_KEY", "").strip() or not model:
        return None
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 400,
    }).encode()
    try:
        req = urllib.request.Request(
            base_url.rstrip("/") + "/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {env['LLM_API_KEY'].strip()}",
            },
        )
        timeout = float(env.get("LLM_TIMEOUT_SECONDS", "30"))
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.load(resp)
        content = payload["choices"][0]["message"]["content"]
    except (urllib.error.URLError, OSError, KeyError, ValueError, TypeError, TimeoutError):
        return None
    match = re.search(r"\{.*\}", content, re.S)
    if match is None:
        return None
    try:
        parsed = json.loads(match.group(0))
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None
