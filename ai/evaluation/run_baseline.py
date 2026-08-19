# -*- coding: utf-8 -*-
"""Chấm bộ trả lời tra bảng bằng thước đo bước 3 — số nền của cả dự án.

Con số này là mốc để mọi thứ về sau so vào. Nó có hai tính chất mà câu trả lời của mô
hình sinh không có: **đúng 100% về dữ liệu** và **giống nhau mọi lần chạy**.

Sàn để so: cách lách "luôn nói chưa có dữ liệu" qua được 12/80 ca. Bất cứ con số nào không
hơn hẳn 12/80 là chưa nói được gì.

    python ai/evaluation/run_baseline.py            # tập phát triển + chốt
    python ai/evaluation/run_baseline.py --all      # cả tập niêm phong
    python ai/evaluation/run_baseline.py --failures # in chi tiết ca đỏ
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))

from answer import respond                      # noqa: E402
from cart import build_cart                     # noqa: E402
from answer_metric import Answer, score         # noqa: E402
from understand import understand               # noqa: E402

MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)
DATA = json.loads((HERE / "cases.json").read_text(encoding="utf-8-sig"))
SPLIT = json.loads((HERE / "split.json").read_text(encoding="utf-8-sig"))
ITEMS = MENU["items"]


def group_of(family: str) -> str:
    if family in SPLIT["gate_families"]:
        return "chốt"
    if family in SPLIT["dev_families"]:
        return "phát triển"
    return "niêm phong"


# Bảng tra tên danh mục, dùng cho lý do thẻ giỏ. Đọc từ thực đơn chứ không viết cứng.
CATEGORY_NAMES = {c["categoryId"]: c["name"] for c in MENU.get("categories", [])}


def run_case(case: dict):
    request = understand(case["question"], ITEMS)
    reply = respond(request, ITEMS)
    # Sinh thẻ giỏ bằng ĐÚNG hàm dịch vụ thật dùng, và từ ĐÚNG danh sách món `respond()` đã chọn.
    # Gọi lại `build_cart` ở đây là cách duy nhất để 119 ca đo được thẻ giỏ — trước bản này
    # `cart.py` chỉ có test đơn vị của chính nó chứng minh, tức bất biến an toàn của một thành phần
    # khách BẤM VÀO được chốt bằng lời chứ không bằng tập ca.
    by_id = {i["id"]: i for i in ITEMS}
    chosen = [by_id[i] for i in reply.items if i in by_id]
    cart = [a.to_payload() for a in
            build_cart(request, chosen, reply.branch, reply.kind, CATEGORY_NAMES)]
    answer = Answer(
        text=reply.text, items=reply.items, kind=reply.kind, asks_back=reply.asks_back,
        cart=cart,
    )
    verdict = score(case, answer, MENU, DATA["named_selectors"])
    return request, reply, verdict


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Gồm cả tập niêm phong.")
    parser.add_argument("--failures", action="store_true", help="In chi tiết ca đỏ.")
    args = parser.parse_args(argv)

    cases = DATA["cases"]
    if not args.all:
        cases = [c for c in cases if group_of(c["family"]) != "niêm phong"]

    results = [(c, *run_case(c)) for c in cases]

    by_group: dict[str, list[bool]] = {}
    by_kind: dict[str, list[bool]] = {}
    by_branch: Counter = Counter()
    safety_fails: list[tuple[dict, object]] = []
    failures: list[tuple[dict, object, object]] = []

    for case, _request, reply, verdict in results:
        by_group.setdefault(group_of(case["family"]), []).append(verdict.passed)
        by_kind.setdefault(case["expect"]["kind"], []).append(verdict.passed)
        by_branch[reply.branch] += 1
        if verdict.safety_failed:
            safety_fails.append((case, verdict))
        if not verdict.passed:
            failures.append((case, reply, verdict))

    total = len(results)
    passed = sum(1 for _c, _r, _p, v in results if v.passed)
    # Sàn phải TÍNH, không được viết cứng. Bản đầu ghi "12/80" và con số đó lạc hậu ngay khi
    # tập ca đổi — đúng loại số cứng làm người đọc tin sai. Sàn là số ca mà cách lách "luôn
    # nói chưa có dữ liệu" qua được, tức số ca dạng `no_data`.
    floor = sum(1 for c in cases if c["expect"]["kind"] == "no_data")
    print(f"SỐ NỀN — trả lời chỉ bằng tra thực đơn, không dùng mô hình nào\n")
    print(f"  qua {passed}/{total} ca  ({passed / total:.1%})")
    print(
        f"  sàn để so: {floor}/{total} — cách lách 'luôn nói chưa có dữ liệu' qua được "
        f"bấy nhiêu ca\n"
    )

    print("theo nhóm:")
    for group in ("chốt", "phát triển", "niêm phong"):
        flags = by_group.get(group)
        if flags:
            print(f"  {group:12} {sum(flags):2}/{len(flags):2}  ({sum(flags)/len(flags):5.1%})")

    print("\ntheo dạng đáp án:")
    for kind, flags in sorted(by_kind.items()):
        print(f"  {kind:9} {sum(flags):2}/{len(flags):2}  ({sum(flags)/len(flags):5.1%})")

    print("\nnhánh nào trả lời (mỗi nhánh một việc, không chồng nhau):")
    for branch, count in by_branch.most_common():
        print(f"  {branch:26} {count:2} ca")

    if safety_fails:
        print(f"\nLỖI AN TOÀN ({len(safety_fails)}) — đây là chặn, không phải điểm trừ:")
        for case, verdict in safety_fails:
            print(f"  {case['id']}: {verdict.failures[0]}")

    if failures and args.failures:
        print(f"\nCHI TIẾT {len(failures)} CA ĐỎ:")
        for case, reply, verdict in failures:
            print(f"\n  {case['id']} [{case['expect']['kind']}] nhánh={reply.branch}")
            print(f"    hỏi     : {case['question']}")
            print(f"    trả lời : {reply.text[:150]}")
            for line in verdict.failures:
                print(f"    ĐỎ      : {line}")
    elif failures:
        print(f"\n{len(failures)} ca đỏ — chạy lại với --failures để xem chi tiết:")
        for case, reply, _verdict in failures:
            print(f"  {case['id']:22} [{case['expect']['kind']:8}] nhánh={reply.branch}")

    return 0 if not safety_fails else 1


if __name__ == "__main__":
    raise SystemExit(main())
