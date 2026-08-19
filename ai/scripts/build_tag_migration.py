# -*- coding: utf-8 -*-
"""Sinh migration EF cập nhật nhãn thực đơn trong cơ sở dữ liệu, và cập nhật snapshot.

Vì sao cần migration riêng thay vì chỉ sửa `RestaurantMenuSeed.cs`: seed chỉ áp cho cơ
sở dữ liệu **mới tạo**. Cơ sở dữ liệu production đã chạy migration seed từ 07/2026, nên
nó vẫn giữ nhãn cũ cho tới khi có một migration cập nhật.

Hai tệp được sinh:

1. `Migrations/<stamp>_RelabelsMenuTagsWithNamespacedKeys.cs` — cập nhật cột `tags` cho
   91 món bằng SQL thuần, theo tiền lệ `ReconcileLegacyKitchenStatuses` trong repo này
   (thuộc tính `[DbContext]`/`[Migration]` khai ngay trong tệp, không cần tệp Designer).
2. `Migrations/RestaurantDbContextModelSnapshot.cs` — cập nhật mảng `Tags` của 91 món.
   Bắt buộc, vì nhãn được seed qua `HasData` nên EF theo dõi chúng trong snapshot; không
   cập nhật thì lần `dotnet ef migrations add` sau sẽ sinh lại đúng phần khác biệt này.

    python ai/scripts/build_tag_migration.py --check
    python ai/scripts/build_tag_migration.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"
MIGRATIONS = (
    REPO_ROOT
    / "backend"
    / "src"
    / "RestaurantQrAiOrdering.Api"
    / "Data"
    / "Migrations"
)
SNAPSHOT_PATH = MIGRATIONS / "RestaurantDbContextModelSnapshot.cs"

# CHUỖI PHIÊN BẢN nhãn. Mỗi lần bộ nhãn thực đơn đổi sau khi một migration ĐÃ CHẠY trên cơ sở dữ
# liệu thật thì phải thêm một dòng vào đây — không được sửa lại migration cũ.
#
# Vì sao không sửa migration cũ: EF ghi migration đã chạy vào `__EFMigrationsHistory` và **không
# chạy lại**. Nên sửa nội dung của nó chỉ ảnh hưởng cơ sở dữ liệu MỚI TẠO; cơ sở dữ liệu đang chạy
# giữ nhãn cũ mãi. Đó đúng là lỗi đã xảy ra: 3 nhãn `season:cooling` được thêm vào thực đơn, tệp
# JSON và tệp seed C# đều cập nhật, nhưng cơ sở dữ liệu vẫn 11 món — nên **trợ lý AI thấy nhãn mới
# mà trang thực đơn của khách thì không**. Đúng lớp lệch hai nguồn mà migration đầu tiên trong danh
# sách này tồn tại để hợp nhất.
#
# Dấu thời gian CỐ ĐỊNH, không sinh từ giờ hệ thống: chạy lại script không được tạo migration mới,
# và migration phải tái lập được bit-for-bit.
#
# Mỗi phiên bản đặt nhãn cho **cả 91 món** theo trạng thái thực đơn lúc đó, chứ không chỉ món đổi.
# Nhờ vậy `Down()` của phiên bản N chỉ cần đọc `Up()` của phiên bản N-1 — không cần lưu trạng thái
# ở đâu khác, và tệp migration tự là nguồn.
REVISIONS: list[tuple[str, str]] = [
    ("20260729120000", "RelabelsMenuTagsWithNamespacedKeys"),
    ("20260730090000", "AddsCoolingSeasonTagsFromDescriptionAudit"),
    ("20260802090000", "AddsWholeRoastMethodTag"),
]
STAMP, CLASS_NAME = REVISIONS[-1]
MIGRATION_PATH = MIGRATIONS / f"{STAMP}_{CLASS_NAME}.cs"

# Migration của phiên bản TRƯỚC, dùng để đọc nhãn cũ cho `Down()`. Với phiên bản đầu thì nguồn là
# migration seed gốc.
SEED_MIGRATION = MIGRATIONS / "20260707233442_SeedOfficialMenuAndThirtyTables.cs"
PREV_MIGRATION = (
    MIGRATIONS / f"{REVISIONS[-2][0]}_{REVISIONS[-2][1]}.cs" if len(REVISIONS) > 1
    else SEED_MIGRATION
)

# Mô tả cho từng phiên bản, in vào `<summary>` của tệp sinh ra.
DESCRIPTIONS: dict[str, str] = {
    "RelabelsMenuTagsWithNamespacedKeys": """/// Gán nhãn lại thực đơn theo khóa có không gian tên, và hợp nhất hai nguồn nhãn.
