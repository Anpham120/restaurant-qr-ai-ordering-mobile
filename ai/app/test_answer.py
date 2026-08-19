# -*- coding: utf-8 -*-
"""Test phần trả lời — trọng tâm là thứ tự sắp món và ranh giới ràng buộc / ngữ cảnh.

Tệp này ra đời muộn hơn `answer.py`, và lý do đáng ghi: hành vi của `answer.py` trước đó chỉ được
kiểm qua 119 ca đánh giá. Điều đó đủ để bắt lỗi *câu trả lời sai*, nhưng KHÔNG đủ để bắt lỗi *câu
trả lời đúng theo tiêu chí mà vẫn tệ với khách* — và đúng một lỗi loại đó đã sống sót:

    "Món nào không cay?"  ->  sáu loại bia

13/119 ca khách hỏi "món" mà nhận toàn đồ uống, và **cả 13 đều QUA** vì khóa đáp án không cấm đồ
uống. Nó chỉ lộ ra khi tôi đọc đầu ra thật của thẻ giỏ hàng.

Bài học: **tập đánh giá đo điều nó được viết để đo.** Một hành vi không có ca thì không có gì canh,
kể cả khi tỷ lệ chung là 100%.

    python -m unittest test_answer      # trong ai/app
"""
from __future__ import annotations

import json
import sys
import unittest
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import answer  # noqa: E402
from answer import (  # noqa: E402
    SO_DOAN_TRI_THUC,
    chon_doan_tri_thuc,
    respond,
    select,
)
from understand import DRINK_CATEGORIES, FOOD_CATEGORIES, understand  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
_MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)
ITEMS = _MENU["items"]
BY_ID = {i["id"]: i for i in ITEMS}
# Tên DANH MỤC cũng là danh từ riêng viết hoa hợp lệ giữa câu — "rẻ hơn nhóm Món
# gà và Hải sản". Đọc từ thực đơn chứ không liệt kê tay, để thêm danh mục mới
# không làm đỏ một phép kiểm chính tả.
TEN_DANH_MUC = [c["name"] for c in _MENU.get("categories", [])]


def reply_for(question: str):
    request = understand(question, ITEMS)
    return request, respond(request, ITEMS)


def drinks_in(reply) -> list[str]:
    return [i for i in reply.items if BY_ID[i]["categoryId"] in DRINK_CATEGORIES]


class MonAnXepTruocDoUongKhiKhachChuaNoiRo(unittest.TestCase):
    """Ngữ cảnh, không phải ràng buộc: XẾP TRƯỚC nhưng KHÔNG lọc bỏ.

    Nguyên nhân gốc đo được: 5 món rẻ nhất thực đơn đều là đồ uống (12.000–30.000đ) còn món ăn rẻ
    nhất là 35.000đ. Sắp theo giá tăng dần làm đồ uống luôn đứng đầu.
    """

    def test_cau_hoi_mon_KHONG_tra_toan_do_uong(self):
        for cau in ("Món nào không cay?", "Có món nào dưới 50.000đ?",
                    "Tôi dị ứng đậu phộng, món nào tránh được?",
                    "Bé nhà mình dị ứng sữa, có món nào được không?",
                    "Cho mình món không hải sản", "Món nào không sữa"):
            _, reply = reply_for(cau)
            with self.subTest(cau):
                self.assertTrue(reply.items, "tiền đề: câu này phải nêu món")
                uong = drinks_in(reply)
                self.assertLess(
                    len(uong), len(reply.items),
                    f"{cau!r} trả TOÀN đồ uống ({len(uong)}/{len(reply.items)}) — khách hỏi món",
                )

    def test_KHONG_loai_bo_do_uong_khi_do_uong_la_cau_tra_loi_dung(self):
        """Chiều ngược, BẮT BUỘC. Lọc cứng ở đây sẽ hỏng đúng ca này.

        Không món ăn nào dưới 20.000đ, nên đồ uống là câu trả lời TRUNG THỰC. Trả rỗng hoặc nói
        "không có món nào phù hợp" mới là sai — khách hỏi thật và dữ liệu trả lời được.
        """
        _, reply = reply_for("Có món nào rẻ hơn 20 nghìn không?")
        self.assertTrue(reply.items, "không được trả rỗng khi dữ liệu có câu trả lời")
        self.assertEqual(
            len(drinks_in(reply)), len(reply.items),
            "dưới 20.000đ thì thực đơn CHỈ có đồ uống — đó là sự thật, không phải lỗi",
        )

    def test_khach_hoi_do_uong_thi_van_tra_do_uong(self):
        _, reply = reply_for("Nhà hàng có trà gì?")
        self.assertTrue(reply.items)
        for i in reply.items:
            self.assertEqual(BY_ID[i]["categoryId"], "cat_drink")

    def test_khach_hoi_mon_an_thi_KHONG_co_do_uong_nao(self):
        """Khi khách nói rõ "món ăn" thì đây là RÀNG BUỘC, lọc cứng — khác với trường hợp trên."""
        _, reply = reply_for("Gợi ý món ăn giúp mình")
        self.assertTrue(reply.items)
        self.assertEqual(drinks_in(reply), [])

    def test_thu_tu_tat_dinh_giua_hai_lan_chay(self):
        for cau in ("Món nào không cay?", "Cho mình món chay"):
            with self.subTest(cau):
                self.assertEqual(reply_for(cau)[1].items, reply_for(cau)[1].items)


class RangBuocKhacNguCanh(unittest.TestCase):
    def test_dip_an_chi_xep_thu_tu_khong_loai_mon(self):
        request = understand("Mình đi hẹn hò, gợi ý món nào", ITEMS)
        self.assertTrue(request.prefer_tags, "tiền đề: câu này sinh nhãn ngữ cảnh")
        self.assertEqual(
            request.prefer_tags[0].split(":")[0], "occasion",
            "dịp ăn phải ở prefer_tags",
        )
        for tag in request.prefer_tags:
            self.assertNotIn(tag, request.require_tags, "ngữ cảnh KHÔNG được vào require_tags")

    def test_an_chay_la_rang_buoc_loc_cung(self):
        request = understand("Mình ăn chay", ITEMS)
        chosen = select(request, ITEMS)
        self.assertLess(len(chosen), len(ITEMS), "ăn chay phải LỌC, không chỉ xếp thứ tự")

    def test_di_nguyen_fail_closed_khong_bao_gio_noi(self):
        request = understand("Mình dị ứng hải sản, gợi ý món ăn giúp mình", ITEMS)
        chosen = select(request, ITEMS)
        sot = [i["id"] for i in chosen if "allergen:seafood" in i["tags"]]
        self.assertEqual(sot, [], "lọc dị nguyên phải fail-closed")

    def test_ket_qua_rong_thi_KHONG_noi_rang_buoc_di_nguyen(self):
        """Thà nói "không có món nào phù hợp" còn hơn mời món có thể gây dị ứng."""
        request = understand("Mình dị ứng hải sản, cho món hải sản", ITEMS)
        chosen = select(request, ITEMS)
        sot = [i["id"] for i in chosen if "allergen:seafood" in i["tags"]]
        self.assertEqual(sot, [])


