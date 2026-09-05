# -*- coding: utf-8 -*-
"""Sinh chỉ mục tài liệu `docs/README.md` từ CHÍNH các tệp có thật.

    python docs/build_docs_index.py            # sinh lại
    python docs/build_docs_index.py --check    # đỏ nếu tệp đã commit khác kết quả sinh

Vì sao chỉ mục phải SINH RA chứ không viết tay
----------------------------------------------
Bản `docs/archive/README.md` viết tay từng khai **đã chuyển 7 tệp vào thư mục đó**, trong khi thư
mục **rỗng** và cả 7 vẫn nằm ở `docs/`. Người đọc tin vào nó rồi đi tìm ở chỗ sai — đó là dạng loạn
dữ liệu tệ nhất, vì nó tệ hơn không có tài liệu.

Cùng lúc, `docs/README.md` chỉ trỏ tới **11/37** tài liệu. 26 tệp còn lại không có cửa vào nào, nên
người mới vào dự án không biết chúng tồn tại — và người cũ viết trùng lại nội dung đã có.

Cả hai lỗi đều là **văn xuôi kể lại trạng thái thư mục**, và văn xuôi thì trôi. Sinh ra thì không.
Đây đúng nguyên tắc mà `build_knowledge.py` và `build_bao_cao_do_an.py` đã áp cho dữ liệu và báo
cáo; chỉ mục tài liệu không có lý do gì được miễn.

Nhóm chủ đề lấy từ ĐƯỜNG DẪN và TIỀN TỐ TÊN TỆP, không từ một bảng viết tay — thêm tài liệu mới thì
nó tự vào đúng nhóm, không cần ai nhớ sửa chỗ này.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent
REPO = DOCS.parent
OUT = DOCS / "README.md"

# (tên nhóm, hàm nhận đường dẫn tương đối -> bool). Thứ tự quyết định thứ tự mục trong chỉ mục.
NHOM: list[tuple[str, str]] = [
    ("Bắt đầu ở đây", "start"),
    ("Kiến trúc và hợp đồng", "arch"),
    ("Vận hành, triển khai, CI/CD", "ops"),
    ("Quy trình nhóm", "process"),
    ("Kiểm thử", "test"),
    ("Lưu trữ — KHÔNG dùng để triển khai", "archive"),
]


def nhom_cua(rel: str) -> str:
    """Xếp nhóm theo đường dẫn và tiền tố tên — suy từ vị trí tệp, không tra bảng viết tay."""
    ten = Path(rel).name
    if rel.startswith("docs/archive/"):
        return "archive"
    if ten in ("README.md", "SPEC.md", "CONTEXT.md", "CHANGELOG.md"):
        return "start"
    if ten.startswith(("BACKEND_", "API_", "BA_SA_", "QR_")):
        return "arch"
    if ten.startswith(("DEPLOY", "PRODUCTION_", "CICD", "DEVOPS", "OPERATIONS", "COUNTER_",
                       "REPO_")):
        return "ops"
    if ten.startswith(("GIT_", "TEAM_", "BRANCH_", "WEEKLY_")):
        return "process"
    if ten.startswith(("TEST_", "E2E_", "SMOKE_")) or "/testing/" in rel:
        return "test"
    return "arch"


def tieu_de(p: Path) -> str:
    for d in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        d = d.strip()
        if d.startswith("# "):
            return d[2:].strip()
        if d.startswith("> ") or not d:
            continue
    return p.stem


def thu_thap() -> dict[str, list[tuple[str, str]]]:
    ra: dict[str, list[tuple[str, str]]] = {k: [] for _, k in NHOM}
    goc = [REPO / "README.md", REPO / "SPEC.md", REPO / "CONTEXT.md", REPO / "CHANGELOG.md"]
    tep = [p for p in goc if p.exists()]
    tep += sorted(DOCS.glob("**/*.md"))
    for p in tep:
        if p.resolve() == OUT.resolve():
            continue
        rel = p.relative_to(REPO).as_posix()
        ra[nhom_cua(rel)].append((rel, tieu_de(p)))
    return ra


def dung() -> str:
    bang = thu_thap()
    tong = sum(len(v) for v in bang.values())
    dong = [
        "# CMC Restaurant — chỉ mục tài liệu",
        "",
        f"**{tong} tài liệu**, nhóm theo mục đích. Trang này **được SINH RA** bởi",
        "`docs/build_docs_index.py` từ chính các tệp có thật — nên nó không thể trỏ vào tệp không",
        "tồn tại, và không thể bỏ sót tệp mới.",
        "",
        "> Vì sao sinh chứ không viết tay: bản chỉ mục viết tay của `docs/archive/` từng khai đã",
        "> chuyển 7 tệp vào đó trong khi thư mục rỗng, còn trang này thì chỉ trỏ tới 11/37 tài liệu.",
        "> Văn xuôi kể lại trạng thái thư mục thì luôn trôi khỏi thư mục.",
        "",
        "Thêm tài liệu mới: đặt đúng thư mục rồi chạy `python docs/build_docs_index.py`.",
        "",
    ]
    for ten, khoa in NHOM:
        muc = bang[khoa]
        if not muc:
            continue
        dong += [f"## {ten}", "", "| Tài liệu | Nội dung |", "|---|---|"]
        for rel, tit in muc:
            lien = rel[len("docs/"):] if rel.startswith("docs/") else "../" + rel
            dong.append(f"| [{Path(rel).name}]({lien}) | {tit} |")
        dong.append("")
    return "\n".join(dong).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="kiểm, không ghi")
    a = ap.parse_args(argv)
    moi = dung()
    if a.check:
        cu = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if cu != moi:
            print("CHỈ MỤC ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI.")
            print("Chạy: python docs/build_docs_index.py")
            return 1
        print("--check: chỉ mục khớp kết quả sinh lại.")
        return 0
    OUT.write_text(moi, encoding="utf-8")
    n = len(re.findall(r"^\| \[", moi, re.M))
    print(f"Đã ghi {OUT.relative_to(REPO)} — {n} tài liệu")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
