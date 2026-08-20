# -*- coding: utf-8 -*-
"""Mọi tệp dữ liệu mà mã lúc chạy đọc phải nằm TRONG thư mục Docker copy vào ảnh.

Vì sao có tệp này
-----------------
`ai/Dockerfile` copy đúng một thứ:

    COPY --chown=app:app ai ./ai      # chỉ có ai/, KHÔNG có backend/
    WORKDIR /app/ai

Nhưng mã lúc chạy từng đọc kho tri thức bằng đường dẫn ra ngoài `ai/`:

    FACTS_PATH = Path(__file__).parents[2] / "backend" / "data" / "restaurant-facts.json"
    #            /app/ai/app/answer.py → parents[2] = /app → /app/backend/data/...

`/app/backend/` không tồn tại trong ảnh. Và `load_facts()` xử lý thiếu tệp bằng `return {}`,
nên trong container **cả 24 chủ đề chính sách trả "chưa có dữ liệu"** — không lỗi, không log,
không ai biết. Khách hỏi giờ mở cửa và AI nói không biết, dù dữ liệu nằm trong repo.

Chỗ đọc đó nay đã hết: kho tri thức gộp về `ai/knowledge/`, tức NẰM TRONG phạm vi `COPY`. Đó
là cách sửa số 1 dưới đây — sửa cấu trúc. `menu-dataset.json` và `menu-tags.json` thì vẫn thuộc
backend thật (chúng seed cơ sở dữ liệu qua migration EF) nên chúng đi theo cách sửa số 2.

Đây đúng loại thoái hóa im lặng đã bắt được hai lần trong dự án này (`Request` nằm ngoài `try`
làm mọi lần gọi mô hình sập thay vì giữ câu trả lời tất định; kho tri thức bản cũ trích đoạn
nội bộ cho khách). Cả hai đều **không** bị test nào bắt, vì test chạy từ mã nguồn nơi mọi tệp
đều có mặt. **Ảnh Docker là môi trường duy nhất tệp bị thiếu, và không ai test ở đó.**

Test này thay chỗ đó: nó không dựng container (đắt và chậm), nó **đọc Dockerfile** và đối chiếu
với các đường dẫn mã thật sự dùng.

Cách sửa khi test đỏ — theo thứ tự ưu tiên:
  1. **Chuyển dữ liệu vào `ai/`.** Sửa cấu trúc, lỗi không quay lại được. Với kho tri thức thì
     đây là hướng đúng: `ai/knowledge/` đã nằm trong `ai/`.
  2. Thêm đường dẫn đó vào `COPY` của Dockerfile. Được, nhưng phải nhớ, nên yếu hơn cách 1.
  3. Nới danh sách miễn trong test. Chỉ khi tệp đó **không** cần lúc chạy (ví dụ tệp chỉ test
     dùng) — và phải ghi lý do.
"""
from __future__ import annotations

import ast
import os
import re
import sys
import unittest
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
REPO_ROOT = APP_DIR.parents[1]
DOCKERFILE = REPO_ROOT / "ai" / "Dockerfile"

# Phép kiểm "điểm vào import được" phải IMPORT THẬT `service.py`, nên nó cần `fastapi`. Phần còn
# lại của tệp này chỉ đọc văn bản nên chạy được bằng thư viện chuẩn.
#
# Bỏ qua sạch khi thiếu gói, để `unittest discover -s ai/app` không vỡ với người chưa cài. Nhưng
# bỏ qua ÂM THẦM trong CI là test dối, nên `AI_REQUIRE_SERVICE_TESTS=1` biến việc thiếu gói thành
# LỖI — cùng cơ chế với `test_service.py`.
try:
    import fastapi  # noqa: F401

    CO_FASTAPI = True
except ImportError:
    CO_FASTAPI = False

BAT_BUOC = os.environ.get("AI_REQUIRE_SERVICE_TESTS") == "1"

# Mô-đun chỉ dùng khi test/khi phát triển, không nằm trên đường trả lời khách. Đường dẫn ra
# ngoài `ai/` trong các tệp này là chấp nhận được, vì chúng không bao giờ chạy trong container.
DEV_ONLY_PREFIXES = ("test_",)


def runtime_modules() -> list[Path]:
    """Các mô-đun THẬT SỰ chạy trong container (loại tệp test)."""
    return sorted(
        p
        for p in APP_DIR.rglob("*.py")
        if not p.name.startswith(DEV_ONLY_PREFIXES) and p.name != "__init__.py"
    )


def docker_copied_roots(dockerfile: Path | None = None) -> set[str]:
    """Đường dẫn nguồn mà Dockerfile copy vào ảnh, đọc TỪ Dockerfile.

    Đọc tệp thật thay vì viết cứng `{"ai"}`, để khi ai đó sửa Dockerfile thì test đi theo —
    một test viết cứng sẽ tiếp tục xanh sau khi Dockerfile đã đổi, và đó là test dối.

    Giữ **nguyên đường dẫn đầy đủ** (`backend/data`, không rút về `backend`), để `COPY
    backend/data` không vô tình hợp lệ hóa một chỗ đọc `backend/src`.
    """
    roots: set[str] = set()
    for line in (dockerfile or DOCKERFILE).read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped.upper().startswith("COPY "):
            continue
        parts = [p for p in stripped.split()[1:] if not p.startswith("--")]
        for src in parts[:-1]:  # phần tử cuối là đích
            roots.add(src.strip("./").rstrip("/"))
    return roots


def _flatten_div_chain(node: ast.BinOp) -> tuple[ast.AST, list[str]]:
    """`ROOT / "backend" / "data" / "x.json"` → (nút ROOT, ["backend", "data", "x.json"]).

    Cần ghép lại cả chuỗi vì chỉ mắt đầu (`"backend"`) là không đủ để so với `COPY backend/data`.
    """
    parts: list[str] = []
    cur: ast.AST = node
    while (
        isinstance(cur, ast.BinOp)
        and isinstance(cur.op, ast.Div)
        and isinstance(cur.right, ast.Constant)
        and isinstance(cur.right.value, str)
    ):
        parts.append(cur.right.value.strip("/"))
        cur = cur.left
    return cur, list(reversed(parts))


