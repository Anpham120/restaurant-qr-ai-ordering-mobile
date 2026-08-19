# -*- coding: utf-8 -*-
"""Test cho lớp Ý ĐỊNH — ba lỗi tìm ra khi dùng THẬT trên production.

Không lỗi nào trong ba lỗi này bị 103 lượt golden + 140 ca + 87 lượt phiên bắt được, và đó là phát
hiện về TẬP ĐÁNH GIÁ chứ không phải về hệ thống: cả ba tập do một người viết, nên chúng mang đúng
thiên lệch của người đó. Người viết tập đánh giá về ẩm thực Việt hỏi "món nào không cay", "nhóm 4
người ăn gì" — chứ không hỏi "xin chào", "tư vấn thêm đi", "tôi hết dị ứng rồi".

    "xin chào"                  -> hệ thống đổ ra danh sách rượu và cà phê
    "tư vấn thêm đi"            -> y nguyên 6 món vừa nêu
    "tôi không còn dị ứng nữa"  -> vẫn lọc theo dị nguyên cũ, và không có đường gỡ

Mỗi nhóm dưới đây kiểm HAI CHIỀU. Một chiều là không đủ: một bộ đọc ý định luôn trả "chào hỏi" cũng
qua được chiều thứ nhất.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from answer import respond
from intent import (
    CAM_ON,
    CHAO_HOI,
    HOI_MON,
    NGOAI_PHAM_VI,
    XIN_THEM,
    XOA_RANG_BUOC,
    doc_y_dinh_tat_dinh,
)
from session import SessionState, merge_into_request, update_state
from understand import fold, understand

REPO_ROOT = Path(__file__).resolve().parents[2]
ITEMS = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]


def hoi(cau: str, state: SessionState | None = None):
    """Một lượt trọn vẹn qua đúng chuỗi mà `service._run_turn` đi."""
    st = state or SessionState()
    merged = merge_into_request(understand(cau, ITEMS), st)
    reply = respond(merged, ITEMS)
    return merged, reply, update_state(st, merged, reply.items, reply.kind, reply.branch)


class DocDungYDinh(unittest.TestCase):
    def test_chao_hoi(self):
        for cau in ("xin chào", "chào bạn", "hello", "Hi", "chào buổi sáng"):
            with self.subTest(cau):
                self.assertEqual(doc_y_dinh_tat_dinh(cau).ten, CHAO_HOI)

    def test_cam_on(self):
        for cau in ("cảm ơn bạn nhé", "thanks", "mình cảm ơn"):
            with self.subTest(cau):
                self.assertEqual(doc_y_dinh_tat_dinh(cau).ten, CAM_ON)

    def test_xin_them(self):
        for cau in ("tư vấn thêm đi", "còn gì nữa không", "cho xem thêm", "gợi ý thêm"):
            with self.subTest(cau):
                self.assertEqual(doc_y_dinh_tat_dinh(cau).ten, XIN_THEM)

    def test_xoa_rang_buoc(self):
        for cau, nhom in (
            ("tôi không còn dị ứng nữa", "allergen"),
            ("tôi hết dị ứng rồi", "allergen"),
            ("giờ ăn được rồi", "allergen"),
            ("bỏ hết điều kiện đi", "all"),
        ):
            with self.subTest(cau):
                y = doc_y_dinh_tat_dinh(cau)
                self.assertEqual(y.ten, XOA_RANG_BUOC)
                self.assertIn(nhom, y.bo_rang_buoc)

    def test_CHIEU_NGUOC_cau_hoi_mon_KHONG_thanh_y_dinh_khac(self):
        """Chiều ngược lại. Thiếu nó thì một bộ luôn trả 'chào hỏi' cũng qua các test trên."""
        for cau in (
            "tư vấn tôi món cho 4-5 người",
            "tôi bị dị ứng hải sản",
            "Ở đây có phở không",
            "Món nào không cay?",
            "Nhà hàng mấy giờ mở cửa?",
        ):
            with self.subTest(cau):
                self.assertEqual(doc_y_dinh_tat_dinh(cau).ten, HOI_MON)


class YDinhXaGiaoKHONGDuocChiemCauHoiThat(unittest.TestCase):
    """Câu có nêu thứ khác thì ý định xã giao phải NHƯỜNG.

    "cảm ơn bạn, cho mình xem món chay" là câu hỏi món, không phải lời cảm ơn. Không có phép chặn
    này thì một chữ xã giao lọt vào đầu câu sẽ nuốt cả yêu cầu thật.
    """

    def test_loi_cam_on_kem_yeu_cau_van_la_yeu_cau(self):
        merged, reply, _ = hoi("cảm ơn bạn, cho mình xem món chay")
        self.assertEqual(merged.y_dinh, HOI_MON)
        self.assertEqual(reply.kind, "list")

    def test_chao_kem_yeu_cau_van_la_yeu_cau(self):
        merged, reply, _ = hoi("xin chào, cho mình món lẩu")
        self.assertEqual(merged.y_dinh, HOI_MON)
        self.assertIn("cat_hotpot", merged.categories)

    def test_xin_them_kem_rang_buoc_van_GIU_rang_buoc(self):
        """"cho mình thêm món chay" vừa là XIN THÊM vừa mang ràng buộc — phải giữ CẢ HAI.

        Bản đầu của test này khẳng định ngược lại: nó đòi `HOI_MON`, với lý do "đây là ràng buộc
        MỚI nên đọc thành xin-thêm sẽ loại đúng những món chay vừa nêu". Lý do đó SAI, và kịch bản
        `ask-for-more-02` chỉ ra chỗ sai — loại món ĐÃ NÊU luôn đúng khi khách xin thêm:

            ràng buộc mới KHÁC   -> món cũ không khớp bộ lọc mới, đã bị loại sẵn
            ràng buộc mới GIỐNG  -> "thêm ... nữa" chính là xin món mới của cùng thứ

        Giữ khẳng định cũ thì "cho mình thêm món chay NỮA" trả lại y nguyên 6 món chay vừa xem.
        """
        merged, _, _ = hoi("cho mình thêm món chay")
        self.assertEqual(merged.y_dinh, XIN_THEM)
        self.assertTrue(merged.wants_similar)
        self.assertIn("cat_vegetarian", merged.categories, "ràng buộc chay phải còn nguyên")


class ChaoHoiKHONGDuocThanhDanhSachMon(unittest.TestCase):
    """Lỗi số 1: "xin chào" nhận về danh sách rượu nếp cẩm, cà phê trứng, trà sen.

    Nguyên nhân là cổng `answer.thuoc_mien()` — phép OR trên TỪNG TỪ ĐƠN của mọi tên món sau khi rút
    dấu, nên `chao` của "xin chào" khớp món **"Cháo lòng Sài Gòn"** và câu lọt xuống nhánh truy hồi
    toàn kho, nơi KHÔNG có ngưỡng tương đồng. Vụ đụng chữ thứ tám của dự án.
    """

    def test_loi_chao_khong_co_the_gio_va_khong_liet_ke(self):
        for cau in ("xin chào", "chào bạn", "hello"):
            with self.subTest(cau):
                _, reply, _ = hoi(cau)
                self.assertEqual(reply.branch, f"xa_giao:{CHAO_HOI}")
                self.assertEqual(reply.items, [], "lời chào không được kèm danh sách món")
                self.assertNotIn("(", reply.text, "câu chào không được chứa giá tiền")

    def test_loi_chao_NEU_PHAM_VI(self):
        """Lượt đầu là chỗ khách học được trợ lý này làm gì."""
        _, reply, _ = hoi("xin chào")
        self.assertIn("món ăn", reply.text.lower())

    def test_chu_chao_van_KHONG_lam_hong_cau_hoi_ve_chao(self):
        """Chiều ngược: "cho mình cháo" vẫn phải ra món cháo, không thành lời chào."""
        merged, reply, _ = hoi("nhà hàng có cháo không")
        self.assertEqual(merged.y_dinh, HOI_MON)
        self.assertNotEqual(reply.branch, f"xa_giao:{CHAO_HOI}")


class XinThemKHONGDuocLapDanhSach(unittest.TestCase):
    """Lỗi số 2: "tư vấn thêm đi" trả lại y nguyên 6 món của lượt trước.

    Từ vựng đã có `mon khac|cai khac|thu khac` -> cờ `similar`, nhưng KHÔNG có "thêm", "còn gì nữa".
    Nên câu rơi vào nhánh lọc bình thường và lặp lại chính danh sách cũ.
    """

    def test_tu_van_them_khong_lap_lai_mon_da_neu(self):
        _, reply1, st = hoi("tư vấn tôi món cho 4-5 người")
        self.assertTrue(reply1.items)
        _, reply2, _ = hoi("tư vấn thêm đi", st)
        trung = set(reply1.items) & set(reply2.items)
        self.assertFalse(
            trung,
            f"lượt 2 lặp lại {len(trung)} món của lượt 1 — đúng lỗi đã đo trên production",
        )

    def test_con_gi_nua_cung_vay(self):
        _, reply1, st = hoi("gợi ý món chay cho mình")
        _, reply2, _ = hoi("còn gì nữa không", st)
        self.assertFalse(set(reply1.items) & set(reply2.items))

    def test_xin_them_bat_co_wants_similar(self):
        st = SessionState(suggested_item_ids=["m_001"], last_listed_ids=["m_001"])
        merged, _, _ = hoi("tư vấn thêm đi", st)
        self.assertTrue(merged.wants_similar)
        self.assertIn("m_001", merged.exclude_item_ids)


class XoaRangBuocPhaiCoDuongVaPhaiNOIRA(unittest.TestCase):
    """Lỗi số 3: khách nói hết dị ứng mà hệ thống vẫn lọc, rồi kẹt luôn.

    `session.merge_into_request` hợp nhất dị nguyên bằng phép HỢP và không bao giờ bỏ — có chủ ý, vì
    đó là chốt an toàn quan trọng nhất của bộ nhớ phiên. Nhưng **"không bao giờ bỏ" khác "không có
    đường bỏ"**, và dự án đã lẫn hai thứ đó.
    """

    def test_khach_bao_het_di_ung_thi_bo_duoc(self):
        _, _, st = hoi("tôi bị dị ứng hải sản")
        self.assertIn("allergen:seafood", st.avoid_tags)

        merged, reply, st = hoi("tôi không còn dị ứng nữa", st)
        self.assertIn("allergen:seafood", merged.da_bo_rang_buoc)
        self.assertEqual(st.avoid_tags, [], "bộ nhớ phải ghi lại việc bỏ, không ghi lại cái cũ")

        _, reply3, _ = hoi("vậy gợi ý món hải sản đi", st)
        self.assertEqual(reply3.kind, "list")
        self.assertTrue(reply3.items, "bỏ ràng buộc xong vẫn không gợi được món là chưa bỏ thật")

    def test_cau_tra_loi_PHAI_NOI_RA_dieu_vua_bo(self):
        """Điều phân biệt "có đường bỏ" với "im lặng bỏ".

        Hạ một hàng rào an toàn mà không nói thì khách không có cách nào biết để sửa nếu hệ thống
        hiểu sai câu của họ — và với dị nguyên, hiểu sai theo hướng này là lỗi nguy hiểm nhất.
        """
        _, _, st = hoi("tôi bị dị ứng hải sản")
        _, reply, _ = hoi("tôi không còn dị ứng nữa", st)
        self.assertIn("bỏ điều kiện", reply.text.lower())
        self.assertIn("hải sản", reply.text.lower())

    def test_CHIEU_NGUOC_khong_noi_gi_thi_KHONG_duoc_bo(self):
        """Chốt an toàn: dị nguyên chỉ được bỏ khi khách nói RÕ, không suy diễn."""
        _, _, st = hoi("tôi bị dị ứng hải sản")
        for cau in ("gợi ý món cho tôi", "món khác đi", "còn gì nữa không", "cảm ơn bạn"):
            with self.subTest(cau):
                merged, _, st2 = hoi(cau, st)
                self.assertEqual(merged.da_bo_rang_buoc, [])
                self.assertIn("allergen:seafood", st2.avoid_tags)

    def test_cau_HOI_ve_di_ung_khong_thanh_loi_khai(self):
        """Bất biến cũ phải còn nguyên. Bản sửa đầu của tôi làm mất nó — 4 lượt kịch bản đỏ."""
        _, _, st = hoi("Ốc hương rang bơ tỏi có hải sản không?")
        self.assertEqual(st.avoid_tags, [])


class CumYDinhPhaiAnCHU(unittest.TestCase):
    """Cụm ý định phải ĂN đoạn đã khớp, như mọi cụm từ vựng khác.

    "bỏ hết điều kiện đi" rút dấu thành `bo het dieu kien di`, và `bo` là nhãn `ingredient:beef`
    ("bò"). Không ăn chữ thì khách xin BỎ ràng buộc lại nhận thêm ràng buộc **thịt bò** — vụ đụng
    chữ thứ chín, xuất hiện ngay trong cơ chế vừa dựng để sửa một vụ khác.
    """

    def test_bo_dieu_kien_khong_thanh_thit_bo(self):
        merged, _, _ = hoi("bỏ hết điều kiện đi")
        self.assertNotIn("ingredient:beef", merged.require_tags)
        self.assertNotIn("ingredient:beef", merged.prefer_tags)

    def test_CHIEU_NGUOC_mon_bo_van_la_thit_bo(self):
        merged, _, _ = hoi("gợi ý món bò cho tôi")
        self.assertIn("ingredient:beef", merged.require_tags + merged.prefer_tags)

    def test_an_chu_KHONG_duoc_lam_mat_rang_buoc_cua_khach(self):
        """Ăn chữ không được phá một cụm từ vựng NẰM NGOÀI đoạn bị ăn.

        Đây là lỗi đã xảy ra ngay trong lần dựng đầu: cụm ý định `them mon` khớp trong "cho mình
        **thêm món** chay" và ăn mất chữ "món" mà `mon chay` cần — khách xin món chay bị loại đúng
        những món chay.

        Bản đầu của test này là một BẢNG KIỂM KÊ tĩnh: mọi cặp cụm chồng chữ. Nó cho 200+ cặp mà chỉ
        một cặp có thật ("chao ban chay nhat" không phải câu tiếng Việt nào cả), và một thước đo báo
        động 200 lần cho một lỗi thật thì sẽ bị tắt. Nên phép kiểm đổi sang HẬU QUẢ: chạy câu thật,
        hỏi ràng buộc còn không.

        `understand` cũng đổi theo: nó chỉ ăn khi việc ăn không phá cụm nằm ngoài đoạn bị ăn — tức
        cơ chế tự phân biệt được, không cần ai bảo trì một danh sách ngoại lệ.
        """
        # Ăn được, vì cụm bị mất (`bo` = thịt bò) NẰM TRONG chính cụm ý định.
        merged, _, _ = hoi("bỏ hết điều kiện đi")
        self.assertEqual(merged.y_dinh, XOA_RANG_BUOC)
        self.assertNotIn("ingredient:beef", merged.require_tags + merged.prefer_tags)

        # KHÔNG được ăn, vì `mon chay` nằm ngoài `them mon`. Nhưng Ý ĐỊNH vẫn phải GIỮ: bỏ nó là
        # mất hẳn cơ chế xin-thêm, và "cho mình thêm món chay nữa" lại trả về danh sách cũ.
        for cau, nhan in (
            ("cho mình thêm món chay", "cat_vegetarian"),
            ("cho mình thêm món lẩu", "cat_hotpot"),
        ):
            with self.subTest(cau):
                m, _, _ = hoi(cau)
                self.assertIn(nhan, m.categories, "ăn chữ đã làm mất ràng buộc của khách")
                self.assertEqual(m.y_dinh, XIN_THEM, "không ăn được thì vẫn phải giữ ý định")

    def test_khong_cum_y_dinh_nao_nam_trong_ten_mon(self):
        """Kiểm kê, không chờ lỗi xảy ra — cùng khuôn với `collision_census`."""
        from intent import _CAM_ON, _CHAO, _TAN_GAU, _XIN_THEM, _XOA_DI_NGUYEN, _XOA_TAT_CA

        ten_mon = [fold(i["name"]) for i in ITEMS]
        xau = []
        for nhom in (_CHAO, _CAM_ON, _XIN_THEM, _XOA_DI_NGUYEN, _XOA_TAT_CA, _TAN_GAU):
            for cum in nhom:
                trung = [n for n in ten_mon if f" {cum} " in f" {n} "]
                if trung:
                    xau.append(f"{cum!r} nằm trong {trung}")
        self.assertFalse(xau, "cụm ý định trùng tên món:\n  " + "\n  ".join(xau))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()


class HoiAnDuocGiKHONGphaiKhaiHetDiUng(unittest.TestCase):
    """Câu HỎI "ăn được gì" bị đọc thành câu KHẲNG ĐỊNH "tôi ăn được" và xóa dị nguyên.

    Đo trên mã trước bản sửa, ba lượt liên tiếp:

        lượt 1  "Con mình dị ứng hải sản"      ->  avoid = [allergen:seafood]     đúng
        lượt 2  "Bé nhà mình ăn được món gì?"  ->  avoid = []                     XÓA MẤT
        lượt 3  "Cho mình món khai vị"         ->  Gỏi cuốn tôm thịt, Súp măng cua,
                                                   Nem rán Hà Nội, Bánh xèo miền Tây

    Bốn món hải sản mời cho phụ huynh vừa khai con dị ứng hải sản. Cụm `minh an duoc` khớp đoạn
    "bé nhà **mình ăn được** món gì" — cùng chuỗi chữ với câu khai hết dị ứng, nghĩa ngược nhau.

    Lỗi im lặng ở chỗ **lượt 2 không mời món nào**, nên không có dấu hiệu gì; chỉ lượt 3 mới lộ.
    Đó là lý do chốt an toàn nằm ở bộ đa lượt, và ca ở đây chỉ chốt phần ý định.
    """

    def test_cau_HOI_khong_xoa_di_nguyen(self):
        for cau in ("Bé nhà mình ăn được món gì?",
                    "Con mình ăn được những món nào?",
                    "Mình ăn được gì ở đây?",
                    "Bé ăn được bao nhiêu món?"):
            with self.subTest(cau=cau):
                y = doc_y_dinh_tat_dinh(cau)
                self.assertNotEqual(y.ten, XOA_RANG_BUOC, "câu HỎI không được xóa ràng buộc")

    def test_cau_KHANG_DINH_van_xoa_duoc(self):
        """Chiều ngược — chiều mà hàng rào quá rộng sẽ phá.

        Khách thật sự hết kiêng thì phải gỡ được, nếu không họ mắc kẹt: giao của "phải là hải sản"
        và "không được là hải sản" ra rỗng và không có đường nào thoát.
        """
        for cau in ("tôi ăn được hải sản hãy tư vấn hải sản cho tôi",
                    "Mình hết dị ứng rồi",
                    "mình ăn được bình thường",
                    "giờ ăn được rồi"):
            with self.subTest(cau=cau):
                self.assertEqual(doc_y_dinh_tat_dinh(cau).ten, XOA_RANG_BUOC)