///
/// Trước migration này, cơ sở dữ liệu và tệp `backend/data/menu-dataset.json` mang hai
/// bộ nhãn khác nhau cho cùng 91 món: cơ sở dữ liệu 1,7 nhãn/món, tệp JSON 15 nhãn/món.
/// Trợ lý AI đọc tệp JSON, còn khách xem thực đơn qua `/api/menu` thấy nhãn từ cơ sở dữ
/// liệu — nên AI suy luận trên dữ liệu dày gấp gần chín lần thứ khách thật nhìn thấy.
///
/// Nhãn cũng đổi dạng: từ tiếng Việt trần (`toi`, `ca`, `nam`) sang khóa có không gian
/// tên (`meal:dinner`, `ingredient:fish`, `ingredient:mushroom`). Dạng cũ trùng với từ
/// thông thường sau khi rút dấu, và đó là gốc của bảy lỗi trong bản AI trước
/// (`cua`/`của`, `chay`/`chạy`, `muc`/`mức`...). Khách không bao giờ gõ `meal:dinner`,
/// nên cả lớp lỗi đó biến mất về mặt cấu trúc.
///
/// Nhãn hiển thị cho khách không đổi: giao diện tra `backend/data/menu-tags.json` và
/// nhận cả khóa mới lẫn tên cũ, nên "Tối", "Cá", "Bình dân" vẫn hiện như trước.""",
    "AddsWholeRoastMethodTag": """/// Thêm giá trị nhãn `method:whole_roast` ("Quay") và gán nó cho "Gà rô ti kiểu Việt".
///
/// Thực đơn có "Rang" và "Nướng" nhưng KHÔNG có "Quay", nên món duy nhất là quay phải mượn
/// một trong hai — và cả hai đều sai theo một hướng khác nhau:
///
///     Rang   đảo chảo khô với muối/me/bơ tỏi (Cua rang me, Tôm rang muối)
///     Nướng  lửa trực tiếp
///     Quay   làm chín nguyên con cho giòn da  <- "ướp ngũ vị hương, mật ong ... rồi QUAY giòn"
///
/// Trước migration này món mang `method:grilled`, nên câu "cho mình món nướng" trả về một món
/// quay. Sai nhỏ, nhưng nó là loại sai không có cách nào tự lộ ra: không ca đánh giá nào hỏi
/// "món quay", và tài liệu tri thức `method-*.md` sinh từ chính bộ nhãn này nên nó cũng đếm
/// theo nhãn sai.
///
/// Tìm ra bằng bộ soát đối chiếu TÊN món với nhãn chế biến — `ai/scripts/audit_method_tags.py`,
/// thêm vào CI cùng migration này. Bộ soát chỉ đọc TÊN, không đọc mô tả: tên do bếp đặt và nói
/// đúng cách chế biến chính, còn mô tả nhắc cả món ăn kèm ("cuốn bánh tráng", "heo quay giòn
/// da" là topping của bún mắm). Đọc cả mô tả thì 12 cảnh báo mà 11 là dương tính giả; chỉ đọc
/// tên thì 1 cảnh báo và nó đúng.
///
/// Migration này cũng là phiên bản đầu tiên có `Down()` ĐÚNG. Hai phiên bản trước lùi về nhãn
/// seed gốc thay vì về phiên bản liền trước, do bộ đọc quét cả tệp migration trước và giữ lần
/// khớp cuối — tức phần `Down()` của nó. Không đường chạy nào gọi `Down()` nên lỗi nằm im. Sửa
/// được an toàn ở đây vì script chỉ ghi lại migration CUỐI, nên hai phiên bản đã chạy trên
/// production không bị đụng tới.""",
    "AddsCoolingSeasonTagsFromDescriptionAudit": """/// Thêm `season:cooling` cho ba món mà bản rà nhãn tìm ra, và đưa cơ sở dữ liệu về đúng
/// bộ nhãn của `backend/data/menu-dataset.json`.
///
/// Vì sao cần migration THỨ HAI thay vì sửa migration trước: EF ghi migration đã chạy vào
/// `__EFMigrationsHistory` và không chạy lại. Sửa migration cũ chỉ ảnh hưởng cơ sở dữ liệu
/// mới tạo — cơ sở dữ liệu đang chạy giữ nhãn cũ mãi, nên **trợ lý AI thấy nhãn mới mà
/// trang thực đơn của khách thì không**. Đó đúng là lớp lệch hai nguồn mà migration trước
/// tồn tại để hợp nhất, nên để nó tái diễn là mất luôn ý nghĩa của lần hợp nhất đó.
///
/// Ba món, và bằng chứng nằm ngay trong mô tả CỦA CHÍNH MÓN — không suy từ ca đánh giá:
///
///     Gỏi cuốn tôm thịt         "Cuốn TƯƠI MÁT ... ít dầu mỡ"
///     Bánh tráng cuốn thịt heo  "THANH MÁT, không dầu mỡ. PHÙ HỢP MÙA NÓNG"
///     Đĩa trái cây theo mùa     "Đĩa trái cây tươi ... TƯƠI MÁT, giàu vitamin"
///
/// `ai/scripts/audit_season_tags.py` tìm ra chúng bằng cách đối chiếu nhãn với mô tả, và
/// gắn cờ 10 chỗ — 7 trong 10 là dương tính giả (Trà sen Tây Hồ ghi "hãm nóng", bia ghi
/// "thanh mát" để mô tả VỊ...), nên bản rà cố tình KHÔNG tự sửa dữ liệu.
///
/// `season:cooling` cho món ăn: 2/56 -> 4/56.""",
}

