# -*- coding: utf-8 -*-
"""KHAI DỊ ỨNG — hệ thống nhận ra bao nhiêu cách nói, và chênh lệch giữa hai tập nói lên gì.

    python ai/evaluation/run_khai_di_ung.py

Vì sao bộ này tồn tại
---------------------
Báo cáo nêu **0 lỗi an toàn** trên mọi tập đánh giá. Câu đó đúng, và nó che một chuyện: các tập
đánh giá dùng chính những cách nói mà hệ thống đã biết, vì **bộ đo và hệ thống cùng một tác giả**.

Rà 20 cách khai dị ứng hải sản viết ra ngoài mọi tập hiện có: chỉ **7/20 = 35,00%** được nhận ra.
Ba câu trong số bỏ sót dẫn tới việc mời món hải sản ở lượt sau.

Ba đường hỏng, và hai trong ba là ĐẢO NGHĨA chứ không phải bỏ sót
-----------------------------------------------------------------
    1. thiếu cụm      "tuyệt đối không có hải sản", "ăn vào là đi cấp cứu" — không cụm nào bắt
    2. đảo ở lớp ý định  "KHÔNG ăn được hải sản" khớp `an duoc hai san` của danh sách XÓA dị nguyên
    3. đảo ở khung phủ nhận  "KHÔNG ĐỤNG được" rút dấu thành `khong dung`, trùng "không ĐÚNG"

Đường 2 và 3 tệ hơn đường 1: bỏ sót thì ràng buộc không được ghi, còn đảo nghĩa thì ràng buộc
**đang có cũng bị xóa**.

Hai tập, và vì sao phải hai
---------------------------
`phat_trien` dùng để dò lỗi và thử từng cụm ứng viên. `niem_phong` viết CÙNG LÚC, không xem trong
lúc sửa, chạy đúng một lần sau khi chốt.

Chênh lệch giữa hai con số là phần trung thực nhất ở đây: nó đo mức mà một bản sửa **có vẻ** tốt
hơn nó thật sự tốt.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))
sys.path.insert(0, str(REPO_ROOT / "ai" / "evaluation"))

from understand import understand  # noqa: E402

CA = REPO_ROOT / "ai" / "evaluation" / "khai_di_ung_cases.json"
MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]


def nhan_ra(cau: str, nhan: str) -> bool:
    r = understand(cau, MENU)
    return nhan in r.avoid_tags or "allergen:shrimp" in r.avoid_tags


def main(argv: list[str] | None = None) -> int:
    from thong_ke import khoang_wilson

    d = json.loads(CA.read_text(encoding="utf-8"))
    nhan = d["nhan_dich"]

    print("=" * 78)
    print("NHẬN DIỆN KHAI DỊ ỨNG — hai tập, một tập niêm phong")
    print("=" * 78)

    ket = {}
    for bo in ("phat_trien", "niem_phong"):
        ds = d[bo]
        dung = [q for q in ds if nhan_ra(q, nhan)]
        sot = [q for q in ds if q not in dung]
        w = khoang_wilson(len(dung), len(ds))
        ket[bo] = w.ty_le
        print(f"\n  {bo:12} {len(dung):2}/{len(ds):<2} = {w.ty_le * 100:6.2f}%   "
              f"KTC {w.duoi * 100:.2f}–{w.tren * 100:.2f}%")
        for q in sot:
            print(f"       bỏ sót: {q}")

    chenh = (ket["phat_trien"] - ket["niem_phong"]) * 100
    print("\n  " + "-" * 70)
    print(f"  CHÊNH LỆCH phát triển − niêm phong: {chenh:+.2f} điểm")
    print()
    print("  Con số này là thứ đáng đọc nhất của bộ đo. Nó KHÔNG nói hệ thống tệ hơn báo cáo —")
    print("  nó nói một bản sửa đo trên chính tập dùng để tìm lỗi sẽ **có vẻ** tốt hơn bấy nhiêu.")
    print("  Mọi con số khác trong Chương 4 đều đo trên tập đã nhìn thấy, nên chúng chịu cùng")
    print("  chiều thổi phồng này — chỉ khác là ở đó không có tập niêm phong để đo ra.")
    print()
    print("  Tập niêm phong nay ĐÃ MỞ. Không sửa hệ thống theo 5 ca nó chỉ ra: làm vậy là biến nó")
    print("  thành tập phát triển thứ hai và mất luôn phép đo này.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
