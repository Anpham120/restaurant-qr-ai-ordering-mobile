"""Đo NHÁNH TRUY HỒI qua đúng đường sản phẩm, không gọi thẳng bộ xếp hạng.

Vì sao cần bộ này. Bốn tập đánh giá đang có đều KHÔNG chạm tới nhánh truy hồi
toàn kho: 147 ca trả lời và 163 lượt phiên đi 0 lượt qua nó, còn 114 ca truy hồi
thì gọi thẳng `search()` nên chúng đo BỘ XẾP HẠNG chứ không đo HỆ THỐNG. Hệ quả:
đường tri thức là đường duy nhất của hệ thống chưa có tập ca cam kết nào phủ,
và mọi con số về nó tới nay đều đến từ bộ chạy phân tích chứ không từ một tập
có khoá đáp án.

Bộ này lấp đúng chỗ đó. Nó gọi `respond(understand(câu, MENU), MENU)` — cùng
hàm mà dịch vụ HTTP gọi — rồi chấm ba điều:

    ĐI ĐÚNG NHÁNH   câu phải rơi vào `knowledge_corpus`, không bị nhánh lọc nuốt
    TRÍCH ĐÚNG KHO  chữ trả về phải khớp tài liệu đích
    KHÔNG CHẠM CẤM  chữ trả về không được lấy từ tài liệu bị cấm của ca đó

Chỉ số thứ ba là chỉ số an toàn của bộ này. Một câu trả lời trích đúng tài liệu
nhưng kèm một đoạn lạc chủ đề vẫn là câu trả lời khách đọc nhầm được.

Chạy:  python ai/evaluation/run_rag_eval.py [--md] [--csv]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

GOC = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(GOC / "ai" / "app"))

from answer import respond            # noqa: E402
from rag.chunker import doan_toan_kho  # noqa: E402
from understand import understand      # noqa: E402

MENU = json.loads(
    (GOC / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)["items"]
CA = json.loads(
    (Path(__file__).parent / "rag_cases.json").read_text(encoding="utf-8-sig")
)["cases"]

# Chữ của từng tài liệu, để biết câu trả lời trích từ đâu. Dùng đoạn thật của
# kho chứ không dùng tiêu đề: tiêu đề trùng nhau giữa vài tài liệu, còn thân
# đoạn thì không.
_DOAN = doan_toan_kho(GOC / "ai" / "knowledge")


def _tai_lieu_cua(chu: str) -> set[str]:
    """Những tài liệu mà câu trả lời có trích chữ từ đó.

    So bằng cách tìm một mẩu liên tục đủ dài của đoạn trong câu trả lời. Mẩu 40
    ký tự đủ dài để không trùng ngẫu nhiên, và đủ ngắn để vẫn khớp khi lớp trình
    bày đã cắt bớt đầu đuôi đoạn.
    """
    thay = set()
    for c in _DOAN:
        than = " ".join(c.text.split())
        if len(than) < 40:
            continue
        for i in range(0, max(len(than) - 40, 1), 30):
            if than[i:i + 40] in chu:
                thay.add(c.doc_id)
                break
    return thay


def chay() -> list[dict]:
    ra = []
    for ca in CA:
        rep = respond(understand(ca["question"], MENU), MENU)
        chu = " ".join((rep.text or "").split())
        lay = _tai_lieu_cua(chu)

        # Nhánh mang tên bộ truy hồi ở hậu tố (`knowledge_corpus:embedding`),
        # nên phải so bằng tiền tố. So bằng `==` thì không ca nào khớp, và bộ
        # đo báo 0/50 trong khi hệ thống chạy đúng — đã mắc đúng lỗi đó một lần.
        dung_nhanh = rep.branch.startswith("knowledge_corpus:")
        dich = ca["expect_doc"]
        trung = dich in lay
        cam = sorted(lay & set(ca.get("forbid_docs", [])))

        ra.append({
            "id": ca["id"],
            "question": ca["question"],
            "branch": rep.branch,
            "dung_nhanh": dung_nhanh,
            "expect_doc": dich,
            "trung": trung,
            "cham_cam": cam,
            "dat": dung_nhanh and trung and not cam,
        })
    return ra


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--md", action="store_true", help="in bảng markdown cho báo cáo")
    p.add_argument("--csv", action="store_true", help="ghi rag_cases.csv")
    a = p.parse_args(argv)

    kq = chay()
    n = len(kq)
    nhanh = sum(k["dung_nhanh"] for k in kq)
    trung = sum(k["trung"] for k in kq)
    cam = sum(bool(k["cham_cam"]) for k in kq)
    dat = sum(k["dat"] for k in kq)

    print(f"\nNHÁNH TRUY HỒI QUA ĐƯỜNG SẢN PHẨM — {n} ca")
    print("=" * 74)
    print(f"  đi đúng nhánh `knowledge_corpus`   {nhanh:3}/{n}  = {100*nhanh/n:6.2f}%")
    print(f"  trích đúng tài liệu đích           {trung:3}/{n}  = {100*trung/n:6.2f}%")
    print(f"  CHẠM tài liệu bị cấm               {cam:3}/{n}  = {100*cam/n:6.2f}%   <- càng thấp càng tốt")
    print(f"  ĐẠT cả ba điều kiện                {dat:3}/{n}  = {100*dat/n:6.2f}%")

    hong = [k for k in kq if not k["dat"]]
    if hong:
        print(f"\n  {len(hong)} ca chưa đạt:\n")
        for k in hong:
            ly_do = ("đi nhánh `%s`" % k["branch"] if not k["dung_nhanh"]
                     else "chạm cấm %s" % k["cham_cam"] if k["cham_cam"]
                     else "không trích được `%s`" % k["expect_doc"])
            print(f'    {k["id"]:14} "{k["question"][:50]}"')
            print(f'    {"":14}  {ly_do}')

    if a.md:
        print("\n\n| Ca | Câu hỏi | Nhánh | Trích đúng | Chạm cấm |")
        print("|---|---|---|:---:|:---:|")
        for k in kq:
            print(f'| `{k["id"]}` | *"{k["question"]}"* | `{k["branch"]}` | '
                  f'{"đúng" if k["trung"] else "**trượt**"} | '
                  f'{"—" if not k["cham_cam"] else "**" + ", ".join(k["cham_cam"]) + "**"} |')

    if a.csv:
        import csv
        d = Path(__file__).parent / "measurements" / "rag_cases.csv"
        d.parent.mkdir(exist_ok=True)
        with d.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(kq[0]))
            w.writeheader()
            for k in kq:
                w.writerow({**k, "cham_cam": " ".join(k["cham_cam"])})
        print(f"\nđã ghi {d}")

    # Chạm tài liệu cấm là lỗi CHẶN: câu trả lời dẫn khách sang chủ đề khác mà
    # vẫn trông như một câu trả lời đúng. Trượt đích thì chỉ là kém.
    return 1 if cam else 0


if __name__ == "__main__":
    raise SystemExit(main())
