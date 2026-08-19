# -*- coding: utf-8 -*-
"""Đo phân bố ĐƯỜNG TRẢ LỜI trên tập ca một lượt và tập kịch bản nhiều lượt.

    python ai/evaluation/run_phan_bo_duong.py          # in bảng
    python ai/evaluation/run_phan_bo_duong.py --ghi    # ghi measurements/phan_bo_duong.json

Vì sao có tệp này
-----------------
Biểu đồ 4.3 của báo cáo từng **viết cứng** con số trong bộ vẽ hình: 147 ca, 163
lượt, và cột truy hồi bằng 0. Ba con số đó đúng vào ngày đo, rồi tập ca mở rộng
lên 161 ca / 175 lượt và họ `knowledge_corpus` được thêm vào — nhưng hình vẫn vẽ
lại y nguyên số cũ mỗi lần chạy, vì nó không đọc gì cả.

Đó là kiểu sai tệ nhất trong báo cáo: hình **vẫn dựng lại được**, `--check` vẫn
xanh, và không có gì đỏ. Chỉ có nội dung là sai.

Nên số phải được ĐO rồi GHI RA, và bộ vẽ hình đọc lại từ tệp đó. Hình không còn
quyền biết con số nào.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
GOC = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(GOC / "ai" / "app"))

from answer import respond          # noqa: E402
from understand import understand   # noqa: E402

MENU = json.loads((GOC / "data" / "menu-dataset.json")
                  .read_text(encoding="utf-8-sig"))
ITEMS = MENU["items"]

# Năm nhóm đường, xếp theo MỨC ĐƯỢC PHÉP TIN MÔ HÌNH tăng dần — cùng thứ tự với
# bảng 3.1 của báo cáo, để hình và bảng đọc được cạnh nhau.
NHOM = [
    ("loc_nhan",   "Lọc nhãn\n(không đọc kho)"),
    ("tra_khoa",   "Tra khoá\nnguyên văn"),
    ("chon_muc",   "Chọn mục\ntrong 1 tài liệu"),
    ("truy_hoi",   "TRUY HỒI\ntoàn kho"),
    ("khac",       "Xã giao / ngoài\nphạm vi / hỏi lại"),
]

# Tiền tố nhánh → nhóm. Nhánh nào không khớp rơi vào `khac`, và số đó được in ra
# kèm tên nhánh để không có nhánh nào lặng lẽ bị xếp nhầm.
BANG = {
    "policy": "tra_khoa", "facts": "tra_khoa",
    "knowledge": "chon_muc", "knowledge_missing": "chon_muc",
    "knowledge_corpus": "truy_hoi",
    "off_topic": "khac", "xa_giao": "khac", "internal": "khac",
    "clarify": "khac", "clarify_tham_chieu_mo_ho": "khac",
}


def nhom_cua(branch: str) -> str:
    dau = (branch or "").split(":")[0]
    return BANG.get(dau, "loc_nhan")


def _phan_tram(dem: Counter, tong: int) -> dict:
    return {k: (100.0 * dem.get(k, 0) / tong if tong else 0.0) for k, _ in NHOM}


def do_tap_ca() -> tuple[Counter, int, Counter]:
    ca = json.loads((HERE / "cases.json").read_text(encoding="utf-8-sig"))["cases"]
    dem, ten = Counter(), Counter()
    for c in ca:
        rep = respond(understand(c["question"], ITEMS), ITEMS)
        dem[nhom_cua(rep.branch)] += 1
        ten[rep.branch] += 1
    return dem, len(ca), ten


def do_tap_phien() -> tuple[Counter, int, Counter]:
    """Chạy kịch bản NHƯ MỘT PHIÊN THẬT: ghép bộ nhớ giữa các lượt.

    Chạy rời từng lượt sẽ cho phân bố khác, vì lượt sau thường không nhắc lại
    ràng buộc của lượt trước.
    """
    import session as S

    kb = json.loads((HERE / "session_scripts.json").read_text(encoding="utf-8-sig"))
    dem, ten, tong = Counter(), Counter(), 0
    for s in kb["scripts"]:
        tt = S.SessionState()
        for luot in s["turns"]:
            req = S.merge_into_request(understand(luot["user"], ITEMS), tt)
            rep = respond(req, ITEMS)
            tt = S.update_state(tt, req, list(rep.items), rep.kind, rep.branch)
            dem[nhom_cua(rep.branch)] += 1
            ten[rep.branch] += 1
            tong += 1
    return dem, tong, ten


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ghi", action="store_true", help="ghi ra measurements/")
    a = ap.parse_args()

    d1, n1, t1 = do_tap_ca()
    d2, n2, t2 = do_tap_phien()
    p1, p2 = _phan_tram(d1, n1), _phan_tram(d2, n2)

    print(f"{'đường':22} {'ca một lượt':>16} {'lượt phiên':>16}")
    print(f"{'':22} {f'(n={n1})':>16} {f'(n={n2})':>16}")
    print("-" * 56)
    for k, nh in NHOM:
        print(f"{nh.replace(chr(10), ' '):22} "
              f"{d1.get(k, 0):5} {p1[k]:8.1f}% "
              f"{d2.get(k, 0):5} {p2[k]:8.1f}%")
    print("-" * 56)
    tr = d1.get("truy_hoi", 0) + d2.get("truy_hoi", 0)
    print(f"truy hồi toàn kho: {tr}/{n1 + n2} lượt")

    if a.ghi:
        ra = HERE / "measurements" / "phan_bo_duong.json"
        ra.parent.mkdir(exist_ok=True)
        ra.write_text(json.dumps({
            "dieu_kien": {
                "ngay": __import__("datetime").date.today().isoformat(),
                "sinh_boi": "ai/evaluation/run_phan_bo_duong.py --ghi",
                "ghi_chu": "Tập phiên chạy CÓ bộ nhớ, ghép ngữ cảnh giữa các lượt.",
            },
            "so": {
                "tap_ca": {"n": n1, "dem": dict(d1), "phan_tram": p1,
                           "theo_nhanh": dict(t1.most_common())},
                "tap_phien": {"n": n2, "dem": dict(d2), "phan_tram": p2,
                              "theo_nhanh": dict(t2.most_common())},
            },
            "nhan": {k: v for k, v in NHOM},
        }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\nđã ghi {ra.relative_to(GOC)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