def _is_escape_root(node: ast.AST) -> bool:
    """`<gì đó>.parents[N]` với N ≥ 2 — tức đã leo ra ngoài `ai/`.

    `parents[0]` là `ai/app`, `parents[1]` là `ai/`; cả hai vẫn nằm trong ảnh nên không sao.
    """
    return (
        isinstance(node, ast.Subscript)
        and isinstance(node.value, ast.Attribute)
        and node.value.attr == "parents"
        and isinstance(node.slice, ast.Constant)
        and isinstance(node.slice.value, int)
        and node.slice.value >= 2
    )


def outside_paths(module: Path, dockerfile: Path | None = None) -> list[tuple[int, str]]:
    """Tìm chỗ mã leo ra ngoài `ai/` rồi ghép tên một thư mục gốc repo.

    Dò bằng AST chứ không bằng chuỗi, vì `grep "backend"` khớp cả chú thích và thông báo lỗi —
    báo động giả rồi người ta tắt test.

    Phải xử lý HAI dạng viết, vì mã thật có cả hai:

        answer.py         Path(__file__).resolve().parents[2] / "backend" / ...   (trực tiếp)
        llm_understand.py REPO_ROOT = ...parents[2]                               (qua biến)
                          DICT_PATH = REPO_ROOT / "backend" / ...

    Bản dò đầu tiên tôi viết chỉ bắt dạng một, và nó báo XANH trên cả hai vi phạm thật đang có
    trong mã. Một bộ dò báo xanh sai còn tệ hơn không có bộ dò, nên chỗ này phải có test tự
    kiểm ở dưới (`BoDoPhaiThatSuBatDuoc`).
    """
    tree = ast.parse(module.read_text(encoding="utf-8"))
    copied = docker_copied_roots(dockerfile)

    # Dạng 2: tên biến nào được gán từ một biểu thức đã leo ra ngoài `ai/`.
    escaped_names: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(_is_escape_root(sub) for sub in ast.walk(node.value)):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                escaped_names.add(target.id)

    # Chỉ xét mắt NGOÀI CÙNG của mỗi chuỗi `/`, để đọc được đường dẫn đầy đủ chứ không chỉ mắt
    # đầu. Mắt ngoài cùng là mắt không làm `left` cho một mắt `/` nào khác.
    inner = {
        node.left
        for node in ast.walk(tree)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div)
    }

    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div)):
            continue
        if node in inner:
            continue
        base, parts = _flatten_div_chain(node)
        if not parts:
            continue
        if not (
            _is_escape_root(base)
            or (isinstance(base, ast.Name) and base.id in escaped_names)
        ):
            continue
        # Bỏ mắt cuối nếu nó là tên tệp — ta so THƯ MỤC với `COPY`.
        dirs = parts[:-1] if "." in parts[-1] else parts
        path = "/".join(dirs)
        if path and not any(path == c or path.startswith(c + "/") for c in copied):
            found.append((node.lineno, path))
    return found


class DuLieuLucChayPhaiNamTrongAnhDocker(unittest.TestCase):
    def test_dockerfile_van_chi_copy_thu_muc_ai(self):
        # Nếu Dockerfile bắt đầu copy thêm thư mục khác thì test dưới nới ra theo, nên phép
        # kiểm này chỉ để lời giải thích trong docstring không lạc hậu âm thầm.
        self.assertIn("ai", docker_copied_roots())

    def test_khong_mo_dun_luc_chay_nao_doc_ra_ngoai_ai(self):
        offenders: list[str] = []
        for module in runtime_modules():
            for lineno, path in outside_paths(module):
                rel = module.relative_to(REPO_ROOT).as_posix()
                offenders.append(f"{rel}:{lineno} đọc {path}")
        self.assertEqual(
            offenders, [],
            "Các chỗ sau đọc dữ liệu NGOÀI `ai/`, mà Dockerfile chỉ copy `ai/` — trong "
            "container tệp sẽ thiếu và mã thoái hóa im lặng:\n  "
            + "\n  ".join(offenders)
            + "\nCách sửa tốt nhất: chuyển dữ liệu vào `ai/`. Xem docstring tệp này.",
        )


