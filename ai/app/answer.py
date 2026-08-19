# -*- coding: utf-8 -*-
"""Trả lời khách chỉ bằng cách tra thực đơn — không dùng mô hình sinh nào.

Vì sao bước này đứng trước mô hình
----------------------------------
Bản cũ có 8 đường xử lý tất định chồng lên nhau, và chỉ 33% câu trả lời do mã sinh ra —
phần còn lại phụ thuộc mô hình. Không ai nói được đường nào phụ trách việc gì, và hai
đường bị một cờ legacy tắt mà hệ thống vẫn hoạt động đúng.

Ở đây làm ngược lại: dựng phần tra bảng **trước**, đo xem nó trả lời được bao nhiêu, rồi
mới biết mô hình còn phải làm gì. Con số đó là số nền, và nó có hai tính chất mà câu trả
lời của mô hình không có: **đúng 100% về dữ liệu** và **giống nhau mọi lần chạy**.

Sáu nhánh, mỗi nhánh một việc
-----------------------------
Không có nhánh nào chồng nhánh nào, và thứ tự là thứ tự loại trừ:

1. ngoài bài toán      -> từ chối ngắn gọn
2. câu chính sách      -> nói thẳng chưa có dữ liệu
3. hỏi giá một món     -> nêu giá
4. so sánh hai món     -> nêu dữ kiện cả hai
5. món đắt/rẻ nhất     -> tính rồi nêu
6. còn lại             -> lọc thực đơn theo ràng buộc

Nhánh 6 sinh ra câu hỏi lại khi khách chưa nói gì đủ để lọc. Hỏi lại là câu trả lời đúng
ở đó, không phải thất bại.
"""
from __future__ import annotations

import re

from dataclasses import dataclass, field, replace
from itertools import zip_longest

from pathlib import Path

from rag.chunker import KnowledgeError, verbatim_answers
from understand import DRINK_CATEGORIES, FOOD_CATEGORIES, Request

# Kho tri thức nằm TRONG `ai/`, nên nó luôn có mặt trong ảnh Docker. Trước đây nó là
# `data/restaurant-facts.json`, ngoài phạm vi `COPY` của `ai/Dockerfile` — nên trong
# container mọi chủ đề chính sách trả "chưa có dữ liệu", im lặng. Xem `test_packaging.py`.
KNOWLEDGE_PATH = Path(__file__).resolve().parents[1] / "knowledge"


def load_facts() -> dict[str, str]:
    """Sự thật về nhà hàng theo chủ đề, trả NGUYÊN VĂN — mô hình không chạm vào chữ.

    Nguồn là các tài liệu `answer_mode: verbatim` trong `ai/knowledge/`. Kho tri thức có hai
    chế độ trả lời, và đây là chế độ tin mô hình **0%**:

        verbatim    giờ mở cửa, cách thanh toán, phụ phí, cách khai dị ứng — thông tin KHÔNG
                    được phép diễn đạt lại. Một chữ số lệch ở đây là sai sự thật về nhà hàng.
        synthesize  nội dung dài nhiều mặt, là đầu vào cho mô hình viết. Không đi qua hàm này.

    Ở đây truy hồi là **tra khóa**: chủ đề đã nhận ra ở bước hiểu câu hỏi chính là khóa. Không
    xếp hạng, không ngưỡng tương đồng, nên không có chỗ nào để chệch.

    Kho hỏng thì coi như chưa có — trả `{}` và hệ thống nói chưa có dữ liệu rồi chuyển nhân
    viên. Không được để một tài liệu viết sai làm sập luồng trả lời khách.
    """
    try:
        return verbatim_answers(KNOWLEDGE_PATH)
    except (KnowledgeError, OSError):
        return {}

# Số món nêu ra trong một câu liệt kê. Thước đo chặn ở 12 món ("đổ cả thực đơn ra không
# phải tư vấn"), còn ca đòi nhiều nhất là 5 món — nên 6 vừa đủ rộng mà vẫn gọn.
LIST_SIZE = 6

STAFF_NOTE = "Bạn nhắc nhân viên khi gọi món để bếp xác nhận lại giúp nhé."


@dataclass
class Reply:
    """Cùng hình dạng với `Answer` của thước đo, để chấm được trực tiếp."""

    text: str
    items: list[str] = field(default_factory=list)
    kind: str = "list"
    asks_back: bool = False
    branch: str = ""
    notes: list[str] = field(default_factory=list)


def money(value: int) -> str:
    return f"{value:,}".replace(",", ".") + "đ"


def phrase(item: dict) -> str:
    return f"{item['name']} ({money(item['price'])})"


# Từ khách dùng để gọi tên một nhóm dị nguyên, tra ngược từ nhãn. Dùng để nhận ra khách vừa XIN
# đúng thứ họ vừa nói mình tránh.
_TU_GOI_DI_NGUYEN = {
    "allergen:seafood": ("hai san", "do bien", "tom", "cua", "muc", "nghieu", "so", "oc", "hau"),
    "allergen:peanut": ("dau phong", "lac"),
    "allergen:dairy": ("sua", "pho mai", "kem"),
    "allergen:egg": ("trung",),
    "allergen:gluten": ("gluten", "bot mi", "mi"),
}


def _xung_dot_di_nguyen(request: Request) -> list[str]:
    """Nhãn dị nguyên mà khách VỪA TRÁNH lại VỪA HỎI XIN trong cùng một câu.

    Đo được trên bản chạy thật, và nó là ngõ cụt im lặng:

        "Con tôi không ăn được tôm hãy tư vấn món hải sản khác"
        -> Bánh mì pate, Cháo lòng, Gỏi cuốn chay, Đậu hũ sốt cà chua...

    Khách xin **món hải sản khác** và nhận về bánh mì, không một lời giải thích. Hệ thống làm đúng
    về mặt an toàn — nhãn `allergen:seafood` phủ cả 26 món hải sản nên không còn món nào — nhưng nó
    **không nói ra**, nên khách tưởng nhà hàng hết món hoặc hệ thống hỏng.

    Vì sao KHÔNG thu hẹp bộ lọc xuống riêng con tôm, dù thực đơn có `ingredient:shrimp` (12 món):
    **7/26 món hải sản không có nhãn nguyên liệu nào cho biết là hải sản gì**, và hai trong số đó
    chứa tôm thật:

        Bún đậu mắm tôm   "Chấm MẮM TÔM pha chanh đường ớt"     nhãn: pork, tofu
        Bún bò Huế        "nước dùng ... sả, MẮM RUỐC, ớt sa tế"  nhãn: beef, pork

    Lọc theo `ingredient:shrimp` sẽ mời đúng hai món đó cho một đứa trẻ dị ứng tôm. Nên chặn rộng
    là lựa chọn đúng với dữ liệu đang có — và việc phải làm là NÓI RA, không phải nới ra.
    """
    if not request.avoid_tags:
        return []
    f = f" {request.folded} "
    return [
        t for t in request.avoid_tags
        if any(f" {tu} " in f for tu in _TU_GOI_DI_NGUYEN.get(t, ()))
    ]


def _cau_noi_xung_dot(nhan: list[str]) -> str:
    """Câu giải thích vì sao không có món nào thuộc nhóm khách vừa hỏi."""
    ten = ", ".join(_ALLERGEN_VI.get(t, t.split(":")[-1]) for t in nhan)
    return (
        f"Bạn có nhắc tới {ten} như thứ cần tránh, mà thực đơn chỉ ghi nhãn theo NHÓM "
        f"— không tách riêng từng loại — nên mình không lọc ra được món {ten} an toàn. "
        f"Mình gợi ý các món thực đơn không ghi nhận {ten} nhé."
    )


def _chon_combo(request: Request, items: list[dict]) -> tuple[list[tuple[str, list[dict]]], int]:
    """Chọn món cho từng suất. Trả `([(tên suất, [món]), ...], tổng tiền)`.

    Ba điều làm nhánh này khác nhánh lọc phẳng:

    1. **Mỗi suất lọc riêng.** Nhiều danh mục trong một câu lọc phẳng chỉ thành phép HOẶC, mà khách
       đang xin phép CỘNG: một món chính VÀ một đồ uống VÀ một tráng miệng.
    2. **Ràng buộc chung vẫn áp cho mọi suất.** Dị nguyên, độ cay, chế độ ăn — khách nêu một lần
       thì đúng cho cả bộ. `select()` được gọi lại cho từng suất nên không có đường nào lọt.
    3. **Ngân sách áp trên TỔNG.** "tầm 300k" cho một bộ ba món nghĩa là cả bộ 300k, không phải mỗi
       món 300k. Đây là chỗ dễ hiểu sai nhất, và hiểu sai theo hướng đắt hơn thì khách trả tiền.

    Cách xếp trong ngân sách: bắt đầu bằng lựa chọn HẠNG ĐẦU của mỗi suất, rồi hạ dần suất đang
    đắt nhất xuống món rẻ hơn kế tiếp cho tới khi tổng vừa. Không tìm tổ hợp tối ưu — bài toán đó
    là knapsack, và "rẻ nhất có thể" cũng không phải điều khách muốn. Hạ dần từ hạng đầu giữ được
    thứ tự ưu tiên vốn đã đo, và dừng ngay khi vừa túi.
    """
    # `combo=[]` để `select()` không quay lại nhánh này; `categories` do từng suất đặt.
    goc = replace(request, combo=[], categories=[], ho_mon=[], wants="any", budget_max=None)

    ung_vien: list[tuple[str, int, list[dict]]] = []
    for ten, so, nhom in request.combo:
        cho_phep = [i for i in items if i["categoryId"] in nhom]
        # Bỏ ràng buộc mà KHÔNG món nào của suất này mang được.
        #
        # Đo được: "hai người, tầm 300k, cho mình 1 món chính 1 lẩu và 2 nước" -> suất đồ uống
        # RỖNG, vì `party:two_three` suy từ "hai người" áp cả lên đồ uống mà không ly nước nào mang
        # nhãn số người. Khách mất hẳn hai suất nước vì một ràng buộc nói về món ăn.
        #
        # Cùng nguyên tắc với "loại đang HỎI thắng loại được NHẮC tới": ràng buộc chỉ có nghĩa
        # trong phạm vi nó mô tả. Suy từ thực đơn nên nó không lệch khi dữ liệu đổi.
        #
        # Dị nguyên KHÔNG nằm trong phép bỏ này — nó ở `avoid_tags`, và `select()` áp riêng.
        cua_suat = {t for i in cho_phep for t in i["tags"]}
        rieng = replace(
            goc,
            categories=list(nhom),
            require_tags=[t for t in goc.require_tags if _ap_duoc(t, cua_suat)],
        )
        duoc = _order(select(rieng, cho_phep), request.prefer_tags, "any",
                      _khach_xin_ruou(request))
        ung_vien.append((ten, so, duoc))

    # Hạng đầu của mỗi suất.
    chon: list[list[dict]] = [ds[:so] for _, so, ds in ung_vien]

    def tong() -> int:
        return sum(m["price"] for nhom in chon for m in nhom)

    if request.budget_max is not None:
        # Hạ dần suất đang đắt nhất. Mỗi vòng đổi đúng MỘT món, nên nó dừng: mỗi suất chỉ hạ được
        # hữu hạn bước, và vòng lặp thoát khi không còn suất nào hạ được nữa.
        while tong() > request.budget_max:
            ha_duoc = False
            for idx in sorted(range(len(chon)),
                              key=lambda k: -max((m["price"] for m in chon[k]), default=0)):
                _, so, ds = ung_vien[idx]
                dang = chon[idx]
                if not dang:
                    continue
                dat_nhat = max(dang, key=lambda m: m["price"])
                re_hon = [m for m in ds if m["price"] < dat_nhat["price"] and m not in dang]
                if re_hon:
                    chon[idx] = [m for m in dang if m is not dat_nhat] + [
                        max(re_hon, key=lambda m: m["price"])
                    ]
                    ha_duoc = True
                    break
            if not ha_duoc:
                break

    return [(ten, chon[i]) for i, (ten, _, _) in enumerate(ung_vien)], tong()


# Tên suất bằng tiếng Việt có dấu, cho câu trả lời.
_TEN_SUAT_VI = {
    "khai vi": "Khai vị", "trang mieng": "Tráng miệng", "do uong": "Đồ uống",
    "thuc uong": "Thức uống", "nuoc uong": "Nước uống", "nuoc": "Đồ uống",
    "lau": "Lẩu", "mon chinh": "Món chính", "mon man": "Món mặn",
}


def listing(items: list[dict]) -> str:
    """Danh sách món, MỖI MÓN MỘT DÒNG có gạch đầu dòng.

    Trước đây nối bằng dấu phẩy thành một đoạn liền:

        Mời bạn tham khảo: Bánh mì pate Sài Gòn (35.000đ), Cháo lòng Sài Gòn (45.000đ), Gỏi cuốn
        chay (45.000đ), Đậu hũ sốt cà chua (45.000đ), Xôi gà Hà Nội (50.000đ), Cơm chiên chay ngũ
        sắc (50.000đ).

    Khách đọc trên điện thoại, giữa lúc đang đói, và phải tự tách sáu món ra khỏi một khối chữ để
    so giá. Gạch đầu dòng làm đúng việc đó thay họ — và giá thẳng hàng thì so được bằng mắt.

    `\\n` chứ không phải `<br>` hay markdown bảng: khung chat của khách hiện văn bản thuần, nên thứ
    duy nhất chắc chắn xuống dòng là ký tự xuống dòng.
    """
    return "\n".join(f"- {phrase(i)}" for i in items)


