# -*- coding: utf-8 -*-
"""Sinh phần SỰ THẬT của tài liệu kiến trúc và DevOps từ chính mã và cấu hình.

    python docs/build_system_facts.py            # sinh lại
    python docs/build_system_facts.py --check    # đỏ nếu tệp đã commit khác kết quả sinh

Sinh cái gì, vào đâu
--------------------
    docs/backend/ARCHITECTURE.md        danh sách module + số endpoint mỗi module + số migration
    docs/devops/PIPELINE_AND_DEPLOY.md  danh sách workflow + cổng CI + biến môi trường deploy

Vì sao
------
Dự án này đã ba lần phát hiện tài liệu nói sai trạng thái mã: `archive/README.md` khai đã chuyển 7
tệp trong khi thư mục rỗng; `API_CONTRACT.md` liệt kê 10/84 endpoint; `ai/docs/05` ghi 425 đoạn khi
kho có 452. Ba lỗi cùng một hình dạng — **văn xuôi kể lại trạng thái mã**.

Kiến trúc và DevOps là hai chỗ còn lại có nhiều "danh sách kể lại": module nào có, workflow nào
chạy, cổng nào chặn. Sinh chúng ra thì tài liệu không thể nói sai về việc **cái gì tồn tại**.

Điều bộ này KHÔNG làm
---------------------
Không mô tả **ý nghĩa**. Nó biết module `Orders` có 12 endpoint, không biết một đơn hàng đi qua
những trạng thái nào. Phần đó là của người viết, và nằm ngoài mốc sinh.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent
REPO = DOCS.parent
# Issue #58 — nguồn đổi từ .NET sang Java. Phải đổi CÙNG LÚC với `build_api_inventory.py`: hàm
# `module_backend()` dưới đây dùng lại `quet()` của bộ kiểm kê để đếm endpoint, nhưng tự liệt kê
# module từ `SRC`. Đổi một bên thì tên module hai bên lệch nhau (`Auth` với `auth`) và bảng sinh ra
# ghi mọi module có 0 endpoint — sai mà vẫn hợp lệ về cú pháp.
SRC = REPO / "backend-java" / "src" / "main" / "java" / "com" / "cmc" / "restaurant"
MIGRATIONS = REPO / "backend-java" / "src" / "main" / "resources" / "db" / "migration"
WF = REPO / ".github" / "workflows"


def _moc(ten: str) -> tuple[str, str]:
    return f"<!-- SINH:{ten} -->", f"<!-- HET:{ten} -->"


def ghep(cu: str, ten: str, moi: str) -> str:
    bd, kt = _moc(ten)
    khoi = f"{bd}\n\n{moi}\n\n{kt}"
    if bd in cu and kt in cu:
        return cu[:cu.index(bd)] + khoi + cu[cu.index(kt) + len(kt):]
    dong = cu.splitlines()
    k = next((n for n, x in enumerate(dong) if x.startswith("# ")), 0)
    while k + 1 < len(dong) and (dong[k + 1].startswith(">") or not dong[k + 1].strip()):
        k += 1
    return "\n".join(dong[:k + 1]) + "\n\n" + khoi + "\n" + "\n".join(dong[k + 1:])


def module_backend() -> str:
    # DÙNG LẠI phép quét của `build_api_inventory.quet()` thay vì cài lại.
    #
    # Bản đầu cài riêng một vòng quét và cho **83 endpoint** trong khi bộ kiểm kê cho **84** — lệch
    # đúng `GET /api/health`, vì nó khai thẳng trong `Program.cs` (không thuộc thư mục module nào)
    # và vòng quét ở đây bỏ qua tệp nằm ở gốc.
    #
    # Hai bộ sinh nói khác nhau về CÙNG một sự thật là đúng lớp lỗi mà cả hai được viết ra để
    # chặn. Nên chỉ được có MỘT phép quét; tệp này gọi lại nó.
    import importlib.util as _u
    _s = _u.spec_from_file_location("_inv", DOCS / "build_api_inventory.py")
    _m = _u.module_from_spec(_s)
    _s.loader.exec_module(_m)
    theo_mod = _m.quet()

    dem = {k: len(set(v)) for k, v in theo_mod.items()}
    # BỎ QUA thư mục build (`build/`, `out/`) — Gradle sinh ra.
    #
    # Máy nhà phát triển có sẵn chúng sau lần build đầu tiên, còn CI thì checkout sạch nên không
    # có. Hệ quả: bảng module sinh trên máy nhà có thêm một dòng giả, và cổng `--check` trên CI đỏ
    # với thông báo "tệp đã commit khác kết quả sinh lại" — một lỗi chỉ xuất hiện ở CI, không tái
    # lập được ở máy nhà.
    BUILD = {"build", "out"}
    tep: dict[str, set[str]] = {}
    for p in sorted(SRC.rglob("*.java")):
        if BUILD & set(p.parts):
            continue
        rel = p.relative_to(SRC).parts
        # Tệp ngay ở gốc gói (`RestaurantApplication.java`) không thuộc module nào.
        if len(rel) < 2:
            continue
        tep.setdefault(rel[0], set()).add(p.name)
    for k in dem:
        tep.setdefault(k, set())
    # Flyway thay EF Core: một tệp `.sql` là một migration, không có tệp Designer/Snapshot đi kèm.
    mig = len(list(MIGRATIONS.glob("V*.sql")))
    d = ["## Module và bề mặt API — SINH TỪ MÃ", "",
         f"**{len([k for k in tep if not k.endswith(chr(46) + 'java')])} module**, "
         f"**{sum(dem.values())} endpoint**, "
         f"**{mig} migration** cơ sở dữ liệu.", "",
         "> Bảng này chỉ nói **cái gì tồn tại**. Ý nghĩa nghiệp vụ của từng module là phần người",
         "> viết ở các mục dưới.", "",
         "| Module | Endpoint | Số tệp |", "|---|---:|---:|"]
    for mod in sorted(tep):
        d.append(f"| `{mod}` | {dem.get(mod, 0)} | {len(tep[mod])} |")
    return "\n".join(d)


def devops() -> str:
    ci = (WF / "ci.yml").read_text(encoding="utf-8") if (WF / "ci.yml").exists() else ""
    cong = re.findall(r"run:\s*python\s+(\S+)\s+--check", ci)
    d = ["## Workflow và cổng chặn — SINH TỪ CẤU HÌNH", "",
         f"**{len(list(WF.glob('*.yml')))} workflow**, **{len(cong)} cổng `--check`** trong CI.", "",
         "| Workflow | Kích hoạt bởi |", "|---|---|"]
    for p in sorted(WF.glob("*.yml")):
        t = p.read_text(encoding="utf-8", errors="ignore")
        kich = []
        for k in ("pull_request_target", "pull_request", "push", "schedule",
                  "workflow_dispatch", "workflow_run", "workflow_call"):
            if re.search(rf"^\s{{2}}{k}:", t, re.M):
                kich.append(k)
        d.append(f"| `{p.name}` | {', '.join(kich) or '—'} |")
    d += ["", "### Cổng `--check` — tệp sinh ra phải khớp nguồn", "",
          "Mỗi cổng đối chiếu một tệp đã commit với kết quả sinh lại. Đỏ nghĩa là ai đó sửa tay",
          "tệp dẫn xuất mà không chạy lại bộ sinh — lớp lỗi đã xảy ra ba lần trong dự án này.", "",
          "| Bộ sinh |", "|---|"]
    d += [f"| `{c}` |" for c in sorted(set(cong))]
    return "\n".join(d)


MUC = [("docs/backend/ARCHITECTURE.md", "backend-modules", module_backend),
       ("docs/devops/PIPELINE_AND_DEPLOY.md", "devops-facts", devops)]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="kiểm, không ghi")
    a = ap.parse_args(argv)
    lech = []
    for rel, ten, ham in MUC:
        p = REPO / rel
        if not p.exists():
            continue
        cu = p.read_text(encoding="utf-8")
        moi = ghep(cu, ten, ham())
        if a.check:
            if cu != moi:
                lech.append(rel)
        else:
            p.write_text(moi, encoding="utf-8")
            print(f"Đã ghi {rel}")
    if a.check:
        if lech:
            print("TỆP ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI:")
            for x in lech:
                print(f"  {x}")
            print("Chạy: python docs/build_system_facts.py")
            return 1
        print("--check: phần sinh của tài liệu kiến trúc và DevOps khớp mã.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