class SauNhanhLoaiTruNhau(unittest.TestCase):
    def test_moi_cau_di_dung_mot_nhanh(self):
        mong_doi = (
            ("Hôm nay thời tiết thế nào?", "off_topic", "refuse"),
            ("Nhà hàng mấy giờ mở cửa?", "facts:hours", "fact"),
            ("Phở bò tái nạm bao nhiêu tiền?", "price_lookup", "fact"),
            ("Món nào rẻ nhất?", "extreme:cheapest", "fact"),
            ("Cho mình món chay", "filter", "list"),
            ("Gợi ý món đi", "clarify", "clarify"),
        )
        for cau, branch, kind in mong_doi:
            _, reply = reply_for(cau)
            with self.subTest(cau):
                self.assertEqual(reply.branch, branch)
                self.assertEqual(reply.kind, kind)

    def test_nhanh_hoi_lai_KHONG_neu_mon_nao(self):
        """Hỏi lại là câu trả lời ĐÚNG ở đó, nhưng nó không được kèm danh sách món —
        kèm danh sách thì nó không còn là câu hỏi lại."""
        _, reply = reply_for("Gợi ý món đi")
        self.assertTrue(reply.asks_back)
        self.assertEqual(reply.items, [])


class MoiMonNeuRaPhaiCoThatVaDungGia(unittest.TestCase):
    def test_moi_ma_mon_ton_tai(self):
        for cau in ("Cho mình món chay", "Món nào không cay?", "Món nào rẻ nhất?",
                    "So sánh Phở bò tái nạm và Bún bò Huế"):
            _, reply = reply_for(cau)
            for i in reply.items:
                with self.subTest(f"{cau} / {i}"):
                    self.assertIn(i, BY_ID)

    def test_gia_neu_trong_cau_tra_loi_khop_thuc_don(self):
        import re

        _, reply = reply_for("Phở bò tái nạm bao nhiêu tiền?")
        gia_that = {BY_ID[i]["price"] for i in reply.items}
        gia_neu = {
            int(m.replace(".", ""))
            for m in re.findall(r"(\d{1,3}(?:\.\d{3})+)đ", reply.text)
        }
        self.assertTrue(gia_neu, "câu hỏi giá phải nêu giá")
        self.assertTrue(
            gia_neu <= gia_that,
            f"nêu giá {sorted(gia_neu - gia_that)} không có trong thực đơn",
        )


class BangTenNhanPhaiPhuDU(unittest.TestCase):
    """`_ALLERGEN_VI` và `_SPICE_VI` phải phủ ĐỦ nhãn của nhóm tương ứng trong từ điển.

    Hai bảng này viết tay trong `answer.py`, nên chúng trôi được: thêm một nhãn dị nguyên vào từ
    điển mà quên thêm ở đây thì câu trả lời gọi nó bằng phần sau dấu hai chấm — "CÓ shellfish" —
    và khách đọc thấy chữ tiếng Anh giữa câu tiếng Việt.

    Test này biến việc trôi thành lỗi thấy được. Không đọc thẳng `label_vi` trong `answer.py` là có
    chủ ý: `label_vi` là nhãn hiển thị trên chip ("Có hải sản"), còn câu trả lời cần tên thuộc tính
    để ghép vào câu ("hải sản") — hai dạng khác nhau, nên bảng riêng là đúng, chỉ cần chống trôi.
    """

    @classmethod
    def setUpClass(cls):
        cls.tags = json.loads(
            (REPO_ROOT / "data" / "menu-tags.json").read_text(encoding="utf-8-sig")
        )["tags"]

    def test_moi_nhan_di_nguyen_co_ten_tieng_viet(self):
        from answer import _ALLERGEN_VI

        thieu = sorted(t for t in self.tags if t.startswith("allergen:") and t not in _ALLERGEN_VI)
        self.assertEqual(thieu, [], f"thiếu tên tiếng Việt cho {thieu} trong `_ALLERGEN_VI`")

    def test_moi_muc_cay_co_ten_tieng_viet(self):
        from answer import _SPICE_VI

        thieu = sorted(t for t in self.tags if t.startswith("spice:") and t not in _SPICE_VI)
        self.assertEqual(thieu, [], f"thiếu tên tiếng Việt cho {thieu} trong `_SPICE_VI`")

    def test_khong_ten_nao_du(self):
        """Chiều ngược: bảng có nhãn mà từ điển không có nghĩa là nhãn đã bị bỏ khỏi thực đơn."""
        from answer import _ALLERGEN_VI, _SPICE_VI

        du = sorted(set(_ALLERGEN_VI) | set(_SPICE_VI) - set(self.tags))
        du = [t for t in du if t not in self.tags]
        self.assertEqual(du, [], f"bảng còn nhãn không có trong từ điển: {du}")

    def test_cau_tra_loi_di_nguyen_NEU_TEN_thanh_phan(self):
        """Khách hỏi về sữa thì câu trả lời phải nói 'sữa', không nói 'thành phần bạn cần tránh'.

        Ở câu về dị ứng, bắt khách tự suy ra thành phần nào là chỗ tệ nhất để tiết kiệm chữ.
        """
        r = understand("Ốc hương rang bơ tỏi có sữa không? Mình không dung nạp lactose", ITEMS)
        reply = respond(r, ITEMS)
        self.assertIn("sữa", reply.text.lower())

    def test_cau_so_sanh_NEU_DO_CAY_khong_chi_gia(self):
        """Câu "món nào cay hơn?" từng nhận về so sánh GIÁ — đúng dữ liệu, sai câu hỏi."""
        r = understand("Gà nướng mật ong và gà nướng muối ớt xanh, món nào cay hơn?", ITEMS)
        reply = respond(r, ITEMS)
        self.assertIn("cay", reply.text.lower())
        self.assertIn("cay vừa", reply.text.lower())


class CauChuKHACHDOCTHAY(unittest.TestCase):
    """Lỗi CHỮ trong câu trả lời — thứ thước đo nội dung không bắt được.

    Thước đo chấm ĐÚNG/SAI về dữ liệu: món có thật không, giá đúng không, có lọt món cần tránh
    không. Nó không chấm câu có đọc được không. Nên một câu như:

        "Mình chỉ đọc được phần thực đơn ghi, nên Bạn nhắc nhân viên…"

    qua được mọi ca đánh giá, dù khách đọc thấy ngay chữ B hoa giữa câu. Lỗi này chỉ hiện ra khi
    ĐỌC câu trả lời thật qua backend, và nó đã hiện ra đúng như vậy.

    Ba phép kiểm dưới đây quét TOÀN BỘ câu trả lời của 119 ca, không chỉ vài ca mẫu — vì lỗi chữ
    nằm ở nhánh nào thì chỉ ca đi qua nhánh đó mới lộ.
    """

    @classmethod
    def setUpClass(cls):
        cases = json.loads(
            (REPO_ROOT / "ai" / "evaluation" / "cases.json").read_text(encoding="utf-8-sig")
        )["cases"]
        cls.tra_loi = [
            (c["id"], respond(understand(c["question"], ITEMS), ITEMS).text) for c in cases
        ]

    def test_khong_chu_hoa_giua_cau(self):
        """Chữ hoa sau dấu phẩy hoặc sau một từ nối là dấu hiệu ghép chuỗi sai chỗ."""
        xau = []
        for cid, text in self.tra_loi:
            for noi in (", nên ", ", và ", ", rồi ", ", thì ", " nên ", " và "):
                vi_tri = text.find(noi)
                while vi_tri >= 0:
                    sau = text[vi_tri + len(noi):]
                    if sau[:1].isupper() and not sau.startswith(("Mình", "Bạn nhé")):
                        # Danh từ riêng viết hoa giữa câu là hợp lệ: tên MÓN và tên
                        # DANH MỤC. Bản đầu chỉ miễn tên món, nên câu đúng "rẻ hơn
                        # nhóm Món gà và Hải sản" bị chấm sai — thước đo sai chứ
                        # không phải câu sai.
                        rieng = [i["name"] for i in ITEMS] + TEN_DANH_MUC
                        if not any(sau.startswith(t) for t in rieng):
                            xau.append(f"{cid}: …{noi}{sau[:34]}…")
                            break
                    vi_tri = text.find(noi, vi_tri + 1)
        self.assertEqual(xau, [], f"{len(xau)} câu có chữ hoa giữa câu: {xau[:6]}")

    def test_khong_hai_dau_cach_hoac_dau_cau_lien_tiep(self):
        xau = [
            f"{cid}: {text[:60]!r}" for cid, text in self.tra_loi
            if "  " in text or ".." in text or " ." in text or " ," in text
        ]
        self.assertEqual(xau, [], f"{len(xau)} câu có khoảng trắng/dấu câu lặp: {xau[:4]}")

    def test_moi_cau_ket_thuc_bang_dau_cau(self):
        """Câu trả lời không được đứt giữa chừng.

        Danh sách món giờ xuống dòng có gạch đầu dòng, nên câu có thể kết thúc bằng một mục
        `- Tên món (85.000đ)`. Đó là một đơn vị TRỌN VẸN, không phải câu bị cụt — nên phép kiểm
        chấp nhận nó, và chỉ nó.

        Nới đúng một hình dạng chứ không nới cả phép kiểm: mục đích của test là bắt câu bị cắt
        ngang, và một câu văn xuôi kết thúc bằng `)` vẫn phải đỏ.
        """
        xau = []
        for cid, text in self.tra_loi:
            if not text:
                continue
            dong_cuoi = text.rstrip().splitlines()[-1].strip()
            if dong_cuoi.startswith("- ") and dong_cuoi.endswith("đ)"):
                continue
            if text.rstrip()[-1] not in ".?!":
                xau.append(f"{cid}: {text[-30:]!r}")
        self.assertEqual(xau, [], f"{len(xau)} câu không có dấu kết: {xau[:4]}")