# Nhãn `party:*` đọc được cho khách. Nhóm này phủ 91/91 món và nó CHÍNH LÀ khẩu phần — xem chú
# thích ở `understand.py` về việc chủ đề `serving_size` bị bỏ.
#
# Chỉ ba nhãn dưới đây nói về SỐ NGƯỜI. `party:share`, `party:friends`, `party:family` nói về DỊP
# ĂN, không nói khẩu phần — trộn chúng vào thì câu trả lời thành "món này cho gia đình người ăn".
# Tên tiếng Việt của nhãn dị nguyên và độ cay, để câu trả lời NÓI RA thuộc tính khách hỏi.
#
# Vì sao cần: câu "Ốc hương rang bơ tỏi có sữa không?" từng nhận "thực đơn có ghi nhận thành phần
# bạn cần tránh trong Ốc hương rang bơ tỏi" — đúng nhưng **buộc khách tự suy ra thành phần nào**.
# Khách hỏi về sữa thì câu trả lời phải nói "sữa".
#
# Hai bảng này bị `test_answer.py` ép phải phủ ĐỦ nhãn của nhóm tương ứng trong `menu-tags.json`,
# nên thêm nhãn mới vào từ điển mà quên ở đây là test đỏ — không phải bảng viết tay rồi trôi.
_ALLERGEN_VI = {
    "allergen:seafood": "hải sản",
    "allergen:peanut": "đậu phộng",
    "allergen:egg": "trứng",
    "allergen:dairy": "sữa",
    "allergen:gluten": "gluten",
}

_SPICE_VI = {
    "spice:none": "không cay",
    "spice:mild": "cay nhẹ",
    "spice:medium": "cay vừa",
    "spice:hot": "cay đậm",
}


def _thuoc_ho(item: dict, ho_mon: list[str]) -> bool:
    """Món này có thuộc một trong những họ món khách gọi tên không.

    So theo TỪ ĐẦU của tên món, không phải chứa-ở-bất-kỳ-đâu. "Bún đậu mắm tôm" bắt đầu bằng "bun"
    nên nó là món bún; còn nếu so kiểu chứa thì một họ tên ngắn sẽ quét sang món khác chỉ vì trùng
    chữ — đúng lớp lỗi đụng chữ mà cả `understand.py` được thiết kế để tránh.
    """
    from understand import fold

    ten = fold(item["name"])
    return any(ten == h or ten.startswith(h + " ") for h in ho_mon)


def _spice_of(item: dict) -> str:
    """Mức cay của một MÓN ĂN. Chuỗi rỗng với đồ uống — thuộc tính không áp dụng.

    Cả **21/21 đồ uống** trong thực đơn đều mang `spice:none`, và nhãn đó không sai: một ly bia
    đúng là không cay. Nhưng nêu nó ra thì thành câu vô nghĩa mà khách đọc được:

        "Bia Hà Nội (18.000đ). Món này không cay."
        "Trà sữa trân châu (45.000đ). Món này không cay."

    Độ cay là thuộc tính của món ăn. Nói một ly bia không cay không sai về dữ liệu, nhưng nó cho
    khách thấy trợ lý đang đọc nhãn chứ không hiểu mình đang nói về cái gì — và đó là thứ khách
    nhớ lâu hơn một câu trả lời đúng.

    Lọc ở đây chứ không xóa nhãn khỏi dữ liệu: `spice:none` trên đồ uống vẫn dùng được cho phép
    lọc ("đồ uống không cay" giao với "món không cay" phải ra kết quả), chỉ là không đáng NÓI RA.
    """
    if item.get("categoryId") in DRINK_CATEGORIES:
        return ""
    tag = next((t for t in item["tags"] if t.startswith("spice:")), "")
    return _SPICE_VI.get(tag, "")


_SERVING_VI = {
    "party:solo": "một người",
    "party:two_three": "2–3 người",
    "party:three_five": "3–5 người",
}


_MARKDOWN_NHAN_MANH = re.compile(r"\*\*|__|`")
_GACH_DAU_DONG = re.compile(r"^\s*[-*+]\s+", re.MULTILINE)


def chu_cho_khach(chunk) -> str:
    """Đoạn tri thức, viết lại cho KHÁCH ĐỌC. Không đổi nội dung, chỉ đổi cách trình bày.

    Vì sao cần: đoạn được trích ra là dán THÔ trước khi có hàm này
    -------------------------------------------------------------
    Hỏi stack thật "Phở với bún khác nhau thế nào?" và khách nhận:

        Phở, bún, mì, hủ tiếu — khác nhau thế nào — Khác nhau ở SỢI, không ở nước dùng Người mới
        thường nghĩ các món nước Việt khác nhau ở nước dùng. Thực tế điều phân biệt chúng trước
        tiên là **sợi**: - **Phở** — sợi dẹt, mềm, làm từ gạo. Nước dùng trong. - **Bún** — ...

    Nội dung ĐÚNG. Trình bày thì sai ba chỗ, và cả ba đến từ `" ".join(text.split())`:

        1. tên tài liệu + tiêu đề mục dính vào đầu câu ("Phở, bún, mì, hủ tiếu — khác nhau thế nào
           — Khác nhau ở SỢI...") — khách hỏi một câu và nhận về một cái nhan đề
        2. dấu `**` của markdown lọt nguyên vào chữ khách đọc
        3. gạch đầu dòng bị nối thành một đoạn dài, nên "- **Phở** — sợi dẹt" thành "... là **sợi**:
           - **Phở** — sợi dẹt"

    Chỗ 1 đáng nói nhất vì nó là hệ quả của một quyết định ĐÚNG ở chỗ khác: `chunker` cố ý gắn tiêu
    đề tài liệu vào `text` để đoạn **tự đủ ngữ cảnh khi truy hồi**. Đúng cho việc xếp hạng, sai cho
    việc đọc. Hai mục đích khác nhau trên cùng một chuỗi, và trước đây chỉ có một cách trình bày.

    Vì sao KHÔNG bỏ tiêu đề khỏi `chunk.text`: làm vậy là làm yếu truy hồi để làm đẹp trình bày —
    đổi một thứ đo được lấy một thứ không đo được. Tách hai mục đích ra là cách đúng.

    Điều hàm này KHÔNG làm: nó không viết lại câu, không tóm tắt, không diễn đạt lại. Nội dung tri
    thức phải giữ nguyên chữ của người viết tài liệu — đó là toàn bộ lý do đường này không đi qua mô
    hình sinh.
    """
    tho = chunk.text
    # Bỏ dòng tiền tố (tiêu đề tài liệu — tiêu đề mục). Nó luôn là dòng ĐẦU, xem `chunker`.
    dong = tho.split("\n", 1)
    than = dong[1] if len(dong) > 1 else dong[0]

    than = _MARKDOWN_NHAN_MANH.sub("", than)
    # Gạch đầu dòng thành câu riêng: thay "- " bằng chỗ ngắt, rồi nối bằng "; " để đọc liền mạch mà
    # vẫn thấy đây là một danh sách. Không giữ ký tự "-" vì khách đọc trên điện thoại thấy nó lạc.
    than = _GACH_DAU_DONG.sub("\n• ", than)

    y = [d.strip() for d in than.split("\n") if d.strip()]
    ra = " ".join(y)
    return " ".join(ra.split())


def _chon_muc(co_muc: list, question: str, so_muc: int = 1) -> list:
    """`so_muc` mục sát nhất trong MỘT tài liệu. Embedding khi được, BM25 khi không.

    Không dựng chỉ mục mới: dùng lại vector của chỉ mục TOÀN KHO, vốn đã nạp sẵn lúc khởi động. Xem
    docstring của `_knowledge_chunk` cho lý do đầy đủ và cho hai trường hợp lùi về BM25.

    Trả về DANH SÁCH theo thứ tự điểm giảm dần, kể cả khi `so_muc` là 1 — một kiểu trả về cho mọi
    trường hợp thì chỗ gọi không cần rẽ nhánh.
    """
    from rag.bm25 import Bm25Index

    theo_id = {c.chunk_id: c for c in co_muc}
    index, cach = _bo_truy_hoi_toan_kho()

    if cach == "embedding" and index is not None:
        co_vector = set(getattr(index, "chunk_ids", ()) or ())
        # ĐỦ ứng viên phải có vector, không phải một phần. Chấm điểm trên tập con thiếu vài đoạn là
        # lặng lẽ loại chúng khỏi cuộc thi — và đoạn bị loại có thể là đoạn đúng.
        if theo_id.keys() <= co_vector:
            diem = index.scores(question)
            # Phá thế theo `chunk_id` TĂNG DẦN — cùng luật với `Bm25Index.search` và với bộ so
            # (`sorted(..., key=lambda kv: (-kv[1], kv[0]))`). Dùng `max` với khóa `(điểm, chunk_id)`
            # sẽ chọn id LỚN nhất khi hòa, tức hai đường xếp hạng phá thế ngược nhau — và một hệ
            # thống có hai luật phá thế là hệ thống không lặp lại được kết quả của chính nó.
            xep = sorted(co_muc, key=lambda c: (-diem.get(c.chunk_id, 0.0), c.chunk_id))
            return xep[:so_muc]

    hits = Bm25Index.build(co_muc).search(question, k=so_muc)
    ra = [theo_id[h.chunk_id] for h in hits if h.chunk_id in theo_id]
    return ra or co_muc[:so_muc]


