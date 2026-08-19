# -*- coding: utf-8 -*-
"""Test cho tầng gọi mô hình — chủ yếu là các bất biến an toàn.

Mô hình sinh là thành phần duy nhất trong hệ thống mà ta **không kiểm soát đầu ra**. Nên
mọi test ở đây trả lời cùng một câu: *nếu mô hình trả về thứ tệ nhất có thể, hệ thống có
còn an toàn không?*

Không test nào ở đây gọi mô hình thật — chúng thay `call_model` bằng hàm trả về đúng thứ
cần thử. Gọi thật thì test phụ thuộc mạng và không tất định.

    python -m unittest discover -s ai/app -p "test_*.py"
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import llm_understand as llm
from understand import understand

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)
ITEMS = MENU["items"]
ENV = {"LLM_MODEL": "test", "LLM_BASE_URL": "http://test", "LLM_API_KEY": "test"}

# Câu mà mã tất định KHÔNG hiểu, nên mô hình phải được gọi. Nhiều test dưới đây cần một câu
# như vậy, và câu đó **hết hạn khi từ vựng lớn lên**: bản trước dùng "cho mình gì đó chua chua",
# rồi cụm "chua chua" được thêm vào từ vựng và hai test đỏ — không phải vì hệ thống sai mà vì
# ví dụ của test đã cũ. Đặt tên một chỗ để lần sau chỉ phải sửa một chỗ, và
# `test_cau_mo_ho_van_con_mo_ho` bên dưới chốt rằng nó vẫn còn mơ hồ thật.
CAU_MO_HO = "Cho mình gì đó lạ lạ"


class FakeModel:
    """Thay `call_model` bằng một đáp án cố định."""

    def __init__(self, payload):
        self.payload = payload
        self.calls = 0
        self._original = None

    def __enter__(self):
        self._original = llm.call_model

        def fake(question, env, *, use_cache=True):
            self.calls += 1
            return self.payload

        llm.call_model = fake
        return self

    def __exit__(self, *exc):
        llm.call_model = self._original
        return False


def ask(question: str):
    return understand(question, ITEMS)


class MoHinhKhongDuocXoaRangBuoc(unittest.TestCase):
    """Bất biến quan trọng nhất của tệp llm_understand."""

    def test_mo_hinh_tra_ve_rong_khong_xoa_duoc_di_ung(self):
        request = ask("Mình dị ứng hải sản, gợi ý món ăn giúp mình")
        self.assertIn("allergen:seafood", request.avoid_tags)
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "any"}):
            llm.enrich(request, ENV, use_cache=False)
        self.assertIn("allergen:seafood", request.avoid_tags)

    def test_mo_hinh_khong_xoa_duoc_rang_buoc_do_cay(self):
        request = ask("Có món nào không cay không?")
        self.assertIn("spice:none", request.require_tags)
        with FakeModel({"require": ["spice:hot"], "prefer": [], "avoid": [], "wants": "any"}):
            llm.enrich(request, ENV, use_cache=False)
        # Ràng buộc cũ còn nguyên. Mô hình không được gọi ở ca này nên `spice:hot` cũng
        # không vào — nhưng điều phải chốt là ràng buộc cũ không mất.
        self.assertIn("spice:none", request.require_tags)

    def test_mo_hinh_khong_doi_duoc_mon_an_thanh_do_uong(self):
        request = ask("Tư vấn cho mình vài món ăn đi")
        self.assertEqual(request.wants, "food")
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "drink"}):
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(request.wants, "food")


class MoHinhKhongDuocBia(unittest.TestCase):
    def test_khoa_nhan_khong_ton_tai_bi_bo(self):
        request = ask("Cho mình gì đó lạ lạ")
        with FakeModel({
            "require": ["flavour:umami", "spice:extreme"],
            "prefer": ["mau:xanh"],
            "avoid": ["allergen:kimchi"],
            "wants": "any",
        }) as fake:
            outcome = llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 1)
        self.assertEqual(request.require_tags, [])
        self.assertEqual(request.prefer_tags, [])
        self.assertEqual(request.avoid_tags, [])
        self.assertEqual(len(outcome.dropped), 4)

    def test_chi_nhom_allergen_duoc_vao_avoid(self):
        # Mô hình đặt một nhãn thật nhưng không phải dị nguyên vào "avoid". Nếu tin thì
        # hệ thống sẽ loại món vì lý do sai.
        request = ask("Cho mình gì đó lạ lạ")
        with FakeModel({
            "require": [], "prefer": [],
            "avoid": ["spice:hot", "allergen:egg"],
            "wants": "any",
        }):
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(request.avoid_tags, ["allergen:egg"])

    def test_kieu_du_lieu_sai_khong_lam_vo(self):
        request = ask("Cho mình gì đó lạ lạ")
        with FakeModel({"require": "spice:none", "prefer": None, "avoid": 42}):
            outcome = llm.enrich(request, ENV, use_cache=False)
        self.assertTrue(outcome.used)
        self.assertEqual(request.require_tags, [])

    def test_thieu_cau_hinh_thi_khong_sap(self):
        """Đây là lỗi CI tìm ra, và nó chứng minh một khẳng định của tôi là sai.

        `ai/.env` chứa khóa nên bị gitignore, tức **CI không bao giờ có cấu hình mô hình**.
        Bản đầu không kiểm điều đó, và `urllib.request.Request(...)` lại nằm ngoài khối try,
        nên URL rỗng thành "/chat/completions" và ném `ValueError: unknown url type` — làm
        sập cả bước CI thay vì suy giảm êm về câu trả lời tất định.

        Ba cấu hình thiếu, ba lần phải trả về None chứ không ném.
        """
        for label, env in [
            ("không có gì", {}),
            ("thiếu URL", {"LLM_MODEL": "m", "LLM_API_KEY": "k"}),
            ("thiếu khóa", {"LLM_MODEL": "m", "LLM_BASE_URL": "http://x/v1"}),
            ("thiếu tên mô hình", {"LLM_BASE_URL": "http://x/v1", "LLM_API_KEY": "k"}),
            ("URL chỉ có khoảng trắng", {"LLM_MODEL": "m", "LLM_BASE_URL": "   ", "LLM_API_KEY": "k"}),
        ]:
            with self.subTest(label):
                self.assertIsNone(
                    llm.call_model("Cho mình gì đó chua chua", env, use_cache=False),
                    f"{label}: phải trả về None, không được ném lỗi",
                )

    def test_thieu_cau_hinh_thi_cau_tra_loi_tat_dinh_con_nguyen(self):
        request = ask(CAU_MO_HO)
        outcome = llm.enrich(request, {}, use_cache=False)
        self.assertTrue(outcome.used)
        self.assertFalse(outcome.ok)
        self.assertEqual(request.require_tags, [])
        self.assertEqual(request.prefer_tags, [])

    def test_goi_that_bai_thi_giu_nguyen_cau_tra_loi_tat_dinh(self):
        request = ask("Cho mình gì đó lạ lạ")
        with FakeModel(None):
            outcome = llm.enrich(request, ENV, use_cache=False)
        self.assertTrue(outcome.used)
        self.assertFalse(outcome.ok)
        self.assertEqual(request.require_tags, [])
        self.assertIn("thất bại", outcome.reason)


class WantsMoHinhDOANKhongThayLoiKHACHNOI(unittest.TestCase):
    """`wants` do mô hình đoán không được một mình tắt câu hỏi lại.

    Vì sao cần phân biệt: hai câu dưới đây cho ra `Request` GIỐNG HỆT sau khi qua mô hình, nhưng
    đáng được trả lời khác nhau —

        "Tư vấn cho mình vài món ăn đi"   khách NÓI "món ăn"  -> gợi ý là đúng
        "Cho mình 2 món"                  khách chỉ nêu SỐ    -> hỏi lại là đúng

    `wants` một mình là ràng buộc yếu (thu 56/91 món ăn hoặc 21/91 đồ uống) nhưng nó ĐỦ để
    `answer.py` thôi hỏi lại. Nên một `wants` mô hình đoán biến câu hoàn toàn mơ hồ thành 6 món
    tùy ý — trả lời tự tin bằng phỏng đoán tệ hơn nói không biết.

    Đây là ca DUY NHẤT mô hình làm TỤT trong 122 ca, và nó chỉ lộ khi thước đo bắt đầu chấm thẻ giỏ.
    """

    def test_mo_hinh_dat_wants_thi_co_CO_duoc_bat(self):
        request = ask(CAU_MO_HO)
        self.assertFalse(request.wants_from_model, "tiền đề: chưa gọi mô hình thì cờ phải False")
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "food"}):
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(request.wants, "food")
        self.assertTrue(request.wants_from_model, "wants do mô hình đặt thì phải có cờ")

    def test_KHACH_noi_thi_KHONG_co_co(self):
        request = ask("Tư vấn cho mình vài món ăn đi")
        self.assertEqual(request.wants, "food", "tiền đề: khách nói 'món ăn'")
        self.assertFalse(request.wants_from_model, "khách nói thì KHÔNG được đánh cờ mô hình")

    def test_mo_hinh_KHONG_ghi_de_wants_khach_da_noi(self):
        request = ask("Cho mình đồ uống thôi")
        self.assertEqual(request.wants, "drink")
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "food"}):
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(request.wants, "drink", "mô hình không được ghi đè lời khách")
        self.assertFalse(request.wants_from_model)

    def test_cau_hoan_toan_mo_ho_van_HOI_LAI_du_mo_hinh_doan_wants(self):
        """Chốt end-to-end: đây là hành vi thật sự quan trọng, không phải cái cờ."""
        from answer import respond

        request = ask("Cho mình 2 món")
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "food"}):
            llm.enrich(request, ENV, use_cache=False)
        reply = respond(request, ITEMS)
        self.assertEqual(reply.kind, "clarify",
                         "mô hình đoán wants mà câu vẫn mơ hồ -> phải hỏi lại, không liệt kê")
        self.assertEqual(reply.items, [], "hỏi lại thì không nêu món nào")


class ChuyenVaiTheoNhomChuKhongTheoMoHinh(unittest.TestCase):
    """Nhóm nhãn quyết định nhãn đó là bộ lọc cứng hay chỉ để sắp thứ tự."""

    def test_nhom_mem_dat_vao_require_thi_ha_xuong_prefer(self):
        # `flavour` chỉ phủ 72/91 món. Dùng làm bộ lọc cứng sẽ cắt mất món đúng.
        request = ask("Cho mình gì đó lạ lạ")
        with FakeModel({"require": ["flavour:sour"], "prefer": [], "avoid": [], "wants": "any"}):
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(request.require_tags, [])
        self.assertIn("flavour:sour", request.prefer_tags)

    def test_nhom_cung_dat_vao_prefer_thi_nang_len_require(self):
        # `price` phủ 91/91 nên lọc được dứt khoát, và khách nêu giá là nêu ràng buộc.
        request = ask("Cho mình gì đó lạ lạ")
        with FakeModel({"require": [], "prefer": ["price:budget"], "avoid": [], "wants": "any"}):
            llm.enrich(request, ENV, use_cache=False)
        self.assertIn("price:budget", request.require_tags)


class ChiGoiMoHinhKhiCanThiet(unittest.TestCase):
    def test_khong_goi_khi_ma_tat_dinh_da_hieu(self):
        request = ask("Có món nào không cay không?")
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "any"}) as fake:
            outcome = llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 0)
        self.assertFalse(outcome.used)

    def test_khong_goi_cho_cau_hoi_gia_mot_mon(self):
        request = ask("Phở bò tái nạm bao nhiêu tiền?")
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "any"}) as fake:
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 0)

    def test_khong_goi_cho_cau_mon_dat_nhat(self):
        # Đây là ca mô hình đã LÀM TỤT khi điều kiện chặn còn thiếu tín hiệu này.
        request = ask("Món đắt nhất menu là món nào?")
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "any"}) as fake:
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 0)

    def test_cau_mo_ho_van_con_mo_ho(self):
        """`CAU_MO_HO` phải THẬT SỰ mơ hồ, nếu không mọi test dùng nó đều vô nghĩa.

        Test này bắt đúng cái đã xảy ra: thêm từ vựng làm câu ví dụ trở thành hiểu được, và
        các test "khi mô hình không được cấu hình" bỗng đỏ mà thông báo lỗi không nói ra lý do.
        """
        request = ask(CAU_MO_HO)
        with FakeModel(None) as fake:
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(
            fake.calls,
            1,
            f"mã tất định đã hiểu được {CAU_MO_HO!r} (require={request.require_tags}, "
            f"prefer={request.prefer_tags}) — chọn câu mơ hồ MỚI cho CAU_MO_HO",
        )

    def test_goi_khi_cau_mo_ho(self):
        request = ask(CAU_MO_HO)
        with FakeModel({"require": [], "prefer": ["flavour:sour"], "avoid": [], "wants": "any"}) as fake:
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 1)
        self.assertIn("flavour:sour", request.prefer_tags)

    def test_an_toan_khong_phu_thuoc_mo_hinh(self):
        # Câu "không ăn được đồ tanh" từng CHỈ mô hình hiểu được, nghĩa là an toàn của hệ
        # thống phụ thuộc một thành phần không tất định — proxy chết là mất bảo vệ. Nay mã
        # tất định hiểu được, và test này chốt điều đó: không gọi mô hình mà vẫn đủ ràng buộc.
        request = ask("Mình không ăn được đồ tanh, gợi ý món ăn giúp mình")
        self.assertIn("allergen:seafood", request.avoid_tags)
        self.assertTrue(request.asks_allergy)
        self.assertFalse(request.unparsed_restriction)
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "any"}) as fake:
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 0)

    def test_trieu_chung_cung_la_cach_khai_di_ung(self):
        # Khách kể triệu chứng thay vì nói "dị ứng". Mẫu "không <chủ đề>" và danh sách
        # triệu chứng đều nằm ở mã tất định, nên đây cũng không cần mô hình.
        request = ask("Bé nhà mình uống sữa là bị đau bụng, có món nào không sữa không?")
        self.assertIn("allergen:dairy", request.avoid_tags)
        self.assertTrue(request.asks_allergy)

    def test_van_goi_khi_khach_neu_han_che_ma_khong_hieu_han_che_gi(self):
        # Ngoại lệ vì lý do an toàn vẫn cần thiết: có những cách nói mã tất định không
        # hiểu, ví dụ "đồ có vỏ" (giáp xác, nhuyễn thể). Câu này CÓ chữ "món ăn" nên mã
        # hiểu được phần đó, nhưng phần quan trọng nhất thì không.
        request = ask("Mình không ăn được đồ có vỏ, gợi ý món ăn giúp mình")
        self.assertEqual(request.avoid_tags, [])
        self.assertTrue(request.unparsed_restriction)
        with FakeModel({
            "require": [], "prefer": [],
            "avoid": ["allergen:seafood"], "wants": "food",
        }) as fake:
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 1)
        self.assertIn("allergen:seafood", request.avoid_tags)
        self.assertTrue(request.asks_allergy)

    def test_han_che_da_hieu_thi_khong_bao_dong_sai(self):
        # Chiều ngược: "không ăn được cay" ĐÃ được hiểu thành spice:none, nên không phải
        # hạn chế chưa hiểu. Bản đầu báo động sai ở đây và làm tụt một ca đang đúng.
        request = ask("Bốn người, ngân sách 500 nghìn, không ăn được cay")
        self.assertIn("spice:none", request.require_tags)
        self.assertFalse(request.unparsed_restriction)
        with FakeModel({"require": [], "prefer": [], "avoid": [], "wants": "any"}) as fake:
            llm.enrich(request, ENV, use_cache=False)
        self.assertEqual(fake.calls, 0)


class TuVungGuiChoMoHinh(unittest.TestCase):
    def test_moi_khoa_trong_tu_vung_deu_co_nhom(self):
        text, key_group = llm.build_vocabulary()
        self.assertEqual(len(key_group), 85)
        for key, group in key_group.items():
            self.assertIn(":", key)
            self.assertTrue(group)

    def test_moi_nhom_thuoc_dung_mot_vai(self):
        # Nhóm không thuộc vai nào thì nhãn của nó sẽ bị bỏ im lặng — phải bắt được.
        _text, key_group = llm.build_vocabulary()
        roles = set(llm.HARD_GROUPS) | set(llm.SOFT_GROUPS) | {"allergen", "meal"}
        for group in sorted(set(key_group.values())):
            self.assertIn(group, roles, f"nhóm {group} không được gán vai nào")


if __name__ == "__main__":
    unittest.main(verbosity=2)