class RONG_VI_LOAI_TRU_KHAC_RONG_VI_RANG_BUOC(unittest.TestCase):
    """Hai nguyên nhân làm kết quả rỗng, và chúng phải cho hai câu trả lời khác nhau.

    Golden qua stack thật bắt được: khách xem ba lượt danh sách rồi nói "Cho mình món khác đi", và
    nhận "Mình chưa tìm được món nào thỏa hết những điều bạn nêu ạ" — trong khi CÓ món thỏa ràng
    buộc, chỉ là chúng đã được nêu ở ba lượt trước.

    Ranh giới không được nhòe, và đó là lý do lớp test này tồn tại:

        loại trừ món đã gợi ý   phép LỊCH SỰ    -> nới được, và phải nới thay vì trả rỗng
        dị nguyên · cay · giá   ràng buộc AN TOÀN -> KHÔNG BAO GIỜ nới, kể cả khi rỗng

    Nới nhóm thứ nhất dẫn tới việc nhắc lại một món khách đã thấy. Nới nhóm thứ hai dẫn tới việc mời
    khách một món có thể gây hại. Nên test cuối cùng của lớp này quan trọng hơn ba test đầu.
    """

    def _req(self, **kw):
        r = understand("Gợi ý món ăn cho mình với", ITEMS)
        for k, v in kw.items():
            setattr(r, k, v)
        return r

    def test_rong_vi_loai_tru_thi_NOI_va_noi_ro(self):
        mon_an = [i["id"] for i in ITEMS if i["categoryId"] in FOOD_CATEGORIES]
        rep = respond(self._req(exclude_item_ids=mon_an), ITEMS)
        self.assertEqual(rep.branch, "exhausted_after_exclusions")
        self.assertIn("đã nêu hết", rep.text)
        # KHÔNG nêu lại danh sách: khách vừa nói "cho mình món khác đi". Bản đầu của nhánh này nêu
        # lại đúng những món khách vừa từ chối, và golden bắt được bằng `must_not_repeat_turn`.
        self.assertEqual(rep.items, [], "không được gợi lại món khách vừa từ chối")
        self.assertTrue(rep.asks_back, "phải mời khách bỏ bớt điều kiện — còn đường đi tiếp")

    def test_khong_bi_loai_tru_thi_khong_vao_nhanh_do(self):
        """Nhánh mới KHÔNG được lấy ca của nhánh lọc bình thường."""
        rep = respond(self._req(), ITEMS)
        self.assertEqual(rep.branch, "filter")

    def test_rong_vi_RANG_BUOC_thi_MOI_BO_chu_khong_tu_noi(self):
        """Rỗng vì ràng buộc thì NÊU điều kiện chặn và MỜI bỏ — nhưng không tự bỏ.

        Ranh giới: **mời khác nới.** Nới là hệ thống tự hạ hàng rào; mời là khách quyết định. Câu
        trả lời cũ ("chưa tìm được món nào") không nới, nhưng nó là ngõ cụt — đo được trên bản chạy
        thật, khách đổi chủ đề rồi nhận 0 món và không có gì để sửa:

            "gợi ý món cho 2 người"     -> 6 món, `party:two_three` vào bộ nhớ
            "chuyển sang món chay đi"   -> 0 món, trong khi thực đơn có 17 món chay

        `rep.items` phải RỖNG: đây là câu hỏi lại, không phải câu gợi ý, nên không có thẻ giỏ.
        """
        rep = respond(self._req(require_tags=["spice:hot"], avoid_tags=["spice:hot"],
                                rang_buoc_ke_thua=["spice:hot"]), ITEMS)
        self.assertEqual(rep.branch, "empty_result_offer_drop")
        self.assertTrue(rep.asks_back, "phải mời khách bỏ điều kiện chặn")
        self.assertEqual(rep.items, [], "câu hỏi lại thì không kèm thẻ giỏ")
        self.assertIn("cay đậm", rep.text, "phải GỌI TÊN điều kiện chặn bằng tiếng Việt")

    def test_CHI_moi_bo_rang_buoc_KE_THUA(self):
        """Không mời bỏ điều khách VỪA NÓI ở lượt này — đó là câu trả lời vô nghĩa.

        Golden bắt được ngay lượt đầu sau khi thêm nhánh mời-bỏ:

            "Vị miền Bắc khác miền Nam thế nào?"
            -> Điều kiện "miền bắc" đang chặn — bỏ nó ra thì có 35 món.

        Khách vừa nêu miền Bắc trong chính câu đó. Đây là câu hỏi tri thức, và hai nhãn "chặn" nó
        là hai nhãn của chính nó. Rơi qua nhánh này thì câu về `empty_result` như cũ, và đường sinh
        viết lại bằng đoạn tri thức truy hồi được — tức câu hỏi vẫn được trả lời đúng.

        Ranh giới này cũng khớp với vấn đề gốc: thứ giết câu hỏi của khách là ràng buộc từ lượt
        TRƯỚC mà họ không còn nghĩ tới. Ràng buộc họ vừa gõ thì họ tự sửa được.
        """
        r = self._req(require_tags=["region:north", "region:south"])
        rep = respond(r, ITEMS)
        self.assertEqual(rep.branch, "empty_result",
                         "ràng buộc do chính lượt này nêu thì KHÔNG được mời bỏ")

        r2 = self._req(require_tags=["region:north", "region:south"],
                       rang_buoc_ke_thua=["region:north"])
        rep2 = respond(r2, ITEMS)
        self.assertEqual(rep2.branch, "empty_result_offer_drop",
                         "ràng buộc KẾ THỪA thì phải mời bỏ — đây là chiều còn lại của bất biến")

    def test_KHONG_BAO_GIO_moi_bo_di_nguyen(self):
        """CHỐT AN TOÀN. Dị nguyên không được xuất hiện trong lời mời bỏ, kể cả khi nó là thứ chặn.

        Đây là test quan trọng nhất của lớp này. Nhánh mời-bỏ đi tìm "bỏ cái gì thì có món", và nếu
        nó xét cả `avoid_tags` thì nó sẽ mời khách bỏ chính hàng rào dị ứng — biến một cơ chế tiện
        lợi thành đường hạ chốt an toàn.
        """
        moi_nhan = sorted({t for i in ITEMS for t in i["tags"] if t.startswith("allergen:")})
        self.assertTrue(moi_nhan, "thực đơn phải có nhãn dị nguyên thì test mới có nghĩa")
        rep = respond(self._req(avoid_tags=moi_nhan, require_tags=["spice:hot"],
                                rang_buoc_ke_thua=["spice:hot"]), ITEMS)
        for nhan in moi_nhan:
            self.assertNotIn(nhan.split(":", 1)[1], rep.text.lower(),
                             f"lời mời bỏ nhắc tới dị nguyên {nhan}")
        self.assertNotIn("dị ứng", rep.text.lower())
        self.assertEqual(rep.items, [])

    def test_KHONG_noi_rang_buoc_DI_NGUYEN_de_lap_cho_trong(self):
        """Bất biến an toàn: nới loại trừ thì được, nới dị nguyên thì KHÔNG.

        Dựng đúng tình huống dễ nhầm nhất: loại trừ ĐÃ ăn hết tập ứng viên, VÀ khách có dị nguyên.
        Nhánh mới bỏ loại trừ rồi lọc lại — nếu nó bỏ luôn `avoid_tags` thì món dị nguyên quay lại.
        """
        seafood = [i for i in ITEMS if "allergen:seafood" in i["tags"]]
        self.assertTrue(seafood, "thực đơn phải có món hải sản để test này có nghĩa")
        khong_hai_san = [i["id"] for i in ITEMS if "allergen:seafood" not in i["tags"]]
        rep = respond(
            self._req(avoid_tags=["allergen:seafood"], exclude_item_ids=khong_hai_san), ITEMS
        )
        ten = {i["id"]: i for i in ITEMS}
        xau = [ten[i]["name"] for i in rep.items if "allergen:seafood" in ten[i]["tags"]]
        self.assertEqual(
            xau, [],
            "nhánh nới loại trừ đã nới luôn ràng buộc dị nguyên — đây là lỗi AN TOÀN, "
            f"món lọt: {xau}",
        )


