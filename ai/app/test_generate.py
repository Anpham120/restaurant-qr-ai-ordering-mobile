# -*- coding: utf-8 -*-
"""Test lớp XÁC MINH của đường sinh — chỗ bảo đảm "không bịa" nay nằm.

Vì sao những test này quan trọng hơn test thường
------------------------------------------------
Khi mô hình không viết chữ cho khách, "không bịa món, không bịa giá" là bảo đảm CẤU TRÚC — không có
đường cho lỗi đó tồn tại. Cho mô hình viết thì bảo đảm chuyển sang lớp `verify()`, và lúc đó **những
test này LÀ bảo đảm**. Một lỗ ở đây là một lỗ trong điều dự án hứa với khách.

Dùng mô hình GIẢ, không gọi mạng — cùng cách `test_llm_understand.py` làm, và vì cùng lý do: phép
kiểm về an toàn phải tất định.

    python -m unittest discover -s ai/app -p "test_*.py"
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate import _mo_ta_mon, BRANCHES_ALLOWED, verify, write_reply  # noqa: E402
from understand import understand  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
ITEMS = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]
BY_NAME = {i["name"]: i for i in ITEMS}
PHO = BY_NAME["Phở bò tái nạm"]          # 75.000đ, không ghi nhận dị nguyên
GA = BY_NAME["Phở gà ta"]                # 70.000đ, không ghi nhận dị nguyên
TOM = BY_NAME["Tôm hùm nướng mỡ hành"]   # 890.000đ, ghi nhận hải sản
ENV = {"LLM_BASE_URL": "http://x/v1", "LLM_API_KEY": "k", "LLM_MODEL": "m"}


def gia_lap(text: str, used: list[str] | None = None):
    """Mô hình giả trả về đúng những gì test muốn kiểm."""
    def call(_prompt, _env):
        return {"text": text, "used_item_ids": used if used is not None else []}
    return call


class TamPhepKiemXacMinh(unittest.TestCase):
    """Mỗi phép kiểm một test phá đúng nó, và một test chiều đúng. Phép kiểm thứ 8 có lớp riêng."""

    def test_cau_sinh_dung_thi_khong_vi_pham(self):
        text = ("Mình gợi ý Phở bò tái nạm (75.000đ) và Phở gà ta (70.000đ) — cả hai đều không cay "
                "và trong tầm giá bạn nêu.")
        self.assertEqual(verify(text, [PHO["id"], GA["id"]], [PHO, GA], ITEMS, []), [])

    def test_khai_dung_mon_NGOAI_danh_sach(self):
        loi = verify("Phở bò tái nạm (75.000đ) rất phù hợp.", [PHO["id"], TOM["id"]],
                     [PHO], ITEMS, [])
        self.assertTrue(any("ngoài danh sách" in x for x in loi), loi)

    def test_nhac_mon_that_NHUNG_ngoai_danh_sach_da_loc(self):
        """Kiểu sai nguy hiểm nhất mà so chuỗi bắt được.

        Mô hình lôi một món THẬT khác vào — đúng tên, đúng giá, nên hai phép kiểm về mã món và về
        số tiền đều không bắt. Nhưng món đó **không qua bộ lọc**, nên nó có thể mang nhãn khách cần
        tránh. Đây là lý do phép kiểm số 2 tồn tại.
        """
        text = "Phở bò tái nạm (75.000đ) hoặc Tôm hùm nướng mỡ hành (890.000đ) đều ngon."
        loi = verify(text, [PHO["id"]], [PHO], ITEMS, [])
        self.assertTrue(any("ngoài danh sách đã lọc" in x for x in loi), loi)

    def test_bia_gia(self):
        loi = verify("Phở bò tái nạm chỉ 49.000đ thôi ạ.", [PHO["id"]], [PHO], ITEMS, [])
        self.assertTrue(any("không phải giá" in x for x in loi), loi)

    def test_gia_dung_cua_mon_KHAC_trong_danh_sach_thi_khong_vi_pham(self):
        """Chiều chống chặt quá: 70.000đ là giá của Phở gà ta, và Phở gà ta có trong danh sách."""
        # Nêu ĐỦ hai món (phép kiểm 6 đòi vậy) để test này cô lập đúng phép kiểm về GIÁ.
        text = f"{PHO['name']} và {GA['name']} nằm trong tầm 70.000đ đến 75.000đ ạ."
        self.assertEqual(verify(text, [], [PHO, GA], ITEMS, []), [])

    def test_nhac_mon_mang_nhan_khach_can_tranh_la_loi_AN_TOAN(self):
        """Chốt an toàn, và nó LẶP LẠI điều bộ lọc đã làm — lặp có chủ ý.

        Bộ lọc chọn món; phép này kiểm CHỮ. Hai thứ đó lệch nhau được, và chỗ lệch là chỗ khách dị
        ứng đọc thấy tên một món họ không ăn được.
        """
        text = "Bạn thử Tôm hùm nướng mỡ hành (890.000đ) nhé."
        loi = verify(text, [], [TOM], ITEMS, ["allergen:seafood"])
        self.assertTrue(any(x.startswith("AN TOÀN") for x in loi), loi)

    def test_in_ma_nhan_ky_thuat_vao_cau_khach_doc(self):
        """Rò rỉ biểu diễn nội bộ — cùng loại với rò rỉ chỉ dẫn, chỉ nhẹ hơn.

        Đo được ở golden 103 lượt chạy qua mô hình thật: "Thực đơn không ghi nhận allergen:peanut ở
        món này, nhưng có ghi nhận allergen:gluten." Khách không biết `allergen:peanut` là gì.

        Nguyên nhân là prompt đưa nhãn dạng KHÓA để mô hình biết thuộc tính món, và mô hình dùng lại
        đúng chuỗi đó. Sửa hai đầu: prompt cấm, và phép kiểm này chặn nếu vẫn có.
        """
        loi = verify(f"{PHO['name']} (75.000đ) — thực đơn không ghi nhận allergen:peanut.",
                     [PHO["id"]], [PHO], ITEMS, [])
        self.assertTrue(any("mã nhãn kỹ thuật" in x for x in loi), loi)

    def test_noi_bang_tieng_Viet_thuong_thi_khong_vi_pham(self):
        """Chiều đúng: cùng nội dung, viết bằng tiếng Việt thường."""
        self.assertEqual(
            verify(f"{PHO['name']} (75.000đ) — thực đơn không ghi nhận đậu phộng.",
                   [PHO["id"]], [PHO], ITEMS, []),
            [],
        )

    def test_bo_sot_mon_trong_danh_sach(self):
        """Phép kiểm 6 — và nó sửa đúng vấn đề "trả lời một kiểu, thẻ giỏ một kiểu".

        Đo được: golden 103 lượt với đường sinh cho 84/103, và gần hết phần đỏ còn lại là văn xuôi
        nêu 2–3 món trong khi bộ lọc chọn 6. Hai hậu quả, cả hai đều xấu với khách:

          thiếu lựa chọn  khách chỉ thấy 2 món thay vì 6
          lệch thẻ giỏ    thẻ giỏ dựng từ 6 món, nên nó chỉ khớp văn xuôi sau khi BỎ BỚT 4 thẻ

        Đòi nhắc đủ giải cả hai: thẻ giỏ khớp mà không phải bỏ món nào, và khách thấy đủ lựa chọn.
        """
        loi = verify(f"Mình gợi ý {PHO['name']} (75.000đ) ạ.", [PHO["id"]], [PHO, GA], ITEMS, [])
        self.assertTrue(any("KHÔNG nhắc đủ món" in x for x in loi), loi)
        self.assertIn(GA["name"], str(loi))

    def test_nhac_du_mon_thi_khong_vi_pham(self):
        text = f"Mình gợi ý {PHO['name']} (75.000đ) và {GA['name']} (70.000đ) ạ."
        self.assertEqual(verify(text, [PHO["id"], GA["id"]], [PHO, GA], ITEMS, []), [])

    def test_so_nho_khong_phai_tien_thi_bo_qua(self):
        """"đi 2 người" không phải số tiền. Bắt oan ở đây làm mọi câu sinh bị bỏ."""
        text = f"{PHO['name']} và {GA['name']} — hai món này đủ cho 2 người ạ."
        self.assertEqual(verify(text, [], [PHO, GA], ITEMS, []), [])


class ChiSinhChoLoaiC(unittest.TestCase):
    """Đề bài cấm sinh ở loại A. Danh sách nhánh được phép là chỗ điều đó được thực thi."""

    def test_danh_sach_nhanh_dung_hai_nhanh(self):
        self.assertEqual(BRANCHES_ALLOWED, {"filter", "compare"})

    def test_nhanh_ngoai_danh_sach_KHONG_goi_mo_hinh(self):
        r = understand("Phở bò tái nạm bao nhiêu tiền?", ITEMS)
        for nhanh in ("price_lookup", "item_detail", "off_topic", "clarify", "no_data",
                      "knowledge:portion_timing"):
            ra = write_reply(r, [PHO], ITEMS, nhanh, ENV, call=gia_lap("gì cũng được"))
            self.assertFalse(ra.called, f"nhánh {nhanh} đã gọi mô hình")
            self.assertIsNone(ra.text)

    def test_khong_co_mon_thi_khong_goi(self):
        r = understand("Gợi ý món ăn", ITEMS)
        ra = write_reply(r, [], ITEMS, "filter", ENV, call=gia_lap("x"))
        self.assertFalse(ra.called)


class ViPhamThiBO_KHONG_SUA(unittest.TestCase):
    """Câu sinh vi phạm thì bị BỎ và hệ thống dùng lại câu khuôn mẫu."""

    def test_vi_pham_thi_text_la_None_va_co_ly_do(self):
        r = understand("Gợi ý món ăn dưới 100.000đ", ITEMS)
        ra = write_reply(r, [PHO], ITEMS, "filter", ENV,
                         call=gia_lap("Phở bò tái nạm chỉ 49.000đ ạ.", [PHO["id"]]))
        self.assertIsNone(ra.text)
        self.assertTrue(ra.called)
        self.assertEqual(ra.reason, "không qua xác minh")
        self.assertTrue(ra.violations)

    def test_cau_sinh_dung_thi_duoc_dung(self):
        r = understand("Gợi ý món ăn dưới 100.000đ", ITEMS)
        cau = "Phở bò tái nạm (75.000đ) không cay và trong tầm giá bạn nêu ạ."
        ra = write_reply(r, [PHO], ITEMS, "filter", ENV, call=gia_lap(cau, [PHO["id"]]))
        self.assertEqual(ra.text, cau)
        self.assertEqual(ra.used, [PHO["id"]])

    def test_mo_hinh_tra_ve_None_thi_lui_ve_khuon(self):
        r = understand("Gợi ý món ăn", ITEMS)
        ra = write_reply(r, [PHO], ITEMS, "filter", ENV, call=lambda p, e: None)
        self.assertIsNone(ra.text)
        self.assertTrue(ra.called)

    def test_text_rong_hoac_sai_kieu_thi_lui_ve_khuon(self):
        r = understand("Gợi ý món ăn", ITEMS)
        for xau in ({"text": "", "used_item_ids": []}, {"text": 5, "used_item_ids": []},
                    {"used_item_ids": []}, {"text": "ok", "used_item_ids": "m_008"}):
            ra = write_reply(r, [PHO], ITEMS, "filter", ENV, call=lambda p, e, x=xau: x)
            self.assertIsNone(ra.text, xau)

    def test_KHONG_thu_lai_sau_khi_vi_pham(self):
        """Thử lại là để một câu sai có cơ hội thứ hai trong lúc khách đang chờ.

        Đếm số lần gọi: đúng một lần, bất kể kết quả.
        """
        dem = {"n": 0}

        def call(_p, _e):
            dem["n"] += 1
            return {"text": "Phở bò tái nạm 1.000đ", "used_item_ids": [PHO["id"]]}

        r = understand("Gợi ý món ăn", ITEMS)
        write_reply(r, [PHO], ITEMS, "filter", ENV, call=call)
        self.assertEqual(dem["n"], 1)


class LyDoKHONG_VAO_CAU_KHACH_DOC(unittest.TestCase):
    def test_ly_do_va_vi_pham_khong_nam_trong_text(self):
        """Chi tiết lỗi là của người vận hành, không phải của khách — cùng nguyên tắc `decision.error`."""
        r = understand("Gợi ý món ăn", ITEMS)
        ra = write_reply(r, [PHO], ITEMS, "filter", ENV,
                         call=gia_lap("Phở bò tái nạm 1.000đ", [PHO["id"]]))
        self.assertIsNone(ra.text)
        self.assertNotIn("xác minh", ra.text or "")


class PhepKiemThu8_MoDuongHoiNhanVien(unittest.TestCase):
    """Khách nêu điều cần tránh -> câu trả lời PHẢI mời hỏi nhân viên. CHỐT AN TOÀN.

    Phép kiểm này ra đời từ một con số: 76 ca loại C với mô hình thật cho đường tất định 76/76 và
    đường sinh **61/76** — và **14 trong 15 ca tụt là ca dị nguyên**, tụt vì đúng một lý do: câu sinh
    bỏ câu "bạn nhắc nhân viên khi gọi món để bếp xác nhận".

    Thước đo đánh dấu tiêu chí đó `safety=True`, nên với đường sinh thì "0 lỗi an toàn" của đường tất
    định thành 14 LỖI AN TOÀN.

    Câu đó là NỘI DUNG, không phải văn vẻ: nhãn dị nguyên phủ 44/91 món, nên "thực đơn không ghi nhận
    thành phần bạn cần tránh" KHÔNG đồng nghĩa "món này an toàn". Câu mời hỏi nhân viên là chỗ duy
    nhất trong câu trả lời nói ra giới hạn đó.
    """

    def test_co_dieu_can_tranh_ma_khong_moi_hoi_nhan_vien(self):
        text = f"Mình gợi ý {PHO['name']} (75.000đ), thực đơn không ghi nhận hải sản ở món này."
        loi = verify(text, [PHO["id"]], [PHO], ITEMS, ["allergen:seafood"])
        self.assertTrue(any("KHÔNG mở đường hỏi nhân viên" in x for x in loi), loi)

    def test_co_moi_hoi_nhan_vien_thi_khong_vi_pham(self):
        text = (f"Mình gợi ý {PHO['name']} (75.000đ), thực đơn không ghi nhận hải sản ở món này. "
                "Bạn nhắc nhân viên khi gọi món để bếp xác nhận lại giúp nhé.")
        self.assertEqual(verify(text, [PHO["id"]], [PHO], ITEMS, ["allergen:seafood"]), [])

    def test_KHONG_co_dieu_can_tranh_thi_KHONG_doi_cau_do(self):
        """Chiều ngược, và nó bắt buộc: đòi câu mời hỏi nhân viên ở MỌI câu trả lời là thêm một câu
        vô nghĩa vào câu "cho mình món chay" — và một câu trả lời đầy cảnh báo không cần thiết thì
        khách bỏ qua cả những cảnh báo cần thiết."""
        text = f"Mình gợi ý {PHO['name']} (75.000đ) ạ."
        self.assertEqual(verify(text, [PHO["id"]], [PHO], ITEMS, []), [])

    def test_cum_nao_cung_duoc_chap_nhan(self):
        for cum in ("nhân viên", "phục vụ", "bếp xác nhận", "hỏi lại bếp"):
            with self.subTest(cum):
                text = f"Mình gợi ý {PHO['name']} (75.000đ). Bạn {cum} giúp nhé."
                loi = verify(text, [PHO["id"]], [PHO], ITEMS, ["allergen:seafood"])
                self.assertEqual(loi, [], f"cụm {cum!r} phải được nhận")

    def test_danh_sach_cum_TRUNG_thuoc_do(self):
        """Hai danh sách phải TRÙNG, và sự trùng đó được ÉP chứ không được nhớ.

        `generate.STAFF_PHRASES` quyết định câu sinh có bị BỎ hay không; `answer_metric.STAFF_PHRASES`
        quyết định ca có ĐỎ hay không. Lệch nhau thì có câu sinh qua được phép kiểm rồi bị thước đo
        chấm đỏ — hệ thống tự tin vào một điều thước đo không đồng ý.

        Không import chéo `ai/app` <- `ai/evaluation`: mã lúc chạy không được phụ thuộc bộ đo, vì bộ
        đo không có mặt trong ảnh Docker. Nên hai chỗ khai riêng và test này đối chiếu.
        """
        import sys as _sys

        _sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evaluation"))
        from answer_metric import STAFF_PHRASES as CUA_THUOC_DO

        from generate import STAFF_PHRASES as CUA_MA_CHAY

        self.assertEqual(
            sorted(CUA_MA_CHAY), sorted(CUA_THUOC_DO),
            "hai danh sách cụm mở đường hỏi nhân viên đã lệch nhau",
        )


class GioiHanDaBiet(unittest.TestCase):
    def test_ten_mon_HOAN_TOAN_bia_thi_lop_nay_KHONG_bat_duoc(self):
        """Giới hạn đã biết, chốt lại để không ai tưởng lớp này bắt được mọi thứ.

        Phép so chuỗi với thực đơn bắt được: món thật ngoài danh sách, giá không có thật, món mang
        nhãn cần tránh. Nó KHÔNG bắt được một cái tên không tồn tại dưới bất kỳ dạng nào.

        Giảm nhẹ: `reply.items` và thẻ giỏ vẫn tất định, nên món bịa không đặt được. Test này đỏ khi
        có ai làm lớp này mạnh hơn — và đó là tin tốt, cập nhật test.
        """
        text = (f"Mình gợi ý {PHO['name']} (75.000đ), hoặc Bò sốt tiêu đen Hoàng Gia "
                f"(75.000đ) ạ.")
        self.assertEqual(verify(text, [PHO["id"]], [PHO], ITEMS, []), [])


if __name__ == "__main__":
    unittest.main()


class NhanChiDangNoiKhiPhanBietDuoc(unittest.TestCase):
    """"Không cay" về một ly nước ép không phân biệt được gì — đừng đưa mô hình.

    `spice` phủ 91/91 món, và **5 danh mục có toàn bộ 7/7 món là `spice:none`**: Cà phê & Trà,
    Nước ép & Sinh tố, Tráng miệng, Trái cây tươi, Bia & Rượu. Nên mô hình được đưa "không cay" cho
    nước ép, và nó nói đúng thứ được đưa:

        "Nước mía Sài Gòn giá 25.000đ, không cay"
        "Bánh flan caramel 30.000đ, có sữa và trứng, không cay"

    Câu không sai, nhưng vô nghĩa — không ly nước ép nào cay. Một câu tư vấn nói toàn điều hiển
    nhiên thì đọc như máy.

    Phân biệt là chuyện của DANH SÁCH đang trả lời, không phải của danh mục: nước ép nêu cạnh Bún bò
    Huế thì "không cay" lại có nghĩa. Bốn test dưới giữ cả bốn hướng của ranh giới đó.
    """

    def _ten(self, ten: str) -> dict:
        for i in ITEMS:
            if i["name"] == ten:
                return i
        raise AssertionError(f"thực đơn không có {ten!r}")

    def test_ca_danh_sach_deu_khong_cay_thi_BO(self):
        mo_ta = _mo_ta_mon([self._ten("Nước mía Sài Gòn"), self._ten("Bánh flan caramel"),
                            self._ten("Dưa hấu lạnh")])
        self.assertNotIn("Không cay", mo_ta,
                         "mọi món đều không cay thì nhãn đó không phân biệt được gì")
        self.assertIn("Có sữa", mo_ta, "nhãn PHÂN BIỆT được thì phải giữ")

    def test_tron_loai_thi_GIU_vi_no_phan_biet(self):
        mo_ta = _mo_ta_mon([self._ten("Nước mía Sài Gòn"), self._ten("Bún bò Huế")])
        self.assertIn("Không cay", mo_ta)
        self.assertIn("Cay đậm", mo_ta)

    def test_nhan_KHACH_DA_HOI_khong_bao_gio_bi_loc(self):
        """Khách xin món không cay thì câu trả lời phải nói được "không cay như bạn cần"."""
        mo_ta = _mo_ta_mon([self._ten("Phở gà ta"), self._ten("Bánh cuốn Thanh Trì")],
                           frozenset({"spice"}))
        self.assertIn("Không cay", mo_ta,
                      "im lặng ở đúng chỗ khách vừa hỏi là bỏ mất lý do của câu")

    def test_MOT_mon_thi_mo_ta_day_du(self):
        """Danh sách một món thì không có gì để so — lọc là làm mô tả rỗng."""
        mo_ta = _mo_ta_mon([self._ten("Trà đào cam sả")])
        self.assertIn("Không cay", mo_ta)