def _knowledge_chunk(topic: str, question: str) -> str | None:
    """Đoạn của tài liệu `topic` trả lời `question` sát nhất, hoặc None nếu không có tài liệu.

    Truy hồi ở đây chỉ xếp hạng TRONG PHẠM VI một tài liệu — 3–8 đoạn, không phải 303. Chủ đề đã
    được nhận ra bằng TRA KHÓA ở bước hiểu câu hỏi, nên phần xếp hạng không quyết định *trả lời về
    cái gì*, chỉ quyết định *mục nào của tài liệu đó*. Đó là lý do không cần ngưỡng tương đồng:
    tài liệu nào cũng có ít nhất một mục, và mục sát nhất luôn tốt hơn không trả lời.

    ĐÃ ĐỔI SANG EMBEDDING, vì SỐ — và vì chính dòng này dặn phải đổi khi có số
    ------------------------------------------------------------------------
    Bản trước dùng BM25 với hai lý lẽ: "3–8 đoạn cùng chủ đề khác nhau ở TỪ KHÓA của từng mục, đúng
    chỗ BM25 mạnh", và "nó không thêm 2–3GB vào ảnh Docker". Kèm điều kiện xét lại: *có tập ca ĐỦ
    LỚN cho việc chọn đoạn trong phạm vi tài liệu*.

    Cả hai lý lẽ nay đã hết, và điều kiện đã xảy ra:

        tập ca      168 ca / 13 họ, hai tập chia theo họ (`chunk_selection_cases.json`)
        Top-1       niêm phong  bm25 0,750  ->  embedding 0,864     +11,4 điểm
                    riêng câu diễn đạt khác từ  0,636 -> 0,818      +18,2 điểm
        ảnh Docker  đã có embedding cho nhánh truy hồi toàn kho, nên phần "thêm 2–3GB" là 0

    CON SỐ 0,864 Ở TRÊN LÀ SỐ CỦA PHẦN DỄ — đo lại sau khi phủ hết kho
    ------------------------------------------------------------------
    Bộ 168 ca đó phủ **84/372 đoạn = 22,58%**, và phần được phủ không ngẫu nhiên: mỗi nhóm
    `derived` đúng 4 đoạn trên 24–40. Nhóm `derived` là nhóm có độ trùng lặp cao nhất kho, tức
    phần KHÓ nhất gần như không được đo.

    Mở rộng bộ sinh cho toàn bộ 49 tài liệu `derived` (168 -> 500 ca, phủ 250/372 = 67,20%):

        written  (viết tay, như cũ)   n= 76   embedding 0,921
        derived  (mới phủ 100%)       n=380   embedding 0,674     thấp hơn 19 điểm

    Đây là lần THỨ HAI cùng một sai lầm trong dự án. Bước 2 của mục 4.10 đã bắt nó ở tầng truy hồi
    toàn kho — bộ 222 ca phủ 36/85 tài liệu, và phần bỏ sót hóa ra là phần khó nhất. Lý lẽ khi đó
    ("49 tài liệu dùng chung một khuôn nên kiểm cả 49 là thừa") nghe hợp lý y như lần này.

    Và bảng theo DẠNG CÂU trên nhóm `derived` cho thấy vì sao bộ nhỏ không thấy được:

        dạng                    bm25    embedding   hybrid
        A trùng từ khóa        0,774      0,721     0,774      <- BM25 THẮNG ở đây
        B diễn đạt khác        0,295      0,626     0,453
        chênh A->B            -0,479     -0,095    -0,321

    Đo chỉ trên dạng A thì kết luận đúng sẽ là "dùng BM25, rẻ hơn 6.000 lần". Bộ 168 ca cũ có quá
    ít ca `derived` dạng B để lộ ra điều đó — nên quyết định đổi sang embedding vẫn ĐÚNG, nhưng
    con số dùng để biện minh cho nó thì đã bị thổi phồng bởi độ phủ.

    Đây là chỗ lệch đáng nói nhất còn lại sau khi đổi bộ truy hồi toàn kho: bộ so 168 ca đo ĐÚNG
    đường này, còn đường này vẫn chạy BM25. Tức báo cáo nói một bộ, hệ thống chạy bộ khác — đúng lớp
    lỗi mà `/ready.retriever` được thêm vào để chặn.

    Và nó KHÔNG tốn thêm gì lúc chạy
    -------------------------------
    Cách hiển nhiên là dựng một `EmbeddingIndex` cho mỗi tài liệu — nhưng đo được là mã hóa 3–8 đoạn
    mất ~91ms MỖI LƯỢT, tức đắt hơn BM25 gần 1000 lần cho cùng một việc.

    Cách ở đây không dựng gì: chỉ mục TOÀN KHO đã có vector của cả 370 đoạn và đã nạp sẵn lúc khởi
    động. Xếp hạng trong một tài liệu chỉ là **giới hạn phép chấm điểm đó vào tập con** — cosine trên
    vector đã chuẩn hóa L2 nên điểm của một đoạn không phụ thuộc việc có bao nhiêu đoạn khác trong
    chỉ mục. Chi phí thật: **một** lần mã hóa CÂU HỎI, thứ nhánh truy hồi toàn kho cũng phải làm.

    Lùi về BM25 ở hai trường hợp, và cả hai đều nói ra qua `/ready.retriever`:
      1. không có `sentence-transformers`
      2. ứng viên có đoạn MỞ ĐẦU — chúng không nằm trong chỉ mục toàn kho (`doan_toan_kho` lọc
         `heading` rỗng), nên không có vector để chấm. Chỉ xảy ra với tài liệu không có mục nào.

    CHIẾN LƯỢC ĐÃ ĐO NHƯNG KHÔNG NHẬN (giữ lại, vẫn đúng): "ưu tiên mục có TIÊU ĐỀ trùng nhiều từ với
    câu hỏi nhất" — xem đoạn dưới.

    CHIẾN LƯỢC ĐÃ ĐO NHƯNG KHÔNG NHẬN: "ưu tiên mục có TIÊU ĐỀ trùng nhiều từ với câu hỏi nhất".
    Nó đạt 6/7 so với 5/7 của bản hiện tại trên 7 câu có khóa đáp án — nhưng **n=7 thì một ca lệch
    là 14%**, và trên 3 câu chưa có khóa đáp án nó chọn đoạn KÉM HƠN ở 2 câu. Chọn chiến lược trên
    7 điểm dữ liệu với biên 1 ca là đúng thứ dự án này có luật riêng để tránh.

    Nên nó được ghi lại chứ không nhận, và điều kiện để xét lại là có tập ca ĐỦ LỚN cho việc chọn
    đoạn trong phạm vi tài liệu — chứ không phải cảm giác rằng tiêu đề là tín hiệu tốt.

    Trả `None` khi không tìm được tài liệu, và chỗ gọi nói "chưa có dữ liệu". Kho hỏng thì coi như
    chưa có, cùng nguyên tắc với `load_facts()`.
    """
    try:
        from rag.bm25 import Bm25Index
        from rag.chunker import retrievable_chunks

        cua_tai_lieu = [
            c for c in retrievable_chunks(KNOWLEDGE_PATH) if topic in c.topic_keys
        ]
    except (KnowledgeError, OSError, ImportError):
        return None
    if not cua_tai_lieu:
        return None

    # BỎ đoạn MỞ ĐẦU (`heading` rỗng) khỏi tập ứng viên. 55/425 đoạn là mở đầu, và chúng mô tả TÀI
    # LIỆU chứ không trả lời câu nào — "Tài liệu này nói về cách ghép các món với nhau...". Đo
    # được: BM25 chọn đúng đoạn mở đầu ở 2 câu, và câu trả lời khi đó không trả lời gì.
    #
    # Đây là quy tắc CẤU TRÚC, không phải chỉnh tham số: một mục không có tiêu đề là phần dẫn nhập
    # của tài liệu. Nên nó không cần đo để biện minh — nhưng vẫn đo, và nó sửa đúng 2 ca.
    #
    # Giữ lại mở đầu làm dự phòng khi tài liệu KHÔNG có mục nào: thà trả phần dẫn nhập còn hơn nói
    # "chưa có dữ liệu" khi tài liệu có nội dung.
    co_muc = [c for c in cua_tai_lieu if c.heading] or cua_tai_lieu

    # Lấy `SO_DOAN_TRI_THUC` mục, cùng số với đường truy hồi toàn kho — và cùng lý do, nhưng đây là
    # phép đo RIÊNG trên bộ 168 ca chọn mục, không phải suy từ kết quả của đường kia:
    #
    #     1 mục   75,60%    72 từ
    #     2 mục   90,48%   138 từ     McNemar so với 1 mục: p = 0,0000
    #     3 mục   94,64%   208 từ     p = 0,0000
    #
    # +14,88 điểm cho +66 từ. Bài toán này còn hưởng lợi rõ hơn đường toàn kho, và lý do thì hợp lý:
    # các mục của CÙNG một tài liệu nói về cùng chủ đề và khác nhau ở khía cạnh, nên hai mục liền
    # nhau hiếm khi lạc đề — cái giá "đoạn lạc" ở đây nhỏ hơn hẳn.
    #
    # Ca bắt được lỗi này là một lượt golden: "Mình nên nói với nhà hàng thế nào về việc dị ứng?"
    # chọn mục #4 (dị ứng nằm ngoài năm loại) thay vì #3 ("Khi gọi món, NÓI VỚI NHÂN VIÊN về dị
    # ứng") — mục #3 là câu trả lời, và nó đứng ngay sau trong bảng xếp hạng.
    chon = _chon_muc(co_muc, question, so_muc=SO_DOAN_TRI_THUC)

    # Ghép theo THỨ TỰ TRONG TÀI LIỆU, không theo thứ tự điểm.
    #
    # Hai mục ở đây là hai phần của CÙNG một bài văn xuôi, tác giả viết chúng nối tiếp nhau. Xếp
    # theo điểm thì văn đọc ngược logic — đo được trên chính lượt golden đã bắt lỗi này:
    #
    #     theo điểm     #4 "Nếu dị nguyên của bạn không nằm trong năm loại…"
    #                   #3 "Vì vậy hãy làm thêm một việc: khi gọi món, nói với nhân viên…"
    #
    # "Vì vậy" đứng sau tiền đề của nó thì thành câu cụt. Theo thứ tự tài liệu thì #3 trước #4, và
    # đoạn trả lời đúng câu hỏi cũng lên đầu — nhưng lý do sắp xếp là MẠCH VĂN, không phải để một
    # ca đi qua: `chunk_id` mang số thứ tự nên đây là thứ tự tác giả, không phải thứ tự tôi chọn.
    chon = sorted(chon, key=lambda c: c.chunk_id)
    return "\n\n".join(chu_cho_khach(c) for c in chon)


def _bo_truy_hoi_toan_kho():
    """Bộ xếp hạng trên TOÀN KHO, dựng một lần cho cả tiến trình.

    Vì sao nhánh này tồn tại
    ------------------------
    Đề bài (`00-problem-statement.md` mục 3B) nói loại B "cần một kho tri thức, và cần **tìm đúng
    đoạn**". Nhưng trước nhánh này, tài liệu `synthesize` chỉ tới được qua CỤM TỪ VỰNG: `understand`
    nhận ra `knowledge_topic` rồi `_knowledge_chunk` xếp hạng 3–7 đoạn TRONG tài liệu đó.

    Hệ quả đo được: 60 tài liệu nhưng chỉ 33 cụm chủ đề, nên phần kho không có cụm là nội dung
    **không bao giờ tới tay khách** — im lặng, không lỗi. Và thêm tài liệu mới mà không thêm cụm thì
    chỉ làm kho to hơn chứ không làm trợ lý trả lời được thêm câu nào.

    Truy hồi toàn kho tháo đúng nút đó: tài liệu tới được vì NỘI DUNG của nó khớp câu hỏi, không vì
    ai đó nhớ thêm một cụm vào từ vựng.

    KHÔNG có ngưỡng tương đồng, và nhánh này được đặt ở đâu là lý do
    ---------------------------------------------------------------
    Nó đứng ngay TRƯỚC nhánh hỏi lại, tức nó chỉ chạy khi câu hỏi **không có ràng buộc nào** để lọc
    thực đơn và **không** ngoài phạm vi. Đó là đúng tập câu đang rơi vào "bạn muốn món ăn hay đồ
    uống?" — nên nhánh này không lấy câu nào của nhánh khác, và nó không cần ngưỡng để quyết định
    có nên trả lời: nếu tới được đây thì lựa chọn còn lại là hỏi lại, và một đoạn tri thức sát nhất
    tốt hơn một câu hỏi lại.

    Chọn embedding khi có, lùi về BM25 khi không
    -------------------------------------------
    Đo được trên tập chọn mục (168 ca, hai tập): embedding Top-1 0,864–0,921 so với BM25 0,750–0,803,
    và cách biệt lớn nhất ở câu diễn đạt khác từ (0,818–0,868 so với 0,636–0,684).

    Nhưng `sentence-transformers` không nằm trong `ai/requirements.txt` (nó kéo theo 2–3GB), nên
    trong container hiện tại nhánh này chạy BM25. Hàm trả về CẢ TÊN phương pháp để `Reply.branch`
    nói ra cái nào đã chạy — một hệ thống âm thầm lùi về bản kém hơn là hệ thống không đo được.
    """
    global _TOAN_KHO
    if _TOAN_KHO is not None:
        return _TOAN_KHO
    try:
        from rag.bm25 import Bm25Index
        from rag.chunker import doan_toan_kho

        # `doan_toan_kho` chứ không phải phép lọc viết tại đây: bước tính sẵn vector lúc build phải
        # dùng ĐÚNG tập này, và khi phép lọc được viết ở hai chỗ thì hai chỗ đã lệch nhau một lần
        # rồi — đệm vector im lặng không bao giờ khớp. Xem docstring của `doan_toan_kho`.
        doan = doan_toan_kho(KNOWLEDGE_PATH)
        if not doan:
            _TOAN_KHO = (None, "kho rỗng")
            return _TOAN_KHO
        try:
            from rag import embedding as EMB

            if EMB.available():
                _TOAN_KHO = (EMB.EmbeddingIndex.build(doan), "embedding")
                return _TOAN_KHO
        except ImportError:
            pass
        _TOAN_KHO = (Bm25Index.build(doan), "bm25")
    except (KnowledgeError, OSError, ImportError) as exc:
        _TOAN_KHO = (None, f"{type(exc).__name__}")
    return _TOAN_KHO


_TOAN_KHO: tuple[object, str] | None = None


_TU_MIEN: frozenset[str] | None = None


def _tu_thuoc_mien(items: list[dict]) -> frozenset[str]:
    """Tập từ thuộc MIỀN nhà hàng, SINH TỪ DỮ LIỆU — không viết tay.

    Nguồn: tên món, tên danh mục, nhãn tiếng Việt của từ điển nhãn, và tiêu đề mọi tài liệu tri
    thức. Bốn nguồn đó là toàn bộ vốn từ mà hệ thống có thể trả lời về, nên một câu không chạm từ
    nào trong đó là câu hệ thống không có gì để nói.

    Vì sao không viết tay danh sách: nó sẽ trôi khỏi thực đơn ngay lần thêm món, và một cổng dựa
    trên danh sách trôi sẽ chặn oan hoặc mở oan mà không ai biết. Sinh từ dữ liệu thì tập tự lớn
    lên cùng thực đơn và kho.

    Bỏ từ một ký tự và từ chức năng ngắn: chúng có trong mọi câu nên chúng làm cổng vô nghĩa.
    """
    from understand import fold

    BO = {"mon", "cua", "va", "cho", "co", "khong", "nao", "gi", "la", "cai", "voi", "de",
          "ban", "minh", "toi", "duoc", "the", "nay", "do", "o", "an", "uong"}
    tu: set[str] = set()
    for i in items:
        tu.update(fold(i["name"]).split())
        tu.update(fold(i.get("categoryName", "")).split())
    try:
        import json as _json

        nhan = _json.loads(
            (Path(__file__).resolve().parents[2] / "data" / "menu-tags.json")
            .read_text(encoding="utf-8-sig")
        )["tags"]
        for meta in nhan.values():
            tu.update(fold(meta.get("label_vi", "")).split())
    except (OSError, ValueError, KeyError):
        pass
    try:
        from rag.chunker import retrievable_chunks

        for c in retrievable_chunks(KNOWLEDGE_PATH):
            tu.update(fold(c.heading or "").split())
    except (KnowledgeError, OSError, ImportError):
        pass
    return frozenset(t for t in tu if len(t) > 2 and t not in BO)


def thuoc_mien(question: str, items: list[dict]) -> bool:
    """Câu hỏi có chạm vào vốn từ của nhà hàng không.

    Cổng cho nhánh truy hồi toàn kho. Đo được vì sao cần: không có nó, "Bạn là model gì?" nhận về
    một đoạn nói về lẩu, và "Đội nào thắng trận tối qua?" nhận về một đoạn nói về cà phê — cả hai
    tệ hơn một câu hỏi lại rõ ràng.
    """
    global _TU_MIEN
    if _TU_MIEN is None:
        _TU_MIEN = _tu_thuoc_mien(items)
    from understand import fold

    return any(t in _TU_MIEN for t in fold(question).split())


