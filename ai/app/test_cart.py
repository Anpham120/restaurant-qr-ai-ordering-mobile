# -*- coding: utf-8 -*-
"""Test thẻ giỏ hàng — mỗi bất biến một test, và bất biến 3 có test HAI CHIỀU.

Bất biến quan trọng nhất là số 3: món bị `avoid_tags` loại không bao giờ vào thẻ. Nó có hai chiều
vì chiều "món cấm không vào thẻ" một mình không đủ — một cách làm bỏ hết mọi món cũng qua được.

    python -m unittest test_cart      # trong ai/app
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from answer import respond, select  # noqa: E402
from cart import (  # noqa: E402
    BRANCHES_WITH_CART,
    MAX_CART_ACTIONS,
    CartError,
    build_cart,
    cart_payload,
)
from understand import understand  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)
ITEMS = MENU["items"]
BY_ID = {i["id"]: i for i in ITEMS}
CATEGORY_NAMES = {c["categoryId"]: c["name"] for c in MENU["categories"]}


def cart_for(question: str):
    """Chạy trọn một lượt rồi sinh thẻ, đúng thứ tự dịch vụ thật dùng."""
    request = understand(question, ITEMS)
    reply = respond(request, ITEMS)
    chosen = [BY_ID[i] for i in reply.items]
    return request, reply, build_cart(
        request, chosen, reply.branch, reply.kind, CATEGORY_NAMES
    )


class BatBien1_MonTonTaiVaGiaLayTuThucDon(unittest.TestCase):
    def test_moi_mon_trong_the_co_that_va_dung_gia(self):
        _, _, actions = cart_for("Cho mình món chay dưới 100 nghìn")
        self.assertTrue(actions, "tiền đề: câu này phải sinh thẻ")
        for a in actions:
            with self.subTest(a.menu_item_id):
                self.assertIn(a.menu_item_id, BY_ID, "món không tồn tại trong thực đơn")
                self.assertEqual(
                    a.price, BY_ID[a.menu_item_id]["price"],
                    "giá phải lấy TỪ thực đơn — sai giá là chuyện tiền của khách",
                )
                self.assertEqual(a.name, BY_ID[a.menu_item_id]["name"])

    def test_evidence_tro_ve_dung_mon(self):
        _, _, actions = cart_for("Cho mình món chay")
        for a in actions:
            self.assertEqual(a.evidence_ids, (f"menu:{a.menu_item_id}",))


class BatBien2_LuonCanKhachXacNhan(unittest.TestCase):
    def test_moi_the_deu_doi_khach_xac_nhan(self):
        for cau in ("Cho mình món chay", "Món nào không cay", "Nhóm mình 4 người gọi gì"):
            _, _, actions = cart_for(cau)
            for a in actions:
                with self.subTest(cau):
                    self.assertTrue(a.requires_customer_confirmation)
                    self.assertTrue(a.to_payload()["requires_customer_confirmation"])

    def test_KHONG_the_dat_thanh_false(self):
        """Đây là ranh giới 'AI không tự đặt món', nên nó phải là HẰNG SỐ.

        Một quyết định theo ngữ cảnh sẽ có ngày sai ngữ cảnh. `field(init=False)` cộng `frozen`
        làm việc đặt `False` không biểu diễn được, không chỉ là không nên.
        """
        _, _, actions = cart_for("Cho mình món chay")
        a = actions[0]
        with self.assertRaises(Exception):
            a.requires_customer_confirmation = False  # type: ignore[misc]
        from cart import CartAction

        with self.assertRaises(TypeError):
            CartAction(  # type: ignore[call-arg]
                menu_item_id="m_001", name="x", price=1, quantity=1, reason="y",
                requires_customer_confirmation=False,
            )


class BatBien3_MonBiTranhKHONGBaoGioVaoThe(unittest.TestCase):
    """Bất biến an toàn. Hai chiều, vì chiều một mình không đủ."""

    def test_the_KHONG_chua_mon_mang_nhan_di_nguyen(self):
        for cau, nhan in (
            ("Mình dị ứng hải sản, gợi ý món ăn giúp mình", "allergen:seafood"),
            ("Mình không ăn được sữa, cho mình món ăn", "allergen:dairy"),
            ("Ăn tôm là mình bị nổi mề đay", "allergen:seafood"),
        ):
            _, _, actions = cart_for(cau)
            with self.subTest(cau):
                self.assertTrue(actions, "tiền đề: câu này phải sinh thẻ")
                bad = [a.menu_item_id for a in actions if nhan in BY_ID[a.menu_item_id]["tags"]]
                self.assertEqual(bad, [], f"thẻ giỏ chứa món mang {nhan}: {bad}")

    def test_van_SINH_the_cho_ca_di_ung(self):
        """Chiều ngược, BẮT BUỘC: một cách làm bỏ hết mọi món cũng qua được test trên.

        Khách dị ứng vẫn phải nhận được gợi ý — fail-closed nghĩa là không mời món cấm, không
        nghĩa là không mời gì.
        """
        _, _, actions = cart_for("Mình dị ứng hải sản, gợi ý món ăn giúp mình")
        self.assertGreaterEqual(len(actions), 1)

    def test_bo_lot_mon_cam_thi_BAO_LOI_khong_lang_le_bo(self):
        """Nếu `answer.select()` hỏng thì `cart` phải BÁO, không được im lặng dọn hộ.

        Im lặng dọn hộ nghĩa là lọc fail-closed hỏng mà mọi thước đo vẫn xanh — đúng lớp lỗi
        thoái hóa im lặng mà dự án đã gặp ba lần.
        """
        request = understand("Mình dị ứng hải sản, gợi ý món ăn giúp mình", ITEMS)
        self.assertIn("allergen:seafood", request.avoid_tags)
        mon_cam = next(i for i in ITEMS if "allergen:seafood" in i["tags"])
        with self.assertRaises(CartError) as ctx:
            build_cart(request, [mon_cam], "filter", "list")
        self.assertIn("fail-closed", str(ctx.exception))


class BatBien4_ChiSinhTheONhanhPhuHop(unittest.TestCase):
    def test_nhanh_hoi_lai_va_khong_co_du_lieu_KHONG_co_the(self):
        for cau in ("Gợi ý món đi",                      # clarify
                    "Nhà hàng có wifi không?",            # facts
                    "Hôm nay thời tiết thế nào?",         # off_topic
                    "Món này bao nhiêu calo?"):           # no_data
            _, reply, actions = cart_for(cau)
            with self.subTest(f"{cau} -> {reply.kind}/{reply.branch}"):
                self.assertEqual(
                    actions, [],
                    f"nhánh {reply.branch!r} kind={reply.kind!r} KHÔNG được có thẻ giỏ",
                )

    def test_nhanh_loc_mon_CO_the(self):
        _, reply, actions = cart_for("Cho mình món chay dưới 100 nghìn")
        self.assertEqual(reply.kind, "list")
        self.assertTrue(actions)

    def test_danh_sach_TRANG_khong_phai_danh_sach_den(self):
        """Nhánh mới thêm sau này mặc định KHÔNG có thẻ, và người thêm phải chủ động nghĩ."""
        request = understand("Cho mình món chay", ITEMS)
        chosen = select(request, ITEMS)[:2]
        self.assertEqual(build_cart(request, chosen, "nhanh_moi_chua_nghi_toi", "list"), [])
        self.assertIn("filter", BRANCHES_WITH_CART)


class BatBien5_LyDoNeuRangBuocDaThoa(unittest.TestCase):
    def test_ly_do_neu_MOI_rang_buoc_mon_do_THOA(self):
        """Không phải "ít nhất một" — phải ĐỦ mọi ràng buộc mà món đó thỏa.

        Bản đầu của test này chấp nhận `"chay" in reason OR "không cay" in reason`, và nó BỎ SÓT
        một lỗi thật: câu "món chay dưới 100 nghìn" cho lý do chỉ nói "Trong ngân sách 100.000đ",
        không nhắc chay một chữ — vì "món chay" đi vào `categories` chứ không vào `require_tags`.
        Câu có cả hai ràng buộc đã qua test nhờ vế thứ hai, nên lỗi sống sót.

        Bài học: phép kiểm dạng "ít nhất một trong các điều kiện" gần như luôn quá lỏng.
        """
        for cau, phai_co in (
            ("Cho mình món chay dưới 100 nghìn", ("chay", "ngân sách")),
            ("Cho mình món chay không cay", ("chay", "không cay")),
            ("Món nào không cay dưới 80 nghìn", ("không cay", "ngân sách")),
        ):
            _, _, actions = cart_for(cau)
            with self.subTest(cau):
                self.assertTrue(actions, "tiền đề: câu này phải sinh thẻ")
                for a in actions:
                    for cum in phai_co:
                        self.assertIn(
                            cum, a.reason.lower(),
                            f"{cau!r} -> lý do {a.reason!r} THIẾU ràng buộc {cum!r}",
                        )

    def test_ly_do_goi_ten_nhom_lay_TU_THUC_DON(self):
        """Tên nhóm không được viết cứng trong `cart.py` — nó phải đến từ thực đơn.

        Viết cứng 13 tên nhóm vào `cart.py` là tạo bản sao thứ hai của dữ liệu, và bản sao thứ hai
        luôn trôi khỏi bản gốc. Không truyền bảng tra thì lý do bỏ qua nhóm chứ không bịa tên.
        """
        request = understand("Cho mình món chay", ITEMS)
        chosen = select(request, ITEMS)[:1]
        co_bang = build_cart(request, chosen, "filter", "list", CATEGORY_NAMES)
        khong_bang = build_cart(request, chosen, "filter", "list", None)
        self.assertIn("Món chay", co_bang[0].reason)
        self.assertNotIn("Món chay", khong_bang[0].reason)

    def test_ly_do_KHONG_phai_cau_quang_cao(self):
        """Lý do sinh từ nhãn nên không thể bịa. Chặn các từ khen không kiểm được."""
        for cau in ("Cho mình món chay", "Món nào không cay", "Nhóm mình 4 người gọi gì"):
            _, _, actions = cart_for(cau)
            for a in actions:
                with self.subTest(f"{cau} / {a.name}"):
                    for tu in ("ngon nhất", "tuyệt vời", "hoàn hảo", "nên thử", "đảm bảo"):
                        self.assertNotIn(tu, a.reason.lower(), f"lý do có từ quảng cáo: {tu!r}")

    def test_di_nguyen_noi_CHUA_GHI_NHAN_khong_noi_khong_co(self):
        """Nhãn dị nguyên chỉ phủ 44/91 món, nên 'không có nhãn' KHÔNG đồng nghĩa 'không chứa'.

        Đây là chỗ dễ nói quá nhất trong cả hệ thống, và nói quá ở đây là nói sai về an toàn.
        """
        _, _, actions = cart_for("Mình dị ứng hải sản, gợi ý món ăn giúp mình")
        self.assertTrue(actions)
        for a in actions:
            with self.subTest(a.name):
                self.assertIn("không ghi nhận", a.reason.lower())
                self.assertNotIn("không chứa", a.reason.lower())
                self.assertNotIn("an toàn", a.reason.lower())

    def test_khong_rang_buoc_nao_thi_noi_thang_khong_biu(self):
        request = understand("Cho mình xem vài món", ITEMS)
        chosen = select(request, ITEMS)[:1]
        actions = build_cart(request, chosen, "filter", "list")
        if actions:
            self.assertIn("yêu cầu bạn vừa nêu", actions[0].reason)


class GioiHanVaHopDong(unittest.TestCase):
    def test_khong_qua_MAX_CART_ACTIONS_the(self):
        """Giỏ dài hơn thế thì khách không đọc, và nó biến câu tư vấn thành danh mục."""
        for cau in ("Cho mình món chay", "Món nào không cay", "Gợi ý món ăn tối cho 4 người"):
            _, _, actions = cart_for(cau)
            with self.subTest(cau):
                self.assertLessEqual(len(actions), MAX_CART_ACTIONS)

    def test_the_nam_trong_danh_sach_mon_DA_CHON(self):
        """Thẻ không được thêm món nào ngoài danh sách `answer.py` đưa cho — nếu thêm được thì
        `cart.py` đã trở thành đường chọn món thứ hai."""
        for cau in ("Cho mình món chay", "Mình dị ứng hải sản, gợi ý món ăn giúp mình"):
            _, reply, actions = cart_for(cau)
            with self.subTest(cau):
                self.assertTrue(set(a.menu_item_id for a in actions) <= set(reply.items))

    def test_json_hoa_duoc(self):
        _, _, actions = cart_for("Cho mình món chay")
        json.dumps(cart_payload(actions), ensure_ascii=False)

    def test_danh_sach_mon_rong_thi_the_rong(self):
        request = understand("Cho mình món chay", ITEMS)
        self.assertEqual(build_cart(request, [], "filter", "list"), [])


class KhongTheTuLocLai(unittest.TestCase):
    def test_chu_ky_ham_KHONG_nhan_thuc_don(self):
        """Không có thực đơn thì không thể tự lọc, kể cả khi ai đó muốn.

        Đây là cách chặn đường chọn món thứ hai bằng CẤU TRÚC thay vì bằng quy ước — cùng nguyên
        tắc với việc nhãn mang tiền tố nhóm để chặn lớp lỗi đụng chữ.
        """
        import inspect

        params = set(inspect.signature(build_cart).parameters)
        self.assertEqual(
            params, {"request", "selected_items", "branch", "kind", "category_names"}
        )
        # `category_names` là bảng tra TÊN, không phải danh sách món — nó không mở lại đường lọc.
        self.assertNotIn("menu_items", params)
        self.assertNotIn("items", params)


if __name__ == "__main__":
    unittest.main(verbosity=2)
