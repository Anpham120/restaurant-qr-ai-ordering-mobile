# -*- coding: utf-8 -*-
"""Test cho phần CHẤM ĐIỂM của golden test đầu-cuối.

Vì sao cần: `run_golden_e2e.py` chỉ chạy được khi có stack, nên nó không nằm trong CI. Nếu logic
chấm điểm của nó sai thì không có gì phát hiện — nó sẽ báo xanh trên một hệ thống đang sai, và đó
là kiểu hỏng tệ nhất của một bộ đo.

Những test này chạy được **không cần stack**: chúng dựng phản hồi giả rồi kiểm hàm chấm. Mỗi test
phá đúng một điều và đòi đúng một lỗi.

    python -m unittest discover -s ai/evaluation -p "test_*.py"
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import run_golden_e2e as RGE  # noqa: E402
from run_golden_e2e import cham_luot, cham_the_gio, suy_ra_kind  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
ITEMS = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]
BY_ID = {m["id"]: m for m in ITEMS}
BY_NAME = {m["name"]: m for m in ITEMS}
PHO = BY_NAME["Phở bò tái nạm"]
GOI_CUON = BY_NAME["Gỏi cuốn tôm thịt"]


def the(mon: dict, **doi) -> dict:
    """Một thẻ giỏ ĐÚNG, để mỗi test chỉ phá một trường."""
    a = {
        "menuItemId": mon["id"],
        "name": mon["name"],
        "price": mon["price"],
        "quantity": 1,
        "reason": "Không cay, trong ngân sách bạn nêu",
        "requiresCustomerConfirmation": True,
    }
    a.update(doi)
    return a


class BatBienTheGio(unittest.TestCase):
    """Bảy bất biến, mỗi bất biến một test phá đúng nó."""

    def test_the_dung_thi_khong_co_loi(self):
        self.assertEqual(cham_the_gio([the(PHO)], f"{PHO['name']} (75.000đ).", BY_ID, {}), [])

    def test_mon_khong_co_trong_thuc_don(self):
        do = cham_the_gio([the(PHO, menuItemId="m_999")], "gì đó", BY_ID, {})
        self.assertTrue(any("không có trong thực đơn" in x for x in do), do)

    def test_ten_the_khac_ten_thuc_don(self):
        do = cham_the_gio([the(PHO, name="Phở bò Wagyu")], "Phở bò Wagyu", BY_ID, {})
        self.assertTrue(any("khác tên thực đơn" in x for x in do), do)

    def test_gia_the_khac_gia_thuc_don(self):
        do = cham_the_gio([the(PHO, price=45000)], f"{PHO['name']}", BY_ID, {})
        self.assertTrue(any("khác giá thực đơn" in x for x in do), do)

    def test_the_co_mon_ma_cau_tra_loi_KHONG_neu(self):
        """Bất biến số 4 — bất biến đáng nhất, và là bất biến dễ thành mã chết nhất.

        Ba bất biến trên chỉ nói thẻ giỏ trỏ vào món có thật với giá đúng. Chúng vẫn xanh nếu trợ lý
        tư vấn món A rồi bỏ món B vào thẻ, mà đó chính là kiểu sai khách chịu thiệt: bấm "thêm vào
        giỏ" là tin rằng nó thêm đúng món vừa được gợi ý.
        """
        do = cham_the_gio([the(GOI_CUON)], f"Mời bạn tham khảo: {PHO['name']} (75.000đ).",
                          BY_ID, {})
        self.assertTrue(any("câu trả lời KHÔNG nêu món đó" in x for x in do), do)

    def test_so_luong_khong_duong(self):
        do = cham_the_gio([the(PHO, quantity=0)], PHO["name"], BY_ID, {})
        self.assertTrue(any("số lượng" in x for x in do), do)

    def test_khong_doi_khach_xac_nhan(self):
        do = cham_the_gio([the(PHO, requiresCustomerConfirmation=False)], PHO["name"], BY_ID, {})
        self.assertTrue(any("không đòi khách xác nhận" in x for x in do), do)

    def test_ly_do_rong(self):
        do = cham_the_gio([the(PHO, reason="  ")], PHO["name"], BY_ID, {})
        self.assertTrue(any("không có lý do" in x for x in do), do)

    def test_nhan_can_tranh_trong_the_la_loi_AN_TOAN(self):
        mon = next(m for m in ITEMS if "allergen:seafood" in m["tags"])
        do = cham_the_gio([the(mon)], mon["name"], BY_ID,
                          {"cart_forbid_tags_any": ["allergen:seafood"]})
        self.assertTrue(any(x.startswith("AN TOÀN GIỎ") for x in do), do)

    def test_nhanh_chua_hieu_thi_khong_duoc_co_the(self):
        do = cham_the_gio([the(PHO)], PHO["name"], BY_ID, {"no_cart": True})
        self.assertTrue(any("không được có thẻ" in x for x in do), do)


class DocDangDapAn(unittest.TestCase):
    """`suy_ra_kind` đọc từ thẻ giỏ và cụm mở đầu, KHÔNG từ số tên món trong văn xuôi."""

    def test_cau_tri_thuc_nhac_ten_mon_KHONG_thanh_danh_sach(self):
        """Ca này là lỗi thật của bản đầu.

        Câu ghép đồ uống nhắc "Trà đào cam sả" và "trà sen" trong văn xuôi — hai tên món — nên bản
        đếm tên món đọc nó thành `list`. Đếm tên món không phân biệt được "đây là các món tôi gợi ý"
        với "tôi đang nói VỀ các món này".
        """
        text = ("Gợi ý ghép đồ uống — Món nướng có mùi khói nên đồ uống nên cắt béo. "
                "Trà đào cam sả hoặc trà sen: vị chua nhẹ cắt được vị đậm.")
        self.assertEqual(suy_ra_kind(text, 0), "fact")

    def test_danh_sach_nhan_ra_bang_cum_mo_dau(self):
        self.assertEqual(suy_ra_kind("Mời bạn tham khảo: A (1đ), B (2đ).", 0), "list")

    def test_tu_choi_thang_hon_moi_dang_khac(self):
        self.assertEqual(
            suy_ra_kind("Mình chỉ hỗ trợ về món ăn và đồ uống của nhà hàng thôi ạ.", 0), "refuse")

    def test_chua_co_du_lieu_khac_tu_choi(self):
        self.assertEqual(
            suy_ra_kind("Thực đơn của nhà hàng chưa có món đó nên mình chưa có dữ liệu ạ.", 0),
            "no_data")

    def test_hoi_lai_chi_khi_khong_co_the_gio(self):
        cau = "Để gợi ý đúng ý bạn, cho mình biết bạn muốn món ăn hay đồ uống ạ?"
        self.assertEqual(suy_ra_kind(cau, 0), "clarify")
        # Có thẻ giỏ thì nó đang gợi ý món, không phải hỏi lại.
        self.assertEqual(suy_ra_kind(cau, 1), "fact")


class TieuChiCauTraLoi(unittest.TestCase):
    def test_cuc_tri_chot_GIA_khong_chot_MON(self):
        """Chốt giá, vì 5 món cùng giá 95.000đ — chốt món là chốt vào thứ tự phá hòa."""
        cao = max(m["price"] for m in ITEMS)
        dung = f"Món đắt nhất là {BY_ID['m_022']['name']}, giá 890.000đ ạ."
        do, _ = cham_luot({"content": dung, "suggestedCartActions": []},
                          {"must_name_priciest": True}, ITEMS, BY_ID, BY_NAME)
        self.assertEqual(do, [], f"giá cao nhất là {cao}")
        do, _ = cham_luot({"content": "Món đắt nhất là Cháo lòng Sài Gòn, giá 45.000đ ạ.",
                           "suggestedCartActions": []},
                          {"must_name_priciest": True}, ITEMS, BY_ID, BY_NAME)
        self.assertTrue(any("đắt nhất thực đơn" in x for x in do), do)

    def test_gia_that_cua_mon_phai_xuat_hien(self):
        do, _ = cham_luot(
            {"content": "Thực đơn ghi Phở bò tái nạm (75.000đ), không phải 45.000đ ạ.",
             "suggestedCartActions": []},
            {"must_state_price_of": "Phở bò tái nạm"}, ITEMS, BY_ID, BY_NAME)
        self.assertEqual(do, [])
        do, _ = cham_luot({"content": "Đúng ạ, Phở bò tái nạm 45.000đ.",
                           "suggestedCartActions": []},
                          {"must_state_price_of": "Phở bò tái nạm"}, ITEMS, BY_ID, BY_NAME)
        self.assertTrue(any("phải nêu giá thật" in x for x in do), do)

    def test_ca_viet_sai_ten_mon_bi_bat_la_CA_SAI(self):
        """Ca trỏ vào món không tồn tại phải báo 'ca viết sai', không phải 'hệ thống sai'.

        Phân biệt này quan trọng: lớp nguyên nhân `criterion_too_strict` của `analyze_failures.py`
        có mặt vì thước đo của dự án này đã sai 3 lần TRƯỚC khi hệ thống sai.
        """
        do, _ = cham_luot({"content": "gì đó", "suggestedCartActions": []},
                          {"must_state_price_of": "Món không tồn tại"}, ITEMS, BY_ID, BY_NAME)
        self.assertTrue(any("ca viết sai" in x for x in do), do)

    def test_vuot_ngan_sach_bi_bat_bang_gia_tra_tu_thuc_don(self):
        do, _ = cham_luot(
            {"content": f"Mời bạn tham khảo: {BY_ID['m_022']['name']} (890.000đ).",
             "suggestedCartActions": []},
            {"max_price": 100000}, ITEMS, BY_ID, BY_NAME)
        self.assertTrue(any("vượt ngân sách" in x for x in do), do)

    def test_nhan_can_tranh_trong_cau_TRA_LOI_la_loi_an_toan(self):
        mon = next(m for m in ITEMS if "allergen:seafood" in m["tags"])
        do, _ = cham_luot({"content": f"Mời bạn tham khảo: {mon['name']}.",
                           "suggestedCartActions": []},
                          {"forbid_tags_any": ["allergen:seafood"]}, ITEMS, BY_ID, BY_NAME)
        self.assertTrue(any(x.startswith("AN TOÀN") for x in do), do)


class TapGoldenPhaiHopLe(unittest.TestCase):
    """Tập golden tự kiểm được, như `validate_cases.py` làm với 140 ca."""

    def setUp(self) -> None:
        self.data = json.loads(
            (Path(__file__).resolve().parent / "golden_e2e.json").read_text(encoding="utf-8-sig")
        )

    def test_moi_hoi_thoai_va_moi_luot_deu_co_why(self):
        for c in self.data["conversations"]:
            self.assertTrue((c.get("why") or "").strip(), c["id"])
            for j, t in enumerate(c["turns"], 1):
                self.assertTrue((t.get("expect", {}).get("why") or "").strip(),
                                f"{c['id']} lượt {j}")

    def test_moi_luot_co_it_nhat_MOT_tieu_chi_thuc_su_do(self):
        """Lượt chỉ có `why` thì nó không đo gì — cùng hàng rào `KHOA_KHONG_DO` của bộ chạy phiên.

        Bảy bất biến thẻ giỏ vẫn áp cho mọi lượt, nhưng chúng chỉ nói về THẺ. Một lượt không có
        tiêu chí nào về câu trả lời là một lượt gọi API rồi không kiểm nội dung.
        """
        for c in self.data["conversations"]:
            for j, t in enumerate(c["turns"], 1):
                khoa = set(t.get("expect", {})) - {"why"}
                self.assertTrue(khoa, f"{c['id']} lượt {j} không có tiêu chí nào")

    def test_khoa_la_bi_chan(self):
        """Khóa bộ chạy không hiểu là LỖI, không phải bị bỏ qua im lặng.

        Đúng lớp lỗi đã xảy ra hai lần: `min_items` viết thay cho `require_min` trong `cases.json`,
        và `tags_include` là mã chết trong thước đo suốt nhiều tháng.
        """
        HIEU = {
            "why", "kind", "min_items", "max_items", "min_chars", "forbid_tags_any", "cart_forbid_tags_any",
            "must_say_any", "must_not_say_any", "max_price", "must_name_priciest",
            "must_name_priciest_within", "must_state_price_of", "no_invented_item_names",
            "no_cart", "add_first_cart_item_to_cart",
            "forbid_category_any", "only_categories", "refers_to_position",
            "must_not_repeat_turn", "must_name_items", "require_tags_all",
        }
        for c in self.data["conversations"]:
            for j, t in enumerate(c["turns"], 1):
                la = sorted(set(t.get("expect", {})) - HIEU)
                self.assertEqual(la, [], f"{c['id']} lượt {j}: khóa lạ {la}")

        # Chiều NGƯỢC LẠI, và nó là chiều nguy hiểm hơn: `HIEU` là bảng VIẾT TAY, nên nó cho phép
        # khai một khóa mà bộ chạy KHÔNG cài. Khóa như vậy là **tiêu chí chết**: ca nào dùng nó cũng
        # xanh, và bảng kết quả trông như đã phủ.
        #
        # Dự án đã có bốn tiêu chí chết theo đúng cách này (`expect` mức trên trong `validate_cases`,
        # `memory_budget_max: null`, `must_not_say_any` vắng mặt, `abstain` trong phép so truy hồi), và
        # cả bốn đều được phát hiện MUỘN — sau khi con số đã được báo ra.
        #
        # Nên mỗi khóa trong `HIEU` phải xuất hiện trong mã của `cham_luot`/`cham_the_gio`. Đây là
        # phép kiểm thô — nó chỉ đọc chuỗi — nhưng nó bắt đúng chỗ hỏng: khai mà không cài.
        nguon = (Path(RGE.__file__)).read_text(encoding="utf-8")
        # Tách phần chú thích ra: một khóa chỉ được NHẮC trong chú thích thì vẫn là khóa chết.
        lenh = "\n".join(
            line for line in nguon.splitlines() if not line.strip().startswith("#")
        )
        chua_cai = sorted(
            k for k in HIEU
            if k != "why" and f'"{k}"' not in lenh and f"'{k}'" not in lenh
        )
        self.assertEqual(
            chua_cai, [],
            f"khóa được khai trong HIEU nhưng KHÔNG có trong mã chấm: {chua_cai}. "
            "Ca dùng khóa đó sẽ xanh mà không đo gì — tiêu chí chết còn tệ hơn không có tiêu chí, "
            "vì nó làm bảng kết quả trông như đã phủ.",
        )

    def test_ten_mon_trong_tieu_chi_phai_co_that(self):
        """Mọi tên món viết trong tiêu chí phải có trong thực đơn.

        `must_state_price_of` nhận CẢ chuỗi và danh sách (câu so sánh cần giá hai món), nên test này
        phải chuẩn hóa. Bản đầu chỉ nhận chuỗi và nó `TypeError` ngay khi tôi nới khóa — hàng rào
        bắt đúng việc nó có mặt để bắt.
        """
        for c in self.data["conversations"]:
            for j, t in enumerate(c["turns"], 1):
                exp = t.get("expect", {})
                gia = exp.get("must_state_price_of")
                ten_list = ([] if gia is None else
                            [gia] if isinstance(gia, str) else list(gia))
                for ten in ten_list + list(exp.get("must_name_items", [])):
                    self.assertIn(ten, BY_NAME, f"{c['id']} lượt {j}")

    def test_nhan_va_danh_muc_trong_tieu_chi_phai_co_that(self):
        """Nhãn và mã danh mục cũng phải có thật — nhãn viết sai là tiêu chí không bao giờ thỏa."""
        nhan_that = {t for m in ITEMS for t in m["tags"]}
        danh_muc_that = {m["categoryId"] for m in ITEMS}
        for c in self.data["conversations"]:
            for j, t in enumerate(c["turns"], 1):
                exp = t.get("expect", {})
                for nhan in (list(exp.get("forbid_tags_any", []))
                             + list(exp.get("cart_forbid_tags_any", []))
                             + list(exp.get("require_tags_all", []))):
                    self.assertIn(nhan, nhan_that, f"{c['id']} lượt {j}: nhãn lạ")
                for cat in (list(exp.get("only_categories", []))
                            + list(exp.get("forbid_category_any", []))):
                    self.assertIn(cat, danh_muc_that, f"{c['id']} lượt {j}: danh mục lạ")

    def test_tham_chieu_chi_tro_vao_luot_TRUOC_do(self):
        """`refers_to_position` và `must_not_repeat_turn` chỉ được trỏ vào lượt đã xảy ra."""
        for c in self.data["conversations"]:
            for j, t in enumerate(c["turns"], 1):
                exp = t.get("expect", {})
                dat = exp.get("refers_to_position")
                if dat is not None:
                    self.assertTrue(1 <= dat["turn"] < j, f"{c['id']} lượt {j}: {dat}")
                    self.assertGreaterEqual(dat["index"], 1, f"{c['id']} lượt {j}")
                k = exp.get("must_not_repeat_turn")
                if k is not None:
                    self.assertTrue(1 <= k < j, f"{c['id']} lượt {j}: trỏ vào lượt {k}")

    def test_co_it_nhat_mot_hoi_thoai_di_duong_SSE(self):
        """Frontend gọi stream TRƯỚC rồi mới lùi về gọi thường, nên SSE là đường CHÍNH của khách.

        Không có hội thoại nào đi đường đó thì đường chính không được kiểm — và hai đường đi qua hai
        nhánh khác nhau ở backend.
        """
        co = [c["id"] for c in self.data["conversations"] if c.get("transport") == "stream"]
        self.assertTrue(co, "không hội thoại nào đi đường SSE")

    def test_co_it_nhat_mot_luot_bam_them_vao_gio_that(self):
        """Không có lượt nào bấm thêm vào giỏ thì bộ này dừng ở chặng 5, không phải chặng 6."""
        co = any(t.get("expect", {}).get("add_first_cart_item_to_cart")
                 for c in self.data["conversations"] for t in c["turns"])
        self.assertTrue(co, "không lượt nào thêm vào giỏ thật — thiếu đúng chặng cuối")


if __name__ == "__main__":
    unittest.main()
