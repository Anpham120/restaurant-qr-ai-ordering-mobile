# -*- coding: utf-8 -*-
"""Sinh khối SỐ LIỆU của báo cáo môn Lập trình nâng cao từ chính mã Java.

    python docs/build_bao_cao_lap_trinh_nang_cao.py            # sinh lại
    python docs/build_bao_cao_lap_trinh_nang_cao.py --check    # đỏ nếu tệp đã commit khác

Vì sao có bộ này
----------------
Dự án đã bốn lần phát hiện tài liệu nói sai trạng thái mã (`archive/README.md` khai đã chuyển 7 tệp
trong khi thư mục rỗng; `API_CONTRACT.md` liệt kê 10/84 endpoint; `ai/docs/05` ghi 425 đoạn khi kho
có 452; và mục `admin-check` mô tả một endpoint bản Java không có). Một BÁO CÁO NỘP MÔN còn dễ sai
hơn: nó viết một lần rồi không ai đọc lại, trong khi mã tiếp tục đổi.

Nên mọi con số về bản Java trong báo cáo nằm giữa hai mốc `SINH:` và được sinh từ mã.

Điều bộ này KHÔNG làm
---------------------
Không sinh số liệu bản .NET. Thư mục `backend/` đã bị xoá ở #59, nên những con số đó là **lịch sử
đã niêm phong**: chúng không thể đổi nữa, và cũng không đọc lại được nếu không có lịch sử git đầy
đủ (CI mặc định clone nông). Báo cáo ghi chúng thành hằng, kèm commit và lệnh tái lập — đó là cách
trung thực duy nhất cho một thứ không còn tồn tại.

Cũng không viết phần LÝ LẼ. Bộ này biết bản Java có bao nhiêu dòng, không biết vì sao chọn kiến
trúc lục giác cho `orders` mà không cho `menu`. Phần đó là của người viết.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BAO_CAO = REPO_ROOT / "docs" / "bao-cao" / "BAO_CAO_LAP_TRINH_NANG_CAO.md"
JAVA_MAIN = REPO_ROOT / "backend-java" / "src" / "main" / "java"
JAVA_TEST = REPO_ROOT / "backend-java" / "src" / "test" / "java"
MIGRATIONS = REPO_ROOT / "backend-java" / "src" / "main" / "resources" / "db" / "migration"
BUILD_GRADLE = REPO_ROOT / "backend-java" / "build.gradle"
API_CONTRACT = REPO_ROOT / "docs" / "backend" / "API_CONTRACT.md"

BAT_DAU = "<!-- SINH:so-lieu-java -->"
KET_THUC = "<!-- HET:so-lieu-java -->"


def dem_dong(paths) -> int:
    return sum(len(p.read_text(encoding="utf-8-sig").splitlines()) for p in paths)


def so_lieu() -> dict:
    main = sorted(JAVA_MAIN.rglob("*.java"))
    test = sorted(JAVA_TEST.rglob("*.java"))
    sql = sorted(MIGRATIONS.glob("*.sql"))

    # `@Test` đếm theo lần xuất hiện, không theo phương thức: một `@Test` luôn đi với đúng một
    # phương thức test trong JUnit 5, và đếm theo chuỗi thì không cần phân tích cú pháp Java.
    so_test = sum(p.read_text(encoding="utf-8-sig").count("@Test") for p in test)

    # ArchUnit khai bằng trường `ArchRule`, không phải `@Test` — nên nó KHÔNG nằm trong `so_test`.
    # Đây là chỗ dễ đếm nhầm thành 0 test kiến trúc.
    arch = 0
    for p in test:
        arch += len(re.findall(r"\bArchRule\s+\w+\s*=", p.read_text(encoding="utf-8-sig")))

    gradle = BUILD_GRADLE.read_text(encoding="utf-8-sig")
    spring = re.search(r"org\.springframework\.boot'\s+version\s+'([\d.]+)'", gradle)
    java_ver = re.search(r"JavaLanguageVersion\.of\((\d+)\)", gradle)

    endpoint = re.search(r"\*\*(\d+) endpoint\*\*", API_CONTRACT.read_text(encoding="utf-8-sig"))

    modules = sorted(d.name for d in (JAVA_MAIN / "com" / "cmc" / "restaurant").iterdir() if d.is_dir())

    return {
        "tep_main": len(main),
        "dong_main": dem_dong(main),
        "tep_test": len(test),
        "dong_test": dem_dong(test),
        "so_test": so_test,
        "so_arch": arch,
        "migration": len(sql),
        "dong_migration": dem_dong(sql),
        "spring": spring.group(1) if spring else "?",
        "java": java_ver.group(1) if java_ver else "?",
        "endpoint": int(endpoint.group(1)) if endpoint else 0,
        "modules": modules,
    }


def nghin(n: int) -> str:
    """Dấu chấm phân cách hàng nghìn, kiểu Việt Nam.

    Viết riêng thay vì `f"{n:,}".replace(",", ".")`: bản đó thay MỌI dấu phẩy trong chuỗi kết quả,
    nên `"7 tệp, 1,520 dòng"` thành `"7 tệp. 1.520 dòng"` — nuốt luôn dấu phẩy của câu văn.
    """
    return f"{n:,}".replace(",", ".")


def khoi(s: dict) -> str:
    d = [
        BAT_DAU,
        "",
        "| Chỉ số | Giá trị |",
        "|---|---|",
        f"| Java | {s['java']} |",
        f"| Spring Boot | {s['spring']} |",
        f"| Endpoint | {s['endpoint']} |",
        f"| Module | {len(s['modules'])} — {', '.join(f'`{m}`' for m in s['modules'])} |",
        f"| Tệp nguồn `.java` | {s['tep_main']} |",
        f"| Dòng mã nguồn | {nghin(s['dong_main'])} |",
        f"| Tệp test | {s['tep_test']} |",
        f"| Dòng mã test | {nghin(s['dong_test'])} |",
        f"| Phương thức `@Test` | {s['so_test']} |",
        f"| Quy tắc ArchUnit | {s['so_arch']} |",
        f"| Migration Flyway | {s['migration']} tệp, {nghin(s['dong_migration'])} dòng SQL |",
        "",
        "> Bảng này SINH TỪ MÃ (`docs/build_bao_cao_lap_trinh_nang_cao.py`), có cổng `--check` ở CI.",
        "> Quy tắc ArchUnit khai bằng trường `ArchRule` chứ không phải `@Test`, nên chúng KHÔNG nằm",
        "> trong con số `@Test` ở trên — đếm gộp sẽ làm bảng nói sai theo cả hai chiều.",
        "",
        KET_THUC,
    ]
    return "\n".join(d)


def ghi(check: bool) -> int:
    if not BAO_CAO.exists():
        print(f"không tìm thấy {BAO_CAO.relative_to(REPO_ROOT)}", file=sys.stderr)
        return 2

    goc = BAO_CAO.read_text(encoding="utf-8-sig")
    if BAT_DAU not in goc or KET_THUC not in goc:
        print(f"{BAO_CAO.name} thiếu mốc {BAT_DAU} / {KET_THUC}", file=sys.stderr)
        return 2

    dau = goc.index(BAT_DAU)
    cuoi = goc.index(KET_THUC) + len(KET_THUC)
    moi = goc[:dau] + khoi(so_lieu()) + goc[cuoi:]

    if check:
        if moi != goc:
            print("BÁO CÁO ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI.")
            print("Chạy `python docs/build_bao_cao_lap_trinh_nang_cao.py` rồi commit lại.")
            return 1
        print("--check: khối số liệu khớp mã.")
        return 0

    BAO_CAO.write_text(moi, encoding="utf-8")
    s = so_lieu()
    print(f"Đã ghi {BAO_CAO.relative_to(REPO_ROOT)} — "
          f"{s['endpoint']} endpoint, {s['dong_main']} dòng mã, {s['so_test']} test.")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="Chỉ kiểm, không ghi.")
    return ghi(p.parse_args(argv).check)


if __name__ == "__main__":
    raise SystemExit(main())
