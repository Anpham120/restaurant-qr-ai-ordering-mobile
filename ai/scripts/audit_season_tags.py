# -*- coding: utf-8 -*-
"""Rà nhãn MÙA: đối chiếu `season:*` với phần mô tả món, cả hai chiều.

Vì sao cần bản rà này
---------------------
Phép so truy hồi ở bước 7 làm lộ một khiếm khuyết gắn nhãn: `season:cooling` gắn cho **5 đồ uống
nhưng chỉ **2/56 món ăn** (theo `understand.FOOD_CATEGORIES` — 8 danh mục món ăn, 7 món mỗi
danh mục). Nên câu "trời nóng quá, ăn gì cho
mát người" — một câu hoàn toàn bình
thường — lọc theo `cooling` chỉ còn đúng **2 món**, và một món đổi nhãn là mất câu trả lời.

Đọc kỹ dữ liệu thì thấy chỗ lệch không phải do thực đơn thiếu món mát, mà do **nhãn không nhất
quán với chính mô tả món**:

    Canh khổ qua nhồi nấm       "Vị đắng nhẹ **thanh nhiệt**, giải độc"  -> CÓ season:cooling
    Bánh tráng cuốn thịt heo    "**Thanh mát**, không dầu mỡ"            -> KHÔNG có

Hai món cùng loại bằng chứng, khác nhãn. Đó là lỗi dữ liệu, không phải lựa chọn thiết kế.

Hai chiều, và chiều thứ hai mới là chiều dễ bị bỏ
-------------------------------------------------
    THIẾU NHÃN   mô tả có bằng chứng mát mà món không mang `season:cooling`
    NHÃN LẠ      món mang `season:cooling` mà mô tả KHÔNG có bằng chứng nào

Chỉ rà chiều thứ nhất thì cách "sửa" dễ nhất là gắn nhãn cho thật nhiều món, và bản rà sẽ luôn
sạch trong khi nhãn thành vô nghĩa. Chiều thứ hai chặn đúng cách lách đó.

Ba lỗi mà bản rà dị nguyên đã mắc rồi sửa, nên bản này thừa hưởng luôn
---------------------------------------------------------------------
1. **Khớp theo biên từ**, không khớp chuỗi con — `mát` không được khớp vào `mát-xa` hay `cà phê
   mát-cha`.
2. **Bỏ qua câu phủ định** — mô tả nói "không lạnh", "dùng nóng" thì đừng gắn nhãn mát.
3. **Ghi rõ vì sao mỗi cụm là bằng chứng**, và tách riêng nhóm cụm *nghe giống mà không phải*.

Bản rà **không tự sửa dữ liệu**. Nó in ra để người đọc quyết định — cùng lý do với bản rà dị
nguyên: căn cứ duy nhất ở đây là câu giới thiệu món, không phải bếp.

    python ai/scripts/audit_season_tags.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"

# Dùng đúng định nghĩa "món ăn" của hệ thống, không tự liệt kê lại — xem chú thích trong `main()`.
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))
from understand import FOOD_CATEGORIES  # noqa: E402

# Bằng chứng cho `season:cooling` — "Giải nhiệt" theo từ điển nhãn.
#
# Cụm nhiều từ khớp nguyên cụm; từ đơn khớp theo BIÊN TỪ. Mỗi cụm ghi rõ vì sao nó là bằng chứng,
# để lần sau ai đó thêm cụm thì phải viết được lý do — và nếu không viết được thì cụm đó không nên
# có ở đây.
COOLING_SIGNS: dict[str, str] = {
    "thanh nhiệt": "nói thẳng — đây là chính nghĩa của nhãn",
    "giải nhiệt": "nói thẳng",
    "giải khát": "nói thẳng",
    "thanh mát": "mát, nói theo cách người Việt mô tả món",
    "mát lạnh": "mát",
    "ngọt mát": "mát",
    "tươi mát": "mát",
    "ăn lạnh": "món phục vụ lạnh",
    "ướp lạnh": "món phục vụ lạnh",
    "đá bào": "phục vụ với đá",
    "đá viên": "phục vụ với đá",
    "phù hợp mùa nóng": "mô tả nói thẳng là phù hợp mùa nóng",
    "mùa hè": "mùa nóng",
}

# Bằng chứng cho `season:cold_season` — "Mùa lạnh".
#
# KHÔNG dùng "ăn nóng" / "dùng nóng" / "nóng hổi" làm bằng chứng. Bản đầu có chúng, và đo lại thấy
# chúng gắn cờ Nghêu hấp sả, Bánh chuối nướng, Chè trôi nước — **nhiệt độ phục vụ không phải tính
# mùa**. Gần như mọi món Việt đều phục vụ nóng, nên một bằng chứng đúng với gần hết thực đơn thì
# không phân biệt được gì.
COLD_SIGNS: dict[str, str] = {
    "ấm người": "làm ấm",
    "giữ ấm": "làm ấm",
    "thuốc bắc": "món tiềm thuốc bắc là món bồi bổ mùa lạnh trong ẩm thực Việt",
    "phù hợp mùa lạnh": "mô tả nói thẳng",
    "ngày lạnh": "mùa lạnh",
    "mùa đông": "mùa lạnh",
}

# Cụm NGHE GIỐNG bằng chứng mà không phải. Ghi ra để lần sau không lặp lại lớp lỗi `bánh tráng`
# của bản rà dị nguyên (bánh tráng làm từ gạo, không phải lúa mì).
NOT_EVIDENCE = {
    "mát-cha": "matcha là tên loại trà, không nói gì về nhiệt độ phục vụ",
    "nước mát": "chưa dùng trong thực đơn này, nhưng nếu có thì phải xét từng món",
    "rau mát": "không có món nào dùng cụm này — giữ để chặn khớp lỏng",
    "nóng chảy": "mô tả kết cấu (phô mai nóng chảy), không phải nhiệt độ phục vụ món",
    "cay nóng": "vị cay, không phải món dùng nóng",
}

# Món ĐÃ XEM và quyết định GIỮ NGUYÊN, kèm lý do. Nhóm này phục vụ **cả hai chiều**:
#
#   với `cooling`      món có cụm khớp mà quyết định KHÔNG gắn nhãn
#   với `cold_season`  món đang MANG nhãn mà mô tả không có cụm nào, và quyết định GIỮ
#
# Cùng vai với `NOT_ALLERGENS` của bản rà dị nguyên: nó biến một phán đoán của người thành thứ đọc
# lại và bác được, thay vì để bản rà báo mãi một chỗ mà không ai biết đã xem chưa hay chưa xem.
#
# Điểm chung của năm món `cooling`: cụm "thanh mát" / "tươi mát" ở đó mô tả **VỊ**, không mô tả chức
# năng giải nhiệt. Không từ khóa nào phân biệt được hai nghĩa đó, nên chỗ này cần người đọc — và
# người đọc phải ghi lại lý do.
DA_XET_GIU_NGUYEN: dict[str, dict[str, str]] = {
    "season:cooling": {
        "Cà phê dừa": "'đá viên' là cách phục vụ; mô tả nhấn 'béo ngậy' và caffeine, "
                      "không nói gì về giải nhiệt",
        "Cà phê sữa đá": "mô tả ghi 'Caffeine cao, phù hợp buổi sáng' — đó là món tỉnh táo, "
                         "không phải món giải nhiệt",
        "Bia Hà Nội": "'vị nhẹ thanh mát' mô tả VỊ của bia, không phải chức năng giải nhiệt",
        "Bia hơi Hà Nội": "'tươi mát' mô tả VỊ",
        "Cocktail chanh đào mật ong": "'tươi mát' mô tả VỊ",
    },
    # Ba món lẩu/cháo mang `cold_season` mà mô tả không có cụm nào — bằng chứng là LOẠI món, không
    # phải chữ. Không thêm "lẩu"/"cháo" vào COLD_SIGNS, vì đo được: 7 món lẩu thì 3 mang
    # `cold_season` và 4 mang `all_year`. Tức người gắn nhãn đã phân biệt có ý, và một từ khóa
    # "lẩu" sẽ gắn cờ 4 món kia thành "thiếu nhãn" — biến một lựa chọn thành một lỗi giả.
    "season:cold_season": {
        "Lẩu chua cá lăng": "lẩu là món ăn quây quần, ấm — bằng chứng là LOẠI món, không phải chữ",
        "Lẩu gà lá é Đà Lạt": "lẩu, và Đà Lạt là vùng lạnh",
        "Cháo lòng Sài Gòn": "cháo nóng là món ấm bụng — bằng chứng là LOẠI món",
        "Súp măng cua": "súp nóng ăn khai vị mùa lạnh — bằng chứng là LOẠI món",
    },
}

# Câu phủ định: mô tả nói rõ ngược lại thì đừng gắn nhãn.
#
# "hãm nóng" và "ăn lạnh hoặc nóng" được thêm sau khi đọc kết quả rà: *Trà sen Tây Hồ* có cụm
# "thanh mát" nhưng mô tả ghi **"Hãm nóng trong ấm sứ"** — "thanh mát" ở đó là HẬU VỊ, không phải
# cách phục vụ. Còn *Chè bưởi* ghi "Ăn lạnh **hoặc nóng**", tức không dứt khoát, khác *Chè khúc
# bạch* chỉ ghi "Ăn lạnh".
NEGATIONS_COOLING = ("không lạnh", "dùng nóng", "ăn nóng", "nóng hổi", "hãm nóng",
                     "ăn lạnh hoặc nóng")
NEGATIONS_COLD = ("ăn lạnh", "ướp lạnh", "không nóng")


def word_tokens(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower(), flags=re.UNICODE))


def hits(text: str, signs: dict[str, str]) -> dict[str, str]:
    """Cụm khớp: nguyên cụm với cụm nhiều từ, biên từ với từ đơn."""
    low = text.lower()
    tokens = word_tokens(text)
    found: dict[str, str] = {}
    for word, reason in signs.items():
        if " " in word or "-" in word:
            if word in low:
                found[word] = reason
        elif word in tokens:
            found[word] = reason
    return found


def rao(items: list[dict], tag: str, signs: dict[str, str],
        negations: tuple[str, ...]) -> tuple[list, list, list]:
    """Trả về (thiếu nhãn, nhãn lạ, bị phủ định)."""
    thieu, la, phu_dinh = [], [], []
    for item in items:
        text = f"{item['name']} {item['description']}"
        found = hits(text, signs)
        co_nhan = tag in item["tags"]
        pd = next((n for n in negations if n in text.lower()), None)

        da_xet = DA_XET_GIU_NGUYEN.get(tag, {})
        if item["name"] in da_xet:
            continue          # đã xem, đã ghi lý do — xem `DA_XET_KHONG_GAN`
        if found and not co_nhan:
            if pd:
                phu_dinh.append((item["name"], pd, sorted(found)))
            else:
                thieu.append((item["id"], item["name"], found))
        elif co_nhan and not found:
            la.append((item["id"], item["name"]))
    return thieu, la, phu_dinh


def main() -> int:
    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    items = menu["items"]

    # Đếm theo món ĂN riêng: đây là chỗ khiếm khuyết nằm, và tổng cộng cả đồ uống thì nó bị che.
    #
    # Dùng `understand.FOOD_CATEGORIES` chứ KHÔNG tự liệt kê danh mục. Bản đầu tự liệt kê bằng cách
    # loại trừ, và ra 56 món trong khi hệ thống tính 49 — hai định nghĩa "món ăn" khác nhau trong
    # cùng một dự án, nên con số của bản rà không so được với con số ở tài liệu. Tráng miệng và trái
    # cây không nằm trong `FOOD_CATEGORIES`: khách hỏi "ăn gì cho mát người" không mong nhận chè.
    import collections
    an = [i for i in items if i["categoryId"] in FOOD_CATEGORIES]
    print(f"Thực đơn: {len(items)} món, trong đó {len(an)} món ĂN\n")
    dem = collections.Counter(t for i in items for t in i["tags"] if t.startswith("season:"))
    dem_an = collections.Counter(t for i in an for t in i["tags"] if t.startswith("season:"))
    print(f"{'nhãn':22}{'tất cả':>8}{'món ăn':>9}")
    print("-" * 40)
    for t in sorted(dem):
        print(f"{t:22}{dem[t]:>8}{dem_an.get(t, 0):>9}")

    van_de: list[str] = []
    for tag, signs, neg in (
        ("season:cooling", COOLING_SIGNS, NEGATIONS_COOLING),
        ("season:cold_season", COLD_SIGNS, NEGATIONS_COLD),
    ):
        thieu, la, pd = rao(items, tag, signs, neg)
        print(f"\n=== {tag} ===")
        print(f"  THIẾU NHÃN: {len(thieu)} món có bằng chứng trong mô tả mà không mang nhãn")
        for _id, ten, found in thieu:
            ly_do = "; ".join(f"{k} ({v})" for k, v in sorted(found.items()))
            print(f"    {ten:32} {ly_do}")
        print(f"  NHÃN LẠ   : {len(la)} món mang nhãn mà mô tả không có bằng chứng")
        for _id, ten in la:
            print(f"    {ten}")
        if pd:
            print(f"  bị PHỦ ĐỊNH nên ĐÚNG khi không mang nhãn: {len(pd)}")
            for ten, n, found in pd:
                print(f"    {ten:32} mô tả nói {n!r} dù có {found}")
        van_de += [f"{tag}: thiếu nhãn ở {ten}" for _, ten, _ in thieu]
        van_de += [f"{tag}: nhãn lạ ở {ten}" for _, ten in la]

    print()
    print("Nhóm cụm NGHE GIỐNG bằng chứng mà không phải (ghi ra để không lặp lại lỗi khớp lỏng):")
    for cum, ly_do in NOT_EVIDENCE.items():
        print(f"  {cum:14} {ly_do}")

    print()
    print("Món ĐÃ XEM và quyết định giữ nguyên, kèm lý do:")
    for tag, ds in DA_XET_GIU_NGUYEN.items():
        print(f"  {tag}")
        for ten, ly_do in ds.items():
            print(f"    {ten:30} {ly_do}")

    if van_de:
        print(f"\n{len(van_de)} chỗ cần người xem lại. Bản rà KHÔNG tự sửa dữ liệu.")
        return 1
    print("\nNhãn mùa nhất quán với mô tả món ở cả hai chiều.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