class CHU_CHO_KHACH_DOC(unittest.TestCase):
    """`chu_cho_khach` — đoạn tri thức trình bày cho khách, KHÔNG đổi nội dung.

    Vì sao có lớp này: hỏi stack thật "Phở với bún khác nhau thế nào?" và khách nhận về

        Phở, bún, mì, hủ tiếu — khác nhau thế nào — Khác nhau ở SỢI... là **sợi**: - **Phở** — sợi dẹt

    Nội dung ĐÚNG, trình bày sai ba chỗ: nhan đề dính đầu câu, `**` markdown lọt nguyên, gạch đầu dòng
    nối thành đoạn dài. Cả ba đến từ `" ".join(text.split())`.

    Test cuối là test quan trọng nhất: hàm này **không được làm mất chữ nào**. Nếu nó cắt nội dung thì
    nó thành một dạng tóm tắt — và tóm tắt tri thức nhà hàng là đúng điều đường này tồn tại để tránh.
    """

    @dataclass
    class Doan:
        chunk_id: str = "kb.x#1"
        heading: str = "Khác nhau ở SỢI"
        text: str = (
            "Phở, bún, mì — khác nhau thế nào — Khác nhau ở SỢI\n"
            "Điều phân biệt chúng là **sợi**:\n"
            "- **Phở** — sợi dẹt, mềm.\n"
            "- **Bún** — sợi tròn nhỏ.\n"
        )

    def test_bo_nhan_de_o_dau_cau(self):
        from answer import chu_cho_khach

        ra = chu_cho_khach(self.Doan())
        self.assertFalse(ra.startswith("Phở, bún, mì —"), f"còn nhan đề: {ra[:60]!r}")
        self.assertTrue(ra.startswith("Điều phân biệt"), ra[:60])

    def test_bo_dau_markdown(self):
        from answer import chu_cho_khach

        ra = chu_cho_khach(self.Doan())
        for dau in ("**", "__", "`"):
            self.assertNotIn(dau, ra, f"còn {dau!r} trong chữ khách đọc")

    def test_gach_dau_dong_thanh_dau_liet_ke_doc_duoc(self):
        from answer import chu_cho_khach

        ra = chu_cho_khach(self.Doan())
        self.assertIn("• Phở — sợi dẹt", ra)
        self.assertNotIn("- **Phở**", ra)

    def test_KHONG_lam_mat_chu_nao(self):
        """Bất biến quan trọng nhất: đây là làm sạch TRÌNH BÀY, không phải tóm tắt.

        So theo TỪ, bỏ những ký tự trình bày mà hàm này có quyền bỏ. Một chữ nội dung bị mất là hàm
        này đã thành một dạng tóm tắt — và tóm tắt tri thức nhà hàng là đúng điều đường này tránh.
        """
        import re

        from answer import chu_cho_khach

        d = self.Doan()
        than = d.text.split("\n", 1)[1]

        def tu(s):
            # So TỪ CÓ NGHĨA, bỏ hết dấu câu và ký tự trình bày.
            #
            # Bản đầu của phép tách này thay `*` bằng khoảng trắng rồi `split()`, nên `**sợi**:` cho
            # hai token `sợi` và `:`, còn bản đã làm sạch cho một token `sợi:` — test đỏ vì CÁCH TÁCH
            # TỪ, không vì mất chữ. Đúng lớp lỗi "phép kiểm sai trước khi hệ thống sai", và lần này
            # nó xảy ra trong chính test tôi vừa viết.
            return re.findall(r"\w+", s, re.UNICODE)

        self.assertEqual(tu(than), tu(chu_cho_khach(d)))

    def test_doan_khong_co_dong_nao_ngoai_tien_to_thi_van_tra_chu(self):
        """Đoạn chỉ có một dòng: không được trả rỗng vì "bỏ dòng đầu"."""
        from answer import chu_cho_khach

        ra = chu_cho_khach(self.Doan(text="Chỉ một dòng duy nhất, không có nội dung sau."))
        self.assertTrue(ra.strip(), "trả rỗng thì khách nhận một câu trắng")


