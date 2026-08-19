# -*- coding: utf-8 -*-
"""Rà nhãn dị nguyên: đối chiếu nhãn với phần mô tả món, cả năm loại.

Vì sao cần bản rà riêng
-----------------------
Nhãn dị nguyên chỉ phủ 44/91 món, và ở bước 1 việc đối chiếu nhãn với mô tả đã tìm ra
**bảy lỗ thật**. Nhưng lần đó tôi dùng một danh sách từ khóa ngắn và chính nó mắc ba lỗi:

- `ốc` khớp vào "cốc 330ml" (Bia hơi) — khớp chuỗi con thay vì biên từ;
- `cá` khớp vào "các loại rau" (Gỏi cuốn chay) — cùng lỗi;
- `bánh tráng` bị xếp vào gluten, nhưng bánh tráng làm từ **gạo**, không có lúa mì.

Nói cách khác: phép thử tìm lỗi dữ liệu lại mắc đúng lớp lỗi mà nó đi tìm. Nên bản rà này
làm ba việc bản trước không làm:

1. **Khớp theo biên từ**, không khớp chuỗi con.
2. **Bỏ qua câu phủ định** ("không hải sản", "không sữa") — Gỏi cuốn chay ghi rõ "Không
   thịt, không hải sản" nên nó đúng khi không mang nhãn.
3. **Ghi rõ vì sao mỗi từ khóa thuộc loại dị nguyên nào**, và tách riêng nhóm từ khóa
   *không* phải dị nguyên dù nghe giống, để lần sau không lặp lại lỗi `bánh tráng`.

Bản rà **không tự sửa dữ liệu**. Nó in ra danh sách để người đọc quyết định, vì gán nhãn
dị nguyên là việc ảnh hưởng sức khỏe và căn cứ duy nhất ở đây là câu giới thiệu món —
không phải kiểm tra bếp.

    python ai/scripts/audit_allergen_tags.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"

# Từ khóa cho từng loại dị nguyên. Cụm nhiều từ khớp nguyên cụm; từ đơn khớp theo biên từ.
SIGNS: dict[str, dict[str, str]] = {
    "seafood": {
        "tôm": "giáp xác",
        "mực": "nhuyễn thể",
        "cua": "giáp xác",
        "cá": "cá",
        "nghêu": "nhuyễn thể",
        "ngao": "nhuyễn thể",
        "sò": "nhuyễn thể",
        "ốc": "nhuyễn thể",
        "hàu": "nhuyễn thể",
        "bạch tuộc": "nhuyễn thể",
        "hải sản": "nói thẳng",
        "mắm tôm": "mắm từ tôm, đậm hơn nước mắm",
        "mắm nêm": "mắm từ cá",
        "mắm ruốc": "mắm từ ruốc (tôm nhỏ)",
        "cá cơm": "cá",
        "tôm sú": "giáp xác",
        "tôm hùm": "giáp xác",
        "cua gạch": "giáp xác",
    },
    "peanut": {
        "đậu phộng": "nói thẳng",
        "lạc": "tên miền Bắc của đậu phộng",
        "tương đậu phộng": "sốt từ đậu phộng",
    },
    "egg": {
        "trứng": "nói thẳng",
        "trứng cút": "trứng",
        "lòng đỏ": "trứng",
        "mayonnaise": "làm từ trứng",
        "flan": "bánh flan làm từ trứng và sữa",
    },
    "dairy": {
        "sữa": "nói thẳng",
        "phô mai": "sữa",
        "bơ": "bơ động vật là sản phẩm sữa",
        "kem tươi": "sữa",
        "trân châu": "trà sữa trân châu thường có sữa",
        "sữa đặc": "sữa",
        "bơ tỏi": "bơ động vật",
    },
    "gluten": {
        "bánh mì": "lúa mì",
        "bột mì": "lúa mì",
        "mì sợi": "lúa mì",
        "mì trứng": "lúa mì",
        "hoành thánh": "vỏ từ bột mì",
        "há cảo": "vỏ thường có bột mì",
        "chả cốm": "có bột mì",
        "nem rán": "vỏ nem và nhân thường có bột mì",
        "cao lầu": "sợi cao lầu có kiềm và bột mì",
    },
}

# Từ khóa NGHE GIỐNG dị nguyên nhưng không phải. Ghi ra để lần sau không lặp lại lỗi.
NOT_ALLERGENS = {
    "bánh tráng": "làm từ bột gạo, không có lúa mì",
    "bún": "bột gạo",
    "phở": "bột gạo",
    "hủ tiếu": "bột gạo",
    "bánh xèo": "bột gạo pha nghệ",
    "bánh cuốn": "bột gạo",
    "sữa hạt": "không phải sữa động vật",
    "bơ Đắk Lắk": "quả bơ, không phải bơ sữa",
    "kem": "'vàng kem' là màu/độ béo của sầu riêng, không phải kem sữa",
    "cốc": "'cốc 330ml' là đơn vị, không phải con ốc",
    "các": "'các loại rau' không phải cá",
}

# Câu phủ định: nếu mô tả nói rõ KHÔNG có thì đừng gắn nhãn.
NEGATIONS = (
    "không hải sản",
    "không thịt",
    "không trứng",
    "không sữa",
    "không đậu phộng",
    "không gluten",
    "không bột mì",
)


def word_tokens(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower(), flags=re.UNICODE))


def hits(text: str, signs: dict[str, str]) -> dict[str, str]:
    """Từ khóa khớp, theo biên từ với từ đơn và nguyên cụm với cụm nhiều từ."""
    low = text.lower()
    tokens = word_tokens(text)
    found: dict[str, str] = {}
    for word, reason in signs.items():
        if " " in word:
            if word in low:
                found[word] = reason
        elif word in tokens:
            found[word] = reason
    return found


def check_diet_consistency(items: list[dict]) -> list[str]:
    """Nhãn chế độ ăn có tự mâu thuẫn với nhãn dị nguyên không.

    Ba bất biến, và cả ba đều là chuyện an toàn chứ không phải chuyện sạch dữ liệu:

    1. **Thuần chay không được có sữa hay trứng.** Một món mang `diet:vegan` cùng
       `allergen:dairy` thì một trong hai nhãn sai, và khách ăn thuần chay tin nhãn đầu.
    2. **Thuần chay phải kéo theo chay.** Người ăn chay hỏi món chay mà một món thuần chay
       không mang nhãn `diet:vegetarian` thì nó bị bỏ sót khỏi câu trả lời.
    3. **Hai nhãn không được trùng hoàn toàn.** Hiện `diet:vegan` và `diet:vegetarian` gắn
       trên đúng cùng 17 món, nên một trong hai không phân biệt được gì. Với món chay Việt
       thì điều đó hợp lý (chay Phật giáo vốn không dùng sữa, trứng), nên đây là **cảnh
       báo** chứ không phải lỗi — nhưng nó phải hiện ra, vì nếu sau này có món chay dùng
       sữa mà vẫn bị gắn thuần chay thì cảnh báo này biến mất và không ai để ý.
    """
    problems: list[str] = []
    vegan = {m["id"] for m in items if "diet:vegan" in m["tags"]}
    vegetarian = {m["id"] for m in items if "diet:vegetarian" in m["tags"]}
    by_id = {m["id"]: m for m in items}

    for item_id in sorted(vegan):
        item = by_id[item_id]
        for tag in ("allergen:dairy", "allergen:egg"):
            if tag in item["tags"]:
                problems.append(
                    f"{item['name']}: mang diet:vegan nhưng cũng mang {tag} — "
                    "một trong hai nhãn sai"
                )

    for item_id in sorted(vegan - vegetarian):
        problems.append(
            f"{by_id[item_id]['name']}: mang diet:vegan mà không mang diet:vegetarian — "
            "người ăn chay sẽ không thấy món này"
        )
    return problems


def main() -> int:
    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    items = menu["items"]

    gaps: list[tuple[str, str, str, dict[str, str]]] = []
    negated: list[tuple[str, str, str]] = []
    tagged_counts: dict[str, int] = {}

    for kind, signs in SIGNS.items():
        tag = f"allergen:{kind}"
        tagged_counts[kind] = sum(1 for m in items if tag in m["tags"])
        for item in items:
            text = f"{item['name']} {item['description']}"
            found = hits(text, signs)
            if not found or tag in item["tags"]:
                continue
            hit_negation = next((n for n in NEGATIONS if n in text.lower()), None)
            if hit_negation:
                negated.append((item["name"], tag, hit_negation))
                continue
            gaps.append((item["id"], item["name"], tag, found))

    print("Phủ nhãn dị nguyên hiện tại:")
    for kind, count in sorted(tagged_counts.items()):
        print(f"  allergen:{kind:8} {count:2}/91 món")
    covered = len({m["id"] for m in items if any(t.startswith("allergen:") for t in m["tags"])})
    print(f"  món có ít nhất 1 nhãn: {covered}/91")

    print(f"\nTừ khóa nghe giống dị nguyên nhưng KHÔNG phải ({len(NOT_ALLERGENS)}):")
    for word, reason in sorted(NOT_ALLERGENS.items()):
        print(f"  {word:16} — {reason}")

    if negated:
        print(f"\nMô tả nói rõ KHÔNG có, nên đúng khi không gắn nhãn ({len(negated)}):")
        for name, tag, phrase in negated:
            print(f"  {name:30} {tag:20} vì mô tả ghi {phrase!r}")

    if gaps:
        print(f"\nCÒN LỖ NHÃN ({len(gaps)}) — cần người xét, bản rà không tự sửa:")
        for item_id, name, tag, found in gaps:
            words = ", ".join(f"{w} ({r})" for w, r in sorted(found.items()))
            print(f"  {item_id} {name:30} thiếu {tag}")
            print(f"        căn cứ: {words}")
    else:
        print("\nKhông còn lỗ nào theo các từ khóa trên.")

    diet_problems = check_diet_consistency(items)
    if diet_problems:
        print(f"\nNHÃN CHẾ ĐỘ ĂN TỰ MÂU THUẪN ({len(diet_problems)}):")
        for line in diet_problems:
            print(f"  - {line}")
    else:
        vegan = sum(1 for m in items if "diet:vegan" in m["tags"])
        vegetarian = sum(1 for m in items if "diet:vegetarian" in m["tags"])
        print(f"\nNhãn chế độ ăn nhất quán: {vegan} thuần chay ⊆ {vegetarian} chay, "
              "không món thuần chay nào mang nhãn sữa hoặc trứng.")
        if vegan == vegetarian:
            print(
                "  Lưu ý: hai nhãn gắn trên đúng cùng một tập món, nên một trong hai không\n"
                "  phân biệt được gì trong bộ dữ liệu này. Với món chay Việt thì hợp lý\n"
                "  (chay Phật giáo vốn không dùng sữa, trứng), nhưng câu trả lời nên nói ra\n"
                "  điều đó thay vì để khách tự đoán."
            )

    print(
        "\nGiới hạn: căn cứ duy nhất là câu giới thiệu món, không phải bảng thành phần và\n"
        "không phải kiểm tra bếp. Món không mang nhãn KHÔNG có nghĩa là không chứa dị\n"
        "nguyên — chỉ nhà hàng trả lời được phần còn lại."
    )
    return 1 if (gaps or diet_problems) else 0


if __name__ == "__main__":
    raise SystemExit(main())
