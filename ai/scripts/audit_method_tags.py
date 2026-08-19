# -*- coding: utf-8 -*-
"""Soát nhãn CÁCH CHẾ BIẾN: tên món nói một đằng mà nhãn nói một nẻo thì chặn.

    python ai/scripts/audit_method_tags.py            # in kết quả
    python ai/scripts/audit_method_tags.py --check    # đỏ nếu còn món lệch

Vì sao cần
----------
`method` là nhóm nhãn duy nhất mà **tên món tự nói ra đáp án**: bếp đặt tên "Gà nướng muối ớt",
"Tôm rang muối", "Nghêu hấp sả" — cách chế biến nằm ngay trong tên. Nên đây là nhóm nhãn kiểm được
tự động mà không cần ai vào bếp.

Bộ soát này tìm ra một món gán sai thật: **"Gà rô ti kiểu Việt"** mang `method:grilled` (Nướng)
trong khi rô ti là **quay**. Thực đơn lúc đó không có giá trị "Quay", nên món ấy phải mượn một nhãn
khác — và cả "Nướng" lẫn "Rang" đều sai theo một hướng riêng. Hệ quả: câu "cho mình món nướng" trả
về một món quay, và tài liệu `ai/knowledge/derived/method-*.md` — vốn sinh từ chính bộ nhãn này —
đếm theo nhãn sai.

CHỈ ĐỌC TÊN MÓN, KHÔNG ĐỌC MÔ TẢ
--------------------------------
Đây là quyết định làm nên giá trị của bộ soát, và nó có số:

    đọc cả mô tả : 12 cảnh báo, **11 dương tính giả**
    chỉ đọc tên  :  1 cảnh báo, **0 dương tính giả**

Mô tả nhắc động từ của cả món ĂN KÈM: "Bánh xèo ... **cuốn** cùng rau sống trong bánh tráng" (món
là chiên), "Bún mắm ... heo **quay** giòn da" (heo quay là topping, món là nấu), "Cao lầu ... bánh
tráng **nướng** giòn". Không cách nào tách "động từ của món chính" khỏi "động từ của thứ ăn kèm"
bằng khớp chuỗi — nên đừng thử.

Tên món thì không có chỗ cho món ăn kèm. Đó là lý do một bộ soát HẸP lại dùng được, còn bộ soát
rộng thì phải tắt vì quá ồn — dự án này đã có một lần đúng như vậy: bản kiểm kê đụng chữ tĩnh báo
200+ cặp mà chỉ một cặp có thật, và một thước đo như vậy sẽ bị bỏ qua.

Điều bộ soát này KHÔNG làm
--------------------------
Không tự sửa dữ liệu. Nó chỉ nêu chỗ lệch; đổi nhãn thực đơn là việc phải qua migration (xem
`build_tag_migration.py`), vì cơ sở dữ liệu production giữ nhãn riêng và sửa tệp JSON không chạm
tới nó.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"
TAGS_PATH = REPO_ROOT / "data" / "menu-tags.json"

# Từ trong TÊN món -> giá trị nhãn `method` mong đợi.
#
# Một từ có thể trỏ tới nhiều giá trị (ví dụ "rang" và "rô ti" đều hợp lệ cho vài cách đặt tên), nên
# giá trị là TẬP. Món đạt khi nhãn của nó giao với tập ấy — không đòi khớp đúng một giá trị.
TU_TRONG_TEN: dict[str, set[str]] = {
    "nuong": {"grilled"},
    "quay": {"whole_roast"},
    "ro ti": {"whole_roast"},
    "rang": {"roasted", "stir_fried"},
    "hap": {"steamed"},
    "chien": {"fried"},
    "ran": {"fried"},
    "xao": {"stir_fried"},
    "rim": {"braised"},
    "luoc": {"boiled"},
    "ham": {"stewed"},
    "tiem": {"stewed"},
}


def fold(s: str) -> str:
    """Rút dấu. Cùng phép biến đổi với `understand.fold` — chép lại vì script không import app."""
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def co_tu(chuoi: str, tu: str) -> bool:
    """Khớp theo TỪ, không theo chuỗi con.

    Bản đầu của bộ soát khớp chuỗi con và tự dính đúng cái bẫy nó đi tìm: `vit` khớp "Việt", `de`
    khớp "đến", `kho` khớp "khổ qua". Đây là vụ va chạm rút dấu thứ mười trong dự án — lần này ở
    chính công cụ soát va chạm.
    """
    return re.search(rf"(?<![a-z]){re.escape(tu)}(?![a-z])", chuoi) is not None


def soat() -> list[str]:
    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    hop_le = {
        t["value"] for t in json.loads(TAGS_PATH.read_text(encoding="utf-8-sig"))["tags"].values()
        if t["group"] == "method"
    }

    # Bất biến của chính bộ soát: mọi giá trị nó mong đợi phải TỒN TẠI trong bộ nhãn. Thiếu thì nó
    # báo "sai nhãn" cho một nhãn không có cách nào gán — tức đòi một việc không làm được.
    thieu = sorted({v for tap in TU_TRONG_TEN.values() for v in tap} - hop_le)
    if thieu:
        return [f"BỘ SOÁT HỎNG: mong đợi giá trị không có trong bộ nhãn: {thieu}"]

    van_de: list[str] = []
    for m in menu["items"]:
        ten = fold(m["name"])
        co = {t.split(":", 1)[1] for t in m["tags"] if t.startswith("method:")}
        mong = set()
        for tu, tap in TU_TRONG_TEN.items():
            if co_tu(ten, tu):
                mong |= tap
        if mong and not (co & mong):
            van_de.append(
                f"{m['id']} {m['name']}: nhãn {sorted(co) or '(không có)'}, "
                f"nhưng TÊN món gợi ý {sorted(mong)}"
            )
    return van_de


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="trả mã khác 0 nếu còn món lệch")
    args = p.parse_args(argv)

    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    co_ten_che_bien = sum(
        1 for m in menu["items"] if any(co_tu(fold(m["name"]), t) for t in TU_TRONG_TEN)
    )
    van_de = soat()

    print("SOÁT NHÃN CÁCH CHẾ BIẾN — đối chiếu TÊN món với nhãn `method`\n")
    print(f"  món trong thực đơn        : {len(menu['items'])}")
    print(f"  món có từ chế biến trong tên: {co_ten_che_bien}")
    print(f"  món lệch                  : {len(van_de)}\n")

    for v in van_de:
        print(f"  - {v}")
    if not van_de:
        print("  Không món nào lệch.")

    print("\nGiới hạn: chỉ đọc TÊN món. Món không có từ chế biến trong tên thì bộ soát không nói")
    print("được gì — và đó là chủ ý, vì mô tả nhắc cả động từ của món ăn kèm.")
    return 1 if (args.check and van_de) else 0


if __name__ == "__main__":
    raise SystemExit(main())