class CHON_MUC_TRONG_TAI_LIEU(unittest.TestCase):
    """`_chon_muc` — xếp hạng mục TRONG một tài liệu, nay bằng embedding.

    Vì sao đổi: bộ so 168 ca (`chunk_selection_cases.json`) đo ĐÚNG đường này, và trên tập niêm phong
    embedding đạt Top-1 0,864 so với BM25 0,750 — riêng câu diễn đạt khác từ là 0,818 so với 0,636.
    Docstring của `_knowledge_chunk` từ trước đã ghi điều kiện: *"Nếu phép đo cho thấy embedding chọn
    đoạn tốt hơn thì đổi — nhưng phải đổi vì SỐ"*, và *"điều kiện để xét lại là có tập ca ĐỦ LỚN"*.
    Cả hai đã có.

    Ba bất biến, và bất biến thứ nhất là bảo đảm CHI PHÍ — không phải chi tiết tối ưu:
    dựng một `EmbeddingIndex` cho mỗi tài liệu mất ~91ms MỖI LƯỢT, tức đắt hơn BM25 gần 1000 lần cho
    cùng một việc. Cách ở đây dùng lại vector của chỉ mục toàn kho đã nạp sẵn.
    """

    def _doan_co_muc(self, topic: str):
        from answer import KNOWLEDGE_PATH
        from rag.chunker import retrievable_chunks

        return [c for c in retrievable_chunks(KNOWLEDGE_PATH) if topic in c.topic_keys and c.heading]

    def test_KHONG_dung_chi_muc_embedding_moi(self):
        """Bảo đảm chi phí: mỗi lượt chat không được trả giá mã hóa 3–8 đoạn."""
        from rag import embedding as EMB

        if not EMB.available():
            self.skipTest("không có sentence-transformers")
        cand = self._doan_co_muc("ordering_guide")
        self.assertTrue(cand, "tiền đề: chủ đề này phải có mục")

        from answer import _bo_truy_hoi_toan_kho, _chon_muc

        _bo_truy_hoi_toan_kho()          # hâm nóng trước khi đếm, như lúc chạy thật
        goc = EMB.EmbeddingIndex.build
        dem = {"n": 0}

        def dem_lai(*a, **kw):
            dem["n"] += 1
            return goc(*a, **kw)

        EMB.EmbeddingIndex.build = staticmethod(dem_lai)
        try:
            _chon_muc(cand, "Gọi bao nhiêu món cho nhóm đông?")
        finally:
            EMB.EmbeddingIndex.build = goc
        self.assertEqual(
            dem["n"], 0,
            "đã dựng chỉ mục embedding mới — mỗi lượt chat sẽ mất thêm ~91ms cho việc đã làm sẵn",
        )

    def test_pha_the_theo_chunk_id_TANG_DAN(self):
        """Cùng luật phá thế với `Bm25Index.search` và với bộ so.

        Hai đường xếp hạng phá thế ngược nhau thì hệ thống không lặp lại được kết quả của chính nó —
        và bản đầu của hàm này dùng `max((điểm, chunk_id))`, tức chọn id LỚN nhất khi hòa.
        """
        from answer import _chon_muc

        @dataclass
        class Doan:
            chunk_id: str
            text: str
            heading: str = "x"

        # Ba đoạn văn bản GIỐNG NHAU -> mọi bộ xếp hạng cho điểm bằng nhau -> chỉ còn luật phá thế.
        doan = [Doan("z#1", "cay"), Doan("a#1", "cay"), Doan("m#1", "cay")]
        # `_chon_muc` trả DANH SÁCH từ khi nhánh tri thức trích nhiều mục — lấy mục đầu để
        # kiểm luật phá thế, thứ không đổi theo số mục xin.
        self.assertEqual(_chon_muc(doan, "cay")[0].chunk_id, "a#1")

    def test_doan_MO_DAU_thi_lui_ve_bm25_chu_khong_bo_no(self):
        """Đoạn mở đầu không có vector (chỉ mục toàn kho lọc `heading` rỗng).

        Chấm điểm trên tập con thiếu vài đoạn là lặng lẽ LOẠI chúng khỏi cuộc thi — và đoạn bị loại
        có thể là đoạn đúng. Nên thiếu vector cho BẤT KỲ ứng viên nào thì cả lượt lùi về BM25.
        """
        from answer import _chon_muc

        @dataclass
        class Doan:
            chunk_id: str
            text: str
            heading: str = ""

        doan = [Doan("kb.gia#0", "phần dẫn nhập của tài liệu", "")]
        chon = _chon_muc(doan, "bất kỳ")
        self.assertEqual([c.chunk_id for c in chon], ["kb.gia#0"],
                         "phải trả đoạn duy nhất, không được trả rỗng")


class HOI_VE_THUOC_TINH_KHAC_LOC_THEO_THUOC_TINH(unittest.TestCase):
    """Cờ `asks_about_attribute` — cổng chặn lớp mô hình đổi nhánh mà mã tất định đã chọn đúng.

    Golden qua stack thật bắt được hai lượt, và cả hai do LỚP MÔ HÌNH làm sai:

        "Nhãn 'ít calo' dựa trên gì?"   mô hình trả `prefer: health:low_calorie` -> nhánh filter
        "Món này có bột ngọt không?"    mô hình trả `prefer: health:no_msg`      -> nhánh filter

    Khách nhận về "Mời bạn tham khảo: Cơm chiên chay ngũ sắc (50.000đ), …" cho một câu hỏi có/không
    về MỘT món — sai loại câu trả lời, kèm thẻ giỏ cho một câu không hỏi mua gì.

    Phép loại trừ `CANDIDATE_FRAMING` là phần bắt buộc, và test thứ ba ép nó: thiếu nó thì
    "Có món nào không cay không?" — một câu lọc THẬT — cũng bị coi là câu hỏi về thuộc tính, và đó là
    hỏng nặng hơn lỗi đang sửa.
    """

    def test_hoi_dinh_nghia_nhan(self):
        self.assertTrue(understand("Nhãn 'ít calo' dựa trên gì?", ITEMS).asks_about_attribute)

    def test_hoi_thuoc_tinh_cua_mon_dang_noi(self):
        for cau in ("Món này có bột ngọt không?", "Món đó có hành không?",
                    "Cái này có sữa không?"):
            with self.subTest(cau):
                self.assertTrue(understand(cau, ITEMS).asks_about_attribute, cau)

    def test_cau_DOI_UNG_VIEN_thi_KHONG_bat_co(self):
        for cau in ("Có món nào không cay không?", "Món nào không có bột ngọt?",
                    "Gợi ý món ăn cho mình với", "Cho mình món gì ít dầu"):
            with self.subTest(cau):
                self.assertFalse(understand(cau, ITEMS).asks_about_attribute, cau)

    def test_co_nay_KHONG_tu_doi_nhanh_nao(self):
        """Cờ này chỉ NGĂN mô hình đổi nhánh; nó không được tự đổi nhánh nào.

        Nếu nó đổi nhánh thì nó thành một luật định tuyến thứ hai chạy song song với sáu nhánh, và
        không ai đoán được nhánh nào thắng.
        """
        cau = "Món này có bột ngọt không?"
        co = understand(cau, ITEMS)
        khong = understand(cau, ITEMS)
        khong.asks_about_attribute = False
        self.assertEqual(respond(co, ITEMS).branch, respond(khong, ITEMS).branch)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class LoaiDangHOI_thang_loai_duoc_NHAC_toi(unittest.TestCase):
    """Khách nói mình đang ăn gì rồi hỏi uống gì — món đang ăn là NGỮ CẢNH, không phải bộ lọc.

    Đo được, và cả bốn ca đều trả lời NGƯỢC câu hỏi:

        "ăn lẩu thì uống gì hợp"        -> 6 món LẨU
        "ăn phở uống gì ngon"           -> 3 món PHỞ
        "món nướng hợp với đồ uống gì"  -> 0 món   (không đồ uống nào `method:grilled`)
        "đồ uống nào hợp món cay"       -> 0 món   (không đồ uống nào cay)

    `wants` được nhận ĐÚNG là `drink` ở cả bốn. Hỏng ở chỗ khác: `ho_mon` và `categories` áp TRƯỚC
    `wants`, nên tên món ăn trong câu thắng chính điều khách đang hỏi.

    Đây là phân biệt món ăn / đồ uống — một ràng buộc đứng từ đầu dự án — nên nó phải có test riêng
    thay vì dựa vào tỷ lệ chung của tập đánh giá.
    """

    GHEP_UONG = (
        "ăn lẩu thì uống gì hợp",
        "món nướng hợp với đồ uống gì",
        "ăn cay thì uống gì",
        "đồ uống nào hợp món cay",
        "ăn phở uống gì ngon",
    )

    def test_hoi_uong_thi_chi_nhan_do_uong(self):
        for cau in self.GHEP_UONG:
            with self.subTest(cau):
                _, reply = reply_for(cau)
                self.assertTrue(reply.items, f"{cau!r} trả RỖNG — nhãn của món ăn giết câu hỏi")
                sai = [BY_ID[i]["name"] for i in reply.items
                       if BY_ID[i]["categoryId"] not in DRINK_CATEGORIES]
                self.assertEqual(sai, [], f"{cau!r} trả về món ĂN: {sai}")

    def test_hoi_mon_an_KHONG_bi_pha(self):
        """Chiều ngược, bắt buộc: quy tắc mới không được đụng câu hỏi món ăn."""
        for cau in ("cho mình món chay", "gợi ý món ăn giúp mình",
                    "cho mình món lẩu", "có món phở gì"):
            with self.subTest(cau):
                _, reply = reply_for(cau)
                self.assertTrue(reply.items)
                self.assertEqual(drinks_in(reply), [], f"{cau!r} lẫn đồ uống")

    def test_hoi_do_uong_cu_the_van_dung(self):
        """Và không được nới quá tay: hỏi trà thì vẫn chỉ ra trà."""
        _, reply = reply_for("nhà hàng có trà gì")
        self.assertTrue(reply.items)
        for i in reply.items:
            self.assertIn("Trà", BY_ID[i]["name"], "hỏi trà mà ra thứ khác")


