"""Không câu trả lời nào được chứa khóa nhãn nội bộ.

Vì sao có tệp này
-----------------
`generate.verify()` đã có phép kiểm chặn `allergen:peanut`, `spice:none`… lọt vào chữ khách đọc —
nhưng nó **chỉ chạy ở đường mô hình sinh**. Đường khuôn mẫu, tức 23 trên 25 nhánh, không đi qua nó.

Hệ quả: cùng một lớp lỗi xuất hiện hai lần ở hai chỗ, và mỗi lần được vá tại chỗ.

    answer._TEN_RANG_BUOC_VI    "Điều kiện "method:grilled" đang chặn — bỏ nó ra thì có 21 món."
    intent.cau_xac_nhan_da_bo   "Dạ em đã bỏ điều kiện health:light theo yêu cầu của anh/chị."

Lần thứ nhất được vá; lần thứ hai thì không, vì không có gì canh. Nó nằm im tới khi một người gõ
"cho tôi món thanh thanh mát mát" — cụm `thanh thanh` map sang `health:light`, nhãn không nằm trong
bảng 13 mục mà hàm ấy tra, nên nó in nguyên khóa ra.

Tập ca một lượt **không bắt được** ca đó: câu xác nhận chỉ xuất hiện khi khách ĐỒNG Ý bỏ ràng buộc,
tức phải hai lượt. Nên phép kiểm ở đây quét cả hai tập.

Đây là chuyển một lỗi đang được canh bằng SỰ CẨN THẬN sang được canh bằng MỘT CỔNG.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

GOC = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(GOC / "ai" / "app"))
sys.path.insert(0, str(Path(__file__).parent))

import answer                                       # noqa: E402
import session as S                                 # noqa: E402
from generate import NHAN_KHOA_TRONG_TEXT           # noqa: E402
from intent import cau_xac_nhan_da_bo               # noqa: E402
from understand import understand                   # noqa: E402

ITEMS = json.loads(
    (GOC / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]
TAGS = json.loads(
    (GOC / "data" / "menu-tags.json").read_text(encoding="utf-8-sig")
)["tags"]


def _doc(ten: str, khoa: str) -> list:
    return json.loads(
        (Path(__file__).parent / ten).read_text(encoding="utf-8-sig")
    )[khoa]


class KhongLoKhoaNhan(unittest.TestCase):
    """Ba chiều: mọi nhãn, mọi ca một lượt, mọi lượt phiên."""

    def test_moi_nhan_deu_dich_duoc_thanh_tieng_viet(self):
        """Chiều gốc — nếu một nhãn không dịch được thì mọi câu chứa nó đều lộ.

        Quét THẲNG bảng nhãn thay vì chờ một ca chạm tới. Nhãn thứ 86 thêm vào ngày mai cũng bị
        chấm ngay, không cần ai nhớ viết thêm ca.
        """
        lo = [t for t in TAGS if NHAN_KHOA_TRONG_TEXT.search(cau_xac_nhan_da_bo([t]))]
        self.assertEqual(
            lo, [],
            f"{len(lo)}/{len(TAGS)} nhãn in nguyên khóa vào câu xác nhận: {lo[:5]}")

    def test_khong_ca_mot_luot_nao_lo(self):
        lo = []
        for c in _doc("cases.json", "cases"):
            rep = answer.respond(understand(c["question"], ITEMS), ITEMS)
            for m in NHAN_KHOA_TRONG_TEXT.findall(rep.text):
                lo.append(f'{c["id"]} «{m}» nhánh={rep.branch}')
        self.assertEqual(lo, [], f"{len(lo)} ca lộ khóa nhãn: {lo[:5]}")

    def test_khong_luot_phien_nao_lo(self):
        """Chiều mà tập một lượt KHÔNG với tới được.

        Câu xác nhận "đã bỏ điều kiện …" chỉ sinh ra sau khi bộ nhớ mang một ràng buộc kế thừa và
        khách đồng ý bỏ nó. Một lượt rời không bao giờ tới được trạng thái đó.
        """
        lo = []
        for kb in _doc("session_scripts.json", "scripts"):
            st = S.SessionState()
            for luot in kb["turns"]:
                req = S.merge_into_request(understand(luot["user"], ITEMS), st)
                rep = answer.respond(req, ITEMS)
                st = S.update_state(st, req, list(rep.items), rep.kind, rep.branch)
                for m in NHAN_KHOA_TRONG_TEXT.findall(rep.text):
                    lo.append(f'{kb["id"]} · "{luot["user"][:34]}" «{m}»')
        self.assertEqual(lo, [], f"{len(lo)} lượt lộ khóa nhãn: {lo[:5]}")


if __name__ == "__main__":
    unittest.main()
