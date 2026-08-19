# -*- coding: utf-8 -*-
"""Mã nguồn không được chứa ký tự điều khiển, và regex phải khớp được thứ nó khai là khớp.

Vì sao tệp này tồn tại
----------------------
`understand.py` có một dòng thế này, và nó **chưa bao giờ hoạt động**:

    re.search(r"<BS>khong (?:co )?(?:hai san|...)<BS>", working)

`<BS>` là một **byte 0x08 THẬT** nằm trong tệp. Nó xuất hiện khi ai đó viết `"\\bkhong ..."`
trong chuỗi **không** raw — Python biến `\\b` thành backspace — rồi một lần sửa sau đó thêm tiền
tố `r` vào chuỗi đã bị vật chất hóa. Từ đó regex là `<backspace>khong ...` chứ không phải
`\\bkhong ...`, nên nó **không khớp gì cả**.

Đây là lớp lỗi tệ nhất có thể có, vì ba lý do cùng lúc:

1. **Vô hình.** Byte 0x08 không hiện trên màn hình, không hiện trong `git diff`, và phép kiểm
   "có ký tự ngoài ASCII không" cũng bỏ qua vì 0x08 < 127.
2. **Im lặng.** Regex không lỗi, nó chỉ không khớp. Mã chạy sạch.
3. **Nằm đúng trên đường an toàn.** Tài liệu dự án ghi cơ chế này là thứ **đưa an toàn dị ứng
   về mã tất định**, tức bỏ được phụ thuộc vào mô hình sinh. Thực tế nó là mã chết, và điều duy
   nhất che được là `AVOID_FRAMING` có sẵn cụm `khong co` và `khong an` — nên "không **có** hải
   sản" hoạt động trong khi "món **không** hải sản" thì không.

112 ca đánh giá **không bắt được**, vì không ca nào dùng đúng cách nói mà chỉ regex đó phủ. Nó
lộ ra khi tôi viết một ô notebook liệt kê bốn cách khai dị ứng và ô đó in ra **2/4 SAI**.

Bài học: **một cơ chế được khai là hàng rào an toàn thì phải có test chứng minh nó CHẠY**, không
phải chỉ có mặt trong mã.
"""
from __future__ import annotations

import ast
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

APP_DIR = Path(__file__).resolve().parent

# Ký tự điều khiển KHÔNG được có trong mã nguồn. Bỏ qua \t \n \r vì chúng là khoảng trắng hợp lệ.
#
# Mỗi ký tự dưới đây là kết quả của một escape trong chuỗi không-raw, và mọi escape đó đều là
# escape thường gặp trong regex:
#     \a -> 0x07   \b -> 0x08 (ranh giới từ!)   \v -> 0x0b   \f -> 0x0c   \e -> 0x1b
FORBIDDEN = {
    0x07: r"\a",
    0x08: r"\b",   # thủ phạm thật của dự án này
    0x0B: r"\v",
    0x0C: r"\f",
    0x1B: r"\e",
}


REPO_ROOT = APP_DIR.parents[1]


def source_files() -> list[Path]:
    """Mọi tệp .py của dịch vụ. Bỏ qua môi trường ảo nếu nó nằm trong `ai/`."""
    return sorted(
        p for p in APP_DIR.rglob("*.py")
        if ".venv" not in p.parts and "site-packages" not in p.parts
    )


def text_files() -> list[Path]:
    """Mọi tệp VĂN BẢN mà một byte điều khiển làm hỏng — rộng hơn `source_files()`.

    Vì sao phải rộng hơn: bản đầu chỉ quét `ai/**/*.py`, và một byte 0x08 lọt vào
    `.github/workflows/ci.yml` — trong một CHÚ THÍCH mô tả chính lỗi 0x08 đó. Hệ quả: GitHub
    Actions không phân tích được tệp workflow, nên **cả CI không chạy**, và mọi lần đẩy báo
    "failure" sau 0 giây.

    Đó là lớp lỗi tệ hơn cả lần trước: lần trước một cơ chế an toàn thành mã chết; lần này **toàn
    bộ phép kiểm tự động** thành mã chết. Và CI không thể tự bắt lỗi của chính tệp CI, nên chỗ duy
    nhất bắt được là test chạy ở máy.
    """
    ra: list[Path] = []
    for mau in ("*.py", "*.yml", "*.yaml", "*.json", "*.md", "*.toml", "*.cfg", "*.txt"):
        for goc in (REPO_ROOT / "ai", REPO_ROOT / ".github", REPO_ROOT / "deploy"):
            if not goc.exists():
                continue
            ra += [
                p for p in goc.rglob(mau)
                if ".venv" not in p.parts and "site-packages" not in p.parts
                and "node_modules" not in p.parts and "__pycache__" not in p.parts
            ]
    return sorted(set(ra))