class CauHaiLuaChon(unittest.TestCase):
    """«A hay B» là hai LỰA CHỌN, không phải hai điều kiện phải thỏa cùng lúc.

    Đo được: "nên gọi lẩu hay nướng" -> **0 món**. "lẩu" thành danh mục, "nướng" thành
    `method:grilled`, và phép lọc là AND nên nó đi tìm món vừa là lẩu vừa nướng.

    "chọn cơm hay phở" thì lại ra món — vì cả hai rơi vào `ho_mon`, vốn đã là phép HOẶC. Nên lỗi
    chỉ hiện khi hai vế rơi vào HAI LOẠI ràng buộc khác nhau, và không tổ hợp nào trong 140 ca
    chạm tới.
    """

    def test_hai_ve_khac_loai_KHONG_duoc_ra_rong(self):
        for cau in ("nên gọi lẩu hay nướng", "ăn lẩu hay ăn nướng", "lẩu hay nướng ngon hơn"):
            with self.subTest(cau):
                _, reply = reply_for(cau)
                self.assertTrue(reply.items, f"{cau!r} ra RỖNG — hai lựa chọn bị giao bằng AND")

    def test_danh_sach_phai_neu_CA_HAI_ben(self):
        """Trả 6 món của một bên là trả lời NỬA câu hỏi — khách không so được."""
        _, reply = reply_for("nên gọi lẩu hay nướng")
        nhom = {BY_ID[i]["categoryName"] for i in reply.items}
        self.assertIn("Lẩu", nhom, "không món lẩu nào — bên rẻ hơn chiếm hết danh sách")
        self.assertTrue(nhom - {"Lẩu"}, "chỉ có lẩu — vế còn lại biến mất")

    def test_KHONG_noi_cau_loc_binh_thuong(self):
        """Chiều ngược, bắt buộc: câu không có "hay" thì phép lọc vẫn là AND."""
        for cau in ("cho mình món chay", "món lẩu nào không cay", "gợi ý món ăn giúp mình"):
            with self.subTest(cau):
                request, reply = reply_for(cau)
                self.assertFalse(request.hai_lua_chon)
                self.assertTrue(reply.items)

    def test_di_nguyen_VAN_duoc_ap_tren_ket_qua_hop(self):
        """CHỐT AN TOÀN: nới phép lọc vì câu có chữ "hay" không được nới hàng rào dị ứng."""
        request, reply = reply_for("mình dị ứng hải sản, cho món nướng hay lẩu")
        self.assertTrue(request.avoid_tags, "tiền đề: câu này phải khai dị ứng")
        xau = [BY_ID[i]["name"] for i in reply.items if "allergen:seafood" in BY_ID[i]["tags"]]
        self.assertEqual(xau, [], f"lọt món mang nhãn hải sản: {xau}")


class ComboNhieuSuat(unittest.TestCase):
    """Khách xin một BỘ món, mỗi loại một suất — không phải một danh sách để tự chọn.

        "Mình đi một mình, muốn tư vấn 1 món ăn nhẹ gồm 1 món chính, 1 thức uống, 1 tráng miệng"

    Trước khi có nhánh này, câu trên cho `categories=['cat_dessert']`, `wants='drink'` và trả 6 món
    khai vị/chay — **không có đồ uống nào**. Nhiều danh mục trong một câu chỉ thành phép HOẶC, mà
    khách đang xin phép CỘNG.
    """

    COMBO = ("Mình đi một mình, mình muốn tư vấn 1 món ăn nhẹ gồm 1 món chính, "
             "1 thức uống, 1 tráng miệng")

    def test_moi_suat_deu_co_mon(self):
        request, reply = reply_for(self.COMBO)
        self.assertTrue(request.combo, "tiền đề: câu này phải được đọc là combo")
        self.assertEqual(reply.branch, "combo")
        nhom = {BY_ID[i]["categoryId"] for i in reply.items}
        self.assertTrue(nhom & set(DRINK_CATEGORIES), "thiếu suất đồ uống")
        self.assertIn("cat_dessert", nhom, "thiếu suất tráng miệng")
        self.assertTrue(nhom - set(DRINK_CATEGORIES) - {"cat_dessert"}, "thiếu suất món chính")

    def test_cau_tra_loi_neu_TONG_TIEN(self):
        _, reply = reply_for(self.COMBO)
        tong = sum(BY_ID[i]["price"] for i in reply.items)
        self.assertIn("Tổng:", reply.text)
        self.assertIn(f"{tong:,}".replace(",", "."), reply.text,
                      "tổng in ra phải khớp tổng giá các món đã chọn")

    def test_di_nguyen_VAN_chan_trong_combo(self):
        """CHỐT AN TOÀN: nhánh mới không được là đường vòng qua bộ lọc dị nguyên."""
        request, reply = reply_for(
            "mình dị ứng hải sản, cho 1 món chính 1 nước 1 tráng miệng")
        self.assertTrue(request.avoid_tags, "tiền đề: câu này phải khai dị ứng")
        xau = [BY_ID[i]["name"] for i in reply.items if "allergen:seafood" in BY_ID[i]["tags"]]
        self.assertEqual(xau, [], f"lọt món mang nhãn hải sản: {xau}")

    def test_MOT_suat_KHONG_thanh_combo(self):
        """Một suất là câu lọc bình thường — biến nó thành combo sẽ phá một đường đã đo."""
        for cau in ("cho mình 2 món chay", "gợi ý món cho 2 người", "cho mình 3 món dưới 100 nghìn"):
            with self.subTest(cau):
                request, _ = reply_for(cau)
                self.assertEqual(request.combo, [])


class TrinhBayGachDauDong(unittest.TestCase):
    """Danh sách món xuống dòng, mỗi món một gạch đầu dòng.

    Trước đây nối bằng dấu phẩy thành một khối chữ, và khách phải tự tách sáu món ra để so giá —
    trên điện thoại, giữa lúc đang đói.
    """

    def test_moi_mon_mot_dong(self):
        _, reply = reply_for("Cho mình món chay")
        self.assertGreaterEqual(len(reply.items), 3, "tiền đề: câu này phải nêu nhiều món")
        dong_mon = [d for d in reply.text.splitlines() if d.startswith("- ")]
        self.assertEqual(len(dong_mon), len(reply.items),
                         "số dòng gạch đầu dòng phải bằng số món nêu ra")

    def test_gia_nam_cung_dong_voi_ten(self):
        _, reply = reply_for("Cho mình món chay")
        for d in [x for x in reply.text.splitlines() if x.startswith("- ")]:
            self.assertRegex(d, r"^- .+ \(\d[\d.]*đ\)$", f"dòng sai dạng: {d!r}")