def trang_thai_truy_hoi() -> dict:
    """Trạng thái ĐỌC ĐƯỢC của tầng truy hồi, để `/ready` báo ra.

    Vì sao cần: lỗi đệm-vector-không-khớp là IM LẶNG
    -----------------------------------------------
    Đã xảy ra thật. Bước build tính vector cho 425 đoạn, lúc chạy cần 370 (tập đã lọc `heading`), nên
    hàm băm lệch và container mã hóa lại toàn bộ mỗi lần khởi động — 60 giây. Hệ thống vẫn ĐÚNG, chỉ
    chậm, và log build in "đã ghi ... cho 425 đoạn" nên mọi dấu hiệu nói là đã có đệm.

    Cách duy nhất phát hiện lúc đó là bấm giờ container rồi thấy nó không giảm. Ba trường dưới đây
    biến nó thành thứ nhìn thấy ngay — cùng lý do `/ready` phải báo `model_key_set` riêng thay vì chỉ
    báo `model_configured`: một trạng thái nói thiếu điều kiện làm người đọc tin một điều chưa kiểm.
    """
    index, cach = _bo_truy_hoi_toan_kho()
    return {
        "retriever": cach,
        "retriever_chunks": len(getattr(index, "chunk_ids", []) or []),
        # `None` khi bộ đang dùng không phải embedding — khác `False`, vì `False` nghĩa là "có đệm mà
        # không dùng được", còn `None` nghĩa là "khái niệm này không áp dụng".
        "retriever_vectors_from_cache": getattr(index, "tu_dem", None) if cach == "embedding" else None,
    }


def ham_nong_truy_hoi() -> str:
    """Dựng chỉ mục toàn kho NGAY, và trả về tên phương pháp đang dùng.

    Vì sao phải hâm nóng thay vì để lười
    ------------------------------------
    Chỉ mục dựng lười nghĩa là **khách đầu tiên** trả giá nạp mô hình và mã hóa 425 đoạn. Đo được
    trên máy có embedding: bộ test nhảy từ 20 giây lên 124 giây chỉ vì một lần dựng chỉ mục. Với
    khách thật thì đó là một lượt chat treo hàng chục giây, và nó xảy ra đúng lần đầu — tức đúng
    lúc gây ấn tượng xấu nhất.

    Embedding NAY đã vào ảnh, nên chi phí đó đã chuyển sang lúc khởi động — đúng như dòng này viết
    từ trước. Đo được trong container: 97,3 giây, và 61,7 giây trong đó là mã hóa. Sau khi vector
    được tính sẵn lúc build, phần mã hóa còn 0,1 giây.
    """
    _, cach = _bo_truy_hoi_toan_kho()
    return cach


# Số ĐOẠN tri thức được trích cho một câu trả lời.
#
# Vì sao con số này không phải 1
# ------------------------------
# Đo đường cong Hit@k của bộ nhúng trên chiều A — 50 câu tri thức khó nhất của dự án:
#
#     k= 1   48,00%          k= 3   68,00%          k=10   80,00%
#     k= 2   64,00%          k= 5   74,00%
#
# Và với một bộ nhúng mạnh hơn (`bge-m3`) thì **Hit@20 = 100,00%**: không một câu nào trong 50 câu
# mà tài liệu đúng nằm ngoài tầm với. Nghĩa là kho tri thức trả lời được HẾT, còn hệ thống thì nhìn
# đúng MỘT đoạn trong 372 rồi bỏ đi phần còn lại.
#
# Tách nguyên nhân trên 50 ca đó: 0,00% là "kho không có", **40,00% là XẾP HẠNG SAI** — tài liệu
# đúng có mặt trong top-10 nhưng không đứng nhất. Đây là lỗi duy nhất còn lại, và nó không sửa được
# bằng viết thêm dữ liệu hay đổi mô hình.
#
# Vì sao KHÔNG nới `BRANCHES_ALLOWED` để mô hình tổng hợp nhiều đoạn
# ------------------------------------------------------------------
# Đó là cách thu về nhiều điểm nhất, và cũng là cách mở đúng con đường mà cả kiến trúc này dựng lên
# để chặn: mô hình viết chữ về tri thức nhà hàng thì không có gì ràng nó vào tài liệu.
#
# Trích NHIỀU ĐOẠN NGUYÊN VĂN giữ được ràng buộc đó — mọi chữ khách đọc vẫn là chữ trong kho — mà
# vẫn lấy lại phần lớn khoảng cách. Cái giá là câu trả lời dài hơn, và đó là cái giá đo được.
#
# Vì sao 2 chứ không phải 3 hay 5
# -------------------------------
# `run_so_doan.py` đo cả LỢI lẫn GIÁ trên 50 câu, gọi đúng phép chọn của bản chạy thật:
#
#     đoạn   trúng tài liệu đúng   số từ (trung vị)   đoạn lạc / câu
#       1          48,00%                  64              0,52
#       2          64,00%                 126              1,36
#       3          68,00%                 186              2,30
#       5          76,00%                 320              4,24
#
# Cả ba mức đều hơn mức 1 có ý nghĩa thống kê (McNemar p = 0,0078 · 0,0020 · 0,0001). Nên câu hỏi
# không phải "có nên tăng không" mà là "tăng tới đâu", và lợi BIÊN trả lời rõ:
#
#     1 -> 2   +16,00 điểm cho +62 từ    = 25,81 điểm mỗi 100 từ
#     2 -> 3    +4,00 điểm cho +60 từ    =  6,67 điểm mỗi 100 từ
#     3 -> 5    +8,00 điểm cho +134 từ   =  5,97 điểm mỗi 100 từ
#
# Bước đầu hiệu quả gấp gần **bốn lần** bước sau. Từ mức 3 trở đi mỗi câu trả lời mang theo hơn hai
# đoạn nói về chuyện khác — thứ làm khách đọc một thông tin đúng-về-việc-khác rồi tưởng đó là câu
# trả lời cho mình. Đó là cái giá không đo bằng số từ được.
SO_DOAN_TRI_THUC = 2


def chon_doan_tri_thuc(question: str) -> tuple[list, str] | None:
    """Các ĐOẠN được chọn cho câu này, kèm tên phương pháp. None nếu không tra được.

    Tách khỏi `doan_tri_thuc_lien_quan()` để bộ đánh giá gọi được ĐÚNG phép chọn của bản chạy thật
    mà không phải đoán lại từ chữ đã định dạng.

    Bản đầu của bộ đo `run_so_doan.py` làm đúng cái việc đoán lại đó — nó so tám từ đầu của chữ đã
    trích với văn bản tài liệu — và báo mức 1 đoạn đạt 36,00% trong khi Hit@1 của cùng bộ truy hồi
    là 48,00%. Chênh 12 điểm đó là lỗi của PHÉP ĐO: `chu_cho_khach()` bỏ tiêu đề và dấu markdown,
    nên chữ đã định dạng không còn khớp chuỗi gốc.

    Trả về đối tượng đoạn thì không còn chỗ cho lớp lỗi đó.

    Khử trùng theo TÀI LIỆU: hai đoạn cùng một tài liệu thì chỉ giữ đoạn đứng trước. Không có bước
    này thì một tài liệu 9 đoạn chiếm cả ba suất, và câu trả lời dài gấp ba mà không thêm tài liệu
    nào — đúng thứ mà việc tăng `k` nhắm vào lại không đạt được.
    """
    index, cach = _bo_truy_hoi_toan_kho()
    if index is None:
        return None
    # Lấy dư rồi mới khử trùng: xin đúng 3 thì sau khi khử có thể chỉ còn 1.
    hits = index.search(question, k=max(SO_DOAN_TRI_THUC * 3, 5))
    if not hits:
        return None
    try:
        from rag.chunker import retrievable_chunks

        theo_id = {c.chunk_id: c for c in retrievable_chunks(KNOWLEDGE_PATH)}
    except (KnowledgeError, OSError):
        return None

    da_co: set[str] = set()
    chon: list = []
    for h in hits:
        c = theo_id.get(h.chunk_id)
        if c is None or c.doc_id in da_co:
            continue
        da_co.add(c.doc_id)
        chon.append(c)
        if len(chon) >= SO_DOAN_TRI_THUC:
            break
    return (chon, cach) if chon else None


def doan_tri_thuc_lien_quan(question: str) -> tuple[str, str] | None:
    """Chữ cho khách từ các đoạn đã chọn, kèm tên phương pháp. None nếu không tra được."""
    got = chon_doan_tri_thuc(question)
    if got is None:
        return None
    chon, cach = got
    return ("\n\n".join(chu_cho_khach(c) for c in chon), cach)


def _hai_ve(request: Request, items: list[dict]) -> tuple[list[dict], list[dict]]:
    """Hai vế của câu «A hay B». Vế trái là loại món, vế phải là nhãn.

    `hai_lua_chon=False` ở cả hai vế: thiếu nó thì mỗi vế lại tách đôi tiếp và hàm tự gọi mãi. Đệ
    quy vô hạn ngay lần chạy đầu — một lỗi ồn ào, may hơn là một lỗi im lặng.
    """
    ve_loai = replace(request, require_tags=[], hai_lua_chon=False)
    ve_nhan = replace(request, categories=[], ho_mon=[], wants="any", hai_lua_chon=False)
    return select(ve_loai, items), select(ve_nhan, items)


def _ap_duoc(tag: str, cua_nhom: set[str]) -> bool:
    """Nhãn này có món nào trong nhóm mang không. Nhãn ghép thì chỉ cần MỘT mức có mặt."""
    if "|" in tag:
        nhom, cac_muc = tag.split(":", 1)
        return any(f"{nhom}:{m}" in cua_nhom for m in cac_muc.split("|"))
    return tag in cua_nhom


def _ho_mon_khac_loai(ho_mon: list[str], items: list[dict], nhom_dung: frozenset | set) -> bool:
    """Họ món khách gọi tên có nằm NGOÀI loại đang hỏi không.

    "ăn lẩu thì uống gì" — `lau` là họ món ĂN, còn câu hỏi là về ĐỒ UỐNG. Kiểm bằng thực đơn chứ
    không bằng danh sách viết tay: một họ món mà không món nào của nhóm thuộc về thì nó là họ của
    nhóm kia.
    """
    if not ho_mon:
        return False
    return not any(
        _thuoc_ho(i, ho_mon) for i in items if i["categoryId"] in nhom_dung
    )