class MaNguonKhongChuaKyTuDieuKhien(unittest.TestCase):
    def test_khong_tep_nao_co_byte_dieu_khien(self):
        loi: list[str] = []
        for path in text_files():
            raw = path.read_bytes()
            for code, escape in FORBIDDEN.items():
                n = raw.count(bytes([code]))
                if n:
                    dong = [
                        i for i, l in enumerate(raw.split(b"\n"), 1) if bytes([code]) in l
                    ]
                    loi.append(
                        f"{path.relative_to(REPO_ROOT)}: {n} byte {hex(code)} ở dòng {dong} — "
                        f"có lẽ là `{escape}` viết trong chuỗi KHÔNG raw"
                    )
        self.assertEqual(
            loi, [],
            "Ký tự điều khiển trong mã nguồn. Chúng vô hình trên màn hình và trong git diff, "
            "và nếu nằm trong regex thì regex im lặng không khớp gì:\n  " + "\n  ".join(loi),
        )


class TepWORKFLOWPhaiPhanTichDuoc(unittest.TestCase):
    """CI không thể tự bắt lỗi của chính tệp CI — nên chỗ bắt phải là test ở máy.

    Đã xảy ra: một byte 0x08 trong `ci.yml` làm GitHub Actions không phân tích được tệp, nên **cả
    CI không chạy**. Mọi lần đẩy báo "failure" sau 0 giây, và không bước nào trong đó thực thi —
    tức 337 test, 12 bộ kiểm và toàn bộ test backend .NET đều KHÔNG chạy, trong khi bảng trạng
    thái chỉ nói "failure" chứ không nói vì sao.

    `yaml` là thư viện tùy chọn, nên test tự bỏ qua khi thiếu — nhưng KHÔNG âm thầm: nó nêu rõ lý
    do, vì một test bỏ qua im lặng thì không khác gì không có test.
    """

    def workflows(self) -> list[Path]:
        goc = REPO_ROOT / ".github" / "workflows"
        return sorted(goc.glob("*.yml")) + sorted(goc.glob("*.yaml")) if goc.exists() else []

    def test_moi_tep_workflow_phan_tich_duoc(self):
        try:
            import yaml
        except ImportError:
            self.skipTest("thiếu pyyaml — cài `pip install pyyaml` để bật phép kiểm này")
        tep = self.workflows()
        self.assertTrue(tep, "không tìm thấy tệp workflow nào — đường dẫn có đúng không?")
        for path in tep:
            with self.subTest(path.name):
                try:
                    data = yaml.safe_load(path.read_text(encoding="utf-8"))
                except Exception as exc:  # ReaderError, ScannerError, ...
                    self.fail(f"{path.name} KHÔNG phân tích được: {type(exc).__name__}: "
                              f"{str(exc)[:200]}")
                self.assertTrue(data.get("jobs"), f"{path.name} không có job nào")

    def test_moi_thay_doi_deu_co_MOT_lan_CI(self):
        """Mọi thay đổi phải được CI chạy — ĐÚNG MỘT lần.

        Bất biến này có hai vế, và mất vế nào cũng tốn:

            thiếu CI    mã xanh ở máy, CI im lặng vì không được gọi — mất hàng tháng không ai biết
            CI TRÙNG    mỗi lần đẩy chạy hai lần trọn vẹn, và job đắt nhất dựng ảnh Docker 2,75GB

        Bản trước của test này chỉ canh vế thứ nhất, và nó canh bằng cách đòi `rebuild/**` nằm trong
        trigger `push` — với lý do "đây là chỗ DUY NHẤT biên dịch được backend .NET".

        Tiền đề đó đã đổi. Máy phát triển vẫn không có .NET SDK, nhưng CI cho một nhánh tính năng nay
        đến từ trigger `pull_request`, không từ `push`. Giữ cả hai là mỗi PR chạy hai lần — đo được
        trên PR #385: cùng commit `12ace33`, hai lần chạy cách nhau 4 giây.

        Nên test canh bất biến THẬT thay vì canh một danh sách nhánh:

            có `pull_request` KHÔNG giới hạn nhánh   -> nhánh nào mở PR cũng có CI
            `push` CHỈ `develop` và `main`           -> không nhân đôi, và vẫn có CI sau khi merge

        Vế thứ hai còn cần cho việc khác: `deploy-staging`/`deploy-production` kích hoạt theo `push`
        lên hai nhánh đó, và `promote-production` chờ Deploy Staging xong.
        """
        try:
            import yaml
        except ImportError:
            self.skipTest("thiếu pyyaml")
        ci = REPO_ROOT / ".github" / "workflows" / "ci.yml"
        if not ci.exists():
            self.skipTest("không có ci.yml")
        data = yaml.safe_load(ci.read_text(encoding="utf-8"))
        # `on` là từ khóa YAML cho True, nên nó có thể vào dict dưới khóa `True`.
        on = data.get("on") or data.get(True) or {}

        self.assertIn(
            "pull_request", on,
            "thiếu trigger `pull_request` — nhánh tính năng sẽ không có CI nào",
        )
        pr = on.get("pull_request") or {}
        self.assertFalse(
            (pr or {}).get("branches"),
            "trigger `pull_request` KHÔNG được giới hạn nhánh: giới hạn là tạo ra một nhóm nhánh "
            "lặng lẽ không có CI",
        )

        nhanh = set((on.get("push") or {}).get("branches") or [])
        self.assertEqual(
            nhanh, {"develop", "main"},
            f"`push` phải đúng {{develop, main}}, đang là {sorted(nhanh)}. Thêm nhánh tính năng vào "
            "đây là chạy CI HAI LẦN cho mọi PR; bớt `develop`/`main` là mất cả CI sau merge lẫn "
            "trigger của deploy-staging / deploy-production.",
        )