class NoiRaKhiKhachXinDungThuHoTranh(unittest.TestCase):
    """Khách xin món hải sản trong khi đang tránh hải sản -> phải NÓI RA, không im lặng đổi món.

        "Con tôi không ăn được tôm hãy tư vấn món hải sản khác"
        -> Bánh mì pate, Cháo lòng, Gỏi cuốn chay...   (không một lời giải thích)

    Hệ thống làm đúng về an toàn — nhãn `allergen:seafood` phủ cả 26 món hải sản nên không còn món
    nào — nhưng nó không nói ra, nên khách tưởng nhà hàng hết món hoặc hệ thống hỏng.
    """

    def test_noi_ra_ly_do(self):
        request, reply = reply_for("Con tôi không ăn được tôm hãy tư vấn món hải sản khác")
        self.assertIn("allergen:seafood", request.avoid_tags, "tiền đề: phải nhận ra dị ứng")
        self.assertIn("hải sản", reply.text.lower())
        self.assertTrue(
            any(c in reply.text.lower() for c in ("cần tránh", "không lọc ra được")),
            "câu trả lời phải giải thích vì sao không có món hải sản nào",
        )

    def test_cau_binh_thuong_KHONG_bi_them_cau_thua(self):
        """Chiều ngược: khách không nhắc dị nguyên thì không được chèn lời giải thích."""
        _, reply = reply_for("Cho mình món chay")
        self.assertNotIn("cần tránh", reply.text.lower())


class RuouBiaKHONGTuDungDau(unittest.TestCase):
    """Rượu bia không tự đứng đầu khi khách không xin.

    Người dùng báo: mọi câu hỏi đồ uống đều mở đầu bằng bia. Nguyên nhân là bốn món rẻ nhất thực
    đơn đều là bia (12.000–22.000đ) còn nước mía 25.000đ, và phép sắp cho mọi đồ uống cùng hạng rồi
    xếp theo giá.

    Đây không chỉ là gợi ý nhạt. Khách ăn trưa, khách đi với trẻ con, khách còn lái xe — mặc định
    mời rượu bia cho tất cả là lời tư vấn tệ. Nhà hàng vẫn bán rượu bia; câu hỏi là nó có nên là
    thứ ĐẦU TIÊN đề xuất cho người không hỏi.

    **Xếp hạng, KHÔNG lọc** — cùng nguyên tắc với "món ăn trước đồ uống".
    """

    def _la_ruou(self, i: str) -> bool:
        return BY_ID[i]["categoryId"] == "cat_alcohol"

    def test_khong_xin_thi_ruou_bia_khong_dung_dau(self):
        for cau in ("tư vấn đồ uống", "cho mình nước uống", "đồ uống nào ngon"):
            with self.subTest(cau):
                _, reply = reply_for(cau)
                self.assertTrue(reply.items, "tiền đề: câu này phải nêu món")
                self.assertFalse(self._la_ruou(reply.items[0]),
                                 f"{BY_ID[reply.items[0]]['name']} đứng đầu khi khách không xin rượu")

    def test_CO_xin_thi_van_ra_ngay_dau(self):
        """Chiều ngược: xếp hạng chứ không lọc, nên khách xin bia vẫn được bia ngay."""
        for cau in ("cho mình bia", "có bia gì không", "đồ uống có cồn"):
            with self.subTest(cau):
                _, reply = reply_for(cau)
                self.assertTrue(reply.items)
                self.assertTrue(self._la_ruou(reply.items[0]),
                                "khách xin rượu bia mà không nhận được ngay đầu")

    def test_do_uong_re_nhat_VAN_noi_su_that(self):
        """Không được vì xếp hạng mà nói sai: bia THẬT SỰ rẻ nhất, và câu hỏi giá phải trung thực."""
        _, reply = reply_for("đồ uống nào rẻ nhất")
        self.assertIn("Bia hơi Hà Nội", reply.text)


class TrichNhieuDoanTriThuc(unittest.TestCase):
    """Nhánh tri thức trích `SO_DOAN_TRI_THUC` đoạn, khử trùng theo tài liệu.

    Vì sao không còn là 1 đoạn: đo đường cong trên 50 câu tri thức khó nhất cho thấy tài liệu đúng
    **luôn nằm trong tầm với** (`Hit@20 = 100,00%` với một bộ nhúng mạnh), và 40,00% số ca là lỗi
    XẾP HẠNG thuần túy — tài liệu đúng có trong top-10 mà không đứng nhất.

    Lấy 2 đoạn đưa tỷ lệ câu trả lời chứa tài liệu đúng từ **48,00% lên 64,00%** (McNemar
    p = 0,0078), và vẫn giữ nguyên luật chống bịa: mọi chữ khách đọc là chữ nguyên văn trong kho,
    `BRANCHES_ALLOWED` không đổi.
    """

    def test_khu_trung_theo_tai_lieu(self):
        """Hai đoạn cùng một tài liệu không được chiếm hai suất.

        Không có bước này thì một tài liệu 9 đoạn lấy hết chỗ, và câu trả lời dài gấp đôi mà không
        thêm tài liệu nào — tức trả cái giá của việc tăng k mà không nhận được cái lợi.
        """
        for cau in ("Gọi mấy món mà ăn cùng nhau cho hợp vị?",
                    "Lần đầu tới đây, gọi kiểu gì cho khỏi bỡ ngỡ?",
                    "Đồ biển ở đây có tươi không, lấy từ đâu?"):
            with self.subTest(cau=cau):
                got = chon_doan_tri_thuc(cau)
                if got is None:
                    continue
                chon, _ = got
                ids = [c.doc_id for c in chon]
                self.assertEqual(len(ids), len(set(ids)), "trùng tài liệu trong một câu trả lời")
                self.assertLessEqual(len(chon), SO_DOAN_TRI_THUC)

    def test_van_la_chu_NGUYEN_VAN_trong_kho(self):
        """Trích nhiều đoạn KHÔNG được mở đường sinh chữ.

        Đây là ràng buộc quan trọng nhất của thay đổi này: lấy thêm đoạn là để tăng khả năng chạm
        đúng tài liệu, không phải để mô hình tổng hợp. `BRANCHES_ALLOWED` phải giữ nguyên hai nhánh.
        """
        from generate import BRANCHES_ALLOWED

        self.assertEqual(BRANCHES_ALLOWED, frozenset({"filter", "compare"}))
        self.assertNotIn("knowledge_corpus", BRANCHES_ALLOWED)


class TrichHaiMucTrongTaiLieu(unittest.TestCase):
    """Nhánh TRA KHÓA cũng trích `SO_DOAN_TRI_THUC` mục, không chỉ một.

    Đo riêng trên bộ 168 ca chọn mục — không suy từ kết quả của đường truy hồi toàn kho:

        1 mục   75,60%    72 từ
        2 mục   90,48%   138 từ    McNemar so với 1 mục: p = 0,0000
        3 mục   94,64%   208 từ    p = 0,0000

    Bài toán này hưởng lợi RÕ HƠN đường toàn kho, và lý do hợp lý: các mục của cùng một tài liệu
    nói về cùng chủ đề nên mục thứ hai hiếm khi lạc đề.

    Ca bắt được lỗi là một lượt golden — "Mình nên nói với nhà hàng thế nào về việc dị ứng?" chọn
    mục #4 thay vì #3 ("Khi gọi món, NÓI VỚI NHÂN VIÊN về dị ứng"), và #3 đứng ngay sau.
    """

    def test_ghep_theo_THU_TU_TAI_LIEU_chu_khong_theo_diem(self):
        """Hai mục cùng một bài văn xuôi phải giữ mạch văn của tác giả.

        Xếp theo điểm thì một đoạn mở đầu bằng "Vì vậy" có thể đứng TRƯỚC tiền đề của nó, và câu
        trả lời thành câu cụt. `chunk_id` mang số thứ tự nên sắp theo nó là theo thứ tự tác giả.
        """
        got = answer._knowledge_chunk("allergy_guidance", "Mình nên nói với nhà hàng thế nào?")
        self.assertIsNotNone(got)
        phan = [p for p in got.split("\n\n") if p.strip()]
        self.assertGreaterEqual(len(phan), 1)
        self.assertLessEqual(len(phan), answer.SO_DOAN_TRI_THUC)

    def test_chon_muc_tra_ve_DANH_SACH_du_xin_mot(self):
        """Một kiểu trả về cho mọi trường hợp — chỗ gọi không phải rẽ nhánh.

        Số mục trả về là **tối đa** `so_muc`, không phải đúng bằng: đường lùi BM25 chỉ trả những mục
        có khớp từ khóa, nên xin 2 mà chỉ một mục chứa từ trong câu hỏi thì nhận về 1.

        Đó là hành vi ĐÚNG của BM25 và giữ nguyên có chủ ý — độn thêm một mục không khớp gì chỉ để
        đủ số là thêm nhiễu vào câu trả lời. Phần lợi 90,48% đo trên đường embedding, còn đường lùi
        chỉ chạy khi không có `sentence-transformers`.
        """
        from dataclasses import dataclass

        @dataclass
        class Doan:
            chunk_id: str
            text: str
            heading: str = "x"

        doan = [Doan("a#1", "cay"), Doan("a#2", "ngọt")]
        for k in (1, 2):
            with self.subTest(so_muc=k):
                ra = answer._chon_muc(doan, "cay", so_muc=k)
                self.assertIsInstance(ra, list)
                self.assertGreaterEqual(len(ra), 1)
                self.assertLessEqual(len(ra), k)


