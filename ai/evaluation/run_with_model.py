# -*- coding: utf-8 -*-
"""Đo mô hình sinh thêm được gì, và có phá gì không.

Hai câu hỏi, và câu thứ hai quan trọng hơn:

1. Mô hình có trả lời được những câu mã tất định không hiểu?
2. Mô hình có làm **tụt** ca nào đang đúng?

Câu 2 quan trọng hơn vì bản cũ chính là ví dụ: thêm cơ chế mà không đo phần bị phá. Nên
bộ này in ra cả hai chiều, và nêu **tên cụ thể** ca nào lên, ca nào xuống.

    python ai/evaluation/run_with_model.py              # toàn bộ 94 ca
    python ai/evaluation/run_with_model.py --no-cache   # gọi mô hình thật, không dùng cache
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))

from answer import respond                              # noqa: E402
from cart import build_cart                             # noqa: E402
from answer_metric import Answer, score                 # noqa: E402
from llm_understand import enrich, load_env             # noqa: E402
from understand import understand                       # noqa: E402

MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)
DATA = json.loads((HERE / "cases.json").read_text(encoding="utf-8-sig"))
SPLIT = json.loads((HERE / "split.json").read_text(encoding="utf-8-sig"))
CASES = DATA["cases"]
NAMED = DATA["named_selectors"]
ITEMS = MENU["items"]
# Bảng tra tên danh mục cho lý do thẻ giỏ. Đọc từ thực đơn, không viết cứng.
CATEGORY_NAMES = {c["categoryId"]: c["name"] for c in MENU.get("categories", [])}


def group_of(family: str) -> str:
    if family in SPLIT["gate_families"]:
        return "chốt"
    if family in SPLIT["dev_families"]:
        return "phát triển"
    return "niêm phong"


def run(case: dict, *, with_model: bool, env: dict, use_cache: bool):
    request = understand(case["question"], ITEMS)
    outcome = None
    if with_model:
        outcome = enrich(request, env, use_cache=use_cache)
    reply = respond(request, ITEMS)
    # Chấm CẢ thẻ giỏ, giống `run_baseline.py`. Bỏ ở đây thì bất biến giỏ hàng chỉ được đo ở chế
    # độ tất định — trong khi chế độ CÓ MÔ HÌNH mới là chỗ mô hình chèn nhãn vào `require_tags` và
    # `avoid_tags`, tức chỗ thẻ giỏ dễ lệch khỏi câu trả lời nhất. Chốt an toàn phải giữ ở CẢ HAI
    # chế độ, nên nó phải được đo ở cả hai.
    by_id = {i["id"]: i for i in ITEMS}
    chosen = [by_id[i] for i in reply.items if i in by_id]
    cart = [a.to_payload() for a in
            build_cart(request, chosen, reply.branch, reply.kind, CATEGORY_NAMES)]
    verdict = score(
        case,
        Answer(text=reply.text, items=reply.items, kind=reply.kind,
               asks_back=reply.asks_back, cart=cart),
        MENU,
        NAMED,
    )
    return reply, verdict, outcome


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-cache", action="store_true",
                        help="Gọi mô hình thật thay vì dùng cache.")
    args = parser.parse_args(argv)
    env = load_env()
    use_cache = not args.no_cache

    before: dict[str, bool] = {}
    after: dict[str, bool] = {}
    unsafe_before: set[str] = set()
    unsafe_after: set[str] = set()
    calls = 0
    call_ms = 0
    dropped_keys: list[str] = []

    for case in CASES:
        _reply, verdict, _ = run(case, with_model=False, env=env, use_cache=use_cache)
        before[case["id"]] = verdict.passed
        if verdict.safety_failed:
            unsafe_before.add(case["id"])

    for case in CASES:
        _reply, verdict, outcome = run(case, with_model=True, env=env, use_cache=use_cache)
        after[case["id"]] = verdict.passed
        if verdict.safety_failed:
            unsafe_after.add(case["id"])
        if outcome is not None and outcome.used:
            calls += 1
            call_ms += outcome.latency_ms
            dropped_keys.extend(outcome.dropped)

    total = len(CASES)
    n_before = sum(before.values())
    n_after = sum(after.values())
    gained = sorted(i for i in before if not before[i] and after[i])
    lost = sorted(i for i in before if before[i] and not after[i])

    print("MÔ HÌNH SINH — chỉ dùng để HIỂU câu hỏi, không dùng để CHỌN món\n")
    print(f"  không mô hình : {n_before}/{total}  ({n_before/total:.1%})")
    print(f"  có mô hình    : {n_after}/{total}  ({n_after/total:.1%})")
    print(f"  chênh         : {n_after - n_before:+d} ca")
    print(f"  số lần gọi    : {calls}/{total} ca "
          f"({calls/total:.0%} — chỉ gọi khi mã tất định chưa hiểu đủ)")
    if calls:
        print(f"  độ trễ trung bình mỗi lần gọi: {call_ms // calls} ms")

    print(f"\n  lỗi an toàn không mô hình : {len(unsafe_before)}")
    print(f"  lỗi an toàn có mô hình    : {len(unsafe_after)}")
    new_unsafe = sorted(unsafe_after - unsafe_before)
    if new_unsafe:
        print(f"  ** MÔ HÌNH GÂY LỖI AN TOÀN MỚI: {new_unsafe} **")

    if gained:
        print(f"\nCA MÔ HÌNH CỨU ĐƯỢC ({len(gained)}):")
        for cid in gained:
            case = next(c for c in CASES if c["id"] == cid)
            print(f"  {cid:20} [{group_of(case['family']):10}] {case['question'][:52]}")
    if lost:
        print(f"\nCA MÔ HÌNH LÀM TỤT ({len(lost)}) — quan trọng hơn cột trên:")
        for cid in lost:
            case = next(c for c in CASES if c["id"] == cid)
            _reply, verdict, _ = run(case, with_model=True, env=env, use_cache=use_cache)
            print(f"  {cid:20} {case['question'][:48]}")
            print(f"      -> {verdict.failures[0][:100]}")
    if not gained and not lost:
        print("\nMô hình không đổi kết quả ca nào.")

    if dropped_keys:
        uniq = sorted(set(dropped_keys))
        print(f"\nKhóa mô hình trả về bị BỎ ({len(uniq)} loại) — bịa hoặc sai vai:")
        for key in uniq[:12]:
            print(f"  {key}")

    # Chốt: mô hình không được gây lỗi an toàn mới, và không được làm tụt ca nào.
    return 1 if (new_unsafe or lost) else 0


if __name__ == "__main__":
    raise SystemExit(main())
