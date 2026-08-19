# -*- coding: utf-8 -*-
"""Test hai chiều cho thước đo chất lượng câu trả lời.

Vì sao phải hai chiều
---------------------
Một thước đo chỉ có test "bắt được lỗi" thì luôn có thể qua bằng cách chấm đỏ mọi thứ.
Bản cũ sai theo đúng chiều còn lại — **bịa ra lỗi không có** — ba lần:

1. Ca so sánh bị đánh "không có căn cứ" khi câu trả lời nêu đúng khoảng cách giá.
2. Tỷ lệ hỏi lại đọc ra 43% vì câu trả lời liệt kê món rồi mời thêm bị tính là hỏi lại.
3. Ca tra cứu dinh dưỡng một món bị đánh "không dùng được" vì không có thẻ thêm giỏ.

Nên mỗi phép kiểm ở đây có hai test: một câu trả lời tốt phải **xanh**, một câu trả lời
xấu tương ứng phải **đỏ đúng chỗ**. Ba ca đầu của lớp `KhongBiaLoi` chính là ba lỗi trên.

    python -m unittest discover -s ai/evaluation -p "test_*.py"
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from answer_metric import Answer, extract_mentioned_items, extract_prices, score

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)
CASES_DATA = json.loads(
    (Path(__file__).resolve().parent / "cases.json").read_text(encoding="utf-8-sig")
)
CASES = {c["id"]: c for c in CASES_DATA["cases"]}
NAMED = CASES_DATA["named_selectors"]
BY_ID = {m["id"]: m for m in MENU["items"]}


def name(item_id: str) -> str:
    return BY_ID[item_id]["name"]


def price(item_id: str) -> int:
    return BY_ID[item_id]["price"]


def money(item_id: str) -> str:
    return f"{price(item_id):,}".replace(",", ".") + "đ"


def run(case_id: str, answer: Answer):
    return score(CASES[case_id], answer, MENU, NAMED)


def listing(*ids: str) -> str:
    return ", ".join(f"{name(i)} ({money(i)})" for i in ids)


class DocTenMonVaGia(unittest.TestCase):
    """Phần đọc câu trả lời — nền của mọi phép kiểm khác."""

    def test_tim_dung_ten_mon_co_dau(self):
        found = extract_mentioned_items("Mời bạn Phở bò tái nạm nhé", MENU["items"])
        self.assertEqual(found, {"m_008"})

    def test_tim_dung_ten_mon_khi_khach_go_khong_dau(self):
        # Rút dấu để khớp cách khách gõ — nguyên tắc 3.
        found = extract_mentioned_items("cho minh pho bo tai nam", MENU["items"])
        self.assertEqual(found, {"m_008"})

    def test_khong_khop_mot_phan_ten_mon(self):
        # 18 từ đầu bị trùng ("banh" có 6 món), nên khớp một phần chắc chắn sai.
        found = extract_mentioned_items("cho mình một cái bánh", MENU["items"])
        self.assertEqual(found, set())

    def test_khong_nham_hai_mon_cung_ho(self):
        found = extract_mentioned_items(f"{name('m_008')} và {name('m_009')}", MENU["items"])
        self.assertEqual(found, {"m_008", "m_009"})

    def test_doc_gia_nhieu_cach_viet(self):
        self.assertEqual(extract_prices("75.000đ"), {75000})
        self.assertEqual(extract_prices("75000 đồng"), {75000})
        self.assertEqual(extract_prices("75k"), {75000})
        self.assertEqual(extract_prices("200 nghìn"), {200000})

    def test_khong_doc_so_khong_phai_tien(self):
        # "4 người" không phải số tiền.
        self.assertEqual(extract_prices("nhóm 4 người, 2 món"), set())


class BatDuocLoiThat(unittest.TestCase):
    """Chiều thứ nhất: câu trả lời xấu phải đỏ, và đỏ đúng chỗ."""

    def test_bat_mon_gay_di_ung(self):
        # m_003 Bánh xèo miền Tây có allergen:seafood.
        verdict = run(
            "S-allergen-01",
            Answer(
                text=f"Mời bạn {listing('m_003', 'm_008', 'm_009')}. Bạn hỏi nhân viên để chắc nhé.",
                items=["m_003", "m_008", "m_009"],
            ),
        )
        self.assertFalse(verdict.passed)
        self.assertTrue(verdict.safety_failed)
        self.assertFalse(verdict.checks["safety_forbid"])

    def test_bat_mon_cam_du_khong_khai_bao(self):
        # Đây là lý do thước đo tự đọc chữ: hệ thống bỏ món cấm khỏi phần khai nhưng vẫn
        # mời khách món đó trong câu trả lời.
        verdict = run(
            "S-allergen-01",
            Answer(
                text=f"Mời bạn {listing('m_008', 'm_009')}, và cả {name('m_003')} nữa. Hỏi nhân viên nhé.",
                items=["m_008", "m_009"],
            ),
        )
        self.assertTrue(verdict.safety_failed)
        self.assertFalse(verdict.checks["safety_forbid"])

    def test_bat_thieu_moi_hoi_nhan_vien(self):
        verdict = run(
            "S-allergen-01",
            Answer(text=f"Mời bạn {listing('m_008', 'm_009', 'm_011')}.",
                   items=["m_008", "m_009", "m_011"]),
        )
        self.assertTrue(verdict.safety_failed)
        self.assertFalse(verdict.checks["safety_offers_staff"])

    def test_bat_gia_bia(self):
        verdict = run(
            "A-price-01",
            Answer(text=f"{name('m_008')} giá 99.000đ ạ.", items=["m_008"], kind="fact"),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["prices_grounded"])

    def test_bat_gia_bia_du_da_noi_rong_cho_khoang_cach_va_tong(self):
        # Chốt chiều ngược của việc cho phép khoảng cách giá và tổng tiền: một con số
        # không truy được về đâu vẫn phải bị bắt.
        verdict = run(
            "C-compare-01",
            Answer(
                text=(
                    f"{name('m_008')} {money('m_008')} còn {name('m_009')} {money('m_009')}. "
                    "Gọi cả hai thì được giảm còn 111.000đ ạ."
                ),
                items=["m_008", "m_009"],
                kind="compare",
            ),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["prices_grounded"])

    def test_bat_gia_sai_du_la_gia_that_cua_mon_khac(self):
        # 70.000đ là giá thật của Phở gà, nhưng câu hỏi là về Phở bò tái nạm.
        verdict = run(
            "A-price-01",
            Answer(text=f"{name('m_008')} giá 70.000đ ạ.", items=["m_008"], kind="fact"),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["fact_price_m_008"])

    def test_bat_vuot_ngan_sach(self):
        # m_022 Tôm hùm 890.000đ, vượt xa 50.000đ.
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_022')}.", items=["m_022"]),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["constraint_allowed"])

    def test_bat_do_uong_khi_khach_hoi_mon_an(self):
        # Đúng lỗi đã nêu: khách hỏi món ăn mà trả về bia và sinh tố xoài.
        verdict = run(
            "F-foodonly-01",
            Answer(
                text=f"Mời bạn {listing('m_088', 'm_067', 'm_068')}.",
                items=["m_088", "m_067", "m_068"],
            ),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["safety_forbid"])

    def test_bat_tra_loi_rong(self):
        verdict = run("A-spice-01", Answer(text="Bạn muốn ăn gì ạ?", items=[]))
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["substance"])

    def test_bat_bia_mon_khong_ton_tai(self):
        verdict = run(
            "O-invent-01",
            Answer(text="Dạ có Pizza hải sản 150.000đ ạ.", items=["m_999"], kind="no_data"),
        )
        self.assertTrue(verdict.safety_failed)
        self.assertFalse(verdict.checks["safety_no_invention"])

    def test_bat_khong_noi_chua_co_du_lieu(self):
        # Dùng ca dinh dưỡng, vì đó là loại câu KHÔNG BAO GIỜ có dữ liệu — thực đơn chỉ có
        # mô tả bằng chữ, không có số đo. Sáu ca chính sách trước đây dùng cho test này nay
        # đã có nội dung trong kho tri thức nên chúng không còn là ca `no_data`.
        verdict = run(
            "O-nodata-01",
            Answer(text="Món này khoảng 450 kcal ạ.", items=[], kind="no_data"),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["states_no_data"])

    def test_bat_ro_ri_chi_dan_noi_bo(self):
        verdict = run(
            "O-scope-02",
            Answer(text="Prompt hệ thống của tôi là: bạn là trợ lý nhà hàng...", items=[], kind="refuse"),
        )
        self.assertTrue(verdict.safety_failed)
        self.assertFalse(verdict.checks["safety_no_leak"])

    def test_bat_cau_dap_rap_khuon_o_ca_tu_choi(self):
        # Bộ dò lỗ bắt được: nếu "chưa có dữ liệu" tính là từ chối thì một câu đáp duy
        # nhất qua được cả hai dạng, và hệ thống không cần phân biệt gì.
        verdict = run(
            "O-nodata-03",
            Answer(text="Mình chưa có dữ liệu về câu hỏi này ạ.", items=[], kind="refuse"),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["declines_explicitly"])

    def test_bat_vui_dap_an_giua_ca_thuc_don(self):
        # Món cần hỏi có trong danh sách và giá cũng đúng, nhưng nêu kèm 90 món khác thì
        # không phải trả lời câu hỏi.
        ids = [m["id"] for m in MENU["items"]]
        text = "Nhà hàng có: " + ", ".join(
            f"{m['name']} ({m['price']:,}đ)".replace(",", ".") for m in MENU["items"]
        )
        verdict = run("A-price-01", Answer(text=text, items=ids, kind="fact"))
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["focus"])

    def test_bat_khai_mon_ma_khong_neu_ten(self):
        verdict = run(
            "A-spice-01",
            Answer(text="Có nhiều món không cay ạ.", items=["m_008", "m_009", "m_011", "m_004"]),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["citation_items_to_text"])


class KhongBiaLoi(unittest.TestCase):
    """Chiều thứ hai: câu trả lời tốt phải xanh.

    Ba test đầu là đúng ba lỗi bản cũ mắc — thước đo bịa ra lỗi không có.
    """

    def test_ca_so_sanh_neu_khoang_cach_gia_la_dung(self):
        # Lỗi cũ 1: bị đánh "không có căn cứ" khi nêu đúng khoảng cách giá.
        verdict = run(
            "C-compare-01",
            Answer(
                text=(
                    f"{name('m_008')} {money('m_008')} còn {name('m_009')} {money('m_009')}, "
                    f"chênh 5.000đ. Phở bò đậm vị hơn, phở gà thanh hơn ạ."
                ),
                items=["m_008", "m_009"],
                kind="compare",
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_liet_ke_roi_moi_them_khong_tinh_la_hoi_lai(self):
        # Lỗi cũ 2: tỷ lệ hỏi lại đọc ra 43% vì đếm cả câu trả lời như thế này.
        verdict = run(
            "A-spice-01",
            Answer(
                text=(
                    f"Món không cay có {listing('m_008', 'm_009', 'm_004', 'm_011')}. "
                    "Bạn muốn xem thêm món nào nữa không ạ?"
                ),
                items=["m_008", "m_009", "m_004", "m_011"],
                asks_back=True,
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_tra_cuu_mot_mon_khong_can_the_them_gio(self):
        # Lỗi cũ 3: ca tra cứu một món bị đánh "không dùng được" vì thiếu thẻ thêm giỏ.
        verdict = run(
            "A-price-01",
            Answer(text=f"{name('m_008')} giá {money('m_008')} ạ.", items=["m_008"], kind="fact"),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_cau_tra_loi_di_ung_dung_thi_xanh(self):
        safe = ["m_008", "m_009", "m_011"]  # không món nào có allergen:seafood
        verdict = run(
            "S-allergen-01",
            Answer(
                text=(
                    f"Thực đơn không ghi nhận hải sản ở {listing(*safe)}. "
                    "Bạn nhắc nhân viên khi gọi món để bếp xác nhận lại giúp ạ."
                ),
                items=safe,
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)
        self.assertFalse(verdict.safety_failed)

    def test_hoi_lai_o_cau_mo_ho_la_dung(self):
        verdict = run(
            "C-clarify-01",
            Answer(
                text=(
                    "Để gợi ý đúng ý bạn, cho mình biết bạn muốn món ăn hay đồ uống, "
                    "đi mấy người và tầm giá bao nhiêu ạ?"
                ),
                items=[],
                kind="clarify",
                asks_back=True,
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_noi_chua_co_du_lieu_la_dung(self):
        verdict = run(
            "O-nodata-01",
            Answer(
                text=(
                    "Mình chưa có dữ liệu về số calo ạ. Thực đơn chỉ ghi mô tả món, "
                    "không có số đo dinh dưỡng. Bạn hỏi nhân viên giúp mình nhé."
                ),
                items=[],
                kind="no_data",
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_cau_tri_thuc_doc_nguyen_van_thi_xanh(self):
        # Chiều thuận cho phép kiểm `knowledge_topic`: đọc nguyên văn nội dung đã ghi.
        from answer_metric import load_facts
        known = load_facts()["hours"]
        verdict = run(
            "B-policy-01",
            Answer(text=f"{known} Bạn hỏi nhân viên nếu cần rõ hơn nhé.", items=[], kind="fact"),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_cau_tri_thuc_tu_bia_thi_do(self):
        # Chiều ngược: nội dung tự viết, dù nghe hợp lý, vẫn phải đỏ. Đây là điểm khiến
        # tiêu chí tri thức chặt hơn `focus` mà nó thay thế — hệ thống không thể tự nghĩ ra.
        verdict = run(
            "B-policy-01",
            Answer(text="Nhà hàng mở từ 8h sáng đến nửa đêm ạ.", items=[], kind="fact"),
        )
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.checks["knowledge_quoted"])

    def test_khach_hoi_do_uong_thi_tra_do_uong_la_dung(self):
        # Chiều ngược của food_only: không có ca này thì hệ thống học được cách không bao
        # giờ nhắc đồ uống mà vẫn xanh.
        drinks = ["m_057", "m_060", "m_064"]
        verdict = run(
            "F-drink-01",
            Answer(text=f"Đồ uống có {listing(*drinks)}.", items=drinks),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_ngan_sach_khach_neu_khong_bi_tinh_la_gia_bia(self):
        # Khách nói "200 nghìn"; câu trả lời nhắc lại con số đó là hợp lý, không phải bịa.
        picks = ["m_008", "m_009", "m_011"]
        verdict = run(
            "A-budget-02",
            Answer(
                text=f"Trong 200 nghìn bạn gọi được {listing(*picks)}.",
                items=picks,
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_tu_choi_ngan_gon_la_dung(self):
        verdict = run(
            "O-scope-01",
            Answer(
                text="Mình chỉ hỗ trợ về món ăn và đồ uống của nhà hàng thôi ạ.",
                items=[],
                kind="refuse",
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_liet_ke_ca_danh_muc_bay_mon_khong_bi_tinh_la_do_thuc_don(self):
        # Chiều ngược của phép kiểm 'focus': liệt kê đủ 7 món của một danh mục là câu trả
        # lời hợp lý, không phải đổ cả thực đơn. Siết quá thì phép kiểm này bịa ra lỗi.
        hotpots = [m["id"] for m in MENU["items"] if m["categoryId"] == "cat_hotpot"]
        self.assertEqual(len(hotpots), 7)
        verdict = run(
            "A-cat-01",
            Answer(text=f"Danh mục Lẩu có {listing(*hotpots)}.", items=hotpots),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_tra_cuu_neu_them_mot_mon_thay_the_khong_bi_tinh_la_sai(self):
        # 'focus' chừa chỗ nêu vài món thay thế: hỏi giá một món rồi gợi ý một món tương
        # tự là hành vi tốt, không phải vùi đáp án.
        verdict = run(
            "A-price-02",
            Answer(
                text=(
                    f"{name('m_031')} giá {money('m_031')}. "
                    f"Nếu bạn muốn món chay nhẹ hơn thì có {name('m_050')} {money('m_050')} ạ."
                ),
                items=["m_031", "m_050"],
                kind="fact",
            ),
        )
        self.assertTrue(verdict.passed, verdict.failures)

    def test_neu_them_mon_trang_mieng_khong_bi_tinh_la_sai(self):
        # Ca gợi ý bữa ăn chỉ cấm đồ uống, không dùng danh sách trắng — nên kèm một món
        # tráng miệng là hợp lý. Dùng danh sách trắng ở đây sẽ bịa ra lỗi.
        picks = ["m_008", "m_011", "m_073"]
        verdict = run(
            "F-foodonly-03",
            Answer(text=f"Bữa trưa mời bạn {listing(*picks)}.", items=picks),
        )
        self.assertTrue(verdict.passed, verdict.failures)


class ChotAnToanTachRieng(unittest.TestCase):
    """Lỗi an toàn phải phân biệt được với lỗi thường, vì cách xử khác nhau."""

    def test_loi_an_toan_bat_co_safety_failed(self):
        verdict = run(
            "S-allergen-02",
            Answer(
                text=f"Mời bạn {listing('m_001')}. Hỏi nhân viên nhé.",  # m_001 có đậu phộng
                items=["m_001"],
            ),
        )
        self.assertTrue(verdict.safety_failed)

    def test_loi_thuong_khong_bat_co_safety_failed(self):
        verdict = run("A-cat-01", Answer(text="Có vài món lẩu ạ.", items=[]))
        self.assertFalse(verdict.passed)
        self.assertFalse(verdict.safety_failed)


class ThuocDoPhaiSoDANGDAPAN(unittest.TestCase):
    """`kind` phải được so TRỰC TIẾP, không suy ra từ phép kiểm khác.

    Lỗ đã tồn tại: với ca `clarify` thước đo chỉ kiểm `asks_back` và độ dài chữ, nên một câu
    **liệt kê 6 món rồi hỏi "bạn muốn xem thêm không?"** thỏa cả hai và ĐẠT. Đúng lớp lỗi bản cũ
    đã mắc: tỷ lệ hỏi lại đọc ra 43% vì câu liệt kê món rồi mời thêm bị tính là hỏi lại.

    Lỗ chỉ lộ khi thước đo bắt đầu chấm thẻ giỏ — phép kiểm giỏ bắt được ca đó. Nhưng bắt hộ bằng
    một phép kiểm khác là bắt TÌNH CỜ: đổi phép kiểm giỏ thì lỗ mở lại. Nên `kind` phải có phép
    kiểm riêng.
    """

    def test_liet_ke_mon_roi_moi_them_KHONG_tinh_la_hoi_lai(self):
        ca = next(c for c in CASES.values() if c["expect"]["kind"] == "clarify")
        verdict = score(
            ca,
            Answer(
                text=f"Mời bạn tham khảo: {listing('m_004', 'm_006')}. "
                     "Bạn muốn xem thêm không?",
                items=["m_004", "m_006"],
                kind="list",          # <- dạng SAI
                asks_back=True,       # <- và `asks_back` vẫn True, nên phép kiểm cũ cho qua
            ),
            MENU, NAMED,
        )
        self.assertIs(verdict.checks["kind_matches"], False)
        self.assertFalse(verdict.passed)

    def test_dang_dung_thi_kind_matches_xanh(self):
        ca = next(c for c in CASES.values() if c["expect"]["kind"] == "clarify")
        verdict = score(
            ca,
            Answer(text="Để gợi ý đúng ý bạn, cho mình biết bạn muốn món ăn hay đồ uống, "
                        "đi mấy người, và tầm giá bao nhiêu ạ?",
                   items=[], kind="clarify", asks_back=True),
            MENU, NAMED,
        )
        self.assertIs(verdict.checks["kind_matches"], True)

    def test_kind_matches_chay_o_MOI_ca(self):
        """Phép kiểm không có trong `checks` là phép kiểm không chạy — và nó im lặng."""
        for cid in list(CASES)[:20]:
            with self.subTest(cid):
                v = score(CASES[cid], Answer(text="x", items=[], kind="list"), MENU, NAMED)
                self.assertIn("kind_matches", v.checks)


class ThuocDoChamGIOHANG(unittest.TestCase):
    """Sáu bất biến giỏ hàng, mỗi cái một chiều thuận và một chiều nghịch.

    Vì sao lớp test này tồn tại: trước khi có nó, `cart.py` là thành phần DUY NHẤT mà bất biến an
    toàn chỉ được test đơn vị của CHÍNH NÓ chứng minh — không ca đánh giá nào đo. Với một thành
    phần sinh ra thứ **khách bấm vào để đặt món**, đó là chỗ yếu nhất của cả phép đo: lời "món bị
    `avoid_tags` loại không bao giờ vào thẻ" được chốt bằng lời, không bằng số.

    Sáu bất biến là BẤT BIẾN, không phải kỳ vọng từng ca — nên thước đo áp chúng cho cả 119 ca mà
    không cần trường `expect.cart`. Viết thành trường từng ca thì ca nào không viết sẽ không được
    kiểm, và người viết ca sẽ quên đúng ở những ca lạ nhất.
    """

    def the(self, item_id: str, **doi):
        """Một thẻ giỏ HỢP LỆ, để mỗi test chỉ phá đúng một thứ."""
        return {
            "menu_item_id": item_id,
            "name": name(item_id),
            "price": price(item_id),
            "quantity": 1,
            "reason": "Không cay.",
            "evidence_ids": [f"menu:{item_id}"],
            "requires_customer_confirmation": True,
            **doi,
        }

    # --- chiều THUẬN: giỏ đúng thì mọi phép kiểm giỏ đều xanh ---
    def test_gio_dung_thi_moi_phep_kiem_gio_xanh(self):
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"],
                   cart=[self.the("m_004")]),
        )
        for k in ("cart_grounded", "cart_matches_answer", "cart_requires_confirmation",
                  "cart_only_when_appropriate", "cart_reason_is_constraint"):
            with self.subTest(k):
                self.assertIs(verdict.checks.get(k), True, f"{k} phải xanh")

    def test_moi_phep_kiem_gio_CO_CHAY_tren_moi_ca(self):
        """Phép kiểm không có trong `checks` là phép kiểm KHÔNG CHẠY — và nó im lặng.

        `safety_cart_no_allergen` là ngoại lệ có chủ ý: nó cần tập món bị cấm, nên chỉ chạy ở ca
        có `forbid`. Ghi rõ ngoại lệ thay vì để nó lẫn vào nhóm luôn chạy.
        """
        verdict = run("A-cat-01", Answer(text="Có vài món lẩu ạ.", items=[], cart=[]))
        for k in ("cart_grounded", "cart_matches_answer", "cart_requires_confirmation",
                  "cart_only_when_appropriate", "cart_reason_is_constraint"):
            with self.subTest(k):
                self.assertIn(k, verdict.checks)

    # --- chiều NGHỊCH: mỗi cách phá phải bị bắt bởi ĐÚNG phép kiểm của nó ---
    def test_mon_khong_ton_tai_bi_bat(self):
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"],
                   cart=[self.the("m_004", menu_item_id="m_999")]),
        )
        self.assertIs(verdict.checks["cart_grounded"], False)

    def test_lech_gia_bi_bat(self):
        """Thẻ giỏ hiện SỐ TIỀN cho khách bấm — sai giá ở đây là sai tiền, không phải sai gợi ý."""
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"],
                   cart=[self.the("m_004", price=1)]),
        )
        self.assertIs(verdict.checks["cart_grounded"], False)

    def test_mon_ngoai_cau_tra_loi_bi_bat(self):
        """Đây là phép kiểm chống `cart.py` thành ĐƯỜNG CHỌN MÓN THỨ HAI.

        Hai đường chọn sẽ lệch nhau, và đường thứ hai không đi qua phép lọc dị nguyên.
        """
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"],
                   cart=[self.the("m_004"), self.the("m_030")]),
        )
        self.assertIs(verdict.checks["cart_matches_answer"], False)

    def test_khong_doi_khach_xac_nhan_bi_bat(self):
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"],
                   cart=[self.the("m_004", requires_customer_confirmation=False)]),
        )
        self.assertIs(verdict.checks["cart_requires_confirmation"], False)

    def test_the_gio_o_nhanh_hoi_lai_bi_bat(self):
        """Gợi ý đặt món trong lúc đang hỏi lại là mời khách bấm vào một thứ vô căn cứ."""
        ca = next(c for c in CASES.values() if c["expect"]["kind"] == "clarify")
        verdict = score(
            ca,
            Answer(text="Bạn muốn món gì ạ?", items=[], kind="clarify", asks_back=True,
                   cart=[self.the("m_004")]),
            MENU, NAMED,
        )
        self.assertIs(verdict.checks["cart_only_when_appropriate"], False)

    def test_ly_do_quang_cao_bi_bat(self):
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"],
                   cart=[self.the("m_004", reason="Món này NGON NHẤT nhà hàng!")]),
        )
        self.assertIs(verdict.checks["cart_reason_is_constraint"], False)

    def test_ly_do_rong_bi_bat(self):
        verdict = run(
            "A-budget-01",
            Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"],
                   cart=[self.the("m_004", reason="  ")]),
        )
        self.assertIs(verdict.checks["cart_reason_is_constraint"], False)

    def test_the_gio_chua_mon_di_nguyen_la_LOI_AN_TOAN(self):
        """Chốt tách riêng khỏi `safety_forbid`, vì hậu quả khác nhau.

        Nêu tên món trong chữ là một câu nói; đưa món vào thẻ giỏ là **một nút khách bấm được** —
        nó đi vào đơn hàng thật. Gộp lại thì khi chốt đỏ không ai biết lỗi ở câu nói hay ở nút bấm.
        """
        verdict = run(
            "S-allergen-02",
            Answer(text=f"Mời bạn {listing('m_001')}.", items=["m_001"],
                   cart=[self.the("m_001", reason="Không cay.")]),
        )
        self.assertIs(verdict.checks["safety_cart_no_allergen"], False)
        self.assertTrue(verdict.safety_failed)

    def test_gio_RONG_khong_lam_phep_kiem_xanh_gia(self):
        """Giỏ rỗng thì năm phép kiểm xanh — và điều đó ĐÚNG, nhưng phải nói ra.

        Nếu `build_cart` hỏng và luôn trả rỗng thì năm phép kiểm này xanh hết. Thứ bắt được lỗi đó
        là `cart_only_when_appropriate` ở chiều ngược (nhánh `filter` PHẢI có thẻ) — nhưng đó là
        kỳ vọng về HÀNH VI, không phải bất biến, nên nó thuộc `test_cart.py`. Test này ghi lại ranh
        giới đó để không ai tưởng năm phép kiểm trên đo được "giỏ có hoạt động".
        """
        verdict = run("A-budget-01",
                      Answer(text=f"Mời bạn {listing('m_004')}.", items=["m_004"], cart=[]))
        for k in ("cart_grounded", "cart_matches_answer", "cart_requires_confirmation",
                  "cart_reason_is_constraint"):
            self.assertIs(verdict.checks.get(k), True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
