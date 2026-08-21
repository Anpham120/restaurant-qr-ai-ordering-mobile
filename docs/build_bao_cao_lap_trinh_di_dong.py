# -*- coding: utf-8 -*-
"""Sinh khối SỐ LIỆU của báo cáo môn Lập trình ứng dụng di động từ chính mã Dart.

    python docs/build_bao_cao_lap_trinh_di_dong.py            # sinh lại
    python docs/build_bao_cao_lap_trinh_di_dong.py --check    # đỏ nếu tệp đã commit khác

Vì sao có bộ này
----------------
Cùng lý do với `build_bao_cao_lap_trinh_nang_cao.py`: một BÁO CÁO NỘP MÔN viết một lần rồi không
ai đọc lại, trong khi mã tiếp tục đổi. Dự án đã bốn lần phát hiện tài liệu nói sai trạng thái mã.

Nên mọi con số về app Flutter trong báo cáo nằm giữa hai mốc `SINH:` và được sinh từ mã.

Điều bộ này KHÔNG làm
---------------------
Không đếm `mobile/android` và `mobile/ios`. Đó là khung do `flutter create` sinh ra, không phải mã
người viết; đếm chúng sẽ thổi phồng con số bằng thứ không ai tác giả.

Không viết phần LÝ LẼ. Bộ này biết app có bao nhiêu màn hình, không biết vì sao gợi ý của trợ lý
phải là nút bấm chứ không phải hành động tự động. Phần đó là của người viết.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BAO_CAO = REPO_ROOT / "docs" / "bao-cao" / "BAO_CAO_LAP_TRINH_DI_DONG.md"
MOBILE = REPO_ROOT / "mobile"
LIB = MOBILE / "lib"
TEST = MOBILE / "test"
PUBSPEC = MOBILE / "pubspec.yaml"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci-mobile.yml"

BAT_DAU = "<!-- SINH:so-lieu-flutter -->"
KET_THUC = "<!-- HET:so-lieu-flutter -->"


def _dart(thu_muc: Path) -> list[Path]:
    return sorted(p for p in thu_muc.rglob("*.dart")) if thu_muc.is_dir() else []


def _dong(files: list[Path]) -> int:
    return sum(len(p.read_text(encoding="utf-8").splitlines()) for p in files)


def _so(mau: str, noi_dung: str) -> int:
    return len(re.findall(mau, noi_dung))


def so_lieu() -> dict:
    lib = _dart(LIB)
    test = _dart(TEST)
    noi_dung_test = "\n".join(p.read_text(encoding="utf-8") for p in test)

    pubspec = PUBSPEC.read_text(encoding="utf-8") if PUBSPEC.exists() else ""
    phien_ban = re.search(r"flutter-version:\s*([0-9.]+)", WORKFLOW.read_text(encoding="utf-8")) \
        if WORKFLOW.exists() else None
    sdk = re.search(r'sdk:\s*"([^"]+)"', pubspec)

    # Phụ thuộc do người viết chọn, không tính `flutter`/`flutter_test` (luôn có).
    phu_thuoc = sorted(set(re.findall(r"^  ([a-z_]+):\s*\^", pubspec, re.MULTILINE)))

    man_hinh = sorted(p.stem for p in _dart(LIB / "ui"))
    lop_core = sorted({p.parent.name for p in _dart(LIB / "core") if p.parent != LIB / "core"})

    return {
        "flutter": phien_ban.group(1) if phien_ban else "?",
        "dart_sdk": sdk.group(1) if sdk else "?",
        "tep_lib": len(lib),
        "dong_lib": _dong(lib),
        "tep_test": len(test),
        "dong_test": _dong(test),
        # `test(` và `testWidgets(` — hai dạng ca kiểm của Flutter.
        "so_ca": _so(r"\btest\(", noi_dung_test) + _so(r"\btestWidgets\(", noi_dung_test),
        "man_hinh": man_hinh,
        "lop_core": lop_core,
        "phu_thuoc": phu_thuoc,
    }


def _nghin(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def khoi(s: dict) -> str:
    return "\n".join([
        BAT_DAU,
        "",
        "| Chỉ số | Giá trị |",
        "|---|---|",
        f"| Flutter (ghim ở CI) | {s['flutter']} |",
        f"| Dart SDK | `{s['dart_sdk']}` |",
        f"| Tệp nguồn `.dart` (`lib/`) | {s['tep_lib']} |",
        f"| Dòng mã nguồn | {_nghin(s['dong_lib'])} |",
        f"| Tệp test | {s['tep_test']} |",
        f"| Dòng mã test | {_nghin(s['dong_test'])} |",
        f"| Ca kiểm (`test` + `testWidgets`) | {s['so_ca']} |",
        f"| Màn hình | {len(s['man_hinh'])} — "
        + ", ".join(f"`{m}`" for m in s["man_hinh"]) + " |",
        f"| Nhóm lớp lõi | {len(s['lop_core'])} — "
        + ", ".join(f"`{m}`" for m in s["lop_core"]) + " |",
        f"| Phụ thuộc ngoài | {len(s['phu_thuoc'])} — "
        + ", ".join(f"`{m}`" for m in s["phu_thuoc"]) + " |",
        "",
        "> Bảng này SINH TỪ MÃ (`docs/build_bao_cao_lap_trinh_di_dong.py`), có cổng `--check` ở CI.",
        "> Không đếm `mobile/android` và `mobile/ios`: đó là khung do `flutter create` sinh ra.",
        "",
        KET_THUC,
    ])


def ghi(check: bool) -> int:
    if not MOBILE.is_dir():
        print("Không tìm thấy thư mục mobile/", file=sys.stderr)
        return 2
    if not BAO_CAO.exists():
        print(f"Không tìm thấy {BAO_CAO}", file=sys.stderr)
        return 2

    goc = BAO_CAO.read_text(encoding="utf-8")
    if BAT_DAU not in goc or KET_THUC not in goc:
        print(f"{BAO_CAO.name} thiếu mốc {BAT_DAU} / {KET_THUC}", file=sys.stderr)
        return 2

    dau = goc.index(BAT_DAU)
    cuoi = goc.index(KET_THUC) + len(KET_THUC)
    moi = goc[:dau] + khoi(so_lieu()) + goc[cuoi:]

    if check:
        if moi != goc:
            print("BÁO CÁO ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI.")
            print("Chạy `python docs/build_bao_cao_lap_trinh_di_dong.py` rồi commit lại.")
            return 1
        print("--check: khối số liệu khớp mã.")
        return 0

    BAO_CAO.write_text(moi, encoding="utf-8")
    s = so_lieu()
    print(f"Đã ghi {BAO_CAO.relative_to(REPO_ROOT)} — "
          f"{s['dong_lib']} dòng mã, {s['so_ca']} ca kiểm, {len(s['man_hinh'])} màn hình.")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="Chỉ kiểm, không ghi.")
    return ghi(p.parse_args(argv).check)


if __name__ == "__main__":
    raise SystemExit(main())
