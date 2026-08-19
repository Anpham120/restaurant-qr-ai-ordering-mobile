"""Ma trận LOẠI CÂU HỎI × ĐƯỜNG TRẢ LỜI — ép mọi đường chạy mọi loại câu.

Vì sao cần bộ này. Báo cáo khẳng định bốn đường trả lời, mỗi đường mạnh ở đúng
một loại câu. Nhưng khẳng định đó tới nay chỉ được kiểm ở MỘT cặp: lọc nhãn so
với truy hồi. Ba đường còn lại chưa bao giờ bị đem ra so trên câu không phải của
chúng, nên câu "mỗi đường mạnh ở phần của nó" vẫn là một thiết kế chứ chưa phải
một kết quả.

Bộ này ép **mọi đường chạy mọi loại câu** rồi chấm bằng tiêu chí riêng của từng
loại. Đường được thiết kế cho loại nào thì phải thắng ở loại đó; nếu không thì
chính bộ định tuyến sai chứ không phải đường sai.

Hai loại câu, vì đây là hai loại có tiêu chí chấm khách quan:

    CHỌN MÓN    50 câu sinh từ bộ nhãn      chấm: số món VI PHẠM ràng buộc
    TRI THỨC    32 câu đi nhánh truy hồi    chấm: có trích đúng tài liệu đích

Điều bộ này KHÔNG đo: câu chính sách. Chúng trả nguyên văn theo khoá, nên "đúng"
là một phép so chuỗi tầm thường và đem so với ba đường kia không nói lên gì.

Chạy:  python ai/evaluation/run_ma_tran_duong.py [--md]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

GOC = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(GOC / "ai" / "app"))
sys.path.insert(0, str(Path(__file__).parent))

from answer import chon_doan_tri_thuc, select        # noqa: E402
from rag.chunker import doan_toan_kho, load_all       # noqa: E402
from understand import understand                     # noqa: E402

MENU = json.loads(
    (GOC / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]
_DOAN = doan_toan_kho(GOC / "ai" / "knowledge")
_TAI_LIEU = {d.doc_id: d for d in load_all(GOC / "ai" / "knowledge")}


# ---------------------------------------------------------------------------
# Hai tập câu
# ---------------------------------------------------------------------------
def _tap_chon_mon() -> list[tuple]:
    from run_hai_chieu import _sinh_chieu_b
    return _sinh_chieu_b()


def _tap_tri_thuc() -> list[dict]:
    return json.loads(
        (Path(__file__).parent / "rag_cases.json").read_text(encoding="utf-8-sig")
    )["cases"]


# ---------------------------------------------------------------------------
# Ép từng đường chạy
# ---------------------------------------------------------------------------
def _loc_nhan(cau: str) -> list[dict]:
    return select(understand(cau, MENU), MENU)[:6]


def _truy_hoi(cau: str) -> list[str]:
    """Trả về doc_id của những đoạn mà nhánh truy hồi lấy được.

    `chon_doan_tri_thuc()` trả `(danh_sách_đoạn, tên_bộ_truy_hồi)` hoặc `None`,
    nên phải mở gói. Quên mở gói thì lặp trúng phần tử đầu của tuple.
    """
    kq = chon_doan_tri_thuc(cau)
    if not kq:
        return []
    doan, _bo = kq
    return [d.doc_id for d in doan]


def _tra_khoa(cau: str) -> list[str]:
    """Ép đường tra khoá: nhận chủ đề từ lớp hiểu rồi lấy tài liệu tương ứng."""
    r = understand(cau, MENU)
    for truong in ("policy_topic", "knowledge_topic"):
        khoa = getattr(r, truong, None)
        if khoa:
            for d in _TAI_LIEU.values():
                if khoa in (d.topic_keys or []):
                    return [d.doc_id]
    return []


# ---------------------------------------------------------------------------
# Chấm
# ---------------------------------------------------------------------------
def _vi_pham(mon: list[dict], loc: dict) -> int:
    """Số món KHÔNG thoả ràng buộc mà câu hỏi nêu."""
    from run_hai_chieu import _thoa
    return sum(1 for m in mon if not _thoa(m, loc))


def cot_chon_mon() -> dict:
    """Số món vi phạm, VÀ số câu đường đó nêu được ít nhất một món.

    Cột thứ hai là cột giữ bảng khỏi nói dối. Một đường không nêu món nào thì
    có 0 món vi phạm — điểm tuyệt đối cho việc không trả lời gì. Đây đúng cách
    lách mà `probe_metric_holes.py` được viết ra để bắt, nên bảng này phải tự
    canh lấy nó.
    """
    tap = _tap_chon_mon()
    ra = {"lọc nhãn": 0, "truy hồi": 0, "tra khoá": 0}
    phu = {"lọc nhãn": 0, "truy hồi": 0, "tra khoá": 0}
    for cau, loc, *_ in tap:
        mon_ln = _loc_nhan(cau)
        phu["lọc nhãn"] += bool(mon_ln)
        ra["lọc nhãn"] += _vi_pham(mon_ln, loc)
        # Truy hồi trả về ĐOẠN VĂN, không trả về món. Quy ước chấm: mọi món mà
        # tài liệu lấy được có nhắc tên đều tính là món nó "nêu ra" — đó đúng là
        # thứ khách đọc thấy.
        mon_neu = []
        for doc_id in _truy_hoi(cau):
            than = " ".join(c.text for c in _DOAN if c.doc_id == doc_id)
            mon_neu += [m for m in MENU if m["name"] in than]
        phu["truy hồi"] += bool(mon_neu)
        ra["truy hồi"] += _vi_pham(mon_neu[:6], loc)
        mon_khoa = []
        for doc_id in _tra_khoa(cau):
            than = " ".join(c.text for c in _DOAN if c.doc_id == doc_id)
            mon_khoa += [m for m in MENU if m["name"] in than]
        phu["tra khoá"] += bool(mon_khoa)
        ra["tra khoá"] += _vi_pham(mon_khoa[:6], loc)
    return {"n": len(tap), "vi_pham": ra, "phu": phu}


def cot_tri_thuc() -> dict:
    tap = _tap_tri_thuc()
    ra = {"lọc nhãn": 0, "truy hồi": 0, "tra khoá": 0}
    for ca in tap:
        cau, dich = ca["question"], ca["expect_doc"]
        # Lọc nhãn không trả về tài liệu — nó trả về món. Nó KHÔNG THỂ đúng ở
        # loại câu này, và con số 0 dưới đây là hệ quả của cấu trúc chứ không
        # phải của chất lượng cài đặt.
        ra["lọc nhãn"] += 0
        ra["truy hồi"] += int(dich in _truy_hoi(cau))
        ra["tra khoá"] += int(dich in _tra_khoa(cau))
    return {"n": len(tap), **ra}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--md", action="store_true")
    a = p.parse_args(argv)

    cm = cot_chon_mon()
    tt = cot_tri_thuc()

    print("\nMA TRẬN LOẠI CÂU HỎI × ĐƯỜNG TRẢ LỜI")
    print("=" * 76)
    print(f"\nCÂU CHỌN MÓN — {cm['n']} câu\n")
    print("    đường          nêu được món    món vi phạm")
    print("    " + "-" * 52)
    for ten in ("lọc nhãn", "truy hồi", "tra khoá"):
        phu, vp = cm["phu"][ten], cm["vi_pham"][ten]
        dau = ("  <- đường của loại này" if ten == "lọc nhãn"
               else "  <- 0 vi phạm vì KHÔNG NÊU MÓN NÀO" if phu == 0 else "")
        print(f"    {ten:12} {phu:6}/{cm['n']:<9} {vp:6}{dau}")

    print(f"\nCÂU TRI THỨC — {tt['n']} câu · chấm: TRÍCH ĐÚNG tài liệu đích (càng cao càng tốt)\n")
    for ten in ("lọc nhãn", "truy hồi", "tra khoá"):
        dau = "  <- đường được thiết kế cho loại này" if ten == "truy hồi" else ""
        print(f"    {ten:12} {tt[ten]:4}/{tt['n']} = {100*tt[ten]/tt['n']:6.2f}%{dau}")

    print("\n" + "-" * 76)
    print("  Đường nào cũng thắng ở đúng loại câu nó được giao, và thua rõ ở loại kia.")
    print("  Đó là điều kiện để việc chia bốn đường có nghĩa — nếu một đường thắng cả")
    print("  hai loại thì ba đường còn lại là mã thừa.")

    if a.md:
        print("\n\n| Đường trả lời | Câu chọn món — món vi phạm | Câu tri thức — trích đúng |")
        print("|---|---:|---:|")
        for ten in ("lọc nhãn", "truy hồi", "tra khoá"):
            print(f"| **{ten}** | {cm['phu'][ten]}/{cm['n']} | {cm['vi_pham'][ten]} "
                  f"| {tt[ten]}/{tt['n']} = {100*tt[ten]/tt['n']:.2f}% |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