def select(request: Request, items: list[dict]) -> list[dict]:
    """Lọc thực đơn theo đúng những gì khách đã nói.

    Thứ tự áp ràng buộc không đổi kết quả (đều là phép AND), nhưng ràng buộc dị nguyên
    được áp **cuối** và không bao giờ bị nới — kể cả khi kết quả rỗng. Đó là fail-closed:
    thà nói "không có món nào phù hợp" còn hơn mời khách một món có thể gây dị ứng.
    """
    picked = list(items)
    # Phạm vi và loại trừ do bộ nhớ phiên điền — tham chiếu ngược vào danh sách khách vừa đọc.
    # Áp TRƯỚC mọi ràng buộc khác vì chúng thu tập ứng viên, không phải thêm điều kiện lên nhãn.
    if request.scope_item_ids:
        cho_phep = set(request.scope_item_ids)
        picked = [i for i in picked if i["id"] in cho_phep]
    if request.exclude_item_ids:
        bo = set(request.exclude_item_ids)
        picked = [i for i in picked if i["id"] not in bo]
    # KHÁCH NÓI MÌNH ĐANG ĂN GÌ, VÀ HỎI UỐNG GÌ. Món đang ăn là NGỮ CẢNH, không phải bộ lọc.
    #
    # Đo được, và cả bốn ca đều trả lời ngược câu hỏi:
    #
    #     "ăn lẩu thì uống gì hợp"        -> 6 món LẨU        (khách hỏi uống)
    #     "ăn phở uống gì ngon"           -> 3 món PHỞ
    #     "món nướng hợp với đồ uống gì"  -> 0 món            (không đồ uống nào `method:grilled`)
    #     "đồ uống nào hợp món cay"       -> 0 món            (không đồ uống nào cay)
    #
    # `wants` được nhận ĐÚNG là `drink` ở cả bốn. Hỏng ở chỗ khác: `ho_mon` và `categories` được áp
    # TRƯỚC `wants`, nên tên món ăn trong câu thắng chính điều khách đang hỏi. Và với hai ca cuối,
    # nhãn suy từ món ăn (`method:grilled`, độ cay) không món uống nào mang, nên giao ra rỗng.
    #
    # Quy tắc: **loại đang hỏi thắng loại được nhắc tới.** Nhắc "lẩu" trong câu hỏi về đồ uống là để
    # nói mình đang ăn gì, không phải để xin thêm lẩu.
    #
    # Nhãn nào là "chỉ của món ăn" thì SUY TỪ THỰC ĐƠN, không viết tay: nhãn mà không đồ uống nào
    # mang thì áp vào một câu hỏi đồ uống chắc chắn cho kết quả rỗng. Suy từ dữ liệu nên nó không
    # thể lệch khi thực đơn đổi — cùng nguyên tắc với `ho_mon_trong_thuc_don()`.
    if request.wants in ("food", "drink") and not request.asks_difference:
        nhom_dung = FOOD_CATEGORIES if request.wants == "food" else DRINK_CATEGORIES
        cua_nhom = {t for i in items if i["categoryId"] in nhom_dung for t in i["tags"]}
        request = replace(
            request,
            ho_mon=[] if _ho_mon_khac_loai(request.ho_mon, items, nhom_dung) else request.ho_mon,
            categories=[c for c in request.categories if c in nhom_dung],
            # Nhãn không loại nào trong nhóm mang -> bỏ khỏi bộ lọc. Giữ nó chỉ đảm bảo kết quả rỗng.
            require_tags=[t for t in request.require_tags if _ap_duoc(t, cua_nhom)],
        )

    # «A hay B» — lấy HỢP của hai vế thay vì GIAO.
    #
    # "nên gọi lẩu hay nướng": vế một là danh mục Lẩu, vế hai là `method:grilled`. Giao chúng là đi
    # tìm món vừa là lẩu vừa nướng — không có, nên khách nhận 0 món cho một câu hỏi hoàn toàn bình
    # thường. Hợp chúng là đưa ra cả hai nhóm để khách chọn, tức trả lời đúng điều được hỏi.
    #
    # Dị nguyên và ngân sách KHÔNG nằm trong phép hợp: chúng được áp SAU, trên kết quả đã hợp. Nới
    # một hàng rào an toàn vì câu có chữ "hay" là cách tệ nhất để cơ chế này hỏng.
    if getattr(request, "hai_lua_chon", False):
        trai, phai = _hai_ve(request, picked)
        hop = {i["id"] for i in [*trai, *phai]}
        picked = [i for i in picked if i["id"] in hop]
        if request.budget_max is not None:
            picked = [i for i in picked
                      if (i["price"] < request.budget_max if request.budget_strict
                          else i["price"] <= request.budget_max)]
        for tag in request.avoid_tags:
            picked = [i for i in picked if tag not in i["tags"]]
        return picked

    # DANH MỤC KHÁCH NÓI RÕ LÀ KHÔNG MUỐN — loại trước mọi phép lọc khác.
    #
    # "tôi không uống bia, tư vấn cho tôi đồ uống khác" từng trả về ba loại bia: `bia` là cụm danh
    # mục nên nó được áp như bộ lọc DƯƠNG. Loại ở đây, sớm nhất có thể, để không nhánh lọc nào sau
    # đó kéo chúng về.
    if request.avoid_categories:
        picked = [i for i in picked if i["categoryId"] not in request.avoid_categories]

    # HỌ MÓN khách gọi tên thắng danh mục.
    #
    # Khách hỏi "có phở không" nhận về cả bún, vì "phở" ánh xạ vào danh mục `cat_noodle` — mà danh
    # mục ấy tên là **"Phở & Bún"**. Đúng nhóm, sai câu hỏi: khách nêu tên một họ món cụ thể.
    #
    # Phép kiểm sức khỏe deploy bắt được, và nó bắt bằng một bất biến rất chặt: mọi thẻ giỏ của câu
    # hỏi phở phải là món CÓ CHỮ PHỞ trong tên. Bốn món bún trong giỏ làm nó đỏ — trong khi 103 lượt
    # golden, 140 ca và 87 lượt phiên đều xanh.
    #
    # Lọc theo tên THAY danh mục, không cộng thêm: "Phở chay nấm đông cô" nằm ở `cat_vegetarian`, và
    # nó VẪN là phở. Giao hai điều kiện thì mất đúng món mà khách sẽ thấy thiếu.
    if request.ho_mon:
        picked = [i for i in picked if _thuoc_ho(i, request.ho_mon)]
    elif request.categories:
        picked = [i for i in picked if i["categoryId"] in request.categories]
    elif request.wants == "food":
        picked = [i for i in picked if i["categoryId"] in FOOD_CATEGORIES]
    elif request.wants == "drink":
        picked = [i for i in picked if i["categoryId"] in DRINK_CATEGORIES]
    for tag in request.require_tags:
        # Dấu `|` là PHÉP HOẶC TRONG CÙNG MỘT NHÓM: `spice:mild|medium|hot` nghĩa là "cay ở bất kỳ
        # mức nào". Cần đúng một chỗ này vì `spice` là nhóm loại trừ — mỗi món mang đúng một mức,
        # nên phép AND thông thường không diễn đạt được "cay" mà không thu về một mức duy nhất.
        #
        # `session._group()` cắt ở dấu ":" đầu tiên nên nhãn ghép vẫn thuộc nhóm `spice`, và quy
        # tắc "lượt mới ghi đè cùng nhóm" vẫn đẩy được `spice:none` ra. Đó là điều làm cách biểu
        # diễn này dùng được mà không phải thêm trường mới vào `Request`.
        if "|" in tag:
            nhom, cac_muc = tag.split(":", 1)
            chap_nhan = {f"{nhom}:{m}" for m in cac_muc.split("|")}
            picked = [i for i in picked if chap_nhan & set(i["tags"])]
        else:
            picked = [i for i in picked if tag in i["tags"]]
    if request.budget_max is not None:
        if request.budget_strict:
            picked = [i for i in picked if i["price"] < request.budget_max]
        else:
            picked = [i for i in picked if i["price"] <= request.budget_max]
    for tag in request.avoid_tags:
        picked = [i for i in picked if tag not in i["tags"]]
    return picked


def _khach_xin_ruou(request: Request) -> bool:
    """Khách có CHỦ ĐỘNG xin rượu bia không.

    Chỉ khi họ gọi tên danh mục ấy, hoặc gọi tên một họ món thuộc nó. Không suy từ dịp ăn: nhãn
    `occasion:drinking` gắn cho món NHẬU, không có nghĩa khách đang muốn uống rượu.
    """
    if "cat_alcohol" in (request.categories or []):
        return True
    return any(h in ("bia", "ruou") for h in (request.ho_mon or []))


def _order(items: list[dict], prefer_tags: list[str], wants: str = "any",
           cho_ruou: bool = False) -> list[dict]:
    """Sắp cố định để câu trả lời giống nhau mọi lần chạy.

    Món mang nhãn ngữ cảnh khách nêu (dịp ăn) được đưa lên trước, nhưng món không mang
    nhãn đó **không bị loại**. Đó là cách dùng đúng cho nhóm nhãn không phủ hết 91 món:
    thiếu nhãn nghĩa là *chưa ghi nhận*, không phải *không phù hợp*.

    Khi khách CHƯA nói món ăn hay đồ uống, món ăn được xếp trước đồ uống
    -------------------------------------------------------------------
    Vì sao cần: 5 món rẻ nhất thực đơn đều là đồ uống (12.000–30.000đ) còn món ăn rẻ nhất là
    35.000đ. Nên sắp theo giá tăng dần làm đồ uống **luôn** đứng đầu, và câu "món nào không cay?"
    trả về sáu loại bia. Đo được: **13/119 ca** khách hỏi "món" mà nhận toàn đồ uống — và cả 13
    đều QUA đánh giá, vì khóa đáp án không cấm đồ uống.

    Đây là NGỮ CẢNH, không phải ràng buộc — cùng nguyên tắc với dịp ăn:

    - **xếp trước**, nên "món nào không cay" trả món ăn thay vì bia
    - **KHÔNG lọc**, nên "món nào rẻ hơn 20 nghìn" vẫn trả đồ uống, vì không món ăn nào dưới
      20.000đ và trả rỗng ở đó mới là sai

    Lọc cứng ở đây sẽ hỏng đúng ca thứ hai: khách hỏi thật, dữ liệu trả lời được, mà hệ thống nói
    "không có món nào phù hợp".

    Tráng miệng và trái cây cũng phải xếp sau, KHÔNG chỉ đồ uống
    -----------------------------------------------------------
    Bản đầu chỉ đẩy `DRINK_CATEGORIES` xuống cuối, và bỏ sót một khoảng: `cat_dessert` và
    `cat_fruit` không thuộc `FOOD_CATEGORIES` **cũng không thuộc** `DRINK_CATEGORIES` — 14 món nằm
    ngoài cả hai nhóm. Chúng giá 30.000–45.000đ, còn món ăn rẻ nhất 35.000đ, nên chúng lên đầu y
    như bia từng lên đầu.
    
    Đo được: câu "Cho mình vài món không cay" nêu **0/6 món mặn** — cả sáu là chè, bánh flan và
    trái cây. Câu "Gợi ý vài món dưới 60 nghìn" nêu 1/6. Cả hai đều ĐÚNG về nhãn (chè không cay,
    chè dưới 60 nghìn) nhưng khách đang chọn bữa ăn và không gọi được một bữa từ 5 món chè.
    
    Cùng một lớp lỗi với sáu chai bia, nên cùng một cách sửa: **xếp hạng, không lọc**. Ca
    `P-savoury-03` ("có món tráng miệng nào không cay không?") là chốt cho điều đó — nó đỏ ngay
    nếu ai sửa bằng cách bỏ tráng miệng khỏi kết quả.
    """
    def key(item: dict) -> tuple:
        matched = sum(1 for t in prefer_tags if t in item["tags"])
        # Ba bậc, không hai: món mặn trước, rồi tráng miệng/trái cây, rồi đồ uống. Bậc giữa tồn tại
        # vì "món ăn phụ" gần với bữa ăn hơn đồ uống — khách hỏi "món gì" mà nhận chè thì còn hiểu
        # được, nhận bia thì không.
        if wants != "any" or item["categoryId"] in FOOD_CATEGORIES:
            bac = 0
        elif item["categoryId"] in DRINK_CATEGORIES:
            bac = 2
        else:
            bac = 1

        # RƯỢU BIA KHÔNG TỰ ĐỨNG ĐẦU KHI KHÁCH KHÔNG XIN.
        #
        # Đo được, và người dùng báo đúng chỗ này: mọi câu hỏi đồ uống đều mở đầu bằng bia. Nguyên
        # nhân là bậc trên cho MỌI đồ uống cùng hạng khi `wants='drink'`, rồi xếp theo giá — mà bốn
        # món rẻ nhất thực đơn đều là bia (12.000–22.000đ) còn nước mía 25.000đ.
        #
        #     "1 món chính, 1 thức uống, 1 tráng miệng"  -> thức uống = Bia hơi Hà Nội
        #     "tư vấn đồ uống"                           -> ba loại bia đứng đầu
        #
        # Đây không chỉ là gợi ý nhạt. Khách ăn trưa, khách đi với trẻ con, khách còn lái xe — mặc
        # định mời rượu bia cho tất cả là lời tư vấn tệ, và ở vài tình huống là tệ hơn thế. Nhà
        # hàng vẫn bán rượu bia; câu hỏi là nó có nên là thứ ĐẦU TIÊN đề xuất cho người không hỏi.
        #
        # Xếp hạng, KHÔNG lọc — cùng nguyên tắc với "món ăn trước đồ uống": khách xin bia thì vẫn ra
        # bia ngay đầu (`cho_ruou`), và câu "đồ uống rẻ nhất" vẫn trả bia vì đó là sự thật.
        ruou = 0 if (cho_ruou or item["categoryId"] != "cat_alcohol") else 1
        return (-matched, bac, ruou, item["price"], item["id"])

    return sorted(items, key=key)


def _TEN_RANG_BUOC_VI(tag: str) -> str:
    """`spice:none` -> "không cay". Trả về chuỗi RỖNG nếu không dịch được.

    Nguồn tên là `menu-tags.json` — **85 nhãn**, cùng bảng mà `generate._mo_ta_mon()` dùng. Bản đầu
    của hàm này đọc `intent._TEN_VI` (13 nhãn) và rơi về nhãn thô khi thiếu, nên câu cho khách in ra
    nguyên văn:

        Điều kiện "method:grilled" đang chặn — bỏ nó ra thì có 21 món.

    Rò khóa nhãn nội bộ vào chữ khách đọc là thứ `generate.verify()` có hẳn một phép kiểm để chặn ở
    đường sinh. Đường khuôn mẫu không được phép làm đúng điều đó — nên ở đây dịch được thì nói, không
    dịch được thì **im**, và bên gọi bỏ qua ứng viên ấy.
    """
    from generate import _nhan_tieng_viet

    bang = _nhan_tieng_viet()
    if "|" in tag:
        nhom, cac_muc = tag.split(":", 1)
        ten = [bang.get(f"{nhom}:{m}", "") for m in cac_muc.split("|")]
        return " hoặc ".join(t.lower() for t in ten if t)
    return bang.get(tag, "").lower()


def respond(request: Request, items: list[dict]) -> Reply:
    """Câu trả lời cho một lượt. Lớp mỏng bọc `_chon_cau_tra_loi` để ghép câu XÁC NHẬN.

    Vì sao phải bọc thay vì ghép ở từng nhánh: `_chon_cau_tra_loi` có **22 điểm trả về**. Ghép ở
    từng chỗ thì chắc chắn sót một, và chỗ sót sẽ là chỗ im lặng bỏ mất một hàng rào an toàn mà
    khách không được biết. Một chỗ duy nhất thì không sót được.
    """
    reply = _chon_cau_tra_loi(request, items)

    from intent import cau_xac_nhan_da_bo

    xac_nhan = cau_xac_nhan_da_bo(list(getattr(request, "da_bo_rang_buoc", ()) or ()))
    if xac_nhan:
        reply = replace(reply, text=xac_nhan + reply.text)
    return reply


