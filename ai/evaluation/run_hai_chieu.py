# -*- coding: utf-8 -*-
"""HAI CHIỀU — chứng minh bằng số vì sao hệ thống cần CẢ mã tất định lẫn truy hồi.

    python ai/evaluation/run_hai_chieu.py           # in bảng
    python ai/evaluation/run_hai_chieu.py --csv     # thêm CSV để đưa vào báo cáo

Vì sao bộ này tồn tại
---------------------
Ba tập đánh giá cũ đều đo MỘT chiều. Tập 140 ca và 149 lượt phiên được viết quanh các nhánh tất
định, nên bộ xếp hạng chạy **0 lần** trên cả hai — đọc một mình, con số đó nói "truy hồi vô dụng".
Tập truy hồi 222 ca thì ngược lại: nó chỉ hỏi câu tri thức, nên không nói được gì về chỗ lọc nhãn
mạnh hơn.

Không tập nào trả lời được câu hỏi mà người đọc báo cáo sẽ hỏi đầu tiên:

    **Vì sao không dùng mỗi một thứ cho gọn?**

Bộ này trả lời bằng cách cho hai phương pháp chạy trên CÙNG một câu hỏi, ở HAI nhóm câu được chọn
để mỗi nhóm là điểm mạnh của một bên:

    CHIỀU A   câu "thế nào / vì sao / nên làm gì"  -> tri thức nằm trong văn xuôi
    CHIỀU B   câu "món nào thỏa điều kiện"          -> đáp án nằm trong nhãn

Cách chấm, và vì sao nó khách quan
----------------------------------
Chiều A chấm bằng **DẠNG đáp án**, không bằng ý kiến. Câu "gọi khai vị trước có làm no bụng không?"
cần một lời giải thích (`fact`). Một danh sách món (`list`) là **sai dạng** — nó không trả lời câu
được hỏi, dù mọi món nêu ra đều có thật và đúng giá.

Đây là chỗ dễ hiểu lầm nhất khi đọc kết quả, nên nói rõ: mã tất định **không im lặng** ở chiều A.
Nó trả lời, tự tin, và trả lời nhầm câu. Im lặng còn dễ nhận ra hơn.

Chiều B chấm bằng **số món vi phạm ràng buộc** — `cấm@5`. Một bộ nêu 5 món mà 3 món vượt ngân sách
thì sai, không phải kém. Với ca dị ứng thì đó là lỗi an toàn.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))
sys.path.insert(0, str(REPO_ROOT / "ai" / "evaluation"))

from answer import respond, select  # noqa: E402
from understand import understand  # noqa: E402

MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]
OUT_CSV = REPO_ROOT / "ai" / "evaluation" / "measurements" / "hai_chieu.csv"

# ------------------------------------------------------------------------------------------------
# CHIỀU A — mã tất định KHÔNG xử lý được, truy hồi thì được.
#
# PHỦ HẾT 36 tài liệu văn xuôi, mỗi tài liệu một câu. Phủ hết chứ không chọn tay là điều làm bảng
# này đáng tin: chọn tay thì người viết vô thức chọn câu mình biết sẽ thắng, và con số đẹp mà vô
# nghĩa. Ở đây danh sách tài liệu quyết định danh sách câu hỏi, nên không có chỗ cho việc đó.
#
# Mỗi câu hỏi một điều mà thực đơn KHÔNG có trường nào để trả lời: cách chia ngân sách, thứ tự ra
# món, tác dụng của khai vị, phép ăn chung mâm. Đáp án nằm trong văn xuôi.
#
# Câu được viết bằng chữ KHÁCH dùng, tránh dùng lại tiêu đề tài liệu — nếu trùng chữ thì bảng đo
# BM25 chứ không đo hiểu nghĩa.
# ------------------------------------------------------------------------------------------------
CHIEU_A = [
    ("Mình bị dị ứng thì phải nói với quán thế nào cho chắc?", "allergy_guidance"),
    ("Gọi khai vị trước có làm no bụng không ăn được món chính không?", "appetizer_role"),
    ("Mình lái xe nên không dám uống gì có cồn, quán tính sao?", "beer_and_alcohol"),
    ("Ăn xong mà miệng vẫn cay xè thì uống gì cho dịu?", "beverage_pairing"),
    ("Đi bốn người mà chỉ muốn tiêu tầm hai trăm mỗi người thì tính sao?", "budget_planning"),
    ("Quán có nói được món này nấu bao lâu không?", "cannot_help"),
    ("Cùng là gà mà sao món thì mềm món thì dai vậy?", "chicken_dishes"),
    ("Bé nhà mình mới hai tuổi, ăn ở đây có tiện không?", "children_elderly"),
    ("Uống cà phê buổi tối có bị mất ngủ không?", "coffee_and_tea"),
    ("Gọi mấy món mà ăn cùng nhau cho hợp vị?", "combo_pairing"),
    ("Mình định cầu hôn ở đây, nên chuẩn bị gì?", "date_occasion"),
    ("Ăn xong ngọt miệng thì nên làm gì tiếp?", "dessert_guide"),
    ("Mình ăn kiêng nhưng không phải dị ứng, có khác gì nhau không?", "dietary_limits"),
    ("Đi có một mình mà gọi nhiều thì phí, làm sao giờ?", "eating_alone"),
    ("Quán này có gì hay mà mọi người hay hỏi?", "faq_extended"),
    ("Lần đầu tới đây, gọi kiểu gì cho khỏi bỡ ngỡ?", "first_visit"),
    ("Ăn xong muốn cái gì mát mát tự nhiên thì có không?", "fresh_fruit"),
    ("Mình người Bắc, ăn gì cho hợp khẩu vị quê?", "hanoi_and_north"),
    ("Mình vừa đi Tây Nguyên về, thèm vị đó thì gọi gì?", "highlands_danang"),
    ("Nhóm sáu người ăn nồi nào cho vừa?", "hotpot_choosing"),
    ("Mình ăn cay giỏi, muốn thử vị miền Trung thật đậm", "hue_and_central"),
    ("Muốn cái gì mát mà rẻ, không phải trà sữa", "juice_and_smoothie"),
    ("Buổi trưa đi làm về, ăn nhanh gọn thì set nào?", "meal_sets"),
    ("Phở với bún với hủ tiếu thì khác nhau chỗ nào?", "noodle_soups"),
    ("Cả phòng mười hai người liên hoan, gọi sao cho đủ?", "ordering_guide"),
    ("Mấy món này ra cùng lúc hay ra dần vậy?", "portion_timing"),
    ("Quét mã xong thì mình bấm tiếp thế nào?", "qr_ordering"),
    ("Mình chỉ có ba mươi phút, kịp ăn gì không?", "quick_meal"),
    ("Mấy chữ ghi dưới tên món có tin được hết không?", "reading_labels"),
    ("Toàn món cơm mà không biết chọn cái nào cho no", "rice_dishes"),
    ("Mình thích vị ngọt kiểu trong Nam, gọi gì?", "saigon_and_south"),
    ("Nhà có người dị ứng tôm mà vẫn muốn ăn đồ biển thì sao?", "seafood_caution"),
    ("Cả nhà ăn chung một mâm thì nên gọi thế nào cho hợp lý?", "sharing_etiquette"),
    ("Mình ăn cay kém, làm sao biết món nào chịu được?", "spice_ladder"),
    ("Tiền nào của nấy hay có món rẻ mà vẫn ngon?", "value_for_money"),
    ("Đồ chay ở đây có thật sự chay không hay chỉ là không thịt?", "vegetarian_reality"),
    # Mười bốn câu thêm cho những tài liệu dày, để chiều A không mỏng hơn chiều B.
    ("Mình no rồi mà bạn chưa ăn xong, gọi thêm gì cho đỡ ngại?", "appetizer_role"),
    ("Tính tiền có bị cộng thêm gì ngoài giá ghi không?", "budget_planning"),
    ("Quán biết món nào còn món nào hết không?", "cannot_help"),
    ("Đi với bà ngoại tám mươi tuổi thì chọn món ra sao?", "children_elderly"),
    ("Trẻ con uống được gì ở đây?", "beverage_pairing"),
    ("Ăn lẩu thì nên gọi thêm gì cho đủ bữa?", "hotpot_choosing"),
    ("Mình muốn ăn no mà tiêu dưới trăm rưỡi", "value_for_money"),
    ("Người ăn chay trường có ăn được món chay ở đây không?", "vegetarian_reality"),
    ("Đặt bàn đông người thì cần báo trước bao lâu?", "ordering_guide"),
    ("Món nào hợp mang về nhà ăn?", "quick_meal"),
    ("Sau bữa nhiều dầu mỡ nên uống gì?", "beverage_pairing"),
    ("Mình muốn thử món lạ mà sợ không hợp miệng", "first_visit"),
    ("Gọi hai người mà muốn thử nhiều vị thì làm sao?", "sharing_etiquette"),
    ("Đồ biển ở đây có tươi không, lấy từ đâu?", "seafood_caution"),
]

# ------------------------------------------------------------------------------------------------
# CHIỀU B — mã tất định làm TỐT HƠN truy hồi.
#
# Ba dạng ràng buộc mà phép xếp hạng theo độ tương đồng không diễn đạt được:
#   NGƯỠNG SỐ   "dưới 50.000đ" — với BM25/embedding, "50.000" là một TỪ, không phải một LƯỢNG
#   PHÉP TRỪ    "tránh hải sản" — câu chứa chữ "hải sản" nên nó kéo món hải sản LÊN ĐẦU
#   PHÉP HỘI    "vừa không cay vừa dưới 80 nghìn" — một điểm giống đã trộn, không ép được hai điều
# ------------------------------------------------------------------------------------------------
def _sinh_chieu_b() -> list[tuple]:
    """Sinh ca chiều B TỪ BỘ NHÃN, không viết tay.

    Cùng lý do với chiều A phủ hết tài liệu: viết tay thì người viết chọn ràng buộc mình biết truy
    hồi sẽ thua. Sinh từ nhãn thì danh sách ca do DỮ LIỆU quyết định.

    Năm dạng ràng buộc, và mỗi dạng là một thứ phép xếp hạng theo độ tương đồng không diễn đạt được:

        ngưỡng số    "dưới 50.000đ" — với BM25/embedding, "50.000" là một TỪ, không phải một LƯỢNG
        phủ định     "không cay" — chung gần hết chữ với "cay", điểm gần bằng nhau
        phân loại    "món chay" — dạng DUY NHẤT truy hồi có cửa, giữ lại để bảng không một chiều
        phép trừ     "tránh hải sản" — câu chứa chữ "hải sản" nên nó kéo món hải sản LÊN ĐẦU
        phép hội     "vừa A vừa B" — một điểm giống đã trộn, không ép được hai điều kiện
    """
    ra: list[tuple] = []
    for gia in (30_000, 50_000, 70_000, 100_000, 150_000, 200_000, 300_000):
        ra.append((f"Món nào dưới {gia // 1000} nghìn?", {"price_max": gia}, "ngưỡng số"))
    for ten, nhan in (("không cay", "spice:none"), ("cay nhẹ", "spice:mild"),
                      ("cay vừa", "spice:medium"), ("cay đậm", "spice:hot")):
        ra.append((f"Món nào {ten}?", {"tags_all": [nhan]}, "phủ định" if "không" in ten else "phân loại"))
    for ten, nhan in (("chay", "diet:vegetarian"), ("thuần chay", "diet:vegan")):
        ra.append((f"Mình ăn {ten}, có món nào không?", {"tags_all": [nhan]}, "phân loại"))
    for ten, nhan in (("hải sản", "allergen:seafood"), ("đậu phộng", "allergen:peanut"),
                      ("sữa", "allergen:dairy"), ("trứng", "allergen:egg"),
                      ("gluten", "allergen:gluten")):
        ra.append((f"Mình dị ứng {ten}, món nào tránh được?", {"tags_none": [nhan]}, "PHÉP TRỪ"))
    for ten, nhan in (("miền Bắc", "region:north"), ("miền Trung", "region:central"),
                      ("miền Nam", "region:south"), ("Hà Nội", "region:hanoi"),
                      ("Huế", "region:hue"), ("Sài Gòn", "region:saigon")):
        ra.append((f"Có món {ten} nào không?", {"tags_all": [nhan]}, "phân loại"))
    for ten, nhan in (("nướng", "method:grilled"), ("hấp", "method:steamed"),
                      ("chiên", "method:fried"), ("xào", "method:stir_fried")):
        ra.append((f"Món {ten} có những gì?", {"tags_all": [nhan]}, "phân loại"))
    for ten, nhan in (("ít calo", "health:low_calorie"), ("nhiều đạm", "health:high_protein"),
                      ("thanh nhẹ", "health:light"), ("ít dầu mỡ", "health:low_fat")):
        ra.append((f"Món nào {ten}?", {"tags_all": [nhan]}, "phân loại"))
    for ten, nhan in (("đậm đà", "flavour:rich"), ("chua", "flavour:sour"),
                      ("ngọt", "flavour:sweet"), ("béo", "flavour:fatty"),
                      ("thơm khói", "flavour:smoky"), ("mặn", "flavour:salty")):
        ra.append((f"Món nào vị {ten}?", {"tags_all": [nhan]}, "phân loại"))
    for ten, nhan in (("hẹn hò", "occasion:date"), ("tiếp khách", "occasion:business"),
                      ("sinh nhật", "occasion:birthday"), ("đi nhậu", "occasion:drinking")):
        ra.append((f"Món nào hợp {ten}?", {"tags_all": [nhan]}, "phân loại"))
    for ten, nhan in (("một mình", "party:solo"), ("2-3 người", "party:two_three")):
        ra.append((f"Món nào hợp ăn {ten}?", {"tags_all": [nhan]}, "phân loại"))

    # PHÉP HỘI — hai ràng buộc độc lập cùng lúc.
    ra += [
        ("Món nào vừa không cay vừa dưới 80 nghìn?",
         {"tags_all": ["spice:none"], "price_max": 80_000}, "PHÉP HỘI"),
        ("Món chay nào dưới 60 nghìn?",
         {"tags_all": ["diet:vegetarian"], "price_max": 60_000}, "PHÉP HỘI"),
        ("Món miền Trung nào không cay?",
         {"tags_all": ["region:central", "spice:none"]}, "PHÉP HỘI"),
        ("Món nướng nào dưới 200 nghìn?",
         {"tags_all": ["method:grilled"], "price_max": 200_000}, "PHÉP HỘI"),
        ("Mình dị ứng hải sản, món nào dưới 100 nghìn?",
         {"tags_none": ["allergen:seafood"], "price_max": 100_000}, "PHÉP HỘI"),
        ("Món chay nào không cay dưới 70 nghìn?",
         {"tags_all": ["diet:vegetarian", "spice:none"], "price_max": 70_000}, "PHÉP HỘI"),
    ]
    return ra


CHIEU_B = _sinh_chieu_b()


def _thoa(m: dict, loc: dict) -> bool:
    if "price_max" in loc and m["price"] > loc["price_max"]:
        return False
    if any(t not in m["tags"] for t in loc.get("tags_all", [])):
        return False
    if any(t in m["tags"] for t in loc.get("tags_none", [])):
        return False
    return True


def chay_chieu_a(bo_truy_hoi, tra_doan: dict | None = None) -> list[dict]:
    """Mã tất định trả DẠNG gì, và truy hồi có tìm đúng tài liệu không.

    `tra_doan` là bảng `chunk_id -> đoạn`. Cần nó vì `Hit` chỉ mang `chunk_id`, `score`, `rank` —
    không mang `topic_keys`. Bản đầu đọc `h.topic_keys` qua `getattr` nên nó LUÔN rỗng, và bảng
    hiện truy hồi 0/8. Con số ấy đo phép chấm của tôi, không đo bộ truy hồi.
    """
    hang = []
    for cau, khoa in CHIEU_A:
        rep = respond(understand(cau, MENU), MENU)
        # TÁCH mã tất định THUẦN khỏi nhánh truy hồi.
        #
        # `respond()` đã có truy hồi làm ngõ cuối, nên nếu chỉ nhìn `kind` thì 4/8 ca hiện "ĐÚNG"
        # — mà chúng đúng CHÍNH VÌ truy hồi trả lời. Ghi chúng vào cột "tất định" là để phép đo tự
        # trả công cho bên kia, và bảng sẽ nói ngược điều nó định nói.
        #
        # Nhánh `knowledge_corpus:*` là truy hồi. Mọi nhánh khác là tất định.
        la_truy_hoi = rep.branch.startswith("knowledge_corpus")
        tat_dinh_dung = (rep.kind == "fact") and not la_truy_hoi
        th_dung = None
        th_top5 = None
        if bo_truy_hoi is not None:
            hits = bo_truy_hoi.search(cau, k=5)
            # So theo `topic_keys` THẬT của đoạn, không so chuỗi con của `chunk_id`. Bản đầu so
            # chuỗi con và cho 2/8 — con số đó đo phép so của tôi, không đo bộ truy hồi.
            def _khop(hs):
                return any(
                    khoa in (tra_doan[h.chunk_id].topic_keys if h.chunk_id in tra_doan else ())
                    for h in hs
                )
            th_dung = _khop(hits[:1])
            th_top5 = _khop(hits[:5])
        hang.append({
            "chieu": "A", "cau_hoi": cau, "dap_an_o_dau": f"tài liệu {khoa}",
            "tat_dinh_nhanh": rep.branch, "tat_dinh_dang": rep.kind,
            "tat_dinh_dung": tat_dinh_dung,
            "nhanh_la_truy_hoi": la_truy_hoi,
            "truy_hoi_dung": th_dung,
            "truy_hoi_top5": th_top5,
            "vi_sao": "cần lời giải thích; danh sách món là sai dạng",
        })
    return hang


class _MonLaDoan:
    """Một MÓN thành một tài liệu tìm được — cùng cách `run_retrieval_comparison.py` dựng.

    Chiều B phải tìm trên chỉ mục MÓN, không phải kho tri thức: hỏi "món nào dưới 50k" mà tìm
    trong tài liệu văn xuôi thì bộ truy hồi không có món nào để trả, và cột của nó ra 0 vi phạm —
    một con số đẹp vô nghĩa. Bản đầu của tệp này mắc đúng lỗi đó.
    """

    def __init__(self, m: dict):
        self.chunk_id = m["id"]
        self.doc_id = m["id"]
        self.topic_keys = ()
        nhan = " ".join(t.split(":")[1].replace("_", " ") for t in m["tags"])
        self.text = f"{m['name']}. {m.get('categoryName','')}. {m.get('description','')} {nhan} {m['price']}"
        self.heading = m["name"]
        self.title = m["name"]
        self.word_count = len(self.text.split())
        self.source = "menu"
        self.answer_mode = "synthesize"


def chay_chieu_b(bo_truy_hoi) -> list[dict]:
    """Lọc nhãn và truy hồi cùng chọn món — đếm món VI PHẠM ràng buộc."""
    hang = []
    for cau, loc, dang in CHIEU_B:
        rep = respond(understand(cau, MENU), MENU)
        by = {m["id"]: m for m in MENU}
        vi_pham_td = [by[i]["name"] for i in rep.items if not _thoa(by[i], loc)]
        vi_pham_th = None
        if bo_truy_hoi is not None:
            hits = bo_truy_hoi.search(cau, k=5)
            vi_pham_th = [by[h.chunk_id]["name"] for h in hits
                          if h.chunk_id in by and not _thoa(by[h.chunk_id], loc)]
        hang.append({
            "chieu": "B", "cau_hoi": cau, "dap_an_o_dau": f"nhãn: {dang}",
            "tat_dinh_nhanh": rep.branch, "tat_dinh_dang": rep.kind,
            "tat_dinh_vi_pham": len(vi_pham_td),
            "truy_hoi_vi_pham": None if vi_pham_th is None else len(vi_pham_th),
            "vi_sao": dang,
        })
    return hang


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", action="store_true", help="ghi thêm CSV cho báo cáo")
    args = p.parse_args(argv)

    # Bộ truy hồi. Thiếu thư viện thì vẫn chạy chiều tất định và NÓI RÕ — im lặng bỏ qua một nửa
    # phép đo là cách dễ nhất để bảng này nói dối.
    bo = None
    thieu = ""
    try:
        from rag.chunker import all_chunks
        from rag.embedding import EmbeddingIndex, available
        if available():
            bo = EmbeddingIndex.build(all_chunks(REPO_ROOT / "ai" / "knowledge"))
        else:
            thieu = "sentence_transformers chưa cài"
    except Exception as e:  # noqa: BLE001
        thieu = f"{type(e).__name__}: {e}"

    # Chiều B dùng chỉ mục MÓN riêng — xem `_MonLaDoan`.
    bo_mon = None
    if bo is not None:
        from rag.embedding import EmbeddingIndex as _EI
        bo_mon = _EI.build([_MonLaDoan(m) for m in MENU])

    tra_doan = {}
    if bo is not None:
        from rag.chunker import all_chunks as _ac
        tra_doan = {c.chunk_id: c for c in _ac(REPO_ROOT / "ai" / "knowledge")}
    a = chay_chieu_a(bo, tra_doan)
    b = chay_chieu_b(bo_mon)

    print("=" * 100)
    print("CHIỀU A — câu mã tất định KHÔNG xử lý được, truy hồi thì được")
    print("=" * 100)
    print(f"  {'câu hỏi':58} {'tất định':>18} {'truy hồi':>10}")
    print("  " + "-" * 90)
    for r in a:
        td = ("ĐÚNG" if r["tat_dinh_dung"]
              else ("KHÔNG XỬ LÝ ĐƯỢC" if r["nhanh_la_truy_hoi"]
                    else f"SAI DẠNG ({r['tat_dinh_dang']})"))
        th = ("—" if r["truy_hoi_dung"] is None
              else "ĐÚNG (top-1)" if r["truy_hoi_dung"]
              else "đúng (top-5)" if r["truy_hoi_top5"] else "trượt")
        print(f"  {r['cau_hoi'][:58]:58} {td:>18} {th:>14}")
    td_a = sum(1 for r in a if r["tat_dinh_dung"])
    th_a = sum(1 for r in a if r["truy_hoi_dung"])
    print(f"\n  tất định trả lời ĐÚNG DẠNG: {td_a}/{len(a)}     truy hồi tìm đúng tài liệu: "
          f"{th_a}/{len(a)}")

    print()
    print("=" * 100)
    print("CHIỀU B — câu mã tất định làm TỐT HƠN truy hồi (đếm món VI PHẠM ràng buộc)")
    print("=" * 100)
    print(f"  {'câu hỏi':50} {'dạng ràng buộc':>16} {'lọc nhãn':>10} {'truy hồi':>10}")
    print("  " + "-" * 90)
    for r in b:
        th = "—" if r["truy_hoi_vi_pham"] is None else str(r["truy_hoi_vi_pham"])
        print(f"  {r['cau_hoi'][:50]:50} {r['vi_sao']:>16} {r['tat_dinh_vi_pham']:>10} {th:>10}")
    print(f"\n  tổng món vi phạm — lọc nhãn: {sum(r['tat_dinh_vi_pham'] for r in b)}     "
          f"truy hồi: {sum(r['truy_hoi_vi_pham'] or 0 for r in b)}")

    if thieu:
        print(f"\n  !! CỘT TRUY HỒI TRỐNG: {thieu}")

    if args.csv:
        OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
        cot = ["chieu", "cau_hoi", "dap_an_o_dau", "tat_dinh_nhanh", "tat_dinh_dang",
               "tat_dinh_dung", "nhanh_la_truy_hoi", "truy_hoi_dung", "truy_hoi_top5",
               "tat_dinh_vi_pham", "truy_hoi_vi_pham", "vi_sao"]
        with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cot, extrasaction="ignore")
            w.writeheader()
            w.writerows(a + b)
        print(f"\n  đã ghi {OUT_CSV.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
