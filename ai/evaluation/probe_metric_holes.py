# -*- coding: utf-8 -*-
"""Dò lỗ trong thước đo — chạy các câu trả lời vô nghĩa trên toàn bộ tập ca.

Vì sao cần
----------
Bản cũ có một lỗ đúng loại này: câu trả lời **rỗng** được tính là "dùng được", vì không
dẫn món nào thì không vi phạm ràng buộc nào. Lỗ đó làm lần đo hiệu quả phương pháp đầu
tiên báo cả 5 đường xử lý là vô giá trị. Khi bịt lại, số nền tụt từ 0,9960 xuống 0,7368 —
tức con số cũ gần như hoàn toàn là ảo.

Test đơn lẻ không tìm ra lỗ kiểu này, vì nó chỉ kiểm những chỗ người viết đã nghĩ tới.
Bộ dò này làm việc khác: đưa vào những câu trả lời **chắc chắn tệ**, rồi đòi thước đo phải
đánh đỏ hầu hết. Ca nào một câu trả lời tệ vẫn qua được thì đó là một lỗ, và nó được nêu
tên cụ thể để xét chứ không bị làm tròn thành một tỷ lệ.

    python ai/evaluation/probe_metric_holes.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from answer_metric import Answer, score

REPO_ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
MENU = json.loads(
    (REPO_ROOT / "data" / "menu-dataset.json").read_text(encoding="utf-8-sig")
)
DATA = json.loads((HERE / "cases.json").read_text(encoding="utf-8-sig"))
CASES = DATA["cases"]
NAMED = DATA["named_selectors"]
ITEMS = MENU["items"]


def strategy_empty(case: dict) -> Answer:
    return Answer(text="", items=[], kind=case["expect"]["kind"])


def strategy_deflect(case: dict) -> Answer:
    return Answer(
        text="Bạn muốn gì ạ?", items=[], kind=case["expect"]["kind"], asks_back=True
    )


def strategy_echo(case: dict) -> Answer:
    return Answer(text=case["question"], items=[], kind=case["expect"]["kind"])


def strategy_spray(case: dict) -> Answer:
    """Nêu cả 91 món — bao gồm mọi món bị cấm, nên phải đỏ ở mọi ca có ràng buộc."""
    text = "Nhà hàng có: " + ", ".join(
        f"{m['name']} ({m['price']:,}đ)".replace(",", ".") for m in ITEMS
    )
    return Answer(
        text=text, items=[m["id"] for m in ITEMS], kind=case["expect"]["kind"]
    )


def strategy_no_data_always(case: dict) -> Answer:
    """Luôn nói chưa có dữ liệu. Đây là cách lách nguy hiểm nhất: nó an toàn tuyệt đối
    nhưng vô dụng, và bước 0 nói rõ 'câu bạn muốn gì?' không tính là trả lời."""
    return Answer(
        text="Mình chưa có dữ liệu về câu hỏi này. Bạn hỏi nhân viên giúp mình nhé.",
        items=[],
        kind="no_data",
    )


STRATEGIES = [
    ("rỗng", strategy_empty),
    ("hỏi lại vô nghĩa", strategy_deflect),
    ("nhắc lại câu hỏi", strategy_echo),
    ("nêu cả 91 món", strategy_spray),
    ("luôn nói chưa có dữ liệu", strategy_no_data_always),
]

# Ca mà một cách lách ĐƯỢC PHÉP qua — vì với ca đó nó là câu trả lời đúng.
# Ghi tên cụ thể chứ không đặt ngưỡng số, vì một ngưỡng thì không giải thích được.
EXPECTED_PASSES = {
    "hỏi lại vô nghĩa": set(),
    "luôn nói chưa có dữ liệu": {
        # 12 ca dạng no_data: đây đúng là câu trả lời đúng, không phải lách.
        c["id"] for c in CASES if c["expect"]["kind"] == "no_data"
    },
    "rỗng": set(),
    "nhắc lại câu hỏi": set(),
    "nêu cả 91 món": set(),
}


def main() -> int:
    print(f"{len(CASES)} ca, {len(STRATEGIES)} cách trả lời vô nghĩa\n")
    holes: list[str] = []
    for label, build in STRATEGIES:
        passed = []
        for case in CASES:
            verdict = score(case, build(case), MENU, NAMED)
            if verdict.passed:
                passed.append(case["id"])
        expected = EXPECTED_PASSES[label]
        unexpected = sorted(set(passed) - expected)
        missing = sorted(expected - set(passed))
        print(
            f"  {label:26} qua {len(passed):2}/{len(CASES)} ca "
            f"(được phép {len(expected)})"
        )
        for cid in unexpected:
            case = next(c for c in CASES if c["id"] == cid)
            holes.append(
                f"{label}: ca {cid} ({case['expect']['kind']}) qua được mà không nên"
            )
        for cid in missing:
            holes.append(
                f"{label}: ca {cid} lẽ ra phải qua được nhưng bị đánh đỏ — "
                "thước đo có thể đang bịa lỗi"
            )

    if holes:
        print(f"\nLỖ TRONG THƯỚC ĐO ({len(holes)}):")
        for line in holes:
            print(f"  - {line}")
        return 1
    print("\nKhông có lỗ: mọi cách trả lời vô nghĩa đều bị bắt, và không ca nào bị bịa lỗi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