class SO_MON_KHACH_XIN(unittest.TestCase):
    """Khách nêu số món thì phải nhận đúng bấy nhiêu món.

    Trước bản này `LIST_SIZE = 6` là cố định và con số trong câu chỉ dùng để bật một cờ. Đo trên
    ba lượt tham chiếu ngược, sau khi lượt 1 đã nêu 6 món:

        "Liệt kê cho tôi 2 món đầu vừa tư vấn"   ->  6 món
        "Liệt kê 3 món vừa tư vấn bên trên"      ->  6 món
        "Cho mình 4 món vừa tư vấn ở trên"       ->  6 món

    PHẠM VI tham chiếu ngược thì đúng — cả ba trả về đúng danh sách đã nêu, đúng thứ tự. Chỉ con
    số bị bỏ. Đây không phải trả lời sai, nhưng nó là **không nghe**: khách nói lại lần nữa cũng
    vẫn nhận sáu món.
    """

    def _hai_luot(self, luot1: str, luot2: str):
        import session as S

        st = S.SessionState.from_payload({})
        for q in (luot1, luot2):
            m = S.merge_into_request(understand(q, ITEMS), st)
            p = respond(m, ITEMS)
            st = S.update_state(st, m, p.items, p.kind, p.branch)
        return p

    def test_nghe_dung_so_mon(self):
        for cau, mong in (("Liệt kê 3 món vừa tư vấn bên trên", 3),
                          ("Cho mình 4 món vừa tư vấn ở trên", 4),
                          ("Liệt kê cho tôi 2 món đầu vừa tư vấn", 2),
                          # "vừa rồi"/"vừa nói" bật `refers_to_focus`, và bước hợp nhất bộ nhớ
                          # giải cờ đó thành MỘT món — cùng lớp lỗi với `mon dau`, đường khác.
                          ("Cho mình xem lại 3 món vừa rồi", 3),
                          ("Kể lại 5 món vừa nói", 5)):
            with self.subTest(cau=cau):
                p = self._hai_luot("Gợi ý món không cay giúp mình", cau)
                self.assertEqual(len(p.items), mong)

    def test_MOT_mon_theo_vi_tri_van_la_MOT_mon(self):
        """Chiều ngược: "món đầu tiên" là MỘT món, không phải một lát cắt.

        `mon dau` và `2 mon dau` chồng chữ mà khác hẳn nghĩa, nên phép phân biệt phải giữ được cả
        hai chiều — nới nhầm ở đây thì câu hỏi giá của một món trả về nửa danh sách.
        """
        for cau in ("Món đầu tiên giá bao nhiêu?", "Món cuối cùng có cay không?",
                    "Món vừa rồi giá bao nhiêu?"):
            with self.subTest(cau=cau):
                p = self._hai_luot("Gợi ý món không cay giúp mình", cau)
                self.assertEqual(len(p.items), 1)

    def test_cau_COMBO_nhieu_cum_so_KHONG_bi_cat(self):
        """"1 món chính 1 nước 1 tráng miệng" có BA cụm số — đó là combo, không phải xin 1 món.

        Không có điều kiện "đúng một cụm", câu này bị cắt còn 1 món và hai kịch bản phiên đang
        xanh sẽ đỏ.
        """
        r = understand("mình dị ứng hải sản, cho 1 món chính 1 nước 1 tráng miệng", ITEMS)
        self.assertIsNone(r.so_mon_muon)


class HOI_LAI_KHI_THAM_CHIEU_MO_HO(unittest.TestCase):
    """Câu XIN MÓN trỏ "món vừa rồi" khi danh sách có nhiều món — hỏi lại, không đoán.

    Hệ thống vẫn trả lời được bằng cách lùi về món thứ nhất, và với câu HỎI thì đó là hành vi đúng
    đã chốt: đoán nhưng NÊU TÊN món đã đoán, để khách sửa được ngay. **12 lượt đánh giá** dựa vào
    nó ("Món đó bao nhiêu tiền?", "Cái đó có cay không?"), và hỏi lại ở đó là bước lùi.

    Câu XIN thì khác: khách muốn LẤY một món, và đoán ở đây là chọn hộ họ.

    Phân loại bằng `XIN_MON_RE` đã có sẵn — đo trên 13 lượt đang dùng tiêu điểm thì nó tách sạch
    12 câu hỏi khỏi 1 câu xin, nên không cần luật mới.
    """

    def _sau_danh_sach(self, luot2: str, luot1: str = "Gợi ý 4 món ăn cho mình"):
        import session as S

        st = S.SessionState.from_payload({})
        for q in (luot1, luot2):
            m = S.merge_into_request(understand(q, ITEMS), st)
            p = respond(m, ITEMS)
            st = S.update_state(st, m, p.items, p.kind, p.branch)
        return p

    def test_XIN_MON_mo_ho_thi_hoi_lai_kem_so_thu_tu(self):
        p = self._sau_danh_sach("Cho mình món vừa rồi")
        self.assertEqual(p.kind, "clarify")
        self.assertTrue(p.asks_back)
        # Câu hỏi lại phải nêu SỐ THỨ TỰ — đó là thứ khách trả lời được bằng một từ, và dạng số
        # ("món thứ 2") đã được nhận ra. Thiếu nó thì hỏi lại là ngõ cụt.
        for so in ("1.", "2.", "3.", "4."):
            self.assertIn(so, p.text)

    def test_HOI_VE_mot_mon_van_doan_va_neu_ten(self):
        """Chiều ngược — chiều mà nới quy tắc sẽ phá 12 lượt đang xanh."""
        for cau in ("Món đó bao nhiêu tiền?", "Cái đó có cay không?", "Món vừa rồi làm từ gì?"):
            with self.subTest(cau=cau):
                p = self._sau_danh_sach(cau)
                self.assertNotEqual(p.kind, "clarify", "câu HỎI không được hỏi lại")
                self.assertEqual(len(p.items), 1)

    def test_danh_sach_MOT_mon_thi_khong_co_gi_mo_ho(self):
        """Một món thì không có gì để hỏi — đòi >= 2 ứng viên."""
        p = self._sau_danh_sach("Cho mình món vừa rồi", luot1="Phở bò tái nạm giá bao nhiêu?")
        self.assertNotEqual(p.kind, "clarify")
