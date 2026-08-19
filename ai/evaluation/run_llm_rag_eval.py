# -*- coding: utf-8 -*-
"""Gọi LLM+RAG THẬT và đo hiệu quả — so với chính đường tất định trên cùng tập ca.

    python ai/evaluation/run_llm_rag_eval.py
    python ai/evaluation/run_llm_rag_eval.py --gioi-han 20
    python ai/evaluation/run_llm_rag_eval.py --chi-tiet

Câu hỏi bộ này trả lời
----------------------
Đề bài yêu cầu một hệ thống LLM+RAG, và nó yêu cầu **gọi thật để đánh giá hiệu quả**. Nên câu hỏi
không phải "câu sinh có hay hơn không" — thước đo không đo được sự hay. Câu hỏi đo được là ba cái:

    1. Câu sinh có GIỮ được ca xanh không?        so `pass` trước và sau
    2. Lớp xác minh CHẶN bao nhiêu, và vì gì?     đếm theo loại vi phạm
    3. Giá phải trả là bao nhiêu?                 độ trễ p50/p95

Điều một tập ca KHÔNG đo được, nói trước
----------------------------------------
Thước đo `answer_metric` chấm **nội dung**: món nêu ra có đúng ràng buộc, giá có đúng, có nhắc nhân
viên. Nó không chấm câu văn có tự nhiên hơn. Nên nếu câu sinh giữ nguyên 100% ca xanh thì kết luận
đúng là "câu sinh KHÔNG làm tụt", **không** phải "câu sinh tốt hơn".

Muốn nói câu sinh tốt hơn thì cần người đọc chấm, và dự án này không có tập chấm bằng người. Ghi ra
chứ không lấp bằng một con số nghe hay.

Vì sao chỉ chạy trên tập con
----------------------------
Đường sinh chỉ bật cho nhánh `filter` và `compare` — loại C của đề bài. Ca thuộc nhánh khác không
gọi mô hình, nên đưa chúng vào phép đo chỉ làm loãng tỷ lệ. Bộ này lọc đúng tập con đó và IN RA số
ca bị loại cùng lý do, thay vì im lặng chạy trên 140 ca rồi báo một tỷ lệ pha.
"""
from __future__ import annotations

import argparse
import json
import datetime
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))
sys.path.insert(0, str(HERE))

from answer import doan_tri_thuc_lien_quan, respond  # noqa: E402
from answer_metric import Answer, score  # noqa: E402
from cart import build_cart  # noqa: E402
from generate import BRANCHES_ALLOWED, write_reply  # noqa: E402
import results  # noqa: E402
from llm_understand import load_env  # noqa: E402
from understand import understand  # noqa: E402

MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"