def _chon_cau_tra_loi(request: Request, items: list[dict]) -> Reply:
    by_id = {i["id"]: i for i in items}
    named = [by_id[i] for i in request.named_items if i in by_id]

    # 1. Ngoài bài toán.
    if request.off_topic:
        return Reply(
            text=(
                "Mình chỉ hỗ trợ về món ăn và đồ uống của nhà hàng thôi ạ. "
                "Bạn cần gợi ý món gì không?"
            ),
            kind="refuse",
            branch="off_topic",
        )

    # 1b. XÃ GIAO — chào hỏi, cảm ơn, tán gẫu.
    #
    # Đứng ngay sau `off_topic` để nhánh đã đo kia không đổi hành vi, và đứng TRƯỚC mọi nhánh chọn
    # món vì một lời chào không phải một yêu cầu lọc.
    #
    # Vì sao nhánh này phải tồn tại: không có nó, "xin chào" rơi xuống bước 6b-bis (truy hồi toàn
    # kho, KHÔNG có ngưỡng tương đồng) và khách nhận về một đoạn tri thức gần nhất. Đo được trên
    # production:
    #
    #     "xin chào"        -> danh sách rượu nếp cẩm, cà phê trứng, trà sen...
    #     "cảm ơn bạn nhé"  -> một đoạn giảng về kết cấu món mềm và ít dầu mỡ
    #
    # Cổng `thuoc_mien()` lẽ ra chặn được, nhưng nó là phép OR trên TỪNG TỪ ĐƠN của mọi tên món sau
    # khi rút dấu — nên `chao` của "xin chào" khớp món **"Cháo lòng Sài Gòn"**, và gần như mọi câu
    # tiếng Việt đều lọt. Vụ đụng chữ thứ tám.
    from intent import cau_tra_loi_xa_giao

    _xa_giao = cau_tra_loi_xa_giao(request)
    if _xa_giao is not None:
        return Reply(text=_xa_giao, kind="fact", branch=f"xa_giao:{request.y_dinh}")

    # 2. Câu chính sách và câu dinh dưỡng — chưa có kho tri thức nào.
    if request.policy_topic is not None:
        if request.policy_topic == "internal":
            return Reply(
                text=(
                    "Mình không cung cấp thông tin nội bộ của nhà hàng ạ. "
                    "Mình hỗ trợ bạn chọn món thì tiện hơn."
                ),
                kind="refuse",
                branch="internal",
            )
        if request.policy_topic == "no_size":
            # Món có thể có thật, nhưng thực đơn không có khái niệm size. Nêu giá cho
            # "size lớn" là bịa ra một thứ không tồn tại.
            item = named[0] if named else None
            head = f"{phrase(item)}. " if item is not None else ""
            return Reply(
                text=(
                    f"{head}Thực đơn chưa ghi nhận tùy chọn size cho món này, nên mình "
                    f"chưa có dữ liệu về giá theo size ạ. {STAFF_NOTE}"
                ),
                items=[item["id"]] if item is not None else [],
                kind="no_data",
                branch="no_size",
            )
        known = load_facts().get(request.policy_topic)
        if known:
            return Reply(
                text=f"{known} Nếu cần rõ hơn, bạn hỏi nhân viên giúp mình nhé.",
                kind="fact",
                branch=f"facts:{request.policy_topic}",
            )
        # Nêu tên món CHỈ khi khách trỏ vào nó bằng THAM CHIẾU, không nêu khi khách tự gõ tên.
        #
        # Phân biệt này không phải để một ca xanh — nó là hai tình huống khác nhau:
        #
        #   khách gõ "Phở bò tái nạm bao nhiêu calo?"  họ ĐÃ biết mình hỏi món nào. Nhắc lại tên
        #                                              không thêm gì, và trong một câu "chưa có dữ
        #                                              liệu" thì nó đọc như một lời MỜI món.
        #   khách gõ "món đó cho mấy người ăn?"        họ KHÔNG biết hệ thống hiểu "món đó" là món
        #                                              nào. Không nêu tên thì họ không phát hiện
        #                                              được khi hệ thống trỏ sai.
        #
        # Bản đầu của tôi nêu tên trong CẢ HAI, và `O-nodata-01` đỏ đúng vì lý do thứ nhất: một ca
        # "chưa có dữ liệu" không được nêu món. Thước đo bắt được, và nó bắt đúng.
        tro_bang_tham_chieu = named and request.reference_index is not None
        head = f"{phrase(named[0])}. " if tro_bang_tham_chieu else ""
        return Reply(
            text=(
                f"{head}Mình chưa có dữ liệu về việc này ạ. "
                f"{STAFF_NOTE}"
            ),
            items=[named[0]["id"]] if tro_bang_tham_chieu else [],
            kind="no_data",
            branch=f"policy:{request.policy_topic}",
        )

    # 2c. Khẩu phần của MỘT món đã nêu tên (hoặc trỏ tới bằng tham chiếu ngược).
    #
    # Trả lời từ nhãn `party:*` của chính món, không từ tri thức chung — hỏi về một món thì đáp án
    # là nhãn của món đó. Nhóm `party` phủ 91/91 nên nhánh này luôn có gì để nói.
    if request.asks_serving and named:
        item = named[0]
        muc = [_SERVING_VI[t] for t in ("party:solo", "party:two_three", "party:three_five")
               if t in item["tags"]]
        if muc:
            return Reply(
                text=f"{phrase(item)} phù hợp cho {', '.join(muc)} ạ.",
                items=[item["id"]],
                kind="fact",
                branch="serving_named_dish",
            )

    # 2d. Chủ đề tri thức NHIỀU MỤC. Khác nhánh 2 ở chỗ tài liệu có nhiều mục nên phải chọn mục.
    #
    # Đặt SAU nhánh chính sách (nguyên văn) và SAU nhánh món-đã-nêu-tên, TRƯỚC nhánh lọc. Thứ tự đó
    # là thứ tự loại trừ và nó quan trọng:
    #
    #   trước nhánh lọc  vì 4 trong 10 câu tri thức từng rơi vào nhánh lọc và nhận về danh sách món
    #   sau nhánh 2      vì chủ đề nguyên văn chính xác tuyệt đối, còn ở đây phải CHỌN mục
    #
    # Câu trả lời là đoạn tri thức NGUYÊN VĂN, không nhờ mô hình viết lại. Tài liệu được viết để
    # đọc được, và một chữ số lệch trong câu về nhà hàng là sai sự thật — cùng lý do với 24 chủ đề
    # nguyên văn. Mô hình có thể viết hay hơn, nhưng "hay hơn" không đáng đổi bằng "có thể bịa".
    # Hỏi khẩu phần mà KHÔNG nêu món nào -> câu hỏi về cả thực đơn, trả bằng tri thức chung.
    chu_de_tri_thuc = request.knowledge_topic
    if chu_de_tri_thuc is None and request.asks_serving:
        chu_de_tri_thuc = "portion_timing"

    if chu_de_tri_thuc is not None:
        doan = _knowledge_chunk(chu_de_tri_thuc, request.text)
        if doan:
            return Reply(
                text=f"{doan} Nếu cần rõ hơn, bạn hỏi nhân viên giúp mình nhé.",
                kind="fact",
                branch=f"knowledge:{chu_de_tri_thuc}",
            )
        return Reply(
            text=f"Mình chưa có dữ liệu về việc này ạ. {STAFF_NOTE}",
            kind="no_data",
            branch=f"knowledge_missing:{chu_de_tri_thuc}",
        )

    # 2b. Khách hỏi một món cụ thể mà thực đơn không có. Phải nói không có, tuyệt đối
    #     không được xác nhận hay bịa giá cho nó.
    if request.unknown_item:
        return Reply(
            text=(
                "Thực đơn của nhà hàng chưa có món đó nên mình chưa có dữ liệu về nó ạ. "
                "Bạn cho mình biết bạn thích vị gì để mình gợi ý món gần nhất nhé?"
            ),
            kind="no_data",
            branch="unknown_item",
            asks_back=True,
        )

    # 3. Hỏi giá một món đã nêu tên.
    if request.asks_price and len(named) == 1 and not request.is_comparison:
        item = named[0]
        return Reply(
            text=f"{item['name']} giá {money(item['price'])} ạ.",
            items=[item["id"]],
            kind="fact",
            branch="price_lookup",
        )

    # 4. So sánh hai món đã nêu tên.
    #
    # Nhận CẢ `asks_comparison` — cách hỏi TIẾP NỐI ("món nào cay hơn?") không nhắc lại tên món, và
    # `session.py` lấy lại cặp món của câu so sánh gần nhất. Không nới ở đây thì cặp món đã lấy lại
    # rơi xuống nhánh `item_detail` và câu trả lời nói về MỘT món — trả lời một câu so sánh bằng
    # thông tin của một bên.
    if (request.is_comparison or request.asks_comparison) and len(named) == 2:
        first, second = named
        gap = abs(first["price"] - second["price"])
        cheaper = first if first["price"] <= second["price"] else second
        # Nêu CẢ độ cay, không chỉ giá.
        #
        # Câu "món nào CAY HƠN?" từng nhận về so sánh GIÁ — đúng dữ liệu, sai câu hỏi. Và ca đánh
        # giá cho câu đó vẫn xanh, vì tiêu chí `tags_include` của nó là mã chết trong thước đo.
        #
        # Cách sửa là nêu cả hai thuộc tính chứ không đoán khách đang so chiều nào: `spice` phủ
        # 91/91 nên luôn nói được, và một câu trả lời nêu đủ giá lẫn độ cay trả lời được cả hai
        # cách hỏi mà không cần phân loại câu hỏi — bớt một chỗ có thể đoán sai.
        cay = [f"{i['name']} {_spice_of(i)}" for i in (first, second) if _spice_of(i)]
        them = f" Về độ cay: {', '.join(cay)}." if cay else ""
        return Reply(
            text=(
                f"{phrase(first)} và {phrase(second)}. "
                f"Chênh nhau {money(gap)}, {cheaper['name']} nhẹ ví hơn.{them} "
                "Bạn muốn mình nói thêm về khẩu vị của từng món không?"
            ),
            items=[first["id"], second["id"]],
            kind="compare",
            branch="compare",
        )

    # 5. Món đắt nhất / rẻ nhất, trong đúng phạm vi khách nêu.
    if request.asks_extreme is not None:
        pool = select(request, items) or items
        item = min(pool, key=lambda i: i["price"]) if request.asks_extreme == "cheapest" \
            else max(pool, key=lambda i: i["price"])
        label = "rẻ nhất" if request.asks_extreme == "cheapest" else "đắt nhất"
        # NÓI RÕ phạm vi khi phạm vi bị thu hẹp.
        #
        # Câu "Món đắt nhất là Cháo lòng Sài Gòn, giá 45.000đ" là một khẳng định TUYỆT ĐỐI sai,
        # dù cả tên món lẫn giá đều có thật: nó chỉ đúng trong phạm vi ngân sách đang có hiệu lực.
        # Với khách, một câu như vậy không khác gì bịa — nên câu trả lời phải mang theo phạm vi
        # của chính nó.
        #
        # Đo bằng số món, không bằng việc dò xem ràng buộc nào đang bật: hễ phạm vi nhỏ hơn cả
        # thực đơn thì nói ra, nên thêm ràng buộc mới về sau không cần sửa chỗ này.
        # `str.capitalize()` KHÔNG dùng được ở đây: nó hạ chữ toàn bộ phần sau, nên "Tôm hùm nướng
        # mỡ hành" thành "tôm hùm nướng mỡ hành". Tên món là dữ liệu, không phải văn xuôi — không
        # hàm chữ nào được chạy qua nó. Tiêu chí `must_name_item` của bộ chạy phiên bắt đúng lỗi
        # này, vì nó so tên món tra từ thực đơn chứ không so chuỗi viết tay.
        mo_dau = "Trong phạm vi bạn nêu, m" if len(pool) < len(items) else "M"

        # KHÁCH HỎI "MÓN" MÀ ĐÁP ÁN LÀ ĐỒ UỐNG.
        #
        # Đo được: "rẻ nhất là món nào" -> **Bia hơi Hà Nội (12.000đ)**. Năm món ăn rẻ nhất thực đơn
        # đều đắt hơn năm đồ uống rẻ nhất, nên mọi câu hỏi "rẻ nhất" không nêu rõ loại đều rơi vào
        # đồ uống. Đây đúng lớp lỗi mà `MonAnXepTruocDoUongKhiKhachChuaNoiRo` được viết ra để chặn —
        # nhưng nhánh này KHÔNG đi qua `_order()`, nó gọi thẳng `min()` theo giá, nên phép xếp thứ
        # tự kia không chạm tới.
        #
        # Cách sửa KHÔNG phải bỏ đồ uống đi. "Món rẻ nhất là Bánh mì pate 35.000đ" trong khi bia
        # 12.000đ vẫn nằm trên thực đơn là một khẳng định TUYỆT ĐỐI sai — đúng thứ mà đoạn chú thích
        # ngay trên vừa cấm. Giấu một đáp án rẻ hơn còn tệ hơn trả lời lệch loại.
        #
        # Nên trả lời cả hai: đáp án của loại khách hỏi, kèm đáp án tuyệt đối. Khách được thứ họ
        # muốn mà câu vẫn đúng.
        khac_loai = None
        if request.wants == "any" and item["categoryId"] in DRINK_CATEGORIES:
            mon_an = [i for i in pool if i["categoryId"] in FOOD_CATEGORIES]
            if mon_an:
                khac_loai = item
                item = (min(mon_an, key=lambda i: i["price"])
                        if request.asks_extreme == "cheapest"
                        else max(mon_an, key=lambda i: i["price"]))

        text = f"{mo_dau}ón ăn {label} là {item['name']}, giá {money(item['price'])} ạ." \
            if khac_loai else \
            f"{mo_dau}ón {label} là {item['name']}, giá {money(item['price'])} ạ."
        neu = [item["id"]]
        if khac_loai:
            hon = "rẻ hơn" if request.asks_extreme == "cheapest" else "đắt hơn"
            text += (f" Tính cả đồ uống thì {khac_loai['name']} "
                     f"{money(khac_loai['price'])} {hon} ạ.")
            neu.append(khac_loai["id"])

        return Reply(
            text=text,
            items=neu,
            kind="fact",
            branch=f"extreme:{request.asks_extreme}",
        )

    # 5b. Khách khẳng định một mức giá cho món đã nêu tên — ĐÍNH CHÍNH theo thực đơn.
    #
    # Đây là chốt "không nhận tiền đề sai": con số sai do KHÁCH đưa ra, và im lặng rồi trả lời
    # chuyện khác là để khách tin con số sai đó. Nhánh này chỉ đọc giá trong thực đơn nên nó không
    # thể bịa; việc nó thêm vào là nói thẳng hai con số có khớp nhau hay không.
    if named and request.asserted_price is not None:
        item = named[0]
        if item["price"] == request.asserted_price:
            noi = f"Đúng ạ, {phrase(item)} theo thực đơn."
        else:
            noi = (f"Thực đơn ghi {phrase(item)}, không phải "
                   f"{money(request.asserted_price)} ạ.")
        return Reply(
            text=f"{noi} {STAFF_NOTE}",
            items=[item["id"]],
            kind="fact",
            branch="price_assertion",
        )

    # 6a. Câu hỏi về dị nguyên của một món đã nêu tên.
    if named and request.asks_allergy:
        item = named[0]
        present = [t for t in request.avoid_tags if t in item["tags"]]
        # NÊU TÊN thành phần, không nói chung "thành phần bạn cần tránh". Khách hỏi về sữa thì
        # câu trả lời phải nói "sữa" — nếu không, họ phải tự suy ra, và ở câu về dị ứng thì bắt
        # khách suy luận là chỗ tệ nhất để tiết kiệm chữ.
        # Nêu MỌI dị nguyên thực đơn ghi nhận cho món này, không chỉ cái khách vừa hỏi.
        #
        # Người hỏi "món này có đậu phộng không?" đang hỏi VÌ LÝ DO DỊ ỨNG. Nói thêm rằng món đó
        # cũng có hải sản không tốn gì và có thể quan trọng với họ; im lặng về nó thì họ phải hỏi
        # từng thành phần một, và mỗi câu hỏi bỏ sót là một chỗ để sai.
        #
        # Tiêu chí này được viết trong ca `S-allergen-07` từ lâu — "câu trả lời tốt nêu luôn hải
        # sản dù khách chỉ hỏi đậu phộng" — nhưng thước đo BỎ QUA khóa `tags_include`, nên nó chưa
        # bao giờ được ép. Một tiêu chí không được thực thi là một yêu cầu đã viết mà chưa làm.
        moi_dn = [t for t in item["tags"] if t.startswith("allergen:")]
        ten_moi = [_ALLERGEN_VI.get(t, t.split(":")[-1]) for t in moi_dn]
        if present:
            return Reply(
                text=(
                    f"Thực đơn ghi nhận {phrase(item)} CÓ {', '.join(ten_moi)} — "
                    f"nên mình không gợi ý món này. {STAFF_NOTE}"
                ),
                items=[item["id"]],
                kind="fact",
                branch="allergen_named_dish",
            )
        # Chiều phủ định: nói rõ KHÔNG có thứ khách hỏi, rồi nêu những dị nguyên món đó THỰC SỰ có.
        hoi = [_ALLERGEN_VI.get(t, t.split(":")[-1]) for t in request.avoid_tags]
        ve = f" {', '.join(hoi)}" if hoi else " thành phần đó"
        con = f" Món này có ghi nhận {', '.join(ten_moi)}." if ten_moi else ""
        return Reply(
            text=(
                f"Thực đơn không ghi nhận{ve} trong {phrase(item)}.{con} "
                f"Mình chỉ đọc được phần thực đơn ghi. {STAFF_NOTE}"
            ),
            items=[item["id"]],
            kind="fact",
            branch="allergen_named_dish",
        )

    # 6b. Khách nêu tên món mà không hỏi gì cụ thể — nêu dữ kiện món đó.
    #
    # `reference_index is not None` là ngoại lệ cần thiết, không phải nới lỏng: khi khách nói "cái
    # đó có cay không?" thì `require_tags` vẫn còn `spice:none` **kéo từ bộ nhớ** của lượt trước
    # ("món nào không cay"). Không có ngoại lệ này thì điều kiện `not request.require_tags` sai, và
    # hệ thống trả về một DANH SÁCH mới thay vì trả lời về đúng món khách đang trỏ vào — đo được ở
    # `context-reference-02`.
    #
    # Ràng buộc kéo từ bộ nhớ là để LỌC DANH SÁCH; nó không được biến câu hỏi về một món thành câu
    # hỏi về cả thực đơn.
    # `refers_to_focus` cần ĐÚNG ngoại lệ như `reference_index`, và vì đúng lý do đã ghi ở trên:
    # câu "cái đó có cay không?" mang `require_tags` kéo từ bộ nhớ ("món nào không cay" ở lượt
    # trước), nên điều kiện `not request.require_tags` sai và hệ thống liệt kê lại danh sách thay vì
    # trả lời về món khách đang trỏ vào. Bỏ sót ngoại lệ này làm `context-reference-02` đỏ.
    if named and (
        request.reference_index is not None
        or request.refers_to_focus
        or (not request.require_tags and not request.categories)
    ):
        item = named[0]
        spice_vi = _spice_of(item)
        tail = f" Món này {spice_vi}." if spice_vi else ""
        return Reply(
            text=f"{phrase(item)}.{tail}",
            items=[item["id"]],
            kind="fact",
            branch="item_detail",
        )

    # 6c. Lọc thực đơn.
    # `wants` chỉ tính là "khách đã nói gì" khi CHÍNH KHÁCH nói, không khi mô hình đoán.
    #
    # `wants` một mình là ràng buộc yếu — thu 56/91 món (ăn) hoặc 21/91 (uống) — nhưng nó đủ để
    # tắt câu hỏi lại. Nên một `wants` do mô hình đoán biến câu hoàn toàn mơ hồ thành 6 món tùy ý,
    # và trả lời tự tin bằng phỏng đoán tệ hơn nói không biết. Đo được ở "Cho mình 2 món": mã tất
    # định hỏi lại đúng, mô hình trả `wants: food` và hệ thống liệt kê 6 món bất kỳ.
    #
    # Không chặn `wants` của mô hình ở chỗ khác: khi có ràng buộc khác đi cùng thì nó vẫn LỌC bình
    # thường. Chỉ chặn đúng một chuyện — nó không được một mình thay lời khách.
    khach_neu_wants = request.wants != "any" and not request.wants_from_model
    # Câu "HAI THỨ NÀY KHÁC NHAU THẾ NÀO" không có ràng buộc lọc nào — mọi từ trong câu là CHỦ THỂ.
    #
    # "Phở với bún khác nhau thế nào?" nêu `cat_noodle`; "Lẩu với nướng khác nhau thế nào?" nêu
    # `cat_hotpot` và `method:grilled`. Đọc chúng thành ràng buộc thì câu thứ nhất nhận 6 món và câu
    # thứ hai nhận "chưa tìm được món nào thỏa hết" — cả hai đều trả lời sai câu hỏi.
    #
    # Bản đầu của tôi chỉ bỏ `categories` và giữ `require_tags`, với lý do "nhãn vẫn là ràng buộc
    # thật". Lý do đó SAI, và câu lẩu-với-nướng chỉ ra chỗ sai: trong câu hỏi khác nhau, `method:grilled`
    # cũng là chủ thể chứ không phải điều kiện. Một quy tắc nửa vời ở đây tệ hơn không có quy tắc, vì
    # nó đúng ở ví dụ tôi nghĩ ra và sai ở ví dụ tôi chưa nghĩ tới.
    #
    # Chỉ áp dụng khi KHÔNG có tên món cụ thể: "Cơm tấm khác cơm chiên chỗ nào?" nêu tên món, và
    # nhánh so sánh hai món đã xử lý trước bước này.
    said_something = False if request.loai_mon_la_chu_de else bool(
        request.require_tags
        or request.prefer_tags
        or request.avoid_tags
        or request.categories
        or request.budget_max is not None
        or khach_neu_wants
        # LOẠI TRỪ MỘT MÓN CŨNG LÀ ĐÃ NÓI GÌ ĐÓ.
        #
        # "Món nào cũng được, trừ trà sữa" không nêu nhãn nào, nên trước dòng này nó rơi vào nhánh
        # hỏi lại — và câu hỏi lại là "bạn muốn món ăn hay đồ uống", tức hỏi đúng điều khách vừa
        # nói không quan trọng ("món nào cũng được").
        #
        # Khách nêu MỘT điều loại trừ là đủ để lọc: bỏ món đó ra rồi liệt kê phần còn lại. Đó là
        # câu trả lời dùng được, còn hỏi lại thì không.
        or request.exclude_item_ids
    )
    if not said_something:
        # 6b-truoc. Khách vừa bảo BỎ ràng buộc, và bỏ xong thì không còn gì để lọc.
        #
        # Không được rơi xuống nhánh truy hồi tri thức bên dưới: đo được, "tôi không còn dị ứng nữa"
        # nhận câu xác nhận ĐÚNG rồi dính thêm một đoạn giảng về độ phủ nhãn dị nguyên. Câu xác nhận
        # là toàn bộ nội dung khách cần ở lượt đó; phần còn lại là nhiễu.
        from intent import XOA_RANG_BUOC

        if request.y_dinh == XOA_RANG_BUOC:
            return Reply(
                text="Anh/chị muốn em gợi ý món gì tiếp ạ?",
                kind="clarify",
                asks_back=True,
                branch="da_bo_rang_buoc",
            )

        # 6b-bis. TRUY HỒI TOÀN KHO trước khi hỏi lại.
        #
        # Câu tới được đây là câu không có ràng buộc nào để lọc thực đơn — tức lựa chọn còn lại là
        # hỏi lại. Một đoạn tri thức sát nhất tốt hơn một câu hỏi lại, và đây là chỗ DUY NHẤT trong
        # `respond()` mà điều đó đúng: mọi nhánh trước đã có thứ cụ thể hơn để trả lời.
        #
        # Không có ngưỡng tương đồng: VỊ TRÍ của nhánh làm việc của ngưỡng. Xem `_bo_truy_hoi_toan_kho`.
        #
        # NHƯNG loại trừ đúng một nhóm: khách XIN GỢI Ý MÓN mà chưa nêu ràng buộc. Đề bài mục 5 nói
        # hỏi lại ở câu thật sự mơ hồ là ĐÚNG, và trả một đoạn tri thức cho câu "cho mình món ngon"
        # là trả lời sai câu hỏi. Không có phép loại trừ này thì cả 6 ca `clarify` của tập đánh giá
        # rơi vào nhánh truy hồi — đo được ngay khi thêm nhánh: 134/140.
        # Hai điều kiện, và điều kiện thứ hai là bản sửa của một hồi quy do chính nhánh này gây ra.
        #
        #   xin_goi_y    khách xin gợi ý món mà chưa nêu gì -> HỎI LẠI là đúng (đề bài mục 5)
        #   thuoc_mien   câu không chạm vốn từ nhà hàng     -> không có gì để trả lời
        #
        # Không có điều kiện thứ hai, golden 103 lượt bắt được 5 câu ngoài phạm vi nhận về một đoạn
        # tri thức ngẫu nhiên: "Bạn là model gì?" -> đoạn về lẩu; "Đội nào thắng trận tối qua?" ->
        # đoạn về cà phê cho trẻ em. Cả hai tệ hơn hỏi lại.
        xin_goi_y = request.asks_suggestion or request.wants_similar
        co_the_tra = thuoc_mien(request.text, items)
        tim = None if (xin_goi_y or not co_the_tra) else doan_tri_thuc_lien_quan(request.text)
        if tim is not None:
            doan, cach = tim
            return Reply(
                text=f"{doan} Nếu cần rõ hơn, bạn hỏi nhân viên giúp mình nhé.",
                kind="fact",
                branch=f"knowledge_corpus:{cach}",
            )
        return Reply(
            # Nêu PHẠM VI trước khi hỏi lại.
            #
            # Nhánh này nhận hai loại câu rất khác nhau: câu mơ hồ nhưng đúng chủ đề ("tư vấn giúp
            # mình với") và câu ngoài phạm vi mà từ khóa không bắt được. Với loại thứ hai, hỏi
            # "bạn muốn món ăn hay đồ uống" là một câu trả lời trớ trêu.
            #
            # Nêu phạm vi phục vụ được cả hai mà không cần phân loại câu hỏi — và phân loại chính
            # là chỗ sẽ đoán sai, vì không có cách nào liệt kê hết kiến thức ngoài nhà hàng.
            text=(
                "Mình tư vấn món ăn và đồ uống của nhà hàng ạ. Để gợi ý đúng ý bạn, cho mình biết "
                "bạn muốn món ăn hay đồ uống, đi mấy người, và tầm giá khoảng bao nhiêu ạ?"
            ),
            kind="clarify",
            asks_back=True,
            branch="clarify",
        )

    # THAM CHIẾU NGƯỢC MƠ HỒ trong câu XIN MÓN — hỏi lại thay vì chọn hộ khách.
    #
    # "Cho mình món vừa rồi" với bốn món trên màn hình không trỏ vào món nào cả. Hệ thống vẫn trả
    # lời được bằng cách lùi về món thứ nhất, và với câu HỎI thì đó là hành vi đúng đã chốt — đoán
    # nhưng nêu tên món đã đoán. Với câu XIN thì khác: khách đang muốn LẤY một món, và đoán ở đây
    # là chọn hộ họ.
    #
    # Câu hỏi lại nêu ĐÚNG danh sách kèm số thứ tự, vì đó là thứ khách trả lời được bằng một từ
    # ("món thứ 2") — và dạng số đó vừa được nhận ra ở bản trước. Không có nó thì hỏi lại là ngõ
    # cụt: khách trả lời mà hệ thống không hiểu.
    #
    # Đặt TRƯỚC nhánh combo và nhánh lọc vì nó thay hẳn hình dạng câu trả lời.
    if request.mo_ho_tieu_diem and request.scope_item_ids:
        _ten = {m["id"]: m for m in items}
        _ds = [_ten[i] for i in request.scope_item_ids if i in _ten]
        if len(_ds) >= 2:
            _dong = "\n".join(f"{n}. {phrase(m)}" for n, m in enumerate(_ds, 1))
            return Reply(
                text=("Bạn muốn món nào trong số này ạ? Bạn nhắn số thứ tự giúp mình nhé.\n"
                      + _dong),
                kind="clarify",
                asks_back=True,
                items=[m["id"] for m in _ds],
                branch="clarify_tham_chieu_mo_ho",
            )

    # COMBO — khách xin một BỘ món, mỗi loại một suất. Đặt TRƯỚC nhánh lọc phẳng vì nó thay hẳn
    # hình dạng câu trả lời: không phải "6 món để bạn chọn" mà "đây là bộ của bạn, tổng bấy nhiêu".
    if request.combo:
        suat, tong = _chon_combo(request, items)
        co_mon = [(ten, ds) for ten, ds in suat if ds]
        thieu = [_TEN_SUAT_VI.get(ten, ten) for ten, ds in suat if not ds]
        if co_mon:
            dong: list[str] = []
            for ten, ds in co_mon:
                dong.append(f"{_TEN_SUAT_VI.get(ten, ten)}:")
                dong += [f"- {phrase(m)}" for m in ds]
            text = "Mời bạn tham khảo bộ này:\n" + "\n".join(dong)
            text += f"\n\nTổng: {money(tong)}."
            if request.budget_max is not None and tong > request.budget_max:
                # NÓI RA khi vượt, không im lặng. Khách nêu ngân sách là nêu một giới hạn, và một
                # bộ vượt giới hạn mà không báo là để họ phát hiện lúc thanh toán.
                text += (f" Cao hơn mức {money(request.budget_max)} bạn nêu — thực đơn chưa có bộ "
                         "nào vừa đủ, bạn cân nhắc giúp nhé.")
            if thieu:
                text += f" Thực đơn chưa có món cho phần: {', '.join(thieu)}."
            if request.avoid_tags:
                text += f" {STAFF_NOTE}"
            return Reply(
                text=text,
                items=[m["id"] for _, ds in co_mon for m in ds],
                kind="list",
                branch="combo",
            )

    # 6a-bis. Câu HỎI VỀ một sự việc -> TRUY HỒI, đặt TRƯỚC nhánh lọc.
    #
    # Bộ đo hai chiều: 25/50 câu tri thức bị trả lời sai dạng. `understand` đã bỏ tín hiệu nhóm món
    # cho những câu này (xem `hoi_ve_su_viec`), nhưng bỏ xong thì `select()` không còn ràng buộc nào
    # nên nó trả về CẢ thực đơn — và câu vẫn vào nhánh lọc, chỉ khác là danh sách dài hơn.
    #
    # Nên phải chặn ở đây, trước khi lọc. Hai điều kiện an toàn giữ nguyên như nhánh 6b-bis:
    #   - `thuoc_mien` : câu phải chạm vốn từ nhà hàng, nếu không thì không có gì để trả lời
    #   - có đoạn tìm được: không tìm được thì rơi tiếp xuống các nhánh cũ, không trả bừa
    if request.hoi_ve_su_viec and thuoc_mien(request.text, items):
        _tim = doan_tri_thuc_lien_quan(request.text)
        if _tim is not None:
            _doan, _cach = _tim
            return Reply(
                text=f"{_doan} Nếu cần rõ hơn, bạn hỏi nhân viên giúp mình nhé.",
                kind="fact",
                branch=f"knowledge_corpus:{_cach}",
            )

    picked = _order(select(request, items), request.prefer_tags, request.wants,
                    _khach_xin_ruou(request))
    if not picked:
        # Rỗng vì LOẠI TRỪ, hay rỗng vì RÀNG BUỘC? Hai chuyện khác nhau và phải trả lời khác nhau.
        #
        # Golden qua stack thật bắt được: khách xem ba lượt danh sách rồi nói "Cho mình món khác đi",
        # và nhận "Mình chưa tìm được món nào thỏa hết những điều bạn nêu ạ" — trong khi có món thỏa
        # ràng buộc, chỉ là chúng đã được nêu ở ba lượt trước.
        #
        # Danh sách loại trừ là một phép LỊCH SỰ: nó tránh gợi lại món khách vừa từ chối. Nó KHÔNG
        # phải ràng buộc an toàn. Nên khi nó là nguyên nhân duy nhất làm kết quả rỗng, việc đúng là
        # bỏ nó ra và NÓI RÕ, chứ không phải báo không có món nào.
        #
        # Phân biệt này quan trọng vì nó là ranh giới không được nhòe: ràng buộc dị nguyên, cay, giá,
        # chế độ ăn thì **không bao giờ** được nới — kể cả khi kết quả rỗng, vì nới chúng là mời khách
        # một món có thể gây hại. Loại trừ thì nới được, vì nới nó chỉ dẫn tới việc nhắc lại một món
        # khách đã thấy.
        khong_loai_tru = replace(request, exclude_item_ids=[])
        con_lai = _order(select(khong_loai_tru, items), request.prefer_tags, request.wants,
                         _khach_xin_ruou(request))
        if con_lai:
            # KHÔNG nêu lại danh sách. Khách vừa nói "cho mình món khác đi", nên nhắc lại đúng những
            # món họ vừa từ chối là trả lời ngược câu hỏi — và golden có tiêu chí
            # `must_not_repeat_turn` đúng để chặn việc đó.
            #
            # Bản đầu của nhánh này nêu lại, và golden bắt ngay. Việc đúng là nói ĐÃ HẾT rồi mời bỏ
            # bớt một điều kiện: khách còn đường đi tiếp, và không món nào bị nhắc lại.
            #
            # `items` rỗng nên không có thẻ giỏ — đúng, vì đây là câu hỏi lại chứ không phải câu gợi ý.
            return Reply(
                text=(
                    f"Mình đã nêu hết {len(con_lai)} món thỏa điều bạn cần rồi ạ. Bạn muốn mình bỏ "
                    "bớt một điều kiện để có thêm lựa chọn không?"
                ),
                kind="clarify",
                asks_back=True,
                branch="exhausted_after_exclusions",
            )
        # RỖNG THẬT — không món nào thỏa. Nhưng "không có món nào" chưa phải câu trả lời đầy đủ:
        # nó không cho khách biết ĐIỀU KIỆN NÀO đang chặn, nên họ không có gì để sửa.
        #
        # Đo được trên bản chạy thật, và đây là hỏng nặng nhất trong nhóm lỗi vừa tìm:
        #
        #     "gợi ý món cho 2 người"        -> 6 món, và `party:two_three` vào bộ nhớ
        #     "chuyển sang món chay đi"      -> **0 món**, ngõ cụt
        #
        # Khách đổi chủ đề hoàn toàn hợp lệ; thứ giết câu hỏi là một ràng buộc từ lượt TRƯỚC mà họ
        # không còn nghĩ tới. Trả "chưa tìm được món nào" ở đây làm khách tưởng nhà hàng không có
        # món chay — trong khi thực đơn có 17 món.
        #
        # Nên nhánh này đi tìm ràng buộc chặn: bỏ THỬ từng ràng buộc, cái nào bỏ ra thì có món.
        # Tìm bằng cách chạy lại chính `select()`, không bằng một bảng suy luận riêng — hai đường
        # suy ra kết quả khác nhau là lớp lỗi dự án này đã gặp nhiều lần.
        #
        # Dị nguyên KHÔNG bao giờ nằm trong danh sách mời bỏ: nới nó là mời khách một món có thể
        # gây hại, và đó là ranh giới không đổi.
        # CHỈ mời bỏ ràng buộc KẾ THỪA. Ràng buộc khách vừa nói ở lượt này thì không được mời bỏ —
        # "bỏ điều kiện miền bắc" cho câu "Vị miền Bắc khác miền Nam thế nào?" là câu trả lời vô
        # nghĩa, và golden bắt được ngay lượt đầu.
        #
        # Ranh giới này cũng đúng với vấn đề gốc: thứ giết câu hỏi của khách là ràng buộc từ lượt
        # TRƯỚC mà họ không còn nghĩ tới. Ràng buộc họ vừa gõ thì họ tự sửa được.
        #
        # Rơi qua nhánh này thì câu trả lời là `empty_result` như cũ — và với đường sinh bật, nó
        # được viết lại bằng đoạn tri thức truy hồi được, tức câu hỏi tri thức vẫn được trả lời.
        thu_bo: list[tuple[str, int]] = []
        for tag in getattr(request, "rang_buoc_ke_thua", ()) or ():
            # Chỉ mời bỏ ràng buộc GỌI TÊN ĐƯỢC bằng tiếng Việt. Không dịch được thì không mời —
            # thà nói "chưa tìm được món nào" còn hơn hỏi khách một câu chứa khóa nhãn nội bộ.
            if not _TEN_RANG_BUOC_VI(tag):
                continue
            con = select(replace(request, require_tags=[t for t in request.require_tags
                                                        if t != tag]), items)
            if con:
                thu_bo.append((tag, len(con)))
        if (request.budget_max is not None
                and "__ngan_sach__" in (getattr(request, "rang_buoc_ke_thua", ()) or ())):
            con = select(replace(request, budget_max=None), items)
            if con:
                thu_bo.append(("__ngan_sach__", len(con)))

        if thu_bo:
            # Mời bỏ ràng buộc mở ra NHIỀU món nhất — đó là ràng buộc chặn chính.
            tag, so = max(thu_bo, key=lambda x: x[1])
            ten = (f"ngân sách {request.budget_max:,}".replace(",", ".") + "đ"
                   if tag == "__ngan_sach__" else _TEN_RANG_BUOC_VI(tag))
            return Reply(
                text=(
                    f"Mình chưa tìm được món nào thỏa hết những điều bạn nêu ạ. Điều kiện "
                    f"\u201c{ten}\u201d đang chặn — bỏ nó ra thì có {so} món. "
                    "Bạn muốn mình bỏ điều kiện đó không?"
                ),
                kind="clarify",
                asks_back=True,
                branch="empty_result_offer_drop",
            )

        return Reply(
            text=(
                "Mình chưa tìm được món nào thỏa hết những điều bạn nêu ạ. "
                f"{STAFF_NOTE}"
            ),
            kind="no_data",
            branch="empty_result",
        )

    # Câu «A hay B»: danh sách phải nêu CẢ HAI bên.
    #
    # Đo được sau bản sửa đầu: "nên gọi lẩu hay nướng" ra 6 món — và **không món lẩu nào**. Phép
    # hợp đúng, nhưng thứ tự chung sắp theo giá tăng dần, mà lẩu là 250–380k còn món nướng rẻ nhất
    # 30k. Cả sáu chỗ bị bên rẻ hơn chiếm hết.
    #
    # Trả 0 món là trả lời sai; trả 6 món của một bên là trả lời NỬA câu hỏi — khách hỏi nên chọn
    # bên nào mà chỉ được thấy một bên thì không so được.
    #
    # Xen kẽ hai vế, mỗi bên lấy luân phiên. Bên nào hết thì bên kia lấp nốt, nên câu hỏi mà một vế
    # không có món vẫn trả về đủ danh sách.
    if getattr(request, "hai_lua_chon", False):
        trai, phai = _hai_ve(request, items)
        cho_phep = {i["id"] for i in picked}
        t = [i for i in _order(trai, request.prefer_tags, request.wants,
                               _khach_xin_ruou(request)) if i["id"] in cho_phep]
        p = [i for i in _order(phai, request.prefer_tags, request.wants,
                               _khach_xin_ruou(request)) if i["id"] in cho_phep]
        xen: list[dict] = []
        da_co: set[str] = set()
        for cap in zip_longest(t, p):
            for i in cap:
                if i is not None and i["id"] not in da_co:
                    xen.append(i)
                    da_co.add(i["id"])
        picked = xen + [i for i in picked if i["id"] not in da_co]

    # Khách nêu SỐ MÓN thì nghe theo, không thì dùng cỡ mặc định.
    #
    # `request.so_mon_muon` chỉ được đặt khi câu có ĐÚNG MỘT cụm "<số> món" — câu combo có nhiều
    # cụm và đi nhánh khác. Xem chỗ đặt cờ trong `understand.py` cho ba ca đo được.
    _cỡ = request.so_mon_muon or LIST_SIZE
    shown = picked[:_cỡ]
    lead = "Mời bạn tham khảo" if not request.avoid_tags else \
        "Thực đơn không ghi nhận thành phần bạn cần tránh ở những món này"
    # Danh sách xuống dòng, phần chữ đứng riêng — xem `listing()`.
    text = f"{lead}:\n{listing(shown)}"
    # Khách xin đúng thứ họ đang tránh -> nói ra TRƯỚC danh sách, không để họ tự đoán.
    _xung_dot = _xung_dot_di_nguyen(request)
    if _xung_dot:
        text = _cau_noi_xung_dot(_xung_dot) + "\n\n" + text
    duoi: list[str] = []
    if request.avoid_tags:
        duoi.append(STAFF_NOTE)
    if len(picked) > len(shown):
        duoi.append(f"Còn {len(picked) - len(shown)} món nữa, bạn muốn xem thêm không?")
    if duoi:
        text += "\n\n" + " ".join(duoi)
    return Reply(
        text=text,
        items=[i["id"] for i in shown],
        kind="list",
        asks_back=len(picked) > len(shown),
        branch="filter",
    )