HEADER = '''using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantQrAiOrdering.Api.Data.Migrations;

/// <summary>
{description}
///
/// Sinh bởi `ai/scripts/build_tag_migration.py` — sửa nhãn thì chạy lại script, đừng sửa
/// tay tệp này. Nhãn đổi SAU khi migration này đã chạy trên cơ sở dữ liệu thật thì phải
/// thêm một phiên bản mới vào `REVISIONS`, không sửa lại tệp này.
/// </summary>
[DbContext(typeof(RestaurantDbContext))]
[Migration("{stamp}_{cls}")]
public partial class {cls} : Migration
{{
    protected override void Up(MigrationBuilder migrationBuilder)
    {{
        // Cập nhật theo mã món, không theo tên: tên có thể đổi, mã thì không.
        migrationBuilder.Sql(
            """
{up_sql}
            """);
    }}

    protected override void Down(MigrationBuilder migrationBuilder)
    {{
        // Trả về đúng bộ nhãn của phiên bản TRƯỚC để lùi được, kể cả bộ cũ vốn thiếu và lệch.
        migrationBuilder.Sql(
            """
{down_sql}
            """);
    }}
}}
'''


def sql_array(tags: list[str]) -> str:
    """Mảng text của PostgreSQL. Nhãn chỉ gồm chữ, số, `_` và `:` nên không có dấu ' —
    vẫn thoát để nếu sau này nhãn có dấu nháy thì không sinh SQL hỏng."""
    inner = ", ".join("'" + t.replace("'", "''") + "'" for t in tags)
    return f"ARRAY[{inner}]::text[]"


