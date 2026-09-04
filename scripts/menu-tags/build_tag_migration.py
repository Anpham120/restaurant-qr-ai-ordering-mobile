# -*- coding: utf-8 -*-
"""Sinh migration Flyway cập nhật NHÃN thực đơn cho cơ sở dữ liệu ĐANG CHẠY.

    python ai/scripts/build_tag_migration.py            # sinh migration mới nếu có lệch
    python ai/scripts/build_tag_migration.py --check    # đỏ nếu có lệch mà chưa sinh

Vấn đề bộ này giải
------------------
`data/menu-dataset.json` (AI dùng) và bảng `menu_items` (khách thấy qua `/api/menu`) phải mang
CÙNG bộ nhãn. Hai nguồn từng lệch nhau âm thầm nhiều tháng — 1,7 nhãn/món ở cơ sở dữ liệu so với
15 nhãn/món ở tệp JSON — nên AI suy luận trên dữ liệu dày gấp gần chín lần thứ khách thật nhìn thấy.

Bản .NET có `build_tag_migration.py` sinh migration EF Core cho việc này. Nó bị gỡ cùng backend .NET
ở #59 vì không còn đích để ghi, và món nợ được ghi thành issue #110 thay vì giấu đi.

Vì sao KHÔNG sửa thẳng V2
-------------------------
`V2__seed_official_menu_and_tables.sql` là migration **ĐÃ CHẠY**. Flyway lưu checksum của từng
migration đã áp dụng, nên sửa nội dung nó khiến **mọi cơ sở dữ liệu đang có dữ liệu thật từ chối
khởi động** với lỗi checksum.

Điều làm cái bẫy này nguy hiểm: máy lập trình tạo cơ sở dữ liệu MỚI từ đầu nên chạy tốt. Người sửa
thấy xanh, đẩy lên, và chỉ môi trường có dữ liệu mới chết.

Trạng thái "hiệu lực" là gì
---------------------------
Không phải nội dung V2, mà là V2 **cộng mọi migration cập nhật nhãn sau nó**. Bộ này và
`build_tag_dictionary.py` dùng chung một hàm đọc (`doc_nhan_hieu_luc`) — hai cổng đọc hai nguồn
khác nhau thì sớm muộn sẽ nói ngược nhau, và người ta sẽ tin cái đang xanh.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"
MIGRATIONS = REPO_ROOT / "backend-java" / "src" / "main" / "resources" / "db" / "migration"
SEED = MIGRATIONS / "V2__seed_official_menu_and_tables.sql"

# INSERT của seed: ..., 'm_004', 'cat_appetizer', 'Tên món', 'mô tả', 55000.00, '/menu-images/…',
#                  true, '{tag:a,tag:b}', ...
SEED_RE = re.compile(
    r"INSERT INTO public\.menu_items[^;]*?VALUES \('(?P<id>[^']+)', '(?P<cat>[^']+)', "
    r"'(?P<name>(?:[^']|'')+)', '(?P<desc>(?:[^']|'')*)', (?P<price>\d+)\.\d+, "
    r"'(?P<slug>[^']*)', \w+, '\{(?P<tags>[^}]*)\}'"
)

# UPDATE của các migration nhãn về sau. CHỈ khớp câu đặt `tags` — `V8` cũng UPDATE `menu_items`
# nhưng đặt `image_url`, và gộp nhầm nó vào đây sẽ làm trạng thái nhãn sai.
UPDATE_RE = re.compile(
    r"UPDATE public\.menu_items\s+SET\s+tags\s*=\s*'\{(?P<tags>[^}]*)\}'[^;]*?"
    r"WHERE\s+id\s*=\s*'(?P<id>[^']+)'",
    re.IGNORECASE | re.DOTALL,
)

VERSION_RE = re.compile(r"^V(\d+)__")


def _ten(raw: str) -> str:
    """SQL thoát dấu nháy đơn bằng cách nhân đôi; trả lại dạng người đọc."""
    return raw.replace("''", "'")


def doc_nhan_hieu_luc() -> dict[str, list[str]]:
    """Nhãn mà một cơ sở dữ liệu đã chạy HẾT migration sẽ có: {tên món: [nhãn đã sắp xếp]}.

    Đọc V2 rồi áp lần lượt mọi `UPDATE ... SET tags` của các migration sau, theo đúng thứ tự số
    hiệu — vì migration sau ghi đè migration trước, và đọc sai thứ tự sẽ cho một trạng thái không
    cơ sở dữ liệu nào từng ở trong đó.
    """
    theo_id: dict[str, tuple[str, list[str]]] = {}
    for m in SEED_RE.finditer(SEED.read_text(encoding="utf-8-sig")):
        tags = [t for t in m.group("tags").split(",") if t]
        theo_id[m.group("id")] = (_ten(m.group("name")), sorted(tags))

    for path in sorted(MIGRATIONS.glob("V*.sql"), key=_so_hieu):
        if path.name == SEED.name:
            continue
        for m in UPDATE_RE.finditer(path.read_text(encoding="utf-8-sig")):
            mon = theo_id.get(m.group("id"))
            if mon is None:
                continue
            tags = [t for t in m.group("tags").split(",") if t]
            theo_id[m.group("id")] = (mon[0], sorted(tags))

    return {ten: tags for ten, tags in theo_id.values()}


def _so_hieu(path: Path) -> int:
    khop = VERSION_RE.match(path.name)
    return int(khop.group(1)) if khop else 0


def _id_theo_ten() -> dict[str, str]:
    return {
        _ten(m.group("name")): m.group("id")
        for m in SEED_RE.finditer(SEED.read_text(encoding="utf-8-sig"))
    }


def lech() -> list[tuple[str, str, list[str], list[str]]]:
    """[(mã món, tên món, nhãn đang có, nhãn mong muốn)] cho những món khác nhau."""
    hieu_luc = doc_nhan_hieu_luc()
    ids = _id_theo_ten()
    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))

    ra = []
    for item in menu["items"]:
        ten = item["name"]
        muon = sorted(item.get("tags") or [])
        dang_co = hieu_luc.get(ten)
        if dang_co is None or ten not in ids:
            # Món có trong tệp JSON mà không có trong seed là chuyện khác — thêm/bớt MÓN cần một
            # migration khác hẳn (INSERT/DELETE), không phải cập nhật nhãn. Báo ra thay vì lặng lẽ
            # sinh một câu UPDATE không khớp dòng nào.
            print(f"  CẢNH BÁO: '{ten}' có trong menu-dataset.json nhưng không có trong seed",
                  file=sys.stderr)
            continue
        if dang_co != muon:
            ra.append((ids[ten], ten, dang_co, muon))
    return ra


def _so_hieu_tiep() -> int:
    return max((_so_hieu(p) for p in MIGRATIONS.glob("V*.sql")), default=0) + 1


def sinh(lech_list) -> Path:
    so = _so_hieu_tiep()
    path = MIGRATIONS / f"V{so}__update_menu_tags.sql"
    dong = [
        "-- Cập nhật nhãn thực đơn cho cơ sở dữ liệu ĐANG CHẠY.",
        "--",
        "-- SINH TỰ ĐỘNG bởi `ai/scripts/build_tag_migration.py` — đừng sửa tay; sửa",
        "-- `data/menu-dataset.json` rồi chạy lại bộ sinh.",
        "--",
        "-- Vì sao là một migration MỚI chứ không sửa V2: V2 đã chạy trên mọi cơ sở dữ liệu có dữ",
        "-- liệu thật, và Flyway lưu checksum của migration đã áp dụng — sửa nó là làm chúng từ chối",
        "-- khởi động. Máy lập trình không thấy vì nó tạo cơ sở dữ liệu mới từ đầu.",
        "",
    ]
    for ma, ten, cu, moi in lech_list:
        them = [t for t in moi if t not in cu]
        bot = [t for t in cu if t not in moi]
        dong.append(f"-- {ten}"
                    + (f" · thêm {','.join(them)}" if them else "")
                    + (f" · bớt {','.join(bot)}" if bot else ""))
        dong.append(
            f"UPDATE public.menu_items SET tags = '{{{','.join(moi)}}}', updated_at = now() "
            f"WHERE id = '{ma}';")
    dong.append("")
    path.write_text("\n".join(dong), encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="Chỉ kiểm, không ghi.")
    args = p.parse_args(argv)

    d = lech()
    print(f"món trong seed        : {len(doc_nhan_hieu_luc())}")
    print(f"món lệch nhãn         : {len(d)}")

    if not d:
        print("\nNhãn của cơ sở dữ liệu khớp menu-dataset.json — không cần migration mới.")
        return 0

    for ma, ten, cu, moi in d[:10]:
        print(f"  {ma} {ten}: {len(cu)} nhãn -> {len(moi)} nhãn")
    if len(d) > 10:
        print(f"  … và {len(d) - 10} món nữa")

    if args.check:
        print("\nCÓ LỆCH NHÃN MÀ CHƯA CÓ MIGRATION.")
        print("Chạy `python ai/scripts/build_tag_migration.py` rồi commit tệp sinh ra.")
        return 1

    path = sinh(d)
    print(f"\nĐã ghi {path.relative_to(REPO_ROOT)} ({len(d)} món).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
