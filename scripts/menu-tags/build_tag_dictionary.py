# -*- coding: utf-8 -*-
"""Xây từ điển nhãn thực đơn và gán nhãn lại theo khóa có không gian tên.

Vì sao phải làm việc này
------------------------
Nhãn cũ là từ tiếng Việt trần (`toi`, `ca`, `nam`, `cua`). Khi rút dấu để khớp với
câu hỏi của khách, chúng đụng từ thông thường, và bản cũ mắc **bảy** lỗi cùng một
gốc:

    cua   (con cua)      đụng  của, cửa      → câu hỏi giờ mở cửa bịa ra dị ứng hải sản
    chay  (ăn chay)      đụng  chạy          → "món bán chạy" khớp vào món chay
    trung (trứng)        đụng  miền Trung    → dị ứng trứng loại 43/91 món, chỉ 7 đúng
    bo    (bơ, nguồn sữa) đụng  bò           → dị ứng sữa loại cả phở bò
    muc   (mực)          đụng  mức           → "chọn mức đường" khớp vào mực
    lac   (đậu lạc)      đụng  lắc           → "bò lúc lắc" khớp vào đậu phộng
    tra   (trà)          đụng  tráng         → "tráng miệng menu" trả về bốn loại trà

Ba nhãn còn tệ hơn: token của chúng nằm **trong nhãn khác**, nên khớp theo biên từ
cũng không cứu được — `nam` (nấm) nằm trong `quanh nam` và `mien Nam`, `ca` (cá) nằm
trong `ca nhan`.

Khóa có không gian tên (`meal:dinner`, `ingredient:fish`) xoá cả lớp lỗi này về mặt
cấu trúc: khách không bao giờ gõ chuỗi đó, nên không có gì để trùng. AI khớp **chính
xác một khóa** thay vì dò chuỗi.

Nhãn hiển thị cho khách vẫn là tiếng Việt có dấu, lấy từ chính tệp này — nên không
còn chuyện giao diện hiển thị "Tối" trong khi AI đoán là "tỏi", đúng lỗi đã xảy ra.

Nguồn của nghĩa từng nhãn
-------------------------
`frontend/src/components/menu/MenuItemCard.tsx` đã có sẵn từ điển 80 nhãn → nhãn
tiếng Việt, do người làm giao diện viết, phủ đúng 80/80 nhãn trong dữ liệu. Đó là
nguồn có thẩm quyền. (Tệp đó đã bị xoá cùng giao diện nhà hàng; nội dung của nó
nằm trong lịch sử git, và từ điển đã chép sang tệp này nên nghĩa không mất.) Nó và nó xác nhận `toi` = "Tối" (bữa tối) chứ không phải "tỏi" —
kết luận cũng khớp với bốn phép thử trên dữ liệu (tráng miệng và trái cây tươi đều
100% mang nhãn `toi`, mà không món nào có tỏi).

    python ai/scripts/build_tag_dictionary.py --check   # chỉ kiểm, không ghi
    python ai/scripts/build_tag_dictionary.py           # ghi từ điển + gán nhãn lại
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"
DICT_PATH = REPO_ROOT / "data" / "menu-tags.json"
# Seed chuyển từ `RestaurantMenuSeed.cs` (.NET, đã xoá ở #59) sang migration Flyway của bản Java.
SEED_PATH = (
    REPO_ROOT
    / "backend-java"
    / "src"
    / "main"
    / "resources"
    / "db"
    / "migration"
    / "V2__seed_official_menu_and_tables.sql"
)

# Mẫu đọc một món trong seed SQL:
#   INSERT INTO public.menu_items (...) VALUES ('m_004', 'cat_appetizer', 'Tên', 'mô tả',
#     55000.00, '/menu-images/...', true, '{tag:a,tag:b}', ...);
#
# Nhãn là mảng Postgres `'{a,b}'` — phân tách bằng dấu phẩy, KHÔNG có dấu nháy quanh từng nhãn
# như danh sách chuỗi của C#. Mọi chỗ đọc nhãn bên dưới đổi theo.
SEED_ITEM_RE = re.compile(
    r"INSERT INTO public\.menu_items[^;]*?VALUES \('(?P<id>[^']+)', '(?P<cat>[^']+)', "
    r"'(?P<name>(?:[^']|'')+)', '(?P<desc>(?:[^']|'')*)', (?P<price>\d+)\.\d+, "
    r"'(?P<slug>[^']*)', \w+, '\{(?P<tags>[^}]*)\}'"
)

# Mỗi nhóm: tên nhóm -> {khóa cũ: (giá trị mới, nhãn tiếng Việt)}.
# Nhãn tiếng Việt lấy từ TAG_LABELS của frontend, không tự dịch lại.
GROUPS: dict[str, dict[str, tuple[str, str]]] = {
    "spice": {
        "khong cay": ("none", "Không cay"),
        "cay nhe": ("mild", "Cay nhẹ"),
        "cay vua": ("medium", "Cay vừa"),
        "cay dam": ("hot", "Cay đậm"),
    },
    "meal": {
        "sang": ("breakfast", "Sáng"),
        "trua": ("lunch", "Trưa"),
        "toi": ("dinner", "Tối"),
        "an khuya": ("late_night", "Ăn khuya"),
    },
    "ingredient": {
        "bo": ("beef", "Bò"),
        "heo": ("pork", "Heo"),
        "ga": ("chicken", "Gà"),
        "ca": ("fish", "Cá"),
        "tom": ("shrimp", "Tôm"),
        "muc": ("squid", "Mực"),
        "cua": ("crab", "Cua"),
        "dau hu": ("tofu", "Đậu hũ"),
        "nam": ("mushroom", "Nấm"),
        "rau": ("vegetable", "Rau"),
    },
    "method": {
        "nuong": ("grilled", "Nướng"),
        "chien": ("fried", "Chiên"),
        "hap": ("steamed", "Hấp"),
        "xao": ("stir_fried", "Xào"),
        "kho": ("braised", "Kho"),
        "luoc": ("boiled", "Luộc"),
        "rang": ("roasted", "Rang"),
        # "Quay" KHAC "Rang" va khac "Nuong": rang la dao chao kho, nuong la lua truc tiep,
        # quay la lam chin nguyen con cho gion da. Thieu gia tri nay thi "Ga ro ti" phai muon mot
        # trong hai nhan kia, va ca hai deu sai theo mot huong khac nhau.
        "quay": ("whole_roast", "Quay"),
        "tiem": ("stewed", "Tiềm"),
        "nau": ("simmered", "Nấu"),
        "cuon": ("rolled", "Cuốn"),
    },
    "allergen": {
        "co hai san": ("seafood", "Có hải sản"),
        "co dau phong": ("peanut", "Có đậu phộng"),
        "co trung": ("egg", "Có trứng"),
        "co sua": ("dairy", "Có sữa"),
        "co gluten": ("gluten", "Có gluten"),
    },
    "diet": {
        "chay": ("vegetarian", "Chay"),
        "vegan": ("vegan", "Vegan"),
    },
    "health": {
        "healthy": ("healthy", "Healthy"),
        "it calo": ("low_calorie", "Ít calo"),
        "giau protein": ("high_protein", "Giàu protein"),
        "it dau mo": ("low_fat", "Ít dầu mỡ"),
        "khong MSG": ("no_msg", "Không MSG"),
        "thanh nhe": ("light", "Thanh nhẹ"),
    },
    "flavour": {
        "dam da": ("rich", "Đậm đà"),
        "beo": ("fatty", "Béo"),
        "chua": ("sour", "Chua"),
        "ngot": ("sweet", "Ngọt"),
        "man": ("salty", "Mặn"),
        "thom khoi": ("smoky", "Thơm khói"),
    },
    "price": {
        "binh dan": ("budget", "Bình dân"),
        "tam trung": ("mid", "Tầm trung"),
        "cao cap": ("high", "Cao cấp"),
        "premium": ("premium", "Premium"),
    },
    "party": {
        "ca nhan": ("solo", "Cá nhân"),
        "2-3 nguoi": ("two_three", "2-3 người"),
        "3-5 nguoi": ("three_five", "3-5 người"),
        "share": ("share", "Chia sẻ"),
        "nhom ban": ("friends", "Nhóm bạn"),
        "gia dinh": ("family", "Gia đình"),
    },
    "audience": {
        "tre em": ("child", "Trẻ em"),
        "nguoi gia": ("elderly", "Người già"),
    },
    "occasion": {
        "tiec": ("banquet", "Tiệc"),
        "hen ho": ("date", "Hẹn hò"),
        "sinh nhat": ("birthday", "Sinh nhật"),
        "tiep khach": ("business", "Tiếp khách"),
        "nhau": ("drinking", "Nhậu"),
        "hang ngay": ("everyday", "Hàng ngày"),
    },
    "region": {
        "mien Bac": ("north", "Miền Bắc"),
        "mien Trung": ("central", "Miền Trung"),
        "mien Nam": ("south", "Miền Nam"),
        "mien Tay": ("mekong", "Miền Tây"),
        "Ha Noi": ("hanoi", "Hà Nội"),
        "Hue": ("hue", "Huế"),
        "Sai Gon": ("saigon", "Sài Gòn"),
        "Da Nang": ("danang", "Đà Nẵng"),
        "Tay Nguyen": ("highlands", "Tây Nguyên"),
        "Hoi An": ("hoian", "Hội An"),
    },
    "season": {
        "quanh nam": ("all_year", "Quanh năm"),
        "mua nong": ("hot_season", "Mùa nóng"),
        "mua lanh": ("cold_season", "Mùa lạnh"),
        "giai nhiet": ("cooling", "Giải nhiệt"),
    },
    "serving": {
        "dat truoc": ("preorder", "Đặt trước"),
        "mang di": ("takeaway", "Mang đi"),
        "nong": ("hot", "Nóng"),
    },
    # Cách nhà hàng giới thiệu món, KHÔNG phải thuộc tính của món. Tách nhóm riêng để
    # không lẫn với sự thật về đồ ăn: "phổ biến" là dữ liệu kinh doanh, còn "cay vừa"
    # là dữ liệu về món. Nhờ nhóm này mà câu "món nào bán chạy" có câu trả lời thật —
    # trước đây nó khớp sai vào nhãn `chay` (ăn chay) do rút dấu.
    "promo": {
        "pho bien": ("popular", "Phổ biến"),
        "signature": ("signature", "Đặc trưng"),
    },
}

LABELS_EN: dict[str, str] = {
    "all_year": "All year",
    "banquet": "Celebration",
    "beef": "Beef",
    "birthday": "Birthday",
    "boiled": "Boiled",
    "braised": "Braised",
    "breakfast": "Breakfast",
    "budget": "Budget",
    "business": "Business meal",
    "central": "Central Vietnam",
    "chicken": "Chicken",
    "child": "Kids",
    "cold_season": "Cool season",
    "cooling": "Refreshing",
    "crab": "Crab",
    "dairy": "Contains dairy",
    "danang": "Da Nang",
    "date": "Date night",
    "dinner": "Dinner",
    "drinking": "Drinks pairing",
    "egg": "Contains egg",
    "elderly": "Seniors",
    "everyday": "Everyday",
    "family": "Family",
    "fatty": "Creamy",
    "fish": "Fish",
    "fried": "Fried",
    "friends": "Groups",
    "gluten": "Contains gluten",
    "grilled": "Grilled",
    "hanoi": "Hanoi",
    "healthy": "Healthy",
    "high": "Premium",
    "high_protein": "High protein",
    "highlands": "Central Highlands",
    "hot": "Very spicy",
    "hot_season": "Hot season",
    "hue": "Hue",
    "late_night": "Late night",
    "light": "Delicate",
    "low_calorie": "Low calorie",
    "low_fat": "Low fat",
    "lunch": "Lunch",
    "medium": "Medium spicy",
    "mekong": "Mekong Delta",
    "mid": "Mid-range",
    "mild": "Mild spicy",
    "mushroom": "Mushroom",
    "no_msg": "No MSG",
    "none": "Not spicy",
    "north": "Northern Vietnam",
    "peanut": "Contains peanuts",
    "pork": "Pork",
    "premium": "Premium plus",
    "preorder": "Pre-order",
    "rich": "Rich",
    "roasted": "Roasted",
    "whole_roast": "Whole roast",
    "rolled": "Rolls",
    "saigon": "Saigon",
    "salty": "Salty",
    "seafood": "Contains seafood",
    "share": "Sharing",
    "shrimp": "Shrimp",
    "simmered": "Simmered",
    "smoky": "Smoky",
    "solo": "For one",
    "sour": "Sour",
    "south": "Southern Vietnam",
    "squid": "Squid",
    "steamed": "Steamed",
    "stewed": "Slow-braised",
    "stir_fried": "Stir-fried",
    "sweet": "Sweet",
    "takeaway": "Takeaway",
    "three_five": "Serves 3-5",
    "tofu": "Tofu",
    "two_three": "Serves 2-3",
    "vegan": "Vegan",
    "vegetable": "Vegetables",
    "vegetarian": "Vegetarian",
    # Bốn nhãn chỉ có trong cơ sở dữ liệu, thu về khi hợp nhất hai nguồn thực đơn.
    "hoian": "Hoi An",
    "hot": "Served hot",
    "popular": "Popular",
    "signature": "Signature",
}


# Nhãn dị nguyên còn thiếu, phát hiện khi đối chiếu nhãn với phần mô tả món.
#
# Bảy món dưới đây nêu rõ thành phần gây dị ứng trong mô tả nhưng không mang nhãn
# tương ứng. Khách nói "tôi dị ứng hải sản" mà hệ thống chỉ lọc theo nhãn thì sẽ
# **không** được bảo vệ khỏi ba món cá và ba món chấm mắm nêm / mắm tôm.
#
# Căn cứ là **mô tả trên thực đơn**, không phải kiểm tra bếp. Vì thế chỉ bổ sung theo
# chiều làm chặt hơn (thêm cảnh báo), không bao giờ bớt nhãn đi. Điều này cũng không
# biến nhãn dị nguyên thành đủ: xem `docs/01-data-dictionary.md`, phần vì sao "không
# có nhãn" không đồng nghĩa "không có thành phần đó".
MISSING_ALLERGEN_TAGS: dict[str, list[tuple[str, str]]] = {
    "Bún đậu mắm tôm": [("allergen:seafood", "chấm mắm tôm")],
    "Cơm cá kho tộ": [("allergen:seafood", "cá basa phi lê")],
    "Cá lóc nướng trui": [("allergen:seafood", "cá lóc đồng, chấm mắm nêm")],
    "Lẩu chua cá lăng": [("allergen:seafood", "cá lăng cắt khúc")],
    "Bánh tráng cuốn thịt heo": [("allergen:seafood", "chấm mắm nêm tỏi ớt")],
    "Bê thui Cầu Mống": [("allergen:seafood", "chấm mắm nêm cay")],
    "Cua rang me": [("allergen:gluten", "ăn kèm bánh mì nóng")],
}


# Nhóm mà các giá trị loại trừ nhau — một món chỉ được mang đúng một giá trị.
# Vi phạm là lỗi dữ liệu, không phải chuyện thẩm mỹ: nếu một món vừa `spice:none`
# vừa `spice:hot` thì không câu trả lời nào về độ cay của nó là đúng được.
EXCLUSIVE_GROUPS = ("spice", "price")


def build_dictionary() -> dict:
    entries: dict[str, dict] = {}
    for group, mapping in GROUPS.items():
        for legacy, (value, label) in mapping.items():
            key = f"{group}:{value}"
            if key in entries:
                raise ValueError(f"khóa trùng: {key}")
            if value not in LABELS_EN:
                raise ValueError(f"thiếu nhãn tiếng Anh cho: {key}")
            entries[key] = {
                "group": group,
                "value": value,
                "label_vi": label,
                "label_en": LABELS_EN[value],
                # Giữ tên cũ để đối chiếu khi di trú và để tra ngược khi cần.
                "legacy_key": legacy,
                "exclusive": group in EXCLUSIVE_GROUPS,
            }
    return {
        "schema_version": 1,
        "source_of_meaning": (
            "frontend/src/components/menu/MenuItemCard.tsx TAG_LABELS — từ điển 80 "
            "nhãn do người làm giao diện viết, phủ đúng 80/80 nhãn trong dữ liệu"
        ),
        "groups": sorted(GROUPS),
        "exclusive_groups": list(EXCLUSIVE_GROUPS),
        "tags": entries,
    }


def resolve_map(dictionary: dict) -> dict[str, str]:
    """Nhận cả tên cũ và khóa mới, để chạy lại nhiều lần cho cùng kết quả.

    Chạy lại được là điều kiện để công cụ này dùng lâu dài: sửa một nhãn trong
    GROUPS rồi chạy lại phải ra đúng trạng thái đó, bất kể dữ liệu đang ở dạng cũ
    hay đã gán lại. Nếu không thì mỗi lần sửa lại phải nhớ đã chạy hay chưa.
    """
    resolve: dict[str, str] = {}
    for key, entry in dictionary["tags"].items():
        resolve[key] = key
        resolve[entry["legacy_key"]] = key
    return resolve


def read_seed_tags(dictionary: dict) -> dict[str, list[str]]:
    """Đọc nhãn từ tệp seed C# — nguồn nhãn mà khách thật đang thấy qua /api/menu."""
    resolve = resolve_map(dictionary)
    source = SEED_PATH.read_text(encoding="utf-8-sig")
    out: dict[str, list[str]] = {}
    for match in SEED_ITEM_RE.finditer(source):
        tags = [t for t in match.group("tags").split(",") if t]
        out[seed_name(match)] = [resolve[t] for t in tags if t in resolve]
    return out