def read_old_tags() -> dict[str, list[str]]:
    """Đọc nhãn của phiên bản TRƯỚC, để `Down()` lùi được.

    Nguồn là **tệp migration của phiên bản trước**, không phải một bản sao lưu ở đâu khác. Nhờ mỗi
    phiên bản đặt nhãn cho cả 91 món (không chỉ món đổi), tệp migration TỰ LÀ nguồn trạng thái —
    không có chỗ thứ hai để lệch.

    Với phiên bản đầu thì nguồn là migration seed gốc, và nó dùng HAI dạng câu lệnh nên phần đọc
    dưới đây phải chịu cả hai. Với phiên bản sau thì nguồn là các câu `UPDATE ... ARRAY[...]` do
    chính script này sinh ra, đọc bằng một mẫu riêng vì hình dạng khác hoàn toàn.
    """
    text = PREV_MIGRATION.read_text(encoding="utf-8-sig")

    # CHỈ đọc phần `Up()` của phiên bản trước.
    #
    # Docstring ngay trên nói "`Down()` của phiên bản N chỉ cần đọc `Up()` của phiên bản N-1" —
    # nhưng mã lại quét CẢ TỆP, và `dict()` giữ lần khớp CUỐI. `Down()` nằm sau `Up()`, nên thứ
    # thắng là nhãn mà phiên bản trước dùng để LÙI, tức nhãn seed gốc.
    #
    # Hậu quả: `Down()` của mọi phiên bản đều đưa cơ sở dữ liệu về nhãn tiếng Việt trần thời seed
    # đầu (`'nuong'`, `'hap'`, `'gia dinh'`) thay vì về phiên bản liền trước. Lùi một phiên bản nhãn
    # sẽ xoá sạch toàn bộ nhãn có không gian tên — đúng thứ migration đầu tiên tồn tại để dựng lên,
    # và là thứ trợ lý AI đọc.
    #
    # Lỗi có sẵn từ trước; không đường chạy nào gọi `Down()` nên không ai thấy. Đây là lớp "mã trái
    # với tài liệu của chính nó", và phần trái là phần không có test — nên bản sửa này đi kèm một
    # test đọc thẳng SQL sinh ra.
    #
    # Sửa được AN TOÀN chỉ vì cùng lúc có phiên bản MỚI: script chỉ ghi lại migration cuối trong
    # `REVISIONS`, nên hai phiên bản đã chạy trên production không bị đụng tới.
    if "void Up" in text and "void Down" in text:
        text = text[text.index("void Up"):text.index("void Down")]

    # Phiên bản sinh bởi script này: `UPDATE menu_items SET tags = ARRAY['a', 'b']::text[]
    #     WHERE id = 'm_001';`
    tu_update = dict(
        (m.group(2), [t.strip().strip("'") for t in m.group(1).split(",") if t.strip()])
        for m in re.finditer(
            r"UPDATE menu_items SET tags = ARRAY\[([^\]]*)\]::text\[\]\s+WHERE id = '(m_\d+)';",
            text,
        )
    )
    if tu_update:
        return tu_update

    out: dict[str, list[str]] = {}
    # Migration seed dùng hai dạng: `UpdateData` ghi `keyValue: "m_001"`, còn
    # `InsertData` ghi `{ "m_048", ... }`.
    #
    # Phải lấy mảng `new[] {...}` **cuối cùng** trong khối, không phải đầu tiên: dạng
    # `UpdateData` có `columns: new[] { "category_id", ... }` đứng trước
    # `values: new object[] { ..., new[] { <nhãn> } }`. Lấy mảng đầu tiên thì thu về tên
    # cột thay vì nhãn — và với 12 món, `Down()` sẽ ghi "category_id" vào ô nhãn.
    positions = [(m.group(1), m.end()) for m in re.finditer(r'"(m_\d+)"', text)]
    for index, (item_id, end) in enumerate(positions):
        if item_id in out:
            continue
        # Biên là cái nào đến trước: mã món kế tiếp, hoặc `});` kết thúc câu lệnh
        # `migrationBuilder`. Thiếu biên thứ hai thì món cuối của một chuỗi `UpdateData`
        # sẽ trùm sang khối `InsertData` ngay sau nó và thu về danh sách tên cột.
        stop = positions[index + 1][1] if index + 1 < len(positions) else len(text)
        closer = text.find("});", end)
        if closer != -1:
            stop = min(stop, closer)
        arrays = re.findall(r"new\[\]\s*\{([^}]*)\}", text[end:stop])
        if not arrays:
            continue
        out[item_id] = re.findall(r'"([^"]+)"', arrays[-1])
    return out