def load_menu() -> tuple[list[dict], dict[str, str]]:
    data = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    return data["items"], {c["categoryId"]: c["name"] for c in data.get("categories", [])}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--gioi-han", type=int, default=0, help="chỉ chạy N ca đầu (để thử nhanh)")
    p.add_argument("--chi-tiet", action="store_true", help="in từng ca")
    args = p.parse_args(argv)

    items, cat_names = load_menu()
    env = load_env()
    if not (env.get("LLM_BASE_URL") and env.get("LLM_API_KEY") and env.get("LLM_MODEL")):
        print("KHÔNG có cấu hình mô hình (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL).")
        print("  Bộ này gọi mô hình THẬT nên nó không chạy được mà không có cấu hình.")
        print("  Đây là trạng thái bình thường ở CI: `ai/.env` chứa khóa nên bị gitignore.")
        return 2

    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    data = json.loads((HERE / "cases.json").read_text(encoding="utf-8-sig"))
    cases = data["cases"]
    named = data["named_selectors"]

    # Lọc tập con loại C, và ĐẾM ca bị loại theo nhánh — không im lặng.
    thuoc: list[tuple[dict, object, object]] = []
    loai_bo: Counter[str] = Counter()
    for case in cases:
        req = understand(case["question"], items)
        rep = respond(req, items)
        if rep.branch in BRANCHES_ALLOWED:
            thuoc.append((case, req, rep))
        else:
            loai_bo[rep.branch] += 1
    if args.gioi_han:
        thuoc = thuoc[: args.gioi_han]

    print(f"LLM+RAG THẬT — mô hình {env['LLM_MODEL']}")
    print(f"  {len(thuoc)} ca thuộc loại C (nhánh {sorted(BRANCHES_ALLOWED)})")
    print(f"  {sum(loai_bo.values())} ca bị loại vì nhánh khác:")
    for nhanh, n in loai_bo.most_common():
        print(f"      {nhanh:34} {n}")
    print()

    by_id = {m["id"]: m for m in items}
    dat_truoc = dat_sau = 0
    sinh_dung = 0
    chan: Counter[str] = Counter()
    khong_goi = 0
    tre: list[float] = []
    tut: list[str] = []

    for case, req, rep in thuoc:
        chosen = [by_id[i] for i in rep.items if i in by_id]
        cart = [a.to_payload() for a in
                build_cart(req, chosen, rep.branch, rep.kind, cat_names)]

        truoc = score(case, Answer(text=rep.text, items=rep.items, kind=rep.kind,
                                   asks_back=rep.asks_back, cart=cart), menu, named)
        dat_truoc += 1 if truoc.passed else 0

        tri_thuc = ""
        tim = doan_tri_thuc_lien_quan(case["question"])
        if tim:
            tri_thuc = tim[0]

        t0 = time.perf_counter()
        gen = write_reply(req, chosen, items, rep.branch, env, knowledge=tri_thuc)
        tre.append((time.perf_counter() - t0) * 1000)

        if not gen.called:
            khong_goi += 1
        if gen.text:
            sinh_dung += 1
            sau = score(case, Answer(text=gen.text, items=rep.items, kind=rep.kind,
                                     asks_back=rep.asks_back, cart=cart), menu, named)
        else:
            # Bị chặn hoặc mô hình không trả lời được -> dùng lại câu khuôn mẫu, nên điểm giữ nguyên.
            for v in gen.violations or [gen.reason]:
                chan[v.split(":")[0][:44]] += 1
            sau = truoc
        dat_sau += 1 if sau.passed else 0
        if truoc.passed and not sau.passed:
            tut.append(case["id"])

        if args.chi_tiet:
            trang = "SINH" if gen.text else f"khuôn ({gen.reason})"
            print(f"  {case['id']:22} {trang}")
            if gen.text:
                print(f"      {gen.text[:150]}")
            for v in gen.violations:
                print(f"      chặn: {v}")

    n = len(thuoc)
    if not n:
        print("Không ca nào thuộc loại C — không đo được gì.")
        return 1

    print(f"\n1. CÂU SINH CÓ GIỮ CA XANH KHÔNG")
    print(f"   đường tất định : {dat_truoc}/{n}")
    print(f"   có đường sinh  : {dat_sau}/{n}")
    if tut:
        print(f"   TỤT {len(tut)} ca: {tut}")
    else:
        print("   không ca nào tụt — nhưng đây là 'KHÔNG LÀM TỤT', không phải 'tốt hơn':")
        print("   thước đo chấm nội dung, nó không chấm câu văn tự nhiên hơn.")

    print(f"\n2. LỚP XÁC MINH")
    print(f"   câu sinh được DÙNG  : {sinh_dung}/{n}  ({sinh_dung / n * 100:.0f}%)")
    print(f"   lùi về khuôn mẫu    : {n - sinh_dung}/{n}")
    if khong_goi:
        print(f"   không gọi mô hình   : {khong_goi} (nhánh không cho sinh, hoặc không có món)")
    if chan:
        print("   lý do bị chặn / lùi:")
        for ly_do, so in chan.most_common():
            print(f"      {so:3}  {ly_do}")

    print(f"\n3. GIÁ PHẢI TRẢ")
    print(f"   độ trễ mỗi câu: p50 {statistics.median(tre):.0f} ms, "
          f"p95 {sorted(tre)[int(len(tre) * 0.95) - 1]:.0f} ms, "
          f"tổng {sum(tre) / 1000:.1f} s cho {n} ca")

    # Ghi ra tệp: phép đo này cần `LLM_API_KEY` thật và mỗi lần chạy tốn tiền, nên notebook không
    # tính lại được và phải đọc số từ đây. Xem docstring của `results.py`.
    #
    # Ghi cả khi có ca TỤT — lần chạy có ca tụt là lần cần phân tích nhất, và `ca_tut` dưới đây là
    # dữ liệu của mục "case sai không sửa được nữa".
    if not args.gioi_han:
        duong = results.ghi(
            "llm_rag_loai_c",
            {
                "ca": n,
                "dat_tat_dinh": dat_truoc,
                "dat_co_duong_sinh": dat_sau,
                "ca_tut": tut,
                "cau_sinh_duoc_dung": sinh_dung,
                "lui_ve_khuon_mau": n - sinh_dung,
                "ly_do_chan": dict(chan),
                "tre_p50_ms": round(statistics.median(tre)),
                "tre_p95_ms": round(sorted(tre)[int(len(tre) * 0.95) - 1]),
            },
            {
                "ngay": datetime.date.today().isoformat(),
                "mo_hinh": env["LLM_MODEL"],
                "base_url": env["LLM_BASE_URL"],
            },
        )
        print(f"\n   đã ghi {duong.name}")

    # Mã thoát khác 0 khi có ca TỤT. Đó là điều duy nhất ở đây đủ nghiêm để chặn.
    return 1 if tut else 0


if __name__ == "__main__":
    sys.exit(main())