def seed_name(match: re.Match[str]) -> str:
    """SQL thoát dấu nháy đơn bằng cách nhân đôi nó; trả lại dạng người đọc để so với JSON."""
    return match.group("name").replace("''", "'")


def read_seed_categories() -> dict[str, str]:
    """Tên món -> mã danh mục trong cơ sở dữ liệu."""
    source = SEED_PATH.read_text(encoding="utf-8-sig")
    return {
        seed_name(match): match.group("cat")
        for match in SEED_ITEM_RE.finditer(source)
    }


def align_category_ids(menu: dict, seed_categories: dict[str, str]) -> list[str]:
    """Đưa mã danh mục của tệp JSON về mã của cơ sở dữ liệu.

    Đây là chỗ lệch thứ hai giữa hai nguồn, cùng loại với lệch nhãn: 12/13 mã danh mục
    khác nhau hoàn toàn, dù ánh xạ 1:1 sạch (mỗi danh mục đúng 7 món, khớp hết). Chỉ
    `cat_alcohol` trùng.

    Cơ sở dữ liệu thắng, hai lý do:

    - Mã của nó là thứ cả hệ thống đang dùng. `CATEGORY_EN` trong `packages/i18n` khóa
      theo `cat_appetizer`, `cat_noodle`...; `menu_items.category_id` trong cơ sở dữ liệu
      trỏ tới chúng. Chỉ `menu-dataset.json` là ngoại lệ.
    - Mã của tệp JSON **có dấu** (`cat_khai_vị`, `cat_phở_bún`, `cat_nước_ép_sinh_tố`).
      Một khóa máy đọc mang dấu là đúng loại mong manh vừa gây ra bảy lỗi ở phần nhãn:
      hễ có bước rút dấu nào ở giữa là khóa vỡ.

    Nếu không sửa, mọi suy luận của AI theo `categoryId` sẽ đúng trên tệp JSON và sai khi
    nhận dữ liệu thật từ `/api/menu`.
    """
    changes: list[str] = []
    id_map: dict[str, str] = {}
    for item in menu["items"]:
        new_id = seed_categories.get(item["name"])
        if new_id is None or new_id == item["categoryId"]:
            continue
        id_map[item["categoryId"]] = new_id
        item["categoryId"] = new_id
    for category in menu["categories"]:
        new_id = id_map.get(category["categoryId"])
        if new_id is None:
            continue
        changes.append(f"{category['categoryId']} -> {new_id} ({category['name']})")
        category["categoryId"] = new_id
    return changes