def build(
    menu: dict, old: dict[str, list[str]], legacy_vocab: set[str]
) -> tuple[str, str, list[str]]:
    problems: list[str] = []
    up, down = [], []
    # Bất biến: mọi nhãn cũ phải nằm trong từ vựng nhãn cũ. Nếu bộ đọc bắt sai khối —
    # ví dụ đọc `columns: new[] { "category_id", ... }` thay vì mảng nhãn — thì lỗi lộ
    # ra ngay đây thay vì đi vào `Down()` của một migration đã chạy trên production.
    for item_id, tags in sorted(old.items()):
        stray = [t for t in tags if t not in legacy_vocab]
        if stray:
            problems.append(
                f"{item_id}: nhãn cũ đọc được không có trong từ vựng nhãn cũ: {stray}"
            )
    for item in menu["items"]:
        item_id = item["id"]
        up.append(
            f"            UPDATE menu_items SET tags = {sql_array(item['tags'])}\n"
            f"                WHERE id = '{item_id}';"
        )
        if item_id not in old:
            problems.append(f"không tìm được nhãn cũ của {item_id} để lùi lại")
            continue
        down.append(
            f"            UPDATE menu_items SET tags = {sql_array(old[item_id])}\n"
            f"                WHERE id = '{item_id}';"
        )
    return "\n".join(up), "\n".join(down), problems