class DiemVaoTrongDockerfilePhaiTonTai(unittest.TestCase):
    """`CMD` trỏ vào một module — module đó phải có thật và phải khai `app`.

    Vì sao cần: `CMD` gọi `app.main:app` suốt từ bản cũ, mà nhánh dựng lại không có
    `app/main.py`. Container khởi động thất bại ngay, và **không test nào bắt được** vì mọi test
    chạy từ mã nguồn chứ không chạy container.

    Cùng lớp lỗi với vụ byte 0x08 trong `understand.py`: mã có mặt, tài liệu nói nó chạy, CI
    xanh, và nó không chạy. Cách chặn cũng giống: đọc chính tệp cấu hình rồi đối chiếu với mã.
    """

    def _cmd(self) -> tuple[str, str, str | None]:
        """Đọc (module, biến, app_dir) từ dòng CMD của Dockerfile.

        Chỉ xét dòng bắt đầu bằng `CMD`, KHÔNG quét cả tệp. Bản đầu quét cả tệp và nó đọc được
        `uvicorn app.service:app` nằm trong **chú thích** — đúng chỗ tôi lấy nó làm ví dụ về lệnh
        SAI. Test khi đó báo lỗi thật nhưng nguyên nhân nằm trong chính phép đọc của nó.
        """
        # Chỉ dòng ở CỘT 0. Lệnh Dockerfile luôn bắt đầu ở cột 0; `CMD` thụt lề là phần tiếp của
        # `HEALTHCHECK ... \` phía trên. Bản dùng `lstrip()` bắt được cả hai và báo "phải có đúng
        # một dòng CMD, thấy 2".
        dong_cmd = [
            l for l in DOCKERFILE.read_text(encoding="utf-8").splitlines()
            if l.startswith("CMD")
        ]
        self.assertEqual(len(dong_cmd), 1, f"phải có đúng một dòng CMD, thấy {len(dong_cmd)}")
        match = re.search(r"uvicorn\s+([\w.]+):(\w+)([^\"]*)", dong_cmd[0])
        self.assertIsNotNone(match, "không tìm được lệnh uvicorn trong dòng CMD")
        module, bien, phan_con_lai = match.groups()  # type: ignore[union-attr]
        app_dir = None
        thay = re.search(r"--app-dir\s+(\S+)", phan_con_lai)
        if thay:
            app_dir = thay.group(1)
        return module, bien, app_dir

    @unittest.skipUnless(CO_FASTAPI, "cần fastapi để import service.py")
    def test_diem_vao_IMPORT_DUOC_THAT(self):
        """Phép kiểm quan trọng nhất của tệp này — và nó ra đời sau khi ba lỗi lọt qua.

        Bản đầu chỉ kiểm "tệp module tồn tại" và "tệp có khai biến `app`". Cả hai đều XANH trong
        khi container vẫn khởi động thất bại, vì:

            uvicorn app.service:app   ->  ModuleNotFoundError: No module named 'answer'

        Mọi mô-đun trong `ai/app` dùng import PHẲNG (`from answer import ...`), nên `ai/app` phải
        nằm trong `sys.path`. Test qua được vì chúng tự thêm đường dẫn đó; uvicorn thì không.

        Phát hiện được chỉ vì tôi chạy uvicorn thật. Nên test này **chạy thử import** trong một
        tiến trình riêng với đúng `sys.path` mà container có — không phải phân tích tĩnh.

        Bài học lặp lại lần thứ tư trong dự án: **"tệp có mặt" không đồng nghĩa "nó chạy".**
        """
        import subprocess

        module, bien, app_dir = self._cmd()
        # WORKDIR trong ảnh là /app/ai. `--app-dir X` làm uvicorn chèn /app/ai/X vào sys.path.
        cwd = APP_DIR.parent
        sys_path_extra = str((cwd / app_dir).resolve()) if app_dir else str(cwd)

        ma = (
            "import sys; sys.path.insert(0, %r);"
            "import importlib; m = importlib.import_module(%r);"
            "assert hasattr(m, %r), 'thiếu biến %s';"
            "print('OK')" % (sys_path_extra, module, bien, bien)
        )
        r = subprocess.run(
            [sys.executable, "-c", ma], cwd=cwd, capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(
            r.returncode, 0,
            f"Dockerfile CMD `uvicorn {module}:{bien}"
            + (f" --app-dir {app_dir}" if app_dir else "")
            + "` KHÔNG import được:\n"
            + (r.stderr or "").strip()[-800:]
            + "\n\nContainer sẽ khởi động thất bại. Nếu lỗi là ModuleNotFoundError cho một "
            "mô-đun trong `ai/app` thì thiếu `--app-dir app`.",
        )

    @unittest.skipUnless(CO_FASTAPI, "cần fastapi để import service.py")
    def test_neu_thieu_app_dir_thi_import_THAT_BAI(self):
        """Chiều ngược: chứng minh `--app-dir app` là bắt buộc, không phải trang trí.

        Không có test này thì ai đó có thể bỏ `--app-dir` và tin rằng nó không cần.
        """
        import subprocess

        module, bien, _ = self._cmd()
        ma = (
            "import sys; sys.path.insert(0, %r);"
            "import importlib; importlib.import_module('app.service')"
            % str(APP_DIR.parent.resolve())
        )
        r = subprocess.run(
            [sys.executable, "-c", ma], cwd=APP_DIR.parent,
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertNotEqual(
            r.returncode, 0,
            "`app.service` import ĐƯỢC mà không cần app/ trong sys.path — nghĩa là các mô-đun "
            "đã chuyển sang import tương đối, và lúc đó `--app-dir app` không còn cần. Cập nhật "
            "Dockerfile và bỏ test này.",
        )
        self.assertIn("ModuleNotFoundError", r.stderr)


class DockerfileKhongDungGoiKhongCoTrongRequirements(unittest.TestCase):
    """Mọi gói Dockerfile cài hoặc import phải có trong `requirements.txt`.

    Vì sao cần: Dockerfile của bản cũ có ba dòng mà **build sẽ thất bại**, và chúng sống sót suốt
    quá trình dựng lại:

        pip install torch==2.13.0+cpu               phiên bản không tồn tại, và không tệp nào
                                                    trong `ai/` import torch
        python -c "from sentence_transformers ..."  gói đã bị bỏ khỏi requirements ở bước 5
        ENV HF_HOME / HF_HUB_OFFLINE                biến cho model không còn tải

    Không test nào bắt được, vì mọi test chạy từ mã nguồn chứ không build ảnh. Cùng lớp lỗi với
    `CMD` trỏ vào `app.main:app` và với byte 0x08 trong regex: **thứ có mặt trong tệp, được tài
    liệu mô tả là hoạt động, và không hoạt động.**

    Test này không build ảnh (đắt, chậm, cần Docker). Nó đọc Dockerfile rồi đối chiếu với
    `requirements.txt` — cùng cách tiếp cận với `docker_copied_roots()` ở trên.
    """

    REQUIREMENTS = REPO_ROOT / "ai" / "requirements.txt"

    def _packages(self) -> set[str]:
        """Tên gói trong requirements.txt, chuẩn hóa về chữ thường và gạch dưới."""
        out: set[str] = set()
        for line in self.REQUIREMENTS.read_text(encoding="utf-8").splitlines():
            line = line.split("#")[0].strip()
            if not line:
                continue
            ten = re.split(r"[<>=!\[;]", line)[0].strip().lower()
            if ten:
                out.add(ten.replace("-", "_"))
        return out

    def test_pip_install_khong_cai_goi_ngoai_requirements(self):
        """`pip install <ten-goi>` trong Dockerfile phải trùng một gói trong requirements.

        Cho phép `-r requirements.txt` và các cờ. Cái bị chặn là **tên gói viết thẳng** —
        `torch==2.13.0+cpu` là dạng đó.
        """
        packages = self._packages()
        vi_pham: list[str] = []
        for i, line in enumerate(DOCKERFILE.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip().lstrip("&").strip()
            if not stripped.startswith(("RUN pip install", "pip install")):
                continue
            for tok in stripped.split():
                if tok.startswith("-") or tok in ("RUN", "pip", "install", "requirements.txt"):
                    continue
                if tok.endswith(("\\", "&&")) or tok in ("&&", "\\"):
                    continue
                ten = re.split(r"[<>=!\[]", tok)[0].strip().lower().replace("-", "_")
                if ten and ten not in packages:
                    vi_pham.append(f"dòng {i}: cài {tok!r} — không có trong requirements.txt")
        self.assertEqual(
            vi_pham, [],
            "Dockerfile cài gói không khai trong requirements.txt. Hoặc thêm nó vào "
            "requirements, hoặc bỏ dòng cài — giữ cả hai chỗ là hai bản sao sẽ trôi khỏi nhau:\n  "
            + "\n  ".join(vi_pham),
        )

    def test_RUN_python_khong_import_goi_ngoai_requirements(self):
        """`RUN python -c "import X"` phải import gói có trong requirements, hoặc thư viện chuẩn.

        Đây là dòng đã giết build: `from sentence_transformers import SentenceTransformer` với
        gói đã bị bỏ.

        `from X import Y` phải đọc là MỘT mệnh đề, không phải hai
        --------------------------------------------------------
        Bản đầu quét `(?:import|from)\\s+(\\w+)`, nên trên đúng dòng ví dụ ở trên nó tìm được HAI
        tên: `sentence_transformers` (đúng) và `SentenceTransformer` (sai — đó là một CÁI TÊN BÊN
        TRONG mô-đun, không phải gói cài bằng pip). Tên thứ hai không bao giờ có trong
        requirements, nên test báo đỏ cho một dòng đúng.

        Lỗi này chỉ lộ ra khi dòng đó được thêm LẠI vào Dockerfile. Trước đó nó ngủ, vì không có
        dòng `from ... import ...` nào để phân tích sai. Cùng lớp với các lỗi "tệp có ≠ nó chạy":
        một phép kiểm không gặp đầu vào thật thì chưa ai biết nó đúng.
        """
        import sys as _sys

        chuan = set(getattr(_sys, "stdlib_module_names", ()))
        packages = self._packages()
        text = DOCKERFILE.read_text(encoding="utf-8")
        # Nhánh `from X import` đứng TRƯỚC, và nó ăn luôn chữ `import`, nên tên sau đó không bị
        # nhánh `import Y` khớp lần nữa. Thứ tự hai nhánh là phần quan trọng của biểu thức này.
        MAU = re.compile(
            r"(?:^|[\s;\"'])from\s+([a-zA-Z_][\w.]*)\s+import\b"
            r"|(?:^|[\s;\"'])import\s+([a-zA-Z_][\w.]*)"
        )
        vi_pham: list[str] = []
        for i, line in enumerate(text.splitlines(), 1):
            if "python -c" not in line:
                continue
            for m in MAU.finditer(line):
                mod = m.group(1) or m.group(2)
                goc = mod.split(".")[0].lower().replace("-", "_")
                if goc in chuan or goc in packages:
                    continue
                vi_pham.append(f"dòng {i}: import {mod!r} — không phải stdlib, không trong requirements")
        self.assertEqual(vi_pham, [], "\n  ".join(vi_pham))

    def test_phep_phan_tich_import_doc_dung_from_X_import_Y(self):
        """Phép kiểm ở trên phải đọc `from X import Y` là gói `X`, không phải gói `Y`.

        Test cho chính phép kiểm, vì bản đầu của nó báo đỏ một dòng Dockerfile ĐÚNG. Một phép kiểm
        sai làm mất nhiều thời gian hơn không có phép kiểm nào: nó gửi người đọc đi sửa chỗ không
        hỏng.
        """
        MAU = re.compile(
            r"(?:^|[\s;\"'])from\s+([a-zA-Z_][\w.]*)\s+import\b"
            r"|(?:^|[\s;\"'])import\s+([a-zA-Z_][\w.]*)"
        )

        def doc(line: str) -> list[str]:
            return [m.group(1) or m.group(2) for m in MAU.finditer(line)]

        self.assertEqual(doc('RUN python -c "from a.b import C"'), ["a.b"])
        self.assertEqual(doc('RUN python -c "import os, sys"'), ["os"])
        self.assertEqual(doc('RUN python -c "import urllib.request; import json"'),
                         ["urllib.request", "json"])
        # Dạng thật trong Dockerfile: một dòng có cả hai kiểu.
        self.assertEqual(
            doc('RUN python -c "from sentence_transformers import SentenceTransformer; import os"'),
            ["sentence_transformers", "os"],
        )

    def test_bien_moi_truong_embedding_phai_khop_voi_requirements(self):
        """Dockerfile không được nói SAI về việc có tầng embedding hay không — theo CẢ HAI chiều.

        Bản đầu của test này chỉ chặn một chiều: "có `ENV HF_HOME` mà không có gói thì đỏ", vì
        bước 5 vừa bỏ `sentence-transformers` và biến còn sót lại làm người đọc tưởng tầng đó còn.

        Nay tầng đó ĐƯỢC BẬT LẠI (đo được: Hit@1 niêm phong 0,391 -> 0,609), nên tiền đề cũ bị đảo
        và chiều còn lại mới là chiều nguy hiểm: **có gói mà thiếu biến**. Thiếu `HF_HUB_OFFLINE`
        thì container gọi mạng ra Hugging Face lúc chạy, và mạng chậm làm chậm khởi động — một lỗi
        chỉ hiện ở môi trường thật, không hiện trong test nào.

        Nên kiểm hai chiều bằng một phép so tương đương, chứ không phải hai test rời:

            có `sentence_transformers`  <->  có `ENV HF_HOME` và `ENV HF_HUB_OFFLINE`

        Cách viết này còn có tính chất em muốn: nó tự đúng nếu ai đó bỏ tầng embedding lần nữa.
        Bỏ gói mà quên biến -> đỏ; bỏ cả hai -> xanh. Không cần sửa test theo quyết định.
        """
        text = DOCKERFILE.read_text(encoding="utf-8")
        co_bien = {
            bien
            for bien in ("HF_HOME", "HF_HUB_OFFLINE")
            for line in text.splitlines()
            if line.strip().startswith("ENV") and bien in line
        }
        co_goi = "sentence_transformers" in self._packages()

        if co_goi and co_bien != {"HF_HOME", "HF_HUB_OFFLINE"}:
            self.fail(
                f"requirements có `sentence-transformers` nhưng Dockerfile thiếu "
                f"{sorted({'HF_HOME', 'HF_HUB_OFFLINE'} - co_bien)}. Thiếu `HF_HOME` thì mô hình "
                "tải về chỗ người dùng `app` không ghi được; thiếu `HF_HUB_OFFLINE` thì container "
                "gọi mạng ra Hugging Face lúc chạy."
            )
        if not co_goi and co_bien:
            self.fail(
                f"Dockerfile còn `ENV {sorted(co_bien)}` nhưng requirements KHÔNG có "
                "`sentence-transformers` — biến cho một tầng không tồn tại làm Dockerfile nói sai "
                "về thứ hệ thống có."
            )

    def test_mo_hinh_embedding_duoc_tai_san_luc_build(self):
        """Có tầng embedding thì mô hình phải nằm TRONG ẢNH, không tải lúc chạy.

        Tải lúc chạy có hai hậu quả và cả hai chỉ hiện ở môi trường thật: khách ĐẦU TIÊN chờ tải
        ~500MB, và dịch vụ phụ thuộc mạng ngoài SAU KHI `/ready` đã báo sẵn sàng — tức "sẵn sàng"
        thành lời nói dối. Cùng lớp lỗi với `HEALTHCHECK` trỏ vào `/ready`: trạng thái báo ra
        không khớp trạng thái thật.

        Test kiểm tên mô hình trong Dockerfile TRÙNG tên mã lúc chạy dùng — hai chỗ ghi tên khác
        nhau thì ảnh tải sẵn mô hình A và runtime tải mô hình B, và lỗi đó im lặng.
        """
        if "sentence_transformers" not in self._packages():
            self.skipTest("không có tầng embedding")

        text = DOCKERFILE.read_text(encoding="utf-8")
        self.assertIn(
            "SentenceTransformer(",
            text,
            "requirements có `sentence-transformers` nhưng Dockerfile KHÔNG tải sẵn mô hình. "
            "Khách đầu tiên sẽ phải chờ tải ~500MB.",
        )

        trong_dockerfile = set(re.findall(r"SentenceTransformer\(['\"]([^'\"]+)", text))
        nguon = (REPO_ROOT / "ai" / "app" / "rag" / "embedding.py").read_text(encoding="utf-8")
        luc_chay = set(re.findall(r"MODEL_NAME\s*=\s*['\"]([^'\"]+)", nguon))
        self.assertEqual(
            trong_dockerfile,
            luc_chay,
            f"Dockerfile tải sẵn {sorted(trong_dockerfile)} nhưng lúc chạy mã dùng "
            f"{sorted(luc_chay)}. Hai tên khác nhau thì ảnh tải một mô hình và runtime tải mô "
            "hình khác — và với `HF_HUB_OFFLINE=1` thì runtime KHÔNG tải được, nên dịch vụ chết.",
        )


class KhongTepBiMatNaoLotVaoANH(unittest.TestCase):
    """`.dockerignore` phải loại MỌI tệp `.env` trong repo, không chỉ tệp ở gốc.

    Lỗi thật đã xảy ra: `.dockerignore` có `.env` và `.env.*`, nhưng mẫu KHÔNG có tiền tố `**/`
    chỉ khớp ở **gốc build context**. Nên `ai/.env` lọt vào ảnh — 917 byte chứa `LLM_API_KEY`
    (35 ký tự) và `AI_INTERNAL_TOKEN` (41 ký tự).

    Bí mật nướng vào một lớp ảnh thì **không xóa được** bằng cách xóa tệp ở lớp sau: lớp cũ vẫn
    nằm trong ảnh và ai có ảnh đều đọc được.

    Phát hiện được chỉ vì chạy container thật rồi `ls` bên trong. Dấu hiệu đầu tiên là `/ready`
    báo `model_configured: true` dù tôi truyền `LLM_MODEL=` rỗng — cấu hình đến từ trong ảnh.

    Test này không build ảnh. Nó liệt kê tệp bí mật thật trong repo rồi đối chiếu với
    `.dockerignore` — cùng cách tiếp cận với `docker_copied_roots()`.
    """

    DOCKERIGNORE = REPO_ROOT / ".dockerignore"

    # Tên tệp thường chứa bí mật. Không quét nội dung — quét nội dung là dò chuỗi và sẽ có báo
    # động giả; tên tệp thì rõ ràng.
    MAU_BI_MAT = (".env", ".env.local", ".env.development", ".env.production")

    def _patterns(self) -> list[str]:
        out = []
        for line in self.DOCKERIGNORE.read_text(encoding="utf-8").splitlines():
            line = line.split("#")[0].strip()
            if line:
                out.append(line)
        return out

    def _bi_loai(self, rel: str, patterns: list[str]) -> bool:
        """Mẫu nào trong `.dockerignore` loại đường dẫn này?

        Cài đúng phần ngữ nghĩa quan trọng: mẫu KHÔNG có `**/` thì neo ở gốc context.
        """
        import fnmatch

        ten = rel.split("/")[-1]
        loai = False
        for pat in patterns:
            phu_dinh = pat.startswith("!")
            p = pat[1:] if phu_dinh else pat
            khop = False
            if p.startswith("**/"):
                duoi = p[3:]
                khop = fnmatch.fnmatch(ten, duoi) or fnmatch.fnmatch(rel, "*/" + duoi)
            else:
                khop = fnmatch.fnmatch(rel, p)
            if khop:
                loai = not phu_dinh
        return loai

    def _tep_bi_mat(self) -> list[str]:
        """Tệp bí mật THẬT trong repo, bỏ qua tệp mẫu và thư mục không vào ảnh."""
        bo_qua = {".git", ".venv", "node_modules", "__pycache__", "bin", "obj"}
        out = []
        for path in REPO_ROOT.rglob("*"):
            if not path.is_file():
                continue
            if bo_qua & set(path.parts):
                continue
            ten = path.name
            if ten.endswith(".example.env") or ten.endswith(".example"):
                continue
            if ten in self.MAU_BI_MAT or ten.startswith(".env."):
                out.append(path.relative_to(REPO_ROOT).as_posix())
        return sorted(out)

    def test_moi_tep_env_deu_bi_dockerignore_loai(self):
        patterns = self._patterns()
        lot = [rel for rel in self._tep_bi_mat() if not self._bi_loai(rel, patterns)]
        self.assertEqual(
            lot, [],
            "Tệp bí mật LỌT vào build context của Docker — chúng sẽ nằm trong một lớp ảnh và "
            "không xóa được bằng cách xóa tệp ở lớp sau:\n  "
            + "\n  ".join(lot)
            + "\n\nThêm mẫu `**/.env` vào `.dockerignore`. Mẫu không có `**/` chỉ khớp ở GỐC.",
        )

    def test_dockerignore_dung_mau_co_TIEN_TO_dung_moi_noi(self):
        """Chiều ngược: chứng minh việc thiếu `**/` là nguyên nhân, không phải trùng hợp."""
        patterns = self._patterns()
        thieu_tien_to = ["env-o-goc/.env"]  # đường dẫn giả, chỉ có mẫu `**/` mới loại được
        self.assertTrue(
            all(self._bi_loai(r, patterns) for r in thieu_tien_to),
            "`.dockerignore` không có mẫu `**/.env` nên tệp .env trong thư mục con sẽ lọt",
        )
        # Và tệp MẪU thì KHÔNG được loại — nó cần có trong repo để người khác biết cần biến gì.
        self.assertFalse(
            self._bi_loai("deploy/env/staging.example.env", patterns),
            "tệp *.example.env phải được giữ, nó là tài liệu về biến cần thiết",
        )


class ComposeChiTruyenBienDichVuTHATSUDoc(unittest.TestCase):
    """`docker-compose.yml` không được nói SAI về hệ thống — theo CẢ HAI chiều.

    Vì sao test này tồn tại
    -----------------------
    Khối `environment` của `ai-service` từng truyền **11 biến mà bản dựng lại không đọc**, và ba
    trong số đó không chỉ chết mà còn NÓI SAI:

        RAG_RETRIEVAL_METHOD: hybrid              bộ truy hồi thật là `embedding`
        RAG_KNOWLEDGE_BASE_PATH: knowledge-base   thư mục đó không còn tồn tại
        AI_LLM_FIRST: true                        khái niệm đó không còn

    Người vận hành đọc compose để biết hệ thống chạy thế nào, nên một biến chết mời họ điều chỉnh
    một cái núm không nối vào đâu, rồi kết luận sai khi không thấy tác dụng. Đây cùng lớp với hai
    tài liệu của hệ thống cũ phải dán nhãn LỊCH SỬ: **mô tả sai hiện trạng còn tệ hơn không mô tả**,
    vì nó được tin.

    Kiểm hai chiều, vì chiều nào cũng có hậu quả thật
    ------------------------------------------------
        compose truyền mà không ai đọc   ->  cấu hình nói sai, núm không nối vào đâu
        mã đọc mà compose không truyền   ->  container chạy với mặc định lập trình viên,
                                             và không ai thấy vì mặc định vẫn chạy được

    Chiều thứ hai đúng là lỗi đã xảy ra: `AI_EMBEDDING_CACHE` chỉ được đặt trong Dockerfile, và một
    thời gian đệm vector trượt im lặng — khởi động 61,9s thay vì 19,0s trong khi log báo thành công.
    """

    # Bản .NET đã xoá (#59), nên tệp compose duy nhất còn lại là bản Java.
    COMPOSE = REPO_ROOT / "deploy" / "docker-compose.java.yml"

    # Biến đặt ở Dockerfile hoặc do hạ tầng dùng, nên compose KHÔNG cần truyền lại.
    #
    # Mỗi tên ở đây là một ngoại lệ có lý do, không phải một chỗ để nhét cho test xanh: thêm tên vào
    # danh sách này mà không có lý do là cách vô hiệu hóa chính test này.
    NGOAI_LE_KHONG_CAN_TRUYEN = {
        "AI_EMBEDDING_CACHE",  # Dockerfile đặt, trỏ vào đường dẫn TRONG ảnh
        "AI_REQUIRE_SERVICE_TESTS",  # chỉ CI đặt, để chặn test bị bỏ qua âm thầm
        "HF_HOME",  # Dockerfile đặt
        "HF_HUB_OFFLINE",
        "TRANSFORMERS_OFFLINE",
    }

    # Biến compose truyền cho hạ tầng, không cho mã Python.
    NGOAI_LE_KHONG_CAN_DOC = {
        "AI_SERVICE_HOST",  # `CMD` của Dockerfile truyền vào uvicorn
        "AI_SERVICE_PORT",
        "OMP_NUM_THREADS",  # torch đọc lúc import, không qua mã của dự án
    }

    def _bien_compose_truyen(self) -> set[str]:
        """Tên biến trong khối `environment` của dịch vụ `ai-service`.

        Quét theo DÒNG, không `split` theo chuỗi con. Bản đầu viết
        `text.split("  ai-service:")` và nó khớp dòng `      ai-service:` nằm trong `depends_on:`
        của dịch vụ `api` — tức bóc sai khối và trả về biến của dịch vụ khác. `test_bo_do_bat_duoc_that`
        bắt đúng chuyện đó, và đây là lần thứ hai trong dự án một bộ phân tích tự viết đọc sai định
        dạng rồi báo kết quả trông hợp lý (lần trước: `from X import Y` bị đếm thành hai import).
        """
        lines = self.COMPOSE.read_text(encoding="utf-8").splitlines()
        try:
            i = lines.index("  ai-service:")
        except ValueError:
            self.fail("không tìm được dòng `  ai-service:` trong compose")

        ra: set[str] = set()
        trong_env = False
        for line in lines[i + 1 :]:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if re.match(r"^  \S", line):  # sang dịch vụ kế tiếp
                break
            if line == "    environment:":
                trong_env = True
                continue
            if trong_env:
                if not line.startswith("      "):  # hết khối environment
                    trong_env = False
                    continue
                khop = re.match(r"^ {6}([A-Za-z][A-Za-z0-9_]*):", line)
                if khop:
                    ra.add(khop.group(1))
        return ra

    def _bien_ma_doc(self) -> set[str]:
        """Tên biến mà mã trong `ai/app` đọc, kể cả qua `ENV_KEYS` của `load_env`."""
        ra: set[str] = set()
        for path in sorted(APP_DIR.rglob("*.py")):
            if path.name.startswith("test_"):
                continue
            text = path.read_text(encoding="utf-8")
            ra |= set(re.findall(r'environ(?:\.get)?[\(\[]\s*"([A-Z][A-Z0-9_]*)"', text))

        from llm_understand import ENV_KEYS

        return ra | set(ENV_KEYS)

    def test_bo_do_bat_duoc_that(self):
        """Bộ bóc rỗng thì hai test dưới xanh vì KHÔNG KIỂM GÌ — lớp lỗi đã xảy ra một lần."""
        truyen = self._bien_compose_truyen()
        doc = self._bien_ma_doc()
        self.assertIn("LLM_MODEL", truyen, f"bộ bóc compose sai? chỉ thấy {sorted(truyen)}")
        self.assertIn("AI_INTERNAL_TOKEN", truyen)
        self.assertIn("LLM_API_KEY", doc, f"bộ bóc mã sai? chỉ thấy {sorted(doc)}")
        self.assertIn("AI_ENABLE_GENERATION", doc)

    def test_khong_truyen_bien_nao_ma_khong_ai_doc(self):
        thua = self._bien_compose_truyen() - self._bien_ma_doc() - self.NGOAI_LE_KHONG_CAN_DOC
        self.assertFalse(
            thua,
            f"compose truyền {sorted(thua)} cho ai-service nhưng KHÔNG mô-đun nào đọc. Biến chết "
            "làm cấu hình nói sai về hệ thống — bỏ nó đi, hoặc nếu nó dành cho hạ tầng thì thêm "
            "vào NGOAI_LE_KHONG_CAN_DOC kèm lý do.",
        )

    def test_khong_doc_bien_nao_ma_compose_khong_truyen(self):
        thieu = self._bien_ma_doc() - self._bien_compose_truyen() - self.NGOAI_LE_KHONG_CAN_TRUYEN
        self.assertFalse(
            thieu,
            f"mã đọc {sorted(thieu)} nhưng compose không truyền — container sẽ chạy với mặc định "
            "trong mã, và không ai thấy vì mặc định vẫn chạy được.",
        )


class ThuVienPhaiCoKhiCIYEUCAU(unittest.TestCase):
    """Chặn việc phép kiểm điểm vào bị bỏ qua âm thầm trong CI."""

    def test_ci_phai_co_fastapi(self):
        if not BAT_BUOC:
            self.skipTest("chỉ ép khi AI_REQUIRE_SERVICE_TESTS=1 (CI đặt biến này)")
        self.assertTrue(
            CO_FASTAPI,
            "CI yêu cầu phép kiểm điểm vào phải CHẠY nhưng thiếu fastapi. Không có nó thì lỗi "
            "'container khởi động thất bại' lọt qua CI — đúng lỗi đã lọt ba lần.",
        )


class BoDoPhaiThatSuBatDuoc(unittest.TestCase):
    """Test cho bộ dò, không cho hệ thống. Có vì bộ dò bản đầu đã báo xanh sai.

    Bản đầu chỉ bắt dạng `parents[2] / "backend"` viết liền, nên nó bỏ qua cả hai vi phạm thật
    đang có trong mã và báo OK. Test hai chiều là bắt buộc ở đây: một bộ dò luôn báo rỗng thì
    phép kiểm ở trên vô nghĩa, và một bộ dò báo bừa thì người ta sẽ tắt nó.
    """

    def _probe(self, source: str) -> list[tuple[int, str]]:
        """Dò trên một Dockerfile GIẢ chỉ copy `ai/`.

        Không được dùng Dockerfile thật ở đây. Nếu dùng, thì ngày ai đó thêm `COPY backend/data`
        vào Dockerfile, mấy test dưới sẽ tự trở thành rỗng nghĩa — chúng vẫn xanh nhưng không
        còn kiểm gì cả. Đó đúng là loại test dối mà cả tệp này tồn tại để chống.
        """
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "probe.py"
            path.write_text(source, encoding="utf-8")
            docker = Path(tmp) / "Dockerfile"
            docker.write_text("FROM x\nCOPY ai ./ai\n", encoding="utf-8")
            return outside_paths(path, docker)

    def test_bat_duoc_dang_viet_lien(self):
        hits = self._probe(
            "from pathlib import Path\n"
            'P = Path(__file__).resolve().parents[2] / "backend" / "data" / "x.json"\n'
        )
        self.assertEqual([h[1] for h in hits], ["backend/data"])

    def test_bat_duoc_dang_qua_bien(self):
        hits = self._probe(
            "from pathlib import Path\n"
            "ROOT = Path(__file__).resolve().parents[2]\n"
            'P = ROOT / "backend" / "data" / "x.json"\n'
        )
        self.assertEqual([h[1] for h in hits], ["backend/data"])

    def test_khong_bao_dong_gia_voi_duong_dan_trong_ai(self):
        # `parents[1]` là `ai/` — vẫn trong ảnh Docker, không được báo.
        hits = self._probe(
            "from pathlib import Path\n"
            "ROOT = Path(__file__).resolve().parents[1]\n"
            'P = ROOT / "knowledge"\n'
        )
        self.assertEqual(hits, [])

    def test_khong_bao_dong_gia_voi_thu_muc_dockerfile_co_copy(self):
        hits = self._probe(
            "from pathlib import Path\n"
            'P = Path(__file__).resolve().parents[2] / "ai" / "knowledge"\n'
        )
        self.assertEqual(hits, [])

    def test_copy_backend_data_khong_hop_le_hoa_backend_src(self):
        """Phần chính xác: `COPY backend/data` chỉ hợp lệ hóa đúng `backend/data`.

        Bản trước rút đường dẫn về tên thư mục gốc (`backend`), nên thêm một dòng `COPY
        backend/data` sẽ làm mọi chỗ đọc `backend/` bất kỳ đều xanh — kể cả `backend/src`, thứ
        vẫn không có trong ảnh.
        """
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            docker = Path(tmp) / "Dockerfile"
            docker.write_text(
                "FROM x\nCOPY ai ./ai\nCOPY backend/data ./backend/data\n", encoding="utf-8"
            )
            copied = docker_copied_roots(docker)
        self.assertEqual(copied, {"ai", "backend/data"})

        def allowed(path: str) -> bool:
            return any(path == c or path.startswith(c + "/") for c in copied)

        self.assertTrue(allowed("backend/data"), "backend/data phải được coi là có trong ảnh")
        self.assertFalse(allowed("backend/src"), "backend/src KHÔNG có trong ảnh, phải bị báo")

    def test_khong_bao_dong_gia_voi_chu_thich_va_thong_bao_loi(self):
        # Chuỗi "backend" trong chú thích và trong thông báo lỗi không phải đường dẫn.
        hits = self._probe(
            "# đọc từ backend/data nếu có\n"
            'MSG = "thiếu tệp ở backend/data"\n'
        )
        self.assertEqual(hits, [])


class DockerignoreCanhTheoDockerfile(unittest.TestCase):
    """`docker compose` KHÔNG áp dụng `.dockerignore` của thư mục context.

    Nó đưa Dockerfile cho BuildKit qua stdin, nên BuildKit không có chỗ nào để tìm tệp ignore của
    context. Dựng lại được: `docker compose build frontend` gửi cả `frontend/node_modules` vào
    build context và vỡ trên Windows, trong khi `docker build -f frontend/Dockerfile .` chỉ gửi
    1,07 kB — cùng một Dockerfile, cùng một context.

    Cách duy nhất có hiệu lực trong đường compose là đặt tệp ignore CẠNH Dockerfile
    (`<Dockerfile>.dockerignore`). Nhưng nhân bản một tệp quy tắc ra bốn chỗ là mời trôi, và ở đây
    trôi không chỉ tốn dung lượng: khối `.env` trong đó là bản vá của sự cố `ai/.env` (chứa
    `LLM_API_KEY` thật) bị nướng vào ảnh. Bản sao thiếu khối đó thì sự cố quay lại y nguyên.
    """

    GOC = REPO_ROOT / ".dockerignore"
    BAN_SAO = (
        REPO_ROOT / "frontend" / "Dockerfile.dockerignore",
        REPO_ROOT / "backend-java" / "Dockerfile.dockerignore",
        REPO_ROOT / "ai" / "Dockerfile.dockerignore",
    )

    def test_moi_dockerfile_dung_compose_deu_co_ban_sao(self):
        for path in self.BAN_SAO:
            self.assertTrue(
                path.exists(),
                f"thiếu {path.relative_to(REPO_ROOT)} — `docker compose build` sẽ gửi cả "
                f"node_modules và mọi tệp .env vào build context",
            )

    def test_ban_sao_khong_duoc_lech_ban_goc(self):
        goc = [d for d in self.GOC.read_text(encoding="utf-8").splitlines() if d.strip()]
        for path in self.BAN_SAO:
            # Bỏ phần chú thích đầu tệp của bản sao: nó giải thích vì sao có bản sao, không phải
            # quy tắc. So phần QUY TẮC, và so cả thứ tự — thứ tự đổi thì phủ định `!...` đổi nghĩa.
            sao = [d for d in path.read_text(encoding="utf-8").splitlines() if d.strip()]
            self.assertEqual(
                sao[-len(goc):], goc,
                f"{path.relative_to(REPO_ROOT)} lệch khỏi .dockerignore ở gốc — chạy lại việc "
                f"nhân bản thay vì sửa tay một bên",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