def merge_seed_tags(
    menu: dict, dictionary: dict, seed_tags: dict[str, list[str]]
) -> tuple[list[str], list[str]]:
    """Hợp nhất nhãn của cơ sở dữ liệu vào thực đơn AI dùng.

    Hai nguồn từng chạy song song và lệch nhau: cơ sở dữ liệu 1,7 nhãn/món (khách
    thấy), tệp JSON 15 nhãn/món (AI dùng). Cùng 91 món, cùng tên.

    Quy tắc hợp nhất, và vì sao:

    - **Nhóm loại trừ (`spice`, `price`): tệp JSON thắng.** Có bằng chứng độc lập —
      63/91 món ghi thẳng độ cay trong phần mô tả ("Cay đậm.", "Không cay."), và nhãn
      JSON khớp mô tả **63/63**, không một ngoại lệ. Ba nhãn cay của cơ sở dữ liệu trái
      với mô tả nên chúng sai (Bún bò Huế và Mực xào sa tế mô tả ghi "Cay đậm" nhưng
      cơ sở dữ liệu gán "cay vừa"; Gà nướng muối ớt xanh mô tả ghi "Cay vừa" nhưng cơ
      sở dữ liệu gán "cay nhẹ"). Với `price`, thang của JSON tự nhất quán còn cơ sở dữ
      liệu gán "cao cấp" cho món 95.000đ và 120.000đ, trái chính thang đó.
    - **Nhóm còn lại: cộng thêm.** Cơ sở dữ liệu có thông tin thật mà JSON thiếu, ví dụ
      `region:mekong` cho Bưởi da xanh Bến Tre — Bến Tre thuộc miền Tây, và nhãn này
      cùng tồn tại với `region:south` được vì miền Tây nằm trong miền Nam.
    - **Bốn nhãn chỉ cơ sở dữ liệu có** được thu về: `region:hoian`, `serving:hot`,
      `promo:popular`, `promo:signature`. Chúng cũng chính là bốn mục "chết" trong bảng
      dịch tiếng Anh — dấu hiệu cho thấy bảng đó được viết theo cơ sở dữ liệu, không
      theo tệp JSON.
    """
    exclusive = set(dictionary["exclusive_groups"])
    added: list[str] = []
    rejected: list[str] = []
    for item in menu["items"]:
        current = list(item["tags"])
        for key in seed_tags.get(item["name"], []):
            if key in current:
                continue
            group = key.split(":", 1)[0]
            if group in exclusive:
                kept = next((t for t in current if t.startswith(f"{group}:")), None)
                rejected.append(f"{item['name']}: bỏ {key} của DB, giữ {kept} của JSON")
                continue
            current.append(key)
            added.append(f"{item['name']}: +{key}")
        item["tags"] = sorted(current)
    return added, rejected