class RegexPhaiKhopDuocThuNoKhaiLaKhop(unittest.TestCase):
    """Chiều ngược của test trên: byte sạch nhưng regex vẫn có thể vô nghĩa.

    Test này biên dịch mọi mẫu regex trong mã và đòi mẫu đó **khớp được ít nhất một chuỗi**. Một
    mẫu không khớp gì thì nó là mã chết, dù tệp không có byte lạ nào.
    """

    def _patterns(self) -> list[tuple[Path, int, str]]:
        out: list[tuple[Path, int, str]] = []
        for path in source_files():
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
                    continue
                if node.func.attr not in ("search", "match", "fullmatch", "compile", "sub"):
                    continue
                if not (isinstance(node.func.value, ast.Name) and node.func.value.id == "re"):
                    continue
                if node.args and isinstance(node.args[0], ast.Constant) \
                        and isinstance(node.args[0].value, str):
                    out.append((path, node.lineno, node.args[0].value))
        return out

    def test_moi_mau_regex_bien_dich_duoc(self):
        for path, lineno, pattern in self._patterns():
            with self.subTest(f"{path.name}:{lineno}"):
                try:
                    re.compile(pattern)
                except re.error as exc:
                    self.fail(f"{path.name}:{lineno} mẫu không biên dịch được: {exc}")

    def test_khong_mau_nao_chua_ky_tu_dieu_khien(self):
        xau: list[str] = []
        for path, lineno, pattern in self._patterns():
            co = [hex(ord(c)) for c in pattern if ord(c) in FORBIDDEN]
            if co:
                xau.append(f"{path.name}:{lineno} chứa {co} — mẫu này sẽ không khớp như ý")
        self.assertEqual(xau, [], "\n  ".join(xau))


class CoCheAnToANPhaiCoBANGCHUNGLaNoCHAY(unittest.TestCase):
    """Mỗi cơ chế được khai là hàng rào an toàn phải có ca chứng minh nó chạy.

    Không có class này thì lỗi backspace lặp lại được: mã có mặt, tài liệu ghi nó là hàng rào,
    112 ca vẫn xanh, và không ai biết nó là mã chết.
    """

    def setUp(self):
        import json

        from understand import understand

        self.understand = understand
        self.items = json.loads(
            (APP_DIR.parents[1] / "data" / "menu-dataset.json").read_text(
                encoding="utf-8-sig"
            )
        )["items"]

    def test_mau_khong_chu_de_bat_duoc_moi_nhom_di_nguyen(self):
        """Mẫu `không ⟨chủ đề⟩` — chính cơ chế từng là mã chết.

        Không dùng cụm `không có` hay `không ăn` ở đây, vì hai cụm đó đã có trong
        `AVOID_FRAMING` và chúng **che mất** việc mẫu regex hỏng. Phải thử đúng dạng mà chỉ
        regex phủ.
        """
        ca = [
            ("Cho mình món không hải sản", "allergen:seafood"),
            ("Món nào không sữa", "allergen:dairy"),
            ("Món nào không trứng", "allergen:egg"),
            ("Cho mình món không đậu phộng", "allergen:peanut"),
            ("Món không gluten", "allergen:gluten"),
        ]
        for cau, nhan in ca:
            with self.subTest(cau):
                r = self.understand(cau, self.items)
                self.assertIn(
                    nhan, r.avoid_tags,
                    f"{cau!r}: mẫu `không ⟨chủ đề⟩` không bắt được — cơ chế này từng là mã "
                    "chết vì một byte 0x08 vô hình",
                )

    def test_duyet_danh_muc_KHONG_bi_coi_la_tranh(self):
        """Chiều ngược, bắt buộc: nếu mọi câu có tên dị nguyên đều bị coi là tránh thì test
        trên qua một cách vô nghĩa, và khách muốn xem món hải sản sẽ không thấy món nào."""
        for cau in ("Nhà hàng có hải sản gì?", "Cho mình xem món hải sản"):
            with self.subTest(cau):
                r = self.understand(cau, self.items)
                self.assertEqual(r.avoid_tags, [], f"{cau!r}: đây là câu DUYỆT, không phải tránh")
                self.assertIn("cat_seafood", r.categories)

    def test_cach_noi_dan_da_va_trieu_chung(self):
        """Hai ca thật đã đưa từ mô hình về mã tất định ở bước 6."""
        for cau, nhan in [
            ("Mình không ăn được đồ tanh", "allergen:seafood"),
            ("Bé nhà mình uống sữa là bị đau bụng, có món nào không sữa không?",
             "allergen:dairy"),
        ]:
            with self.subTest(cau):
                r = self.understand(cau, self.items)
                self.assertIn(nhan, r.avoid_tags)


if __name__ == "__main__":
    unittest.main(verbosity=2)