def update_snapshot(menu: dict) -> tuple[int, list[str]]:
    """Đổi mảng `Tags` của từng món trong snapshot, khớp theo `Id = "m_0xx"` ở trên nó."""
    text = SNAPSHOT_PATH.read_text(encoding="utf-8-sig")
    by_id = {m["id"]: m for m in menu["items"]}
    changed = 0
    problems: list[str] = []

    def replace(match: re.Match[str]) -> str:
        nonlocal changed
        item = by_id.get(match.group("id"))
        if item is None:
            return match.group(0)
        new_inner = ", ".join(f'"{t}"' for t in item["tags"])
        if match.group("tags").strip() == new_inner:
            return match.group(0)
        changed += 1
        return (
            match.group(0)[: match.start("tags") - match.start()]
            + " "
            + new_inner
            + " "
            + match.group(0)[match.end("tags") - match.start() :]
        )

    pattern = re.compile(
        r'Id = "(?P<id>m_\d+)",(?P<mid>.*?)Tags = new\[\] \{(?P<tags>[^}]*)\}', re.S
    )
    updated, count = pattern.subn(replace, text)
    if count != len(by_id):
        problems.append(
            f"snapshot khớp {count} món nhưng thực đơn có {len(by_id)} — mẫu đọc có thể lạc hậu"
        )
    return changed, problems if problems else [updated]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Chỉ kiểm, không ghi.")
    args = parser.parse_args(argv)

    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    dictionary = json.loads(
        (REPO_ROOT / "data" / "menu-tags.json").read_text(encoding="utf-8-sig")
    )
    # Từ vựng để kiểm nhãn cũ phải theo ĐÚNG NGUỒN đang đọc.
    #
    # Phiên bản ĐẦU đọc migration seed, nơi nhãn là tiếng Việt trần (`nuong`, `hap`) — từ vựng là
    # `legacy_key`. Phiên bản SAU đọc migration do chính script này sinh, nơi nhãn đã có không gian
    # tên (`method:grilled`) — từ vựng là chính khóa nhãn.
    #
    # Dùng nhầm từ vựng thì phép kiểm báo cả 91 món "nhãn lạ" và chặn việc sinh, dù dữ liệu đúng.
    # Bất biến giữ nguyên ý nghĩa: nhãn đọc được phải nằm trong một từ vựng ĐÃ BIẾT, để lỗi đọc sai
    # khối lộ ra ở đây thay vì đi vào `Down()` của một migration đã chạy trên production.
    legacy_vocab = (
        {e["legacy_key"] for e in dictionary["tags"].values()}
        if PREV_MIGRATION == SEED_MIGRATION
        else set(dictionary["tags"])
    )
    old = read_old_tags()
    up_sql, down_sql, problems = build(menu, old, legacy_vocab)

    print(f"món trong thực đơn        : {len(menu['items'])}")
    print(f"món đọc được nhãn cũ      : {len(old)}")
    print(f"câu UPDATE sinh ra        : {up_sql.count('UPDATE')} lên / {down_sql.count('UPDATE')} lùi")

    snap_text = SNAPSHOT_PATH.read_text(encoding="utf-8-sig")
    changed, snap_result = update_snapshot(menu)
    if snap_result and isinstance(snap_result[0], str) and snap_result[0].startswith("snapshot khớp"):
        problems.extend(snap_result)
        new_snapshot = None
    else:
        new_snapshot = snap_result[0]
    print(f"món đổi nhãn trong snapshot: {changed}")

    if problems:
        print(f"\nVẤN ĐỀ ({len(problems)}):")
        for line in problems:
            print(f"  - {line}")
        return 2

    if args.check:
        # SO tệp sinh ra với tệp đã commit, và trả mã KHÁC 0 khi lệch.
        #
        # Bản đầu của `--check` chỉ in số rồi trả 0 — tức nó không kiểm gì cả, và CI vẫn xanh khi
        # migration đã lạc hậu so với thực đơn. Đúng lỗi đó đã xảy ra: 3 nhãn được thêm vào thực
        # đơn, `build_tag_dictionary.py --check` đỏ đúng và bắt được tệp seed, nhưng bước này im
        # lặng — nên nếu chỉ tin CI thì cơ sở dữ liệu sẽ lệch mà không ai biết.
        #
        # Mọi `--check` khác trong dự án đều so tệp; bước này phải theo cùng hợp đồng.
        moi_mig = HEADER.format(stamp=STAMP, cls=CLASS_NAME, up_sql=up_sql, down_sql=down_sql,
                                description=DESCRIPTIONS[CLASS_NAME])
        lech = []
        if not MIGRATION_PATH.exists():
            lech.append(f"{MIGRATION_PATH.name} CHƯA TỒN TẠI")
        elif MIGRATION_PATH.read_text(encoding="utf-8-sig") != moi_mig:
            lech.append(f"{MIGRATION_PATH.name} khác kết quả sinh lại")
        if new_snapshot is not None and new_snapshot != snap_text:
            lech.append(f"{SNAPSHOT_PATH.name} khác kết quả sinh lại")
        if lech:
            print(f"\nTỆP ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI ({len(lech)}):")
            for l in lech:
                print(f"  - {l}")
            print("Chạy `python ai/scripts/build_tag_migration.py` để cập nhật.")
            return 1
        print("\n--check: không ghi tệp nào.")
        return 0

    MIGRATION_PATH.write_text(
        HEADER.format(stamp=STAMP, cls=CLASS_NAME, up_sql=up_sql, down_sql=down_sql,
                      description=DESCRIPTIONS[CLASS_NAME]),
        encoding="utf-8",
    )
    if new_snapshot is not None and new_snapshot != snap_text:
        SNAPSHOT_PATH.write_text(new_snapshot, encoding="utf-8")
    print(f"\nĐã ghi {MIGRATION_PATH.relative_to(REPO_ROOT)}")
    print(f"Đã ghi {SNAPSHOT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