def seed_tags_differ(menu: dict) -> bool:
    """Nhãn của cơ sở dữ liệu có khác bộ nhãn đã hợp nhất không — dùng cho `--check`.

    Đọc TRẠNG THÁI HIỆU LỰC (V2 cộng mọi migration cập nhật nhãn sau nó), không đọc riêng V2.

    Vì sao quan trọng: sau khi `build_tag_migration.py` sinh một migration cập nhật nhãn, nội
    dung V2 vẫn giữ nhãn CŨ mãi mãi — đó là bản chất của migration. Nếu hàm này chỉ đọc V2 thì
    nó sẽ báo "lệch" vĩnh viễn, và người ta sẽ học cách bỏ qua nó. Một cổng luôn đỏ cũng vô
    dụng như một cổng luôn xanh.

    Dùng chung đúng một hàm đọc với `build_tag_migration.py`: hai cổng đọc hai nguồn khác nhau
    thì sớm muộn sẽ nói ngược nhau, và người ta sẽ tin cái đang xanh.
    """
    hieu_luc = _doc_nhan_hieu_luc()
    for item in menu["items"]:
        dang_co = hieu_luc.get(item["name"])
        if dang_co is not None and dang_co != sorted(item["tags"]):
            return True
    return False


def _doc_nhan_hieu_luc() -> dict[str, list[str]]:
    """Nạp muộn để `build_tag_dictionary` vẫn chạy được khi ai đó chạy nó một mình."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_tag_migration import doc_nhan_hieu_luc  # noqa: E402

    return doc_nhan_hieu_luc()


def relabel(menu: dict, dictionary: dict) -> tuple[dict, list[str], list[str]]:
    resolve = resolve_map(dictionary)
    problems: list[str] = []
    added: list[str] = []
    unseen = set(MISSING_ALLERGEN_TAGS)
    for item in menu["items"]:
        new_tags: list[str] = []
        for tag in item.get("tags") or []:
            key = resolve.get(tag)
            if key is None:
                problems.append(f"{item['id']}: nhãn không có trong từ điển: {tag!r}")
                continue
            if key not in new_tags:
                new_tags.append(key)
        # Bổ sung nhãn dị nguyên còn thiếu, chỉ theo chiều làm chặt hơn.
        for key, reason in MISSING_ALLERGEN_TAGS.get(item["name"], []):
            unseen.discard(item["name"])
            if key not in new_tags:
                new_tags.append(key)
                added.append(f"{item['name']}: +{key} ({reason})")
        # Kiểm bất biến loại trừ ngay khi gán, không để lọt xuống dưới.
        for group in EXCLUSIVE_GROUPS:
            values = [t for t in new_tags if t.startswith(f"{group}:")]
            if len(values) > 1:
                problems.append(
                    f"{item['id']} ({item['name']}): nhóm {group} loại trừ nhau "
                    f"nhưng có {values}"
                )
        item["tags"] = sorted(new_tags)
    # Tên món trong danh sách bổ sung mà không khớp món nào là lỗi gõ sai, và nó sẽ
    # âm thầm bỏ mất một cảnh báo dị ứng — nên phải báo, không được im lặng.
    for name in sorted(unseen):
        problems.append(f"danh sách bổ sung có tên món không tồn tại: {name!r}")
    return menu, problems, added


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Chỉ kiểm tra, không ghi tệp nào."
    )
    args = parser.parse_args(argv)

    dictionary = build_dictionary()
    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))

    before = Counter(t for m in menu["items"] for t in (m.get("tags") or []))
    resolve = resolve_map(dictionary)
    unmapped = sorted(t for t in before if t not in resolve)
    if unmapped:
        print("Nhãn trong dữ liệu chưa có trong từ điển:", unmapped, file=sys.stderr)
        return 2

    menu, problems, added = relabel(menu, dictionary)
    seed_tags = read_seed_tags(dictionary)
    if len(seed_tags) != len(menu["items"]):
        problems.append(
            f"đọc được {len(seed_tags)} món từ tệp seed nhưng thực đơn có "
            f"{len(menu['items'])} món — mẫu đọc seed có thể đã lạc hậu"
        )
    merged, rejected = merge_seed_tags(menu, dictionary, seed_tags)
    cat_changes = align_category_ids(menu, read_seed_categories())
    after = Counter(t for m in menu["items"] for t in (m.get("tags") or []))

    print(f"nhãn trong từ điển : {len(dictionary['tags'])}")
    print(f"nhóm               : {len(dictionary['groups'])}")
    print(f"nhãn trước gán lại : {len(before)} loại, {sum(before.values())} lần gán")
    print(f"nhãn sau gán lại   : {len(after)} loại, {sum(after.values())} lần gán")
    print(f"món đọc từ tệp seed: {len(seed_tags)}")
    if merged:
        print(f"\nHỢP NHẤT TỪ CƠ SỞ DỮ LIỆU ({len(merged)} nhãn cộng thêm):")
        for line in merged:
            print(f"  - {line}")
    if rejected:
        print(f"\nNHÃN DB BỊ BỎ ({len(rejected)}) — nhóm loại trừ, mô tả món xử JSON đúng:")
        for line in rejected:
            print(f"  - {line}")
    if cat_changes:
        print(f"\nMÃ DANH MỤC ĐƯA VỀ MÃ CỦA CƠ SỞ DỮ LIỆU ({len(cat_changes)}):")
        for line in cat_changes:
            print(f"  - {line}")
    if added:
        print(f"\nBổ SUNG NHÃN DỊ NGUYÊN ({len(added)}) — căn cứ mô tả món, không phải kiểm bếp:")
        for line in added:
            print(f"  - {line}")
    if problems:
        print(f"\nVẤN ĐỀ DỮ LIỆU ({len(problems)}):")
        for line in problems:
            print(f"  - {line}")

    if args.check:
        # So kết quả sinh lại với tệp đang có trên đĩa. Đây mới là phép kiểm hữu ích
        # trong CI: nó bắt trường hợp có người sửa tay dữ liệu mà không chạy lại bộ sinh —
        # và khi đó dữ liệu không còn giải thích được bằng bộ sinh nữa.
        stale: list[str] = []
        want_dict = json.dumps(dictionary, ensure_ascii=False, indent=2) + "\n"
        if DICT_PATH.read_text(encoding="utf-8-sig") != want_dict:
            stale.append(str(DICT_PATH.relative_to(REPO_ROOT)))
        want_menu = json.dumps(menu, ensure_ascii=False, indent=2) + "\n"
        if MENU_PATH.read_text(encoding="utf-8-sig") != want_menu:
            stale.append(str(MENU_PATH.relative_to(REPO_ROOT)))
        if seed_tags_differ(menu):
            stale.append(str(SEED_PATH.relative_to(REPO_ROOT)))
        if stale:
            print(f"\nTỆP ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI ({len(stale)}):")
            for path in stale:
                print(f"  - {path}")
            print("Chạy `python ai/scripts/build_tag_dictionary.py` để cập nhật.")
        else:
            print("\n--check: tệp đã commit khớp kết quả sinh lại.")
        return 1 if (problems or stale) else 0

    DICT_PATH.write_text(
        json.dumps(dictionary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    MENU_PATH.write_text(
        json.dumps(menu, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nĐã ghi {DICT_PATH.relative_to(REPO_ROOT)}")
    print(f"Đã ghi {MENU_PATH.relative_to(REPO_ROOT)}")
    # KHÔNG ghi vào seed: nó là migration Flyway ĐÃ CHẠY, sửa nội dung sẽ làm mọi cơ sở dữ liệu
    # đang có dữ liệu từ chối khởi động (lỗi checksum). Cách đúng là sinh một migration MỚI, và
    # `build_tag_migration.py` làm đúng việc đó — nên ở đây chỉ chỉ đường sang nó.
    if seed_tags_differ(menu):
        print(
            "\nNhãn của cơ sở dữ liệu lệch bộ nhãn vừa hợp nhất."
            "\n  Chạy: python ai/scripts/build_tag_migration.py"
        )
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
