# -*- coding: utf-8 -*-
"""Sinh KIỂM KÊ ENDPOINT trong `docs/backend/API_CONTRACT.md` từ chính mã backend.

    python docs/build_api_inventory.py            # sinh lại
    python docs/build_api_inventory.py --check    # đỏ nếu tệp đã commit khác kết quả sinh

Vì sao phải sinh
----------------
`API_CONTRACT.md` viết tay liệt kê **10 endpoint** trong khi backend có **84** — nó phủ 12% bề mặt
API. Người đọc tin vào nó rồi gọi một endpoint không có trong tài liệu, hoặc tệ hơn: tưởng endpoint
mình cần không tồn tại.

Đây là cùng một lỗi với `docs/archive/README.md` (khai đã chuyển 7 tệp trong khi thư mục rỗng) và
với `ai/docs/05` (ghi 425 đoạn trong khi kho có 452): **văn xuôi kể lại trạng thái mã thì luôn
trôi khỏi mã.**

Cách sửa không phải "cập nhật một lần" mà là **bỏ hẳn cơ hội trôi**: phần kiểm kê được sinh ra và
CI đối chiếu. Thêm endpoint mà quên chạy lại bộ sinh thì CI đỏ.

Phần nào SINH, phần nào người viết
----------------------------------
Chỉ phần giữa hai mốc `<!-- SINH:api-inventory -->` được sinh. Mọi phần khác — quy ước đặt tên, mã
lỗi, ví dụ payload, ghi chú hợp đồng — do người viết, vì máy không suy được ý nghĩa từ chữ ký hàm.

Giới hạn phải nói rõ: bộ này đọc chú giải định tuyến của Spring, nên nó biết **đường dẫn và động
từ**, KHÔNG biết **dạng phản hồi**. Một endpoint đổi kiểu trả về mà giữ nguyên đường dẫn thì kiểm
kê này vẫn xanh. Nó chặn được lớp lỗi "tài liệu thiếu endpoint", không chặn được lớp "tài liệu mô
tả sai hành vi".

Đổi nguồn quét: .NET -> Java (issue #58)
----------------------------------------
Bản đầu đọc `backend/src/**/*.cs`, tìm `app.MapGroup(...)` và `MapGet/MapPost/...`. Backend nay là
Spring Boot, nên nguồn là `backend-java/src/main/java/**/*.java` và hai mẫu tương đương:

    .NET                                      Spring
    var g = app.MapGroup("/api/auth")    ->   @RequestMapping("/api/auth")  (cấp lớp)
    g.MapPost("/login", ...)             ->   @PostMapping("/login")        (cấp phương thức)

Một khác biệt có thật, không phải ánh xạ 1-1: Spring cho phép `@PostMapping` **không kèm đường
dẫn**, nghĩa là dùng nguyên tiền tố của lớp. Bốn endpoint trong `AdminCategoryController` và
`AdminMenuItemController` đang ở dạng đó. Bỏ sót nhánh này thì bảng thiếu 4 endpoint mà `--check`
vẫn xanh — tức đúng lớp lỗi mà tệp này tồn tại để chặn.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent
REPO = DOCS.parent
SRC = REPO / "backend-java" / "src" / "main" / "java" / "com" / "cmc" / "restaurant"
OUT = DOCS / "backend" / "API_CONTRACT.md"

BAT_DAU = "<!-- SINH:api-inventory -->"
KET_THUC = "<!-- HET:api-inventory -->"

# Tiền tố cấp lớp. `@RequestMapping` chỉ xuất hiện trên lớp trong mã này (đã kiểm: không chỗ nào
# dùng nó ở cấp phương thức, cũng không chỗ nào dùng dạng `value =` hay `method =`).
NHOM_RE = re.compile(r'@RequestMapping\(\s*"([^"]*)"\s*\)')

# Chú giải cấp phương thức. Nhóm 2 là đường dẫn và CÓ THỂ VẮNG: `@PostMapping` trần nghĩa là dùng
# đúng tiền tố của lớp.
#
# Nhận cả dạng `@PostMapping(value = "...", produces = ...)`. Bản đầu chỉ nhận chuỗi đứng ngay sau
# dấu mở ngoặc, nên endpoint SSE của chat — endpoint duy nhất phải khai `produces` — bị đếm thiếu.
# Một cái gate dựng ra để phát hiện endpoint thiếu mà lại tự giấu mất một endpoint thì tệ hơn không
# có gate, vì nó còn khiến người đọc tin là đã đủ.
MAP_RE = re.compile(
    r'@(Get|Post|Put|Patch|Delete)Mapping(?:\(\s*(?:value\s*=\s*)?"([^"]*)")?')


def quet() -> dict[str, list[tuple[str, str, str]]]:
    """{module: [(động từ, đường dẫn đầy đủ, tệp)]} — đọc từ mã, không từ tài liệu."""
    ra: dict[str, list[tuple[str, str, str]]] = {}
    for p in sorted(SRC.rglob("*.java")):
        # BỎ QUA `build/` và `out/` — Gradle sinh ra, chỉ có ở máy đã build. Không bỏ thì bảng
        # sinh ở máy nhà khác bảng sinh trên CI, và cổng `--check` đỏ ở CI mà không tái lập được ở
        # máy nhà. Xem chú thích cùng nội dung trong `build_system_facts.py`.
        if {"build", "out"} & set(p.parts):
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        if "Mapping" not in t:
            continue
        # Tiền tố cấp lớp, nếu có. Không có thì đường dẫn của phương thức đã là đầy đủ.
        m_nhom = NHOM_RE.search(t)
        tien_to = m_nhom.group(1).rstrip("/") if m_nhom else ""
        muc: list[tuple[str, str, str]] = []
        for m in MAP_RE.finditer(t):
            dong_tu = m.group(1).upper()
            # `@PostMapping` trần -> group(2) là None -> đường dẫn chính là tiền tố lớp.
            duong = m.group(2) or ""
            day_du = tien_to + duong
            if not day_du.startswith("/"):
                continue
            muc.append((dong_tu, day_du.rstrip("/") or "/", p.relative_to(SRC).as_posix()))
        if muc:
            mod = p.relative_to(SRC).parts[0]
            ra.setdefault(mod, []).extend(muc)
    return ra


def dung() -> str:
    bang = quet()
    tong = sum(len(v) for v in bang.values())
    d = [
        BAT_DAU,
        "",
        "## Kiểm kê endpoint — SINH TỪ MÃ",
        "",
        f"**{tong} endpoint** trong **{len(bang)} module**, đọc trực tiếp từ",
        "`backend-java/src/main/java/com/cmc/restaurant/**/*.java` bởi `docs/build_api_inventory.py`.",
        "",
        "> Bảng này **không thể thiếu endpoint**: CI chạy `--check` và đỏ nếu mã có endpoint mà",
        # Con số 10 là số endpoint bảng viết tay từng liệt kê — một sự kiện đã xảy ra, nên nó cố
        # định. Tổng thì lấy từ lần quét này, vì viết cứng cả hai sẽ khiến câu văn tự sai đi mỗi
        # lần thêm endpoint.
        f"> bảng chưa có. Trước khi có nó, tài liệu viết tay liệt kê 10/{tong} endpoint.",
        ">",
        "> Nhưng nó chỉ biết **đường dẫn và động từ**. Dạng phản hồi, mã lỗi, quy tắc phân quyền là",
        "> phần người viết — xem các mục bên dưới.",
        "",
    ]
    for mod in sorted(bang):
        muc = sorted(set(bang[mod]), key=lambda x: (x[1], x[0]))
        d += [f"### {mod} ({len(muc)})", "", "| Động từ | Đường dẫn | Khai ở |", "|---|---|---|"]
        d += [f"| `{v}` | `{p}` | `{f}` |" for v, p, f in muc]
        d.append("")
    d.append(KET_THUC)
    return "\n".join(d)


def ghep(cu: str, moi: str) -> str:
    if BAT_DAU in cu and KET_THUC in cu:
        i, j = cu.index(BAT_DAU), cu.index(KET_THUC) + len(KET_THUC)
        return cu[:i] + moi + cu[j:]
    # lần đầu: chèn ngay sau tiêu đề H1 và banner
    dong = cu.splitlines()
    k = next((n for n, x in enumerate(dong) if x.startswith("# ")), 0)
    while k + 1 < len(dong) and (dong[k + 1].startswith(">") or not dong[k + 1].strip()):
        k += 1
    return "\n".join(dong[:k + 1]) + "\n\n" + moi + "\n" + "\n".join(dong[k + 1:])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="kiểm, không ghi")
    a = ap.parse_args(argv)
    cu = OUT.read_text(encoding="utf-8") if OUT.exists() else "# Hợp đồng API\n"
    moi = ghep(cu, dung())
    if a.check:
        if cu != moi:
            print("KIỂM KÊ ENDPOINT ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI.")
            print("Chạy: python docs/build_api_inventory.py")
            return 1
        print("--check: kiểm kê endpoint khớp mã.")
        return 0
    OUT.write_text(moi, encoding="utf-8")
    print(f"Đã ghi {OUT.relative_to(REPO)} — {len(re.findall(r'^\| `', dung(), re.M))} endpoint")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
