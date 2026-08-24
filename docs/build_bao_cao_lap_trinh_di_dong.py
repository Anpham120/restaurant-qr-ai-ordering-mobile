# -*- coding: utf-8 -*-
"""Sinh khối SỐ LIỆU của báo cáo môn Lập trình ứng dụng di động từ chính mã TypeScript.

    python docs/build_bao_cao_lap_trinh_di_dong.py            # sinh lại
    python docs/build_bao_cao_lap_trinh_di_dong.py --check    # đỏ nếu tệp đã commit khác

Vì sao có bộ này
----------------
Cùng lý do với `build_bao_cao_lap_trinh_nang_cao.py`: một BÁO CÁO NỘP MÔN viết một lần rồi không
ai đọc lại, trong khi mã tiếp tục đổi. Dự án đã bốn lần phát hiện tài liệu nói sai trạng thái mã.

Nên mọi con số về app trong báo cáo nằm giữa hai mốc `SINH:` và được sinh từ mã.

App đã chuyển từ Flutter sang React Native (#145). Bộ này đọc `mobile-rn/` — cùng cơ chế, khác
nguồn. Mốc `SINH:so-lieu-flutter` giữ nguyên TÊN để không phải sửa tay báo cáo đã nộp; đổi tên
mốc chỉ tạo ra một lần diff vô nghĩa và một lần nữa quên đồng bộ.

Điều bộ này KHÔNG làm
---------------------
Không đếm `node_modules`, `android`, `ios`. Đó là thứ công cụ sinh ra, không phải mã người viết;
đếm chúng sẽ thổi phồng con số bằng thứ không ai tác giả.

Không viết phần LÝ LẼ. Bộ này biết app có bao nhiêu màn hình, không biết vì sao gợi ý của trợ lý
phải là nút bấm chứ không phải hành động tự động. Phần đó là của người viết.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BAO_CAO = REPO_ROOT / "docs" / "bao-cao" / "BAO_CAO_LAP_TRINH_DI_DONG.md"
MOBILE = REPO_ROOT / "mobile-rn"
LIB = MOBILE / "src"
PACKAGE_JSON = MOBILE / "package.json"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci-mobile.yml"

BAT_DAU = "<!-- SINH:so-lieu-flutter -->"
KET_THUC = "<!-- HET:so-lieu-flutter -->"


def _ts(thu_muc: Path, *, test: bool) -> list[Path]:
    """Tệp .ts/.tsx. `test=True` lấy trong `__tests__`, `False` lấy phần còn lại."""
    if not thu_muc.is_dir():
        return []
    ds = list(thu_muc.rglob("*.ts")) + list(thu_muc.rglob("*.tsx"))
    return sorted(p for p in ds if ("__tests__" in p.parts) == test)


def _dong(files: list[Path]) -> int:
    return sum(len(p.read_text(encoding="utf-8").splitlines()) for p in files)


def _so(mau: str, noi_dung: str) -> int:
    return len(re.findall(mau, noi_dung))


def so_lieu() -> dict:
    nguon = _ts(LIB, test=False)
    if (MOBILE / "App.tsx").exists():
        nguon = sorted(nguon + [MOBILE / "App.tsx"])
    test = _ts(LIB, test=True)
    noi_dung_test = "\n".join(p.read_text(encoding="utf-8") for p in test)

    pkg = json.loads(PACKAGE_JSON.read_text(encoding="utf-8")) if PACKAGE_JSON.exists() else {}
    deps = pkg.get("dependencies", {})
    node = re.search(r"node-version:\s*([0-9.]+)", WORKFLOW.read_text(encoding="utf-8")) \
        if WORKFLOW.exists() else None

    # Phụ thuộc do NGƯỜI VIẾT chọn. Bỏ khung (luôn có) để con số nói đúng điều nó hứa.
    khung = {"expo", "react", "react-native", "expo-status-bar",
             "react-dom", "react-native-web", "@expo/metro-runtime"}
    phu_thuoc = sorted(k for k in deps if k not in khung)

    man_hinh = sorted(p.stem for p in _ts(LIB / "ui", test=False) if p.suffix == ".tsx")
    lop_core = sorted({p.parent.name for p in _ts(LIB / "core", test=False)
                       if p.parent != LIB / "core"})

    return {
        "expo": str(deps.get("expo", "?")).lstrip("~^"),
        "react_native": str(deps.get("react-native", "?")).lstrip("~^"),
        "node": node.group(1) if node else "?",
        "tep_lib": len(nguon),
        "dong_lib": _dong(nguon),
        "tep_test": len(test),
        "dong_test": _dong(test),
        # `it(` và `test(` — hai dạng ca kiểm của Jest. `it.each` sinh NHIỀU ca từ MỘT dòng, nên
        # đây là số ca KHAI BÁO, không phải số ca chạy. Bảng nói rõ điều đó.
        "so_ca": _so(r"\bit\(", noi_dung_test) + _so(r"\btest\(", noi_dung_test),
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
        f"| Expo SDK | {s['expo']} |",
        f"| React Native | {s['react_native']} |",
        f"| Node (ghim ở CI) | {s['node']} |",
        f"| Tệp nguồn `.ts`/`.tsx` | {s['tep_lib']} |",
        f"| Dòng mã nguồn | {_nghin(s['dong_lib'])} |",
        f"| Tệp test | {s['tep_test']} |",
        f"| Dòng mã test | {_nghin(s['dong_test'])} |",
        f"| Ca kiểm khai báo (`it` + `test`) | {s['so_ca']} |",
        f"| Màn hình | {len(s['man_hinh'])} — "
        + ", ".join(f"`{m}`" for m in s["man_hinh"]) + " |",
        f"| Nhóm lớp lõi | {len(s['lop_core'])} — "
        + ", ".join(f"`{m}`" for m in s["lop_core"]) + " |",
        f"| Phụ thuộc ngoài | {len(s['phu_thuoc'])} — "
        + ", ".join(f"`{m}`" for m in s["phu_thuoc"]) + " |",
        "",
        "> Bảng này SINH TỪ MÃ (`docs/build_bao_cao_lap_trinh_di_dong.py`), có cổng `--check` ở CI.",
        "> Không đếm `node_modules`, `android`, `ios`: đó là thứ công cụ sinh ra.",
        "> Số ca kiểm là số KHAI BÁO. `it.each` sinh nhiều ca từ một dòng, nên số ca CHẠY thật lớn",
        "> hơn — `npm test` là nguồn đúng cho con số đó.",
        "",
        KET_THUC,
    ])


def ghi(check: bool) -> int:
    if not MOBILE.is_dir():
        print("Không tìm thấy thư mục mobile-rn/", file=sys.stderr)
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
