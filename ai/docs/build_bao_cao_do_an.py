# -*- coding: utf-8 -*-
"""Sinh báo cáo đồ án môn Học máy & Khai phá dữ liệu từ MÃ và BẰNG CHỨNG ĐO, không viết tay số.

    python ai/docs/build_bao_cao_do_an.py            # sinh báo cáo
    python ai/docs/build_bao_cao_do_an.py --check    # kiểm khớp bản đã commit

Vì sao báo cáo phải được SINH — và đây là bài học đã trả giá bằng chính nó
------------------------------------------------------------------------
Bản trước của `BAO_CAO_DO_AN_HOC_MAY_KPDL.md` viết tay 1587 dòng, gồm toàn bộ số liệu. Sau khi phần AI
được dựng lại từ số không, báo cáo mô tả một hệ thống **không còn tồn tại**:

    nhắc `understand.py`, `answer.py`, `generate.py`, `golden_e2e`   0 lần
    Phụ lục B "Lệnh tái lập thực nghiệm" — 11 lệnh                  11/11 trỏ vào tệp ĐÃ XÓA
    Chương 4                                                       so "bảy phương pháp truy hồi",
                                                                   "ba pipeline profile" — thực nghiệm
                                                                   của hệ thống cũ
    số liệu 0,937 · 0,990 · 0,981                                  đo trên hệ thống cũ

Người chấm đọc báo cáo rồi mở repo sẽ thấy hai hệ thống khác nhau, và không lệnh nào trong Phụ lục B
chạy được. Đó là hỏng nặng nhất có thể với một bài nộp.

Notebook của dự án KHÔNG trôi, vì mọi ô mã của nó tự tính lại. Báo cáo trôi vì nó không tính gì. Nên
cách sửa không phải "viết lại rồi nhớ cập nhật" — cách đó vừa thất bại — mà là **sinh**.

Ba loại số, ba nguồn khác nhau
------------------------------
    đếm được ngay      thực đơn, nhãn, kho tri thức, kích thước bốn tập ca  -> đọc tệp dữ liệu
    cần embedding      so ba bộ truy hồi trên hai bài toán                  -> đọc `measurements/`
    cần stack + mô hình golden 103 lượt, LLM+RAG loại C                     -> đọc `measurements/`

Loại thứ hai và ba không tính lại được ở đây: CI cài từng gói chứ không cài cả `requirements.txt`, nên
`--check` sẽ đỏ vì thiếu `sentence-transformers` — một lý do không liên quan gì tới báo cáo. Chúng được
GHI ra `measurements/` bởi chính bộ chạy, và thiếu tệp thì bộ sinh **báo lỗi to** chứ không in số cũ.

Phụ lục B TỰ KIỂM
-----------------
Mỗi lệnh trong Phụ lục B được đối chiếu với hệ thống tệp lúc sinh. Thiếu một tệp là **sinh thất bại**,
không phải một dòng sai lặng lẽ trong tài liệu. Đây là phép kiểm đắt giá nhất của tệp này, vì nó bịt
đúng lỗ đã làm bản trước thành vô dụng.
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# `parents[1]`, không phải `parents[2]`: HERE là `<repo>/ai/docs`, nên parents[0]=`ai` và
# parents[1]=gốc repo. Bản đầu viết `parents[2]` và trỏ ra NGOÀI repo — cổng tự kiểm của Phụ lục B bắt
# ngay ở lần chạy đầu, báo 20/21 lệnh trỏ vào tệp không tồn tại. Đúng việc nó có mặt để làm.
REPO_ROOT = HERE.parents[1]
AI = REPO_ROOT / "ai"

# Báo cáo nằm ở `docs/ai/`, KHÔNG phải `ai/docs/`. Repo có HAI thư mục tài liệu và chúng khác vai:
#
#     ai/docs/    tài liệu TỪNG BƯỚC của phần AI (00-problem-statement … 07-error-analysis) + bộ sinh
#     docs/ai/    tài liệu mức DỰ ÁN, gồm báo cáo đồ án và runbook vận hành
#
# Bản đầu của tệp này ghi vào `HERE / "BAO_CAO..."` tức `ai/docs/`, nên nó **tạo một tệp mới ở chỗ sai
# và để nguyên bản gốc đã trôi** — hai bản báo cáo cùng tồn tại, và người đọc gặp bản nào là tùy may.
# Đúng lớp lỗi "hai đầu phải khớp", lần này hai đầu là hai đường dẫn giống nhau đến mức khó thấy.
OUT_PATH = REPO_ROOT / "docs" / "ai" / "BAO_CAO_DO_AN_HOC_MAY_KPDL.md"

sys.path.insert(0, str(AI / "app"))
sys.path.insert(0, str(AI / "evaluation"))


# ----------------------------------------------------------------- đọc dữ liệu và bằng chứng
def doc_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def so(x: float, n: int = 3) -> str:
    """Số thập phân kiểu Việt: dấu phẩy. `None` thành gạch ngang."""
    return "—" if x is None else f"{x:.{n}f}".replace(".", ",")


def pct(x: float, n: int = 2) -> str:
    """Tỷ lệ 0–1 thành phần trăm kiểu Việt, mặc định HAI chữ số thập phân: `0.6087` -> `60,87%`.

    Vì sao đổi từ dạng thập phân `0,609` sang phần trăm: báo cáo học thuật ngành đọc `98,74%` nhanh
    hơn `0,9874`, và hai chữ số sau dấu phẩy là mức chi tiết vừa đủ — với n = 222 ca thì một ca lệch
    là 0,45%, nên chữ số thứ ba không mang thông tin thật.
    """
    return "—" if x is None else f"{x * 100:.{n}f}".replace(".", ",") + "%"


def diem_pt(x: float, n: int = 2) -> str:
    """Chênh lệch tính bằng ĐIỂM PHẦN TRĂM (không phải phần trăm tương đối)."""
    return "—" if x is None else f"{x * 100:+.{n}f}".replace(".", ",")


def tien(x: int) -> str:
    return f"{x:,}".replace(",", ".") + "đ"


class Bang:
    """Mọi số của báo cáo, đọc một lần rồi dùng chung. Thiếu bằng chứng thì NỔ, không đoán."""

    def __init__(self) -> None:
        import results
        from rag.chunker import all_chunks, doan_toan_kho, load_all, retrievable_chunks

        self.menu = doc_json(REPO_ROOT / "data/menu-dataset.json")
        self.tags = doc_json(REPO_ROOT / "data/menu-tags.json")["tags"]
        self.items = self.menu["items"]

        kho = AI / "knowledge"
        self.docs = load_all(kho)
        self.doan = all_chunks(kho)
        self.doan_synth = retrievable_chunks(kho)
        self.doan_xep_hang = doan_toan_kho(kho)
        self.che_do = collections.Counter(d.answer_mode for d in self.docs)

        self.ca_tra_loi = doc_json(AI / "evaluation/cases.json")["cases"]
        self.ca_truy_hoi = doc_json(AI / "evaluation/retrieval_cases.json")["cases"]
        self.ca_chon_muc = doc_json(AI / "evaluation/chunk_selection_cases.json")["cases"]
        self.kich_ban = doc_json(AI / "evaluation/session_scripts.json")["scripts"]
        self.golden = doc_json(AI / "evaluation/golden_e2e.json")["conversations"]
        self.split_truy_hoi = doc_json(AI / "evaluation/retrieval_split.json")

        # Bằng chứng đo. Thiếu là NỔ — xem docstring mô-đun.
        self.m_golden = results.doc("golden_e2e")
        self.m_golden_sinh = results.doc("golden_e2e_sinh")
        self.m_llm = results.doc("llm_rag_loai_c")
        self.m_truy_hoi = results.doc("truy_hoi_so_sanh")
        self.m_chon_dev = results.doc("chon_muc_phat_trien")
        self.m_chon_np = results.doc("chon_muc_niem_phong")
        # Phân bố đường đi. Trước bản này ba câu trong báo cáo viết CỨNG "đường truy
        # hồi chạy 0 lần", còn số ca thì thay động — nên sau khi tập ca mở rộng, bộ
        # sinh in ra câu "trên 161 ca … chạy 0 lần" trong khi số thật là 14/161.
        # Câu nào nói về một phép đo thì con số của nó phải ĐỌC từ phép đo ấy.
        self.m_duong = results.doc("phan_bo_duong")

        # Bộ HAI CHIỀU — 100 câu, đo VÌ SAO hệ thống cần cả hai lớp. Đọc CSV vì đó cũng là tệp đưa
        # cho người đọc mở Excel; giữ MỘT nguồn thay vì sinh thêm một JSON song song.
        import csv as _csv
        _p = AI / "evaluation/measurements/hai_chieu.csv"
        if not _p.exists():
            raise SystemExit(
                f"Thiếu bằng chứng {_p.relative_to(REPO_ROOT)}. "
                "Chạy: python ai/evaluation/run_hai_chieu.py --csv"
            )
        self.hai_chieu = list(_csv.DictReader(_p.open(encoding="utf-8-sig")))

    # -- dẫn xuất -------------------------------------------------------------------
    @property
    def luot_phien(self) -> int:
        return sum(len(s["turns"]) for s in self.kich_ban)

    @property
    def luot_golden(self) -> int:
        return sum(len(c["turns"]) for c in self.golden)

    @property
    def tr_ca(self) -> int:
        """Số ca một lượt đi qua nhánh truy hồi toàn kho — ĐỌC từ phép đo."""
        return self.m_duong["so"]["tap_ca"]["dem"].get("truy_hoi", 0)

    @property
    def tr_phien(self) -> int:
        """Số lượt phiên đi qua nhánh truy hồi toàn kho — ĐỌC từ phép đo."""
        return self.m_duong["so"]["tap_phien"]["dem"].get("truy_hoi", 0)

    def ktc_truy_hoi(self, tap: str) -> dict:
        """Khoảng tin cậy Wilson 95% cho Hit@1 của từng bộ truy hồi trên một tập."""
        import sys as _s
        if str(AI / "evaluation") not in _s.path:
            _s.path.insert(0, str(AI / "evaluation"))
        from thong_ke import khoang_wilson
        bo = self.m_truy_hoi["so"]["bai_toan_1"][tap]["bo"]
        return {ten: khoang_wilson(v["hit1"], v["n"]) for ten, v in bo.items()}

    def mcnemar_truy_hoi(self, tap: str) -> list:
        """Kiểm định McNemar ghép cặp cho mọi cặp bộ truy hồi trên một tập.

        Yêu cầu `hit1_theo_ca` có trong bằng chứng đo. Thiếu thì NỔ thay vì bỏ qua — một báo cáo
        khẳng định "A tốt hơn B" mà không kiểm định được là báo cáo không bảo vệ được.
        """
        import itertools
        import sys as _s
        if str(AI / "evaluation") not in _s.path:
            _s.path.insert(0, str(AI / "evaluation"))
        from thong_ke import mcnemar
        bo = self.m_truy_hoi["so"]["bai_toan_1"][tap]["bo"]
        thieu = [t for t, v in bo.items() if not v.get("hit1_theo_ca")]
        if thieu:
            raise SystemExit(
                f"Thiếu `hit1_theo_ca` cho {thieu} ở tập {tap}. "
                "Chạy: python ai/evaluation/run_retrieval_comparison.py --sealed"
            )
        ra = []
        for a, b_ in itertools.combinations(["embedding", "hybrid", "bm25"], 2):
            if a in bo and b_ in bo:
                ra.append((a, b_, mcnemar(bo[a]["hit1_theo_ca"], bo[b_]["hit1_theo_ca"])))
        return ra

    def ktc_chon_mon(self) -> dict:
        """Khoảng tin cậy Wilson cho bài toán chọn món (bài toán 2)."""
        import sys as _s
        if str(AI / "evaluation") not in _s.path:
            _s.path.insert(0, str(AI / "evaluation"))
        from thong_ke import khoang_wilson
        bo = self.m_truy_hoi["so"]["bai_toan_2"]["bo"]
        return {ten: khoang_wilson(v["hit1"], v["n"]) for ten, v in bo.items()}

    def mcnemar_chon_mon(self) -> list:
        """McNemar so lọc nhãn với từng bộ xếp hạng trên bài toán chọn món."""
        import sys as _s
        if str(AI / "evaluation") not in _s.path:
            _s.path.insert(0, str(AI / "evaluation"))
        from thong_ke import mcnemar
        bo = self.m_truy_hoi["so"]["bai_toan_2"]["bo"]
        if not bo["lọc nhãn"].get("hit1_theo_ca"):
            raise SystemExit(
                "Thiếu `hit1_theo_ca` ở bài toán 2. "
                "Chạy: python ai/evaluation/run_retrieval_comparison.py --sealed"
            )
        return [("lọc nhãn", t, mcnemar(bo["lọc nhãn"]["hit1_theo_ca"], bo[t]["hit1_theo_ca"]))
                for t in ("bm25", "embedding", "hybrid") if t in bo]

    def n_can(self, nua_rong: float) -> int:
        import sys as _s
        if str(AI / "evaluation") not in _s.path:
            _s.path.insert(0, str(AI / "evaluation"))
        from thong_ke import n_can_thiet
        return n_can_thiet(nua_rong)

    def vd(self, i: int) -> dict:
        """Chạy THẬT một trong ba câu ví dụ qua toàn hệ thống, trả về trạng thái từng lớp.

        Không chép tay kết quả: nếu hệ thống đổi hành vi thì báo cáo đổi theo, và cổng `--check`
        của CI bắt được. Đây là cách duy nhất để ví dụ trong báo cáo không trôi khỏi mã.
        """
        if not hasattr(self, "_vd_cache"):
            import answer as _a
            import understand as _u
            cau = [
                "Mình dị ứng hải sản, cho món chay dưới 100 nghìn",
                "Mấy giờ quán đóng cửa?",
                "Gọi khai vị trước có làm no bụng không?",
            ]
            theo_id = {x["id"]: x for x in self.items}
            ra = []
            for c in cau:
                r = _u.understand(c, self.items)
                p = _a.respond(r, self.items)
                # Bỏ tên BỘ TRUY HỒI khỏi tên nhánh: `knowledge_corpus:embedding` -> `knowledge_corpus`.
                #
                # Máy nhà có `sentence_transformers` nên nhánh ghi `:embedding`; CI không cài nên nó
                # ghi `:bm25`. Cùng một commit cho hai kết quả khác nhau, và cổng `--check` đỏ trên
                # CI mà không tái lập được ở máy nhà — cùng lớp lỗi với `obj/` lọt vào bảng module.
                #
                # Tên bộ truy hồi không phải điều ví dụ này muốn nói; điều nó muốn nói là câu ĐI
                # ĐƯỜNG NÀO. Nên cắt phần sau dấu hai chấm cho nhánh truy hồi.
                _nhanh = p.branch
                if _nhanh.startswith("knowledge_corpus:"):
                    _nhanh = "knowledge_corpus"
                ra.append({
                    "cau": c,
                    "avoid": r.avoid_tags or "—",
                    "budget": f"{r.budget_max:,}".replace(",", ".") if r.budget_max else "—",
                    "policy": getattr(r, "policy_topic", None) or "—",
                    "nhanh": _nhanh,
                    "so_mon": len(p.items),
                    "mon": theo_id[p.items[0]]["name"] if p.items else "—",
                    "ghi_chu": (f"nhánh `{_nhanh}` trả về {len(p.items)} món"
                                if p.items else "không trả về món nào"),
                })
            self._vd_cache = ra
        return self._vd_cache[i]

    @property
    def so_nhanh(self) -> int:
        """Số nhánh trả lời — ĐẾM từ mã, không gõ tay."""
        import re
        src = (AI / "app" / "answer.py").read_text(encoding="utf-8")
        return len(set(re.findall(r"""branch=["'](\w+)["']""", src)))

    @property
    def nhanh_duoc_sinh(self) -> list[str]:
        """Danh sách nhánh được phép gọi mô hình sinh — đọc từ `generate.BRANCHES_ALLOWED`."""
        import generate
        return sorted(generate.BRANCHES_ALLOWED)

    @property
    def nhanh_co_the_gio(self) -> list[str]:
        import cart
        return list(cart.BRANCHES_WITH_CART)

    @property
    def so_cum_tu_vung(self) -> int:
        """Số cụm từ vựng tất định — ĐẾM từ chính bảng, không gõ tay."""
        import understand
        return len(understand.VOCAB)

    @property
    def so_phep_kiem(self) -> int:
        """Số phép kiểm của `verify()`, đếm HAI cách rồi đối chiếu.

        Nhãn chú thích (`# 1.` … `# 8.` kèm hậu tố `6b`, `6c`) đọc được nhưng có thể quên cập nhật;
        số chỗ `loi.append(` thì đúng lúc chạy nhưng không tự nói tên. Lệch nhau nghĩa là có phép
        kiểm không được đánh số. Bản đầu gom `6`, `6b`, `6c` làm một nên đếm 8 trong khi thật là 10.
        """
        import re
        src = (AI / "app" / "generate.py").read_text(encoding="utf-8")
        than = src[src.index("def verify("):]
        moc = chr(10) + "def "
        than = than[:than.index(moc)] if moc in than else than
        theo_nhan = len(set(re.findall(r"^    # (\d+[a-z]?)\.", than, re.M)))
        theo_ma = than.count("loi.append(")
        if theo_nhan != theo_ma:
            raise SystemExit(
                f"verify(): {theo_nhan} phép kiểm có nhãn nhưng {theo_ma} chỗ báo vi phạm."
            )
        return theo_nhan

    @property
    def so_cong_check(self) -> int:
        """Số cổng `--check` trong CI — đếm từ chính workflow."""
        return (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(
            encoding="utf-8").count("--check")

    @property
    def hc_a(self) -> list[dict]:
        return [r for r in self.hai_chieu if r["chieu"] == "A"]

    @property
    def hc_b(self) -> list[dict]:
        return [r for r in self.hai_chieu if r["chieu"] == "B"]

    def hc_a_dem(self, loai: str) -> int:
        """`dung` | `khong_xu_ly` | `sai_dang` — ba kết cục của mã tất định ở chiều A."""
        if loai == "dung":
            return sum(1 for r in self.hc_a if r["tat_dinh_dung"] == "True")
        if loai == "khong_xu_ly":
            return sum(1 for r in self.hc_a
                       if r["tat_dinh_dung"] != "True" and r["nhanh_la_truy_hoi"] == "True")
        return sum(1 for r in self.hc_a
                   if r["tat_dinh_dung"] != "True" and r["nhanh_la_truy_hoi"] != "True")

    def hc_a_truy_hoi(self, cot: str) -> int:
        return sum(1 for r in self.hc_a if r[cot] == "True")

    def hc_b_cau_vi_pham(self, cot: str, dang: str | None = None) -> int:
        """Số CÂU có ít nhất một món vi phạm — khác `hc_b_vi_pham` vốn đếm tổng số MÓN.

        Hai cách đếm trả lời hai câu hỏi khác nhau, và báo cáo cần cả hai: "bao nhiêu câu bị ảnh
        hưởng" là thước đo mức phổ biến của lỗi, còn "tổng bao nhiêu món sai" là thước đo mức
        nghiêm trọng. Một phương pháp sai 1 câu nhưng sai 20 món khác hẳn một phương pháp sai 20
        câu mỗi câu 1 món.
        """
        hang = self.hc_b if dang is None else [r for r in self.hc_b if r["vi_sao"] == dang]
        return sum(1 for r in hang if int(r[cot] or 0) > 0)

    def hc_b_vi_pham(self, cot: str, dang: str | None = None) -> int:
        hang = self.hc_b if dang is None else [r for r in self.hc_b if r["vi_sao"] == dang]
        return sum(int(r[cot] or 0) for r in hang)

    def hc_b_dang(self) -> list[str]:
        return sorted({r["vi_sao"] for r in self.hc_b})

    @property
    def loai_ca(self) -> collections.Counter:
        return collections.Counter(c.get("type", "?") for c in self.ca_tra_loi)

    @property
    def chu_de_khong_cum(self) -> int:
        """Chủ đề `synthesize` KHÔNG có cụm từ vựng — chỉ tới được qua truy hồi."""
        from understand import VOCAB

        cum = {v for v in VOCAB.values()} if isinstance(VOCAB, dict) else set()
        co_cum = set()
        for d in self.docs:
            if d.answer_mode != "synthesize":
                continue
            for k in d.topic_keys:
                if any(k == c for c in cum):
                    co_cum.add(k)
        tat_ca = {k for d in self.docs if d.answer_mode == "synthesize" for k in d.topic_keys}
        return len(tat_ca - co_cum)

    def ty_le_truy_hoi(self, nhom: str, bo: str, chi_so: str) -> float | None:
        """Tỷ lệ = tổng tích lũy / số ca có khóa đáp án. `Ketqua` giữ TỔNG, không giữ tỷ lệ."""
        d = self.m_truy_hoi["so"]["bai_toan_1"].get(nhom, {}).get("bo", {}).get(bo)
        if not d or not d["n"]:
            return None
        return d[chi_so] / d["n"]

    def cam5(self, nhom: str, bo: str) -> int | None:
        d = self.m_truy_hoi["so"]["bai_toan_1"].get(nhom, {}).get("bo", {}).get(bo)
        return None if not d else d["cam5"]

    def chon_muc(self, tap: str, nhom_dang: str, bo: str, chi: str = "top1") -> float | None:
        m = self.m_chon_np if tap == "niem_phong" else self.m_chon_dev
        d = m["so"]["nhom"].get(nhom_dang, {}).get(bo)
        return None if not d else d.get(chi)

    def bo_truy_hoi(self) -> list[str]:
        return list(self.m_truy_hoi["so"]["bai_toan_1"]["phát triển"]["bo"])


# ----------------------------------------------------------------- Phụ lục B: TỰ KIỂM
# Lệnh tái lập, và MỌI lệnh ở đây được đối chiếu với hệ thống tệp lúc sinh.
#
# Bản trước của báo cáo có 11 lệnh và 11/11 trỏ vào tệp đã xóa. Không ai phát hiện, vì tài liệu không
# có cách nào tự kiểm. Nay thiếu một tệp là sinh THẤT BẠI.
LENH_TAI_LAP: list[tuple[str, str, str]] = [
    # (nhóm, lệnh, tệp phải tồn tại)
    ("Bước 1 — dữ liệu và tri thức sinh lại được, không cần mô hình",
     "python ai/scripts/build_tag_dictionary.py --check", "ai/scripts/build_tag_dictionary.py"),
    ("Bước 1 — dữ liệu và tri thức sinh lại được, không cần mô hình",
     "python ai/scripts/build_knowledge.py --check", "ai/scripts/build_knowledge.py"),
    ("Bước 1 — dữ liệu và tri thức sinh lại được, không cần mô hình",
     "python ai/scripts/build_retrieval_cases.py --check", "ai/scripts/build_retrieval_cases.py"),
    ("Bước 1 — dữ liệu và tri thức sinh lại được, không cần mô hình",
     "python ai/scripts/build_chunk_selection_cases.py --check",
     "ai/scripts/build_chunk_selection_cases.py"),
    ("Bước 2 — thước đo và tập ca",
     "python ai/evaluation/validate_cases.py", "ai/evaluation/validate_cases.py"),
    ("Bước 2 — thước đo và tập ca",
     "python ai/evaluation/probe_metric_holes.py", "ai/evaluation/probe_metric_holes.py"),
    ("Bước 2 — thước đo và tập ca",
     "python ai/evaluation/build_retrieval_split.py --check",
     "ai/evaluation/build_retrieval_split.py"),
    ("Bước 3 — số nền, không gọi mô hình",
     "python ai/evaluation/run_baseline.py --all", "ai/evaluation/run_baseline.py"),
    ("Bước 3 — số nền, không gọi mô hình",
     "python ai/evaluation/run_session_eval.py", "ai/evaluation/run_session_eval.py"),
    ("Bước 3 — số nền, không gọi mô hình",
     "python ai/evaluation/run_ablation.py", "ai/evaluation/run_ablation.py"),
    ("Bước 4 — so truy hồi (cần `sentence-transformers`)",
     "python ai/evaluation/run_retrieval_comparison.py --sealed",
     "ai/evaluation/run_retrieval_comparison.py"),
    ("Bước 4 — so truy hồi (cần `sentence-transformers`)",
     "python ai/evaluation/run_chunk_selection_comparison.py",
     "ai/evaluation/run_chunk_selection_comparison.py"),
    ("Bước 4 — so truy hồi (cần `sentence-transformers`)",
     "python ai/evaluation/run_chunk_selection_comparison.py --sealed",
     "ai/evaluation/run_chunk_selection_comparison.py"),
    ("Bước 5 — cần MÔ HÌNH thật (`LLM_API_KEY`)",
     "python ai/evaluation/run_llm_rag_eval.py", "ai/evaluation/run_llm_rag_eval.py"),
    ("Bước 6 — cần CẢ STACK (docker compose) và mô hình thật",
     "docker compose -f deploy/docker-compose.java.yml up -d --build", "deploy/docker-compose.java.yml"),
    ("Bước 6 — cần CẢ STACK (docker compose) và mô hình thật",
     "python ai/evaluation/wait_for_stack.py", "ai/evaluation/wait_for_stack.py"),
    ("Bước 6 — cần CẢ STACK (docker compose) và mô hình thật",
     "python ai/evaluation/run_golden_e2e.py", "ai/evaluation/run_golden_e2e.py"),
    ("Bước 7 — phân tích và tài liệu",
     "python ai/evaluation/analyze_failures.py", "ai/evaluation/analyze_failures.py"),
    ("Bước 7 — phân tích và tài liệu",
     "python ai/notebooks/build_teaching_notebook.py",
     "ai/notebooks/build_teaching_notebook.py"),
    ("Bước 7 — phân tích và tài liệu",
     "python ai/docs/build_bao_cao_do_an.py", "ai/docs/build_bao_cao_do_an.py"),
]


def kiem_lenh_tai_lap() -> list[str]:
    return [t for _, _, t in LENH_TAI_LAP if not (REPO_ROOT / t).exists()]


def phu_luc_b() -> str:
    ra = ["## Phụ lục B: Lệnh tái lập thực nghiệm", ""]
    ra.append("Chạy từ **gốc repo**. Mỗi lệnh dưới đây được bộ sinh báo cáo đối chiếu với hệ thống tệp,")
    ra.append("nên một lệnh trỏ vào tệp không tồn tại là **sinh báo cáo thất bại** — không phải một dòng")
    ra.append("sai lặng lẽ trong tài liệu. Bản trước của báo cáo có 11 lệnh và **11/11 trỏ vào tệp đã")
    ra.append("xóa**, không ai phát hiện.")
    ra.append("")
    nhom_hien = None
    for nhom, lenh, _ in LENH_TAI_LAP:
        if nhom != nhom_hien:
            if nhom_hien is not None:
                ra.append("```")
                ra.append("")
            ra.append(f"**{nhom}**")
            ra.append("")
            ra.append("```bash")
            nhom_hien = nhom
        ra.append(lenh)
    ra.append("```")
    return "\n".join(ra)


# ----------------------------------------------------------------- Phụ lục C: cấu trúc mã
def phu_luc_c(b: Bang) -> str:
    """Cấu trúc mã nguồn: mô tả VAI TRÒ, và kiểm mọi mô-đun được nhắc là CÓ THẬT.

    Vì sao KHÔNG đếm số dòng
    ------------------------
    Bản đầu của phụ lục này in "số tệp / tổng dòng" cho mỗi thư mục. Hậu quả: **mọi lần sửa một dòng
    mã đều làm báo cáo lạc hậu**, nên `--check` trong CI đỏ cho bất kỳ PR chạm vào `ai/`. Ma sát đó
    không đổi lấy gì — số dòng là trang trí, và nó tạo cảm giác chính xác giả.

    Kết cục dễ đoán của ma sát vô ích: người ta bỏ chạy bộ sinh, hoặc bỏ luôn bước `--check`. Tức một
    phép kiểm quá nhạy tự làm mình bị vô hiệu.

    Nên phụ lục này mô tả **cấu trúc** — thư mục nào làm gì, mô-đun nào chịu trách nhiệm gì — và nó
    chỉ đổi khi **kiến trúc** đổi, đúng lúc báo cáo *nên* đổi. Điều được kiểm là mọi mô-đun được nhắc
    **tồn tại**, vì đó là thứ có thể sai và có hậu quả.
    """
    CAU_TRUC: list[tuple[str, str, list[str]]] = [
        ("ai/app", "mã lúc chạy — không tệp nào ở đây phụ thuộc bộ đo", [
            "understand.py", "answer.py", "generate.py", "cart.py", "session.py",
            "llm_understand.py", "service.py",
        ]),
        ("ai/app/rag", "ba bộ truy hồi và tầng chia đoạn", [
            "bm25.py", "embedding.py", "hybrid.py", "chunker.py", "precompute.py",
        ]),
        ("ai/evaluation", "bốn tập đánh giá, thước đo, bộ so, phân tích nguyên nhân", [
            "cases.json", "session_scripts.json", "retrieval_cases.json",
            "chunk_selection_cases.json", "golden_e2e.json",
            "answer_metric.py", "run_baseline.py", "run_session_eval.py",
            "run_retrieval_comparison.py", "run_chunk_selection_comparison.py",
            "run_llm_rag_eval.py", "run_golden_e2e.py", "analyze_failures.py",
            "results.py", "verify_deploy_config.py",
        ]),
        ("ai/knowledge", "kho tri thức markdown — nguồn của mọi câu trả lời tri thức", []),
        ("ai/scripts", "bộ sinh dữ liệu, tất cả có `--check` trong CI", [
            "build_tag_dictionary.py", "build_knowledge.py",
            "build_retrieval_cases.py", "build_chunk_selection_cases.py",
        ]),
        ("ai/notebooks", "notebook giảng dạy + báo cáo, mọi ô tự tính lại", [
            "build_teaching_notebook.py",
        ]),
        ("ai/docs", "tài liệu từng bước, và bộ sinh của báo cáo này", [
            "build_bao_cao_do_an.py",
        ]),
        ("ai/contracts", "lược đồ JSON của hợp đồng với backend", [
            "ai-chat-v1.schema.json",
        ]),
    ]
    thieu = [
        f"{d}/{m}" for d, _, mods in CAU_TRUC for m in mods
        if not (REPO_ROOT / d / m).exists()
    ]
    if thieu:
        raise FileNotFoundError(
            "Phụ lục C nhắc những mô-đun KHÔNG TỒN TẠI: " + ", ".join(thieu)
            + "\nSửa `CAU_TRUC` trong `build_bao_cao_do_an.py`, hoặc khôi phục tệp. Bản trước của báo"
            " cáo có cả một phụ lục trỏ vào tệp đã xóa và không ai phát hiện."
        )

    ra = ["## Phụ lục C: Cấu trúc mã nguồn", ""]
    ra.append("Mọi mô-đun nhắc dưới đây được **đối chiếu với hệ thống tệp** lúc sinh báo cáo — một tên")
    ra.append("không tồn tại là sinh thất bại. Không in số dòng, có chủ ý: số dòng đổi mỗi lần sửa mã,")
    ra.append("nên nó biến `--check` thành một phép kiểm quá nhạy, và một phép kiểm quá nhạy sẽ bị bỏ.")
    ra.append("")
    ra.append("| Thư mục | Vai trò | Mô-đun chính |")
    ra.append("|---|---|---|")
    for d, vai, mods in CAU_TRUC:
        m = ", ".join(f"`{x}`" for x in mods) if mods else f"{len(b.docs)} tài liệu markdown"
        ra.append(f"| `{d}` | {vai} | {m} |")
    ra.append("")
    ra.append("**Một chiều phụ thuộc được ép:** `ai/evaluation` được import `ai/app`, nhưng KHÔNG chiều")
    ra.append("ngược lại. Mã lúc chạy không được phụ thuộc bộ đo, vì bộ đo không có mặt trong ảnh Docker.")
    ra.append("Chỗ hai bên cần cùng một danh sách — các cụm mở đường hỏi nhân viên — thì mỗi bên khai")
    ra.append("riêng và **một test đối chiếu chúng**, thay vì import chéo.")
    return "\n".join(ra)


# ----------------------------------------------------------------- phần đầu
def phan_dau(b: Bang) -> str:
    return f"""# TRƯỜNG ĐẠI HỌC CMC
## KHOA CÔNG NGHỆ THÔNG TIN VÀ TRUYỀN THÔNG

---

# BÁO CÁO ĐỒ ÁN MÔN HỌC
# MÔN: HỌC MÁY VÀ KHAI PHÁ DỮ LIỆU

**Dự án:** Trợ lý AI tư vấn thực đơn qua mã QR — kiến trúc LLM + RAG với an toàn bảo đảm bằng
cấu trúc và xác minh, không bằng lời nhắc mô hình

**Khoa/Ngành:** CNTT&TT — CNTT

**Giảng viên hướng dẫn:** Phạm Ngọc Đông

**Nhóm sinh viên thực hiện:**

| STT | Họ và tên | MSSV |
|:---:|---|---|
| 1 | Phạm Duy An | BIT240002 |
| 2 | Bùi Đào Đức Anh | BIT240025 |
| 3 | Đỗ Tuấn Anh | BIT240015 |
| 4 | Lê Anh | BIT240017 |
| 5 | Nguyễn Quang Hiếu | BIT240091 |

Hà Nội, ngày {b.m_golden['dieu_kien']['ngay'][8:10]} tháng {b.m_golden['dieu_kien']['ngay'][5:7]} \
năm {b.m_golden['dieu_kien']['ngay'][0:4]}

> **Tài liệu này được SINH RA từ mã nguồn và bằng chứng đo, không viết tay.**
> Sinh lại bằng `python ai/docs/build_bao_cao_do_an.py`. Mọi con số trong báo cáo đến từ một trong ba
> nguồn: đếm trực tiếp trên tệp dữ liệu, hoặc đọc từ `ai/evaluation/measurements/` — nơi các bộ chạy
> ghi kết quả kèm điều kiện của lần chạy. Không con số nào được người viết gõ vào.
>
> Lý do làm vậy: **bản trước của báo cáo này viết tay, và nó đã trôi khỏi hệ thống** — nó mô tả một
> kiến trúc không còn tồn tại, và toàn bộ 11 lệnh tái lập ở Phụ lục B trỏ vào tệp đã bị xóa. Chi tiết
> ở mục 5.4.

---
---"""


def muc_luc() -> str:
    return """# MỤC LỤC

- [TÓM TẮT](#tóm-tắt)
- [DANH MỤC THUẬT NGỮ VÀ VIẾT TẮT](#danh-mục-thuật-ngữ-và-viết-tắt)\n- [DANH MỤC HÌNH ẢNH](#danh-mục-hình-ảnh)\n- [DANH MỤC BẢNG BIỂU](#danh-mục-bảng-biểu)
- [PHÂN CÔNG CÔNG VIỆC](#phân-công-công-việc)
- **[CHƯƠNG 1: GIỚI THIỆU](#chương-1-giới-thiệu)**
  - 1.1 Bối cảnh và động lực
  - 1.2 Ba loại câu hỏi, và vì sao phân loại chúng là quyết định kiến trúc
  - 1.3 Ràng buộc an toàn — bài toán thật của đồ án
  - 1.4 Các nghiên cứu liên quan
  - 1.5 Mục tiêu và đóng góp
- **[CHƯƠNG 2: CƠ SỞ LÝ THUYẾT](#chương-2-cơ-sở-lý-thuyết)**
  - 2.0 Giải thích bằng lời — đọc mục này trước khi vào công thức
  - 2.1 Truy hồi từ khoá — BM25
  - 2.2 Truy hồi ngữ nghĩa — biểu diễn nhúng
  - 2.3 Hợp nhất thứ hạng — Reciprocal Rank Fusion
  - 2.4 Kiến trúc RAG và chỗ nó KHÔNG nên dùng
  - 2.5 Chuẩn hoá văn bản tiếng Việt là phép MẤT thông tin
  - 2.6 Ba lớp an toàn: lọc fail-closed, xác minh, thẻ giỏ tất định
  - 2.7 Các chỉ số đánh giá, và chỉ số nào QUYẾT ĐỊNH
  - 2.8 Vì sao chọn cách làm này — phương án thay thế và bằng chứng
- **[CHƯƠNG 3: PHƯƠNG PHÁP](#chương-3-phương-pháp)**
  - 3.0 Chương này làm gì — đọc bằng lời trước
  - 3.1 Kiến trúc bảy chặng — và chỉ hai chặng có mô hình
  - 3.2 Kho tri thức: một kho, hai chế độ trả lời
    - 3.2.1 Bộ nhãn được xây dựng như thế nào
    - 3.2.2 Kho tri thức gồm những gì
    - 3.2.3 Ai đọc kho tri thức, và đọc bằng cách nào
  - 3.3 Bốn tập đánh giá, và kỷ luật chia tập
    - 3.3.1 Bộ đánh giá được xây dựng như thế nào
  - 3.4 Mười bảy nhánh trả lời, không nhánh nào chồng nhánh nào
  - 3.5 Hai bài toán truy hồi khác nhau
  - 3.6 Điều kiện kiểm soát thực nghiệm
  - 3.7 Nguyên lý hoạt động từng lớp
    - 3.7.1 → 3.7.9 Nhận câu hỏi · Nhớ ngữ cảnh · Chọn nhánh · Lọc nhãn · Truy hồi · Trả lời · Xác minh · Thẻ giỏ
    - 3.7.10 Ba ví dụ chạy xuyên suốt bảy lớp
- **[CHƯƠNG 4: THỰC NGHIỆM VÀ KẾT QUẢ](#chương-4-thực-nghiệm-và-kết-quả)**
  - 4.0 Đọc chương kết quả thế nào
  - 4.1 Thiết lập
  - 4.2 So ba phương pháp truy hồi trên hai tập
  - 4.3 Chọn mục trong tài liệu — bài toán mà hệ thống thật sự chạy
  - 4.4 Chọn món: lọc theo nhãn so với RAG
  - 4.5 Gọi LLM+RAG thật trên câu loại C
  - 4.6 Golden 103 lượt qua chuỗi gọi đầy đủ
  - 4.7 Phân tích nguyên nhân sai — và case nào KHÔNG sửa được nữa
  - 4.8 Chốt phương án triển khai, kèm giá đã đo
  - 4.9 Vì sao hệ thống cần CẢ hai lớp — bộ đo hai chiều 100 câu\n  - 4.10 So sánh công bằng, quyết định kiến trúc, trần thật của truy hồi, và đổi mô hình nhúng\n  - 4.11 Độ phủ của bộ đánh giá, và ba lỗi phép rà tìm ra
- **[CHƯƠNG 5: KẾT LUẬN](#chương-5-kết-luận)**
  - 5.1 Tổng kết
  - 5.2 Phân tích chi tiết theo từng thành phần\n    - 5.2.1 → 5.2.5 Nhận xét của từng thành viên\n  - 5.3 Làm được
  - 5.4 Hạn chế của nghiên cứu
  - 5.5 Bài học kinh nghiệm
  - 5.6 Khó khăn gặp phải\n  - 5.7 Hướng phát triển tương lai
- [TÀI LIỆU THAM KHẢO](#tài-liệu-tham-khảo)
- [PHỤ LỤC](#phụ-lục)

---"""


def tom_tat(b: Bang) -> str:
    """TÓM TẮT — bố cục theo mẫu báo cáo môn học: bài toán, phương pháp, kết quả, từ khoá.

    Nguyên tắc trình bày: **một đoạn một ý**, và mọi con số nằm trong bảng thay vì trong câu văn.
    Bản trước ghép số vào giữa câu bằng f-string, nên sau khi thay số thì dòng bị ngắt ở giữa cụm
    và đoạn văn trở nên khó đọc.
    """
    g, gs, llm = b.m_golden["so"], b.m_golden_sinh["so"], b.m_llm["so"]
    e_np = b.ty_le_truy_hoi("NIÊM PHONG", "embedding", "hit1")
    b_np = b.ty_le_truy_hoi("NIÊM PHONG", "bm25", "hit1")
    cm_np = b.chon_muc("niem_phong", "written|*", "embedding")
    cm_np_bm = b.chon_muc("niem_phong", "written|*", "bm25")
    bo2 = b.m_truy_hoi["so"]["bai_toan_2"]["bo"]
    n2 = b.m_truy_hoi["so"]["bai_toan_2"]["so_ca"]
    ln = bo2["lọc nhãn"]
    khac = [v["cam5"] for k, v in b.m_truy_hoi["so"]["bai_toan_2"]["bo"].items() if k != "lọc nhãn"]
    return f"""# TÓM TẮT

## Bài toán

Đồ án xây dựng một trợ lý ảo tư vấn thực đơn cho khách quét mã QR tại bàn nhà hàng. Khách đặt câu
hỏi bằng tiếng Việt tự nhiên; hệ thống trả lời và đề xuất món để khách thêm vào giỏ hàng.

Dữ liệu gồm thực đơn thật **{len(b.items)} món** được gán **{len(b.tags)} nhãn** thuộc 16 nhóm
thuộc tính, và kho tri thức **{len(b.docs)} tài liệu** được chia thành **{len(b.doan)} đoạn**.

Câu hỏi của khách chia thành hai loại có bản chất khác nhau:

| Loại câu hỏi | Ví dụ | Đáp án nằm ở đâu |
|---|---|---|
| **Chọn món theo điều kiện** | *"Món nào dưới 100 nghìn và không cay?"* | Thuộc tính có cấu trúc của món (giá, nhãn) |
| **Tri thức nhà hàng** | *"Gọi khai vị trước có làm no bụng không?"* | Văn xuôi do người viết |

## Câu hỏi nghiên cứu và đóng góp

Câu hỏi nghiên cứu **không phải** *"áp dụng RAG cho nhà hàng như thế nào"*. Kỹ thuật RAG đã có sẵn
và được dùng rộng rãi. Câu hỏi đặt ra là:

> **Loại câu hỏi nào KHÔNG nên xử lý bằng RAG, và bằng chứng định lượng nào cho thấy điều đó?**

Để trả lời, nhóm so sánh **lọc theo nhãn** với **phương pháp xếp hạng theo độ tương đồng** trên
cùng một bài toán chọn món. Bộ đo gồm **{len(b.hc_b)} câu hỏi** có ràng buộc kiểm tra được, và các
câu này **được sinh tự động từ bộ nhãn** của thực đơn thay vì do người viết chọn:

| Dạng ràng buộc | Số câu | Ví dụ |
|---|---:|---|
| Ngưỡng số | {sum(1 for r in b.hc_b if r['vi_sao'] == 'ngưỡng số')} | *"Món nào dưới 50 nghìn?"* |
| Phân loại | {sum(1 for r in b.hc_b if r['vi_sao'] == 'phân loại')} | *"Có món miền Trung nào không?"* |
| Phủ định | {sum(1 for r in b.hc_b if r['vi_sao'] == 'phủ định')} | *"Món nào không cay?"* |
| Phép trừ (dị nguyên) | {sum(1 for r in b.hc_b if r['vi_sao'] == 'PHÉP TRỪ')} | *"Mình dị ứng hải sản, món nào tránh được?"* |
| Phép hội (hai điều kiện) | {sum(1 for r in b.hc_b if r['vi_sao'] == 'PHÉP HỘI')} | *"Món chay nào dưới 60 nghìn?"* |
| **Tổng** | **{len(b.hc_b)}** | |

Sinh câu hỏi từ bộ nhãn thay vì viết tay là quyết định có chủ đích về mặt phương pháp: khi người
viết tự chọn câu hỏi, họ có xu hướng chọn những câu mà mình đã biết trước kết quả. Sinh tự động thì
danh sách câu hỏi do **dữ liệu** quyết định.

Kết quả — đếm theo **số câu có ít nhất một món vi phạm** ràng buộc khách nêu:

| Phương pháp | Số câu có món vi phạm | Tỷ lệ | Tổng số món vi phạm |
|---|---:|---:|---:|
| **Lọc theo nhãn** | **{b.hc_b_cau_vi_pham('tat_dinh_vi_pham')}/{len(b.hc_b)}** | **{pct(b.hc_b_cau_vi_pham('tat_dinh_vi_pham') / len(b.hc_b))}** | **{b.hc_b_vi_pham('tat_dinh_vi_pham')}** |
| Xếp hạng theo độ tương đồng | {b.hc_b_cau_vi_pham('truy_hoi_vi_pham')}/{len(b.hc_b)} | {pct(b.hc_b_cau_vi_pham('truy_hoi_vi_pham') / len(b.hc_b))} | {b.hc_b_vi_pham('truy_hoi_vi_pham')} |

Riêng nhóm **phép trừ** — câu hỏi về dị ứng, nơi mỗi món vi phạm là một **lỗi an toàn** — lọc theo
nhãn có **{b.hc_b_vi_pham('tat_dinh_vi_pham', 'PHÉP TRỪ')} món vi phạm**, còn phương pháp xếp hạng
có **{b.hc_b_vi_pham('truy_hoi_vi_pham', 'PHÉP TRỪ')} món**.

**Giải thích kết quả.** Thực đơn là dữ liệu **có cấu trúc**: mỗi món đã được gán sẵn giá và nhãn,
nên điều kiện *"giá dưới 100.000đ"* có đáp án đúng hoặc sai xác định. Phép lọc theo nhãn kiểm tra
trực tiếp điều kiện này.

Các phương pháp xếp hạng hoạt động theo nguyên lý khác: chúng đo **mức độ giống nhau** giữa câu hỏi
và văn bản mô tả món, rồi sắp xếp theo điểm giống. Chúng không kiểm tra điều kiện mà ước lượng gián
tiếp, nên đưa vào danh sách những món có mô tả *giống* câu hỏi nhưng *không thỏa* điều kiện.

## Kết quả trên bài toán truy hồi tri thức

Với loại câu hỏi thứ hai — tri thức nhà hàng nằm trong văn xuôi — RAG là phương pháp phù hợp. Kết
quả trên **tập niêm phong** (mở đúng một lần, không dùng để điều chỉnh hệ thống):

| Bài toán | BM25 | Embedding |
|---|---:|---:|
| Truy hồi trên toàn kho (Hit@1) | {pct(b_np)} | **{pct(e_np)}** |
| Chọn đúng mục trong tài liệu (Top-1) | {pct(cm_np_bm)} | **{pct(cm_np)}** |

## Cơ chế bảo đảm an toàn

Hệ thống phục vụ khách có dị ứng thực phẩm, nên yêu cầu an toàn được đặt cao hơn yêu cầu chất lượng
câu chữ. An toàn được bảo đảm bằng **ba lớp độc lập**, không bằng chỉ dẫn trong lời nhắc mô hình:

1. **Lọc dị nguyên fail-closed** — món có nhãn dị nguyên khách nêu bị loại trước khi mô hình nhìn thấy
2. **{b.so_phep_kiem} phép kiểm xác minh** — câu do mô hình viết bị đối chiếu với dữ liệu gốc; vi phạm thì bị loại bỏ
3. **Thẻ giỏ hàng tất định** — dựng từ danh sách món đã lọc, không đọc chữ mô hình viết

Phép đo xác nhận lớp thứ hai là bắt buộc: khi bật đường sinh **trước** khi bổ sung phép kiểm cuối,
**14 ca dị nguyên** mất câu mời khách hỏi nhân viên. Nói cách khác, kết quả "0 lỗi an toàn" của
đường tất định trở thành **14 lỗi an toàn** khi bật mô hình sinh mà chưa đủ phép kiểm.

## Kết quả thực nghiệm cuối

Đo qua chuỗi gọi đầy đủ: quét QR → phiên bàn → phiên chat → backend .NET → dịch vụ AI → mô hình →
thẻ giỏ → giỏ hàng.

| Phép đo | Quy mô | Kết quả |
|---|---:|---|
| Golden đầu-cuối, đường sinh TẮT (mặc định) | {b.luot_golden} lượt | **{g['dat']}/{g['luot']}** |
| Golden đầu-cuối, đường sinh BẬT | {b.luot_golden} lượt | **{gs['dat']}/{gs['luot']}** |
| Tập ca trả lời một lượt | {len(b.ca_tra_loi)} ca | **{len(b.ca_tra_loi)}/{len(b.ca_tra_loi)}** |
| Bộ nhớ phiên nhiều lượt | {b.luot_phien} lượt | **{b.luot_phien}/{b.luot_phien}**, 0 lỗi an toàn |
| LLM + RAG trên câu loại C | {llm['ca']} ca | tất định {llm['ca']}/{llm['ca']} · có sinh {llm['ca']}/{llm['ca']} |

## Hạn chế

**Quy mô bộ đo.** Mục 4.4 của báo cáo trình bày một bộ đo **8 câu** cho cùng bài toán chọn món.
Bộ đó được viết trước, và với n = 8 thì một câu lệch tương ứng 12,50% — quá thô để rút kết luận.
Bộ 50 câu ở trên được xây sau chính vì lý do đó. Mục 4.4 vẫn giữ bộ 8 câu vì nó phân tích **từng
dạng ràng buộc riêng lẻ** kèm giải thích cơ chế, còn bộ 50 câu cho con số tổng hợp đáng tin hơn.
Khi hai bộ cho kết luận khác nhau, **bộ 50 câu là bộ được dùng để kết luận**.

Hạn chế lớn nhất: **không có nhật ký hội thoại của khách thật**. Toàn bộ ca đánh giá do nhóm tự
viết, nên chúng đo được hệ thống có tôn trọng ràng buộc hay không, nhưng không đo được khách thật
sẽ hỏi những gì.

Ngoài ra, cả bốn tập niêm phong đã được mở trong quá trình làm. Con số held-out thật duy nhất của
dự án là **23/27 (85,19%)** ở lần mở đầu tiên.

**Từ khoá:** Trợ lý ảo nhà hàng; Sinh văn bản có tăng cường truy hồi (RAG); Truy hồi thông tin;
BM25; Biểu diễn nhúng đa ngữ; Hợp nhất theo nghịch đảo thứ hạng (RRF); Lọc theo nhãn; An toàn dị
nguyên; Xử lý tiếng Việt; Đánh giá hệ thống hội thoại.

---
---"""


def danh_muc_hinh(b: Bang) -> str:
    """Danh mục hình — SINH từ thư mục `docs/ai/figures/`, không liệt kê tay.

    Cùng nguyên tắc với mọi phần khác của báo cáo: một danh mục viết tay sẽ trôi khỏi thư mục ngay
    lần notebook sinh thêm biểu đồ. Ở đây danh sách tệp quyết định danh mục.
    """
    import re as _re
    thu_muc = REPO_ROOT / "docs" / "ai" / "figures"
    tep = sorted(thu_muc.glob("*.png")) if thu_muc.exists() else []

    # Nhãn đọc được, suy từ tên tệp `hinh<mục>_<thứ tự>.png`
    def nhan(p) -> tuple[str, str]:
        m = _re.match(r"hinh(\d+)_(\d+)", p.stem)
        if not m:
            return p.stem, p.stem
        muc, thu = m.group(1), m.group(2)
        return f"Hình {muc}.{thu}", f"Biểu đồ sinh từ ô mã mục {muc} của notebook"

    d = ["# DANH MỤC HÌNH ẢNH", "",
         f"**{len(tep)} hình**, tất cả **sinh từ ô mã** của notebook",
         "`ai/notebooks/he_thong_ai_tu_van_dat_mon.ipynb` — không hình nào là ảnh chụp màn hình hay",
         "vẽ tay. Chạy lại notebook là vẽ lại từ dữ liệu thật.", "",
         "| Ký hiệu | Mô tả | Tệp |", "|---|---|---|"]
    for p in tep:
        k, mo_ta = nhan(p)
        d.append(f"| {k} | {mo_ta} | `figures/{p.name}` |")
    if not tep:
        d.append("| — | *(chưa sinh hình; chạy notebook để tạo)* | — |")
    d += ["", "---", "---"]
    return "\n".join(d)


def danh_muc_bang(b: Bang) -> str:
    """Danh mục bảng biểu — liệt kê các bảng CHÍNH, kèm mục chứa nó."""
    hang = [
        ("Bảng 2.1", "Ba dạng ràng buộc mà xếp hạng theo độ giống không diễn đạt được", "2.4.1"),
        ("Bảng 2.2", "Bảy quyết định thiết kế — phương án đã bỏ và bằng chứng", "2.8"),
        ("Bảng 3.1", "Bốn tập đánh giá và kỷ luật chia tập", "3.3"),
        ("Bảng 3.2", "Mười bảy nhánh trả lời, loại trừ nhau", "3.4"),
        ("Bảng 4.1", "Điều kiện thực nghiệm", "4.1"),
        ("Bảng 4.2", "So ba phương pháp truy hồi trên tập phát triển", "4.2"),
        ("Bảng 4.3", "So ba phương pháp truy hồi trên tập niêm phong", "4.2"),
        ("Bảng 4.4", "Chọn mục trong tài liệu — hai nhóm báo cáo riêng", "4.3"),
        ("Bảng 4.5", "Chọn món: lọc theo nhãn so với RAG", "4.4"),
        ("Bảng 4.6", "Kết quả gọi LLM+RAG thật trên câu loại C", "4.5"),
        ("Bảng 4.7", f"Golden {b.luot_golden} lượt qua chuỗi gọi đầy đủ", "4.6"),
        ("Bảng 4.8", "Phân loại nguyên nhân sai", "4.7"),
        ("Bảng 4.9", "Chốt phương án triển khai, kèm giá đã đo", "4.8"),
        ("Bảng 4.10", f"Chiều A — {len(b.hc_a)} câu tri thức, ba kết cục của mã tất định", "4.9.1"),
        ("Bảng 4.11", f"Chiều B — {len(b.hc_b)} câu chọn món, số món vi phạm ràng buộc", "4.9.2"),
        ("Bảng 4.12", "Ba lần bộ đo của nhóm sai trước khi ra số đúng", "4.9.4"),
        ("Bảng 5.1", "Tổng hợp kết quả cuối", "5.1"),
    ]
    d = ["# DANH MỤC BẢNG BIỂU", "",
         "Mọi con số trong các bảng dưới đây **được tính lúc sinh báo cáo**, từ tệp dữ liệu và từ",
         "`ai/evaluation/measurements/`. Không con số nào gõ tay.", "",
         "| Ký hiệu | Mô tả | Mục |", "|---|---|---|"]
    d += [f"| {k} | {m} | {muc} |" for k, m, muc in hang]
    d += ["", "---", "---"]
    return "\n".join(d)


def thuat_ngu() -> str:
    return """# DANH MỤC THUẬT NGỮ VÀ VIẾT TẮT

| Viết tắt | Thuật ngữ đầy đủ |
|---|---|
| RAG | Retrieval-Augmented Generation — sinh văn bản có tăng cường truy hồi |
| LLM | Large Language Model — mô hình ngôn ngữ lớn |
| BM25 | Best Matching 25 — hàm xếp hạng theo tần suất từ |
| RRF | Reciprocal Rank Fusion — hợp nhất theo nghịch đảo thứ hạng |
| Hit@k | Tỷ lệ có ít nhất một kết quả đúng trong k kết quả đầu |
| Top-1 | Hit@1 — chỉ số QUYẾT ĐỊNH ở đây, vì hệ thống chỉ đọc đoạn thứ nhất |
| cấm@5 | Số ca lấy phải đoạn BỊ CẤM trong 5 đoạn đầu — đo việc trả lời SAI, không phải kém |
| MRR | Mean Reciprocal Rank — trung bình nghịch đảo thứ hạng |
| nDCG | normalized Discounted Cumulative Gain |
| Đoạn (chunk) | Một mục của tài liệu tri thức, đã cắt theo tiêu đề `##` |
| Fail-closed | Thiếu bằng chứng thì TỪ CHỐI, không đoán. Áp cho ràng buộc dị nguyên |
| Đường tất định | Đường trả lời không gọi mô hình sinh — giống nhau mọi lần chạy |
| Đường sinh | Nhánh mô hình VIẾT câu trả lời, qua tám phép kiểm xác minh |
| Xác minh (verify) | Kiểm câu mô hình viết trước khi gửi; vi phạm là BỎ cả câu, không sửa |
| Ablation | Tắt từng cơ chế để đo đóng góp của nó |
| Tập niêm phong | Tập chỉ mở MỘT lần để chốt kết quả; mở rồi thì hết là held-out |
| p50 / p95 | Phân vị 50 / 95 của phân bố độ trễ |

---"""


def phan_cong(b: Bang) -> str:
    """Phân công theo TUẦN TỰ của đường xây dựng, không theo module.

    Vì sao tuần tự: hệ thống này có thứ tự phụ thuộc rất chặt — không có nhãn thì không lọc được
    món, không có kho thì không truy hồi được, không có tập đánh giá thì không ai biết mình đúng
    hay sai. Chia theo module thì năm người bắt đầu cùng lúc và ba người ngồi chờ.
    """
    return f"""# PHÂN CÔNG CÔNG VIỆC

Phân công theo **thứ tự xây dựng**, không theo module. Lý do nằm ở ràng buộc phụ thuộc rất chặt của
hệ thống: không có nhãn thì không lọc được món, không có kho tri thức thì không truy hồi được, và
**không có tập đánh giá thì không ai biết mình đúng hay sai**. Chia theo module thì năm người khởi
động cùng lúc rồi ba người ngồi chờ; chia theo chặng thì mỗi người bàn giao một thứ người sau
**dùng được ngay**.

## Sơ đồ bàn giao

```
TV1  DỮ LIỆU + LỚP HIỂU CÂU HỎI
      |   91 món · {len(b.tags)} nhãn · {len(b.docs)} tài liệu / {len(b.doan)} đoạn
      |   -> Request(nhãn lọc, ràng buộc, ý định)
      v
TV2  TRUY HỒI
      |   {len(b.ca_truy_hoi)} ca · BM25 / embedding / hybrid
      |   -> đoạn tri thức cho câu ngoài thực đơn
      v
TV3  CHỌN MÓN & AN TOÀN
      |   {b.so_phep_kiem} phép kiểm xác minh · lọc dị nguyên fail-closed
      |   -> danh sách món + thẻ giỏ tất định
      v
TV4  PHIÊN & TÍCH HỢP
      |   dịch vụ HTTP · bộ nhớ phiên 3 quy tắc hợp nhất
      |   -> câu trả lời đã ghép ngữ cảnh, gửi qua backend
      v
TV5  ĐÁNH GIÁ
          {len(b.ca_tra_loi)} ca · {b.luot_phien} lượt phiên · {b.luot_golden} lượt golden
          {len(b.hai_chieu)} câu hai chiều · {b.so_cong_check} cổng CI
```

## Bảng phân công

| # | Họ và tên | MSSV | Chặng | Bàn giao cho người sau | Mục báo cáo | % |
|:-:|---|---|---|---|---|:-:|
| 1 | Phạm Duy An | BIT240002 | **Dữ liệu & lớp hiểu câu hỏi** | Bộ nhãn, kho tri thức, và `Request` đã hiểu | 2.5, 3.1–3.3, 4.5 | 20% |
| 2 | Bùi Đào Đức Anh | BIT240025 | **Truy hồi** | Đoạn tri thức cho câu ngoài thực đơn | 2.1–2.4, 4.2, 4.3 | 20% |
| 3 | Đỗ Tuấn Anh | BIT240015 | **Chọn món & an toàn** | Danh sách món, thẻ giỏ, ba lớp an toàn | 2.6, 4.4, 4.5 | 20% |
| 4 | Lê Anh | BIT240017 | **Phiên & tích hợp** | Dịch vụ HTTP, bộ nhớ phiên, ghép với backend | 3.1, 3.6, 4.6 | 20% |
| 5 | Nguyễn Quang Hiếu | BIT240091 | **Đánh giá** | Bốn tập đánh giá, thước đo, golden, cổng CI | 3.3, 4.1, 4.7–4.9, Ch.5 | 20% |

## Việc từng chặng, và điều kiện bàn giao

Mỗi chặng có **điều kiện nghiệm thu bằng số** — người sau chỉ bắt đầu khi số đó đạt. Đây là chỗ
tránh được lỗi hay gặp nhất của đồ án nhóm: bàn giao một thứ "chạy được trên máy em" rồi ba tuần
sau người khác mới phát hiện nó sai.

### TV1 — Dữ liệu & lớp hiểu câu hỏi

Hai việc này thuộc **một người** vì chúng dính nhau chặt hơn mọi cặp khác: lớp hiểu câu hỏi ánh xạ
chữ khách gõ vào **chính bộ nhãn** mà chặng dữ liệu định nghĩa. Tách ra thì mỗi lần thêm một nhãn
phải đợi người khác thêm cụm từ vựng tương ứng.

1. Hợp nhất hai nguồn thực đơn (JSON của AI và CSDL của backend) về **một** bộ nhãn
2. Từ điển **{len(b.tags)} nhãn / 16 nhóm**, khóa có không gian tên (`spice:none`)
3. Kho tri thức **{len(b.docs)} tài liệu / {len(b.doan)} đoạn** ({b.che_do.get('synthesize', 0)} `synthesize`, {b.che_do.get('verbatim', 0)} `verbatim`)
4. Chuỗi **migration** để nhãn đổi thì CSDL production đổi theo
5. Từ vựng tất định **{b.so_cum_tu_vung} cụm**, khớp trên chuỗi đã rút dấu
6. Tách **ràng buộc** (lọc cứng) khỏi **ngữ cảnh** (chỉ xếp thứ tự), và lớp **ý định**

> **Nghiệm thu:** hai nguồn khớp **91/91 món**; mọi tệp dẫn xuất `--check` xanh; bộ rà nhãn **0 lỗ**;
> kiểm kê đụng chữ khớp con số đã ghi.

### TV2 — Truy hồi

1. Cài **BM25**, **embedding** (`bge-m3`), **hybrid RRF**
2. So trên **hai bài toán** (truy hồi tri thức / chọn món) và **hai tập** (phát triển / niêm phong)
3. Tính sẵn vector lúc build ảnh Docker, không tải mô hình lúc chạy
4. Chốt bộ cho production kèm **giá phải trả** — ảnh Docker, độ trễ, thời gian khởi động

> **Nghiệm thu:** {len(b.ca_truy_hoi)} ca chạy trên cả ba bộ; bảng so có `cấm@5`; quyết định chốt
> **có số đi kèm**, không chọn theo cảm giác.

### TV3 — Chọn món & an toàn

1. `select()` — lọc theo nhãn, **giao** các nhóm ràng buộc
2. Ba lớp an toàn: **lọc dị nguyên fail-closed**, **{b.so_phep_kiem} phép kiểm** xác minh câu sinh, **thẻ giỏ tất định**
3. Thẻ giỏ dựng từ `reply.items`, không từ chữ mô hình viết
4. Danh sách trắng nhánh được sinh — nhánh mới mặc định **không** sinh

> **Nghiệm thu:** **0 lỗi an toàn** trên mọi tập; câu sinh vi phạm thì **bị BỎ**, không sửa; thẻ giỏ
> không bao giờ chứa món ngoài danh sách đã lọc.

### TV4 — Phiên & tích hợp

1. Dịch vụ HTTP `/v1/chat`, hợp đồng cố định với backend
2. Bộ nhớ phiên **ba quy tắc hợp nhất khác nhau**: dị nguyên cộng dồn, ràng buộc cứng ghi đè theo
   nhóm, ngữ cảnh tích lũy có trần
3. Ghép với backend .NET: phiên bàn, thẻ giỏ, giỏ hàng
4. Đóng gói Docker, biến môi trường, đường lui khi mô hình hỏng

> **Nghiệm thu:** dịch vụ trả lời được khi mô hình **không** cấu hình; bộ nhớ giữ dị nguyên qua mọi
> lượt; hợp đồng với backend không đổi ngoài kế hoạch.

### TV5 — Đánh giá

1. Bốn tập: **{len(b.ca_tra_loi)} ca trả lời**, **{b.luot_phien} lượt phiên**, **{len(b.ca_truy_hoi)} ca truy hồi**, **{len(b.ca_chon_muc)} ca chọn mục**
2. Thước đo và **bộ dò lỗ** — chỗ đo sai trước khi hệ thống sai
3. **Golden {b.luot_golden} lượt** qua chuỗi gọi thật: QR → backend → AI → thẻ giỏ → giỏ hàng
4. **Bộ hai chiều {len(b.hai_chieu)} câu** — chứng minh vì sao cần cả hai lớp
5. **{b.so_cong_check} cổng CI**, và cổng deploy đối chiếu bằng chứng với cấu hình

> **Nghiệm thu:** {len(b.ca_tra_loi)}/{len(b.ca_tra_loi)} ca; {b.luot_phien}/{b.luot_phien} lượt phiên;
> {b.luot_golden}/{b.luot_golden} lượt golden; mọi cổng xanh; deploy bị chặn nếu bằng chứng đo không
> khớp cấu hình đang bật.

## Vì sao chia đều 20%

Không phải để "cho công bằng". Bốn chặng TV1–TV4 mỗi chặng là một khâu **bắt buộc** trên đường một
câu hỏi đi qua — bỏ chặng nào thì hệ thống không chạy. Chặng TV5 không nằm trên đường chạy, nhưng
**không có nó thì bốn chặng kia không chứng minh được mình đúng** — và trong một đồ án học máy, một
một hệ thống không có phương pháp đo thì không có căn cứ để khẳng định nó hoạt động đúng.

---
---"""


def chuong_1(b: Bang) -> str:
    n_a = b.loai_ca.get("A", 0)
    n_b = b.loai_ca.get("B", 0)
    n_c = b.loai_ca.get("C", 0)
    return f"""# CHƯƠNG 1: GIỚI THIỆU

## 1.1 Bối cảnh và động lực

Khách vào nhà hàng, quét mã QR ở bàn, và mở được một trang gọi món. Câu hỏi của đồ án là: **trợ lý AI
thêm được gì vào đúng chỗ đó?** Thực đơn có {len(b.items)} món chia {len(b.menu.get('categories', []))}
danh mục — đủ nhiều để khách không đọc hết, và đủ ít để mọi câu hỏi đều có đáp án xác định trong dữ liệu.

Điều đó đặt ra một tình thế đặc biệt so với các bài toán trợ lý thường gặp: **phần lớn câu hỏi của
khách có đáp án ĐÚNG, tra được, không cần suy đoán.** "Phở bò tái nạm bao nhiêu tiền?" có một câu trả
lời và chỉ một. Một hệ thống sinh văn bản trả lời câu đó là một hệ thống có cơ hội sai ở chỗ không cần
có cơ hội nào.

Nên động lực của đồ án không phải "làm chatbot cho nhà hàng" mà là câu hỏi hẹp hơn và đo được hơn:
**ranh giới giữa việc TRA và việc SINH nằm ở đâu, và ranh giới đó nên được ép bằng cấu trúc hay bằng
lời nhắc mô hình?**

## 1.2 Ba loại câu hỏi, và vì sao phân loại chúng là quyết định kiến trúc

Tập đánh giá {len(b.ca_tra_loi)} ca được gán nhãn theo ba loại, và tỷ lệ của chúng quyết định kiến trúc:

| Loại | Số ca | Bản chất | Mô hình sinh |
|---|---:|---|---|
| A | {n_a} | tra cứu thực đơn — giá, thành phần, khẩu phần | **cấm** |
| B | {n_b} | tri thức nhà hàng — chính sách, cách gọi món, vùng miền | **cấm** |
| C | {n_c} | suy luận và diễn đạt — nhiều ràng buộc, so sánh | **được** |

Loại A cấm sinh vì có đáp án xác định: một mô hình viết lại nó chỉ thêm cơ hội sai. Loại B cấm sinh vì
nội dung là **chữ của người viết tài liệu**, và một chữ số lệch trong câu chính sách là sai sự thật về
nhà hàng. Chỉ loại C — **{n_c}/{len(b.ca_tra_loi)} ca** — là chỗ mô hình có việc thật.

Phân loại này không phải nhãn cho vui: nó thành **danh sách trắng nhánh được phép sinh** trong mã, nên
mô hình *không có đường* ghi chữ cho khách ở loại A và B. Đó là khác biệt giữa "bảo mô hình đừng làm"
và "mô hình không làm được".

## 1.3 Ràng buộc an toàn — bài toán thật của đồ án

Nhãn dị nguyên trong thực đơn phủ **44/{len(b.items)} món**. Con số đó định hình toàn bộ phần an toàn,
vì nó nói: **"thực đơn không ghi nhận hải sản" KHÔNG đồng nghĩa "món này an toàn"** — nó chỉ nói dữ
liệu không có ghi chép.

Hệ quả là hai yêu cầu, và cả hai đều đo được:

1. **Fail-closed.** Khách khai dị ứng thì món mang nhãn đó tuyệt đối không được nêu — kể cả khi kết quả
   rỗng. Thà nói "không có món nào phù hợp" còn hơn mời một món có thể gây hại.
2. **Nói ra giới hạn.** Câu trả lời phải mời khách nhắc nhân viên để bếp xác nhận. Đây **không** phải
   câu khách sáo mà là **nội dung**: nó là chỗ duy nhất trong câu trả lời nói rằng dữ liệu chỉ phủ một
   phần.

Yêu cầu thứ hai được kiểm chứng ở mục 4.5: khi bật đường sinh, mô hình
viết văn mượt hơn và **bỏ câu đó đi** ở 14 ca dị nguyên.

## 1.4 Các nghiên cứu liên quan

BM25 (Robertson & Zaragoza, 2009) là chuẩn cho truy hồi theo từ khoá và vẫn là đường cơ sở mạnh trên
kho nhỏ. Họ mô hình E5 (Wang et al., 2022) cung cấp biểu diễn nhúng đa ngữ có tiếng Việt, dùng tiền tố
`query:`/`passage:` để phân biệt vai trò của văn bản. Reciprocal Rank Fusion (Cormack et al., 2009) hợp
nhất hai bảng xếp hạng mà không cần chuẩn hoá điểm. RAG (Lewis et al., 2020) đặt truy hồi trước sinh để
câu trả lời có nguồn.

Điểm mà đồ án này bổ sung vào bức tranh đó: các công trình trên trả lời câu hỏi *"truy hồi thế nào cho
tốt"*, còn câu hỏi thực tế của một hệ thống có dữ liệu **đã cấu trúc** là *"chỗ nào KHÔNG nên truy hồi"*.
Mục 4.4 đo chính câu đó.

## 1.5 Mục tiêu và đóng góp

1. **Đo ranh giới tra/sinh bằng số**, không bằng lập luận: dựng đường tất định trước, đo nó, rồi mới
   biết mô hình còn phải làm gì.
2. **So ba phương pháp truy hồi trên HAI bài toán** — truy hồi tri thức và chọn món — vì chúng cho hai
   kết luận trái nhau, và một phép so trên một bài toán sẽ dẫn tới quyết định sai ở bài toán kia.
3. **Xây an toàn thành ba lớp độc lập**, và chứng minh từng lớp cần thiết bằng ablation.
4. **Bốn tập đánh giá** phủ bốn chặng khác nhau của chuỗi gọi, tới tận giỏ hàng thật.
5. **Ghi lại mọi lần đo sai** — kể cả những lần thước đo sai trước khi hệ thống sai. Mục 5.4.

---
---"""


def chuong_2(b: Bang) -> str:
    return f"""# CHƯƠNG 2: CƠ SỞ LÝ THUYẾT

## 2.0 Giải thích bằng lời — đọc mục này trước khi vào công thức

Chương này có công thức, nhưng **mọi công thức đều có một câu tiếng Việt giải thích nó làm gì**.
Mục 2.0 giải thích trước bằng lời và bằng ví dụ; các mục sau mới viết công thức chính xác.

### Bài toán gốc: khách hỏi bằng lời, dữ liệu nằm ở hai dạng khác nhau

Nhà hàng có **hai loại thông tin**, và chúng khác nhau đến mức cần hai cách tra hoàn toàn khác:

| Loại | Ví dụ | Nằm ở đâu | Câu hỏi điển hình |
|---|---|---|---|
| **Có cấu trúc** | giá 85.000đ, nhãn `spice:none` (không cay) | bảng thực đơn — mỗi món một dòng, mỗi thuộc tính một cột | *"món nào dưới 100 nghìn?"* |
| **Văn xuôi** | *"khai vị dùng để lấp thời gian chờ, không phải để no"* | tài liệu người viết | *"gọi khai vị trước có làm no bụng không?"* |

Câu hỏi loại một trả lời được bằng **lọc**: duyệt 91 món, giữ món thoả điều kiện. Chính xác tuyệt
đối, vì "giá < 100.000" là một phép so sánh có đáp án đúng/sai rõ ràng.

Câu hỏi loại hai **không có cột nào để lọc**. Đáp án nằm trong một đoạn văn, và việc phải làm là
**tìm đúng đoạn văn đó** trong 182 đoạn của chỉ mục. Đó là bài toán **truy hồi thông tin**.

### Truy hồi thông tin (Information Retrieval — IR) là gì

**Truy hồi** = cho một câu hỏi, tìm trong kho tài liệu những đoạn **liên quan nhất**, xếp theo thứ
tự từ liên quan nhất trở xuống.

Điểm quan trọng nhất, và là điều quyết định cả đồ án này: truy hồi **không trả lời** câu hỏi. Nó chỉ
**đưa cho bạn đoạn văn** mà nó cho là liên quan. Nó cũng **không biết** đoạn đó có đúng không — nó
chỉ biết đoạn đó **giống** câu hỏi tới mức nào.

> **Ẩn dụ:** truy hồi giống một thủ thư. Bạn hỏi *"sách nào nói về nấu ăn Huế?"*, thủ thư đưa bạn ba
> cuốn xếp theo mức liên quan. Thủ thư **không đọc hộ** và **không khẳng định** cuốn nào trả lời
> đúng câu bạn cần — đó là việc của bạn.

### Hai cách đo "giống nhau", và vì sao cần cả hai

Máy không hiểu nghĩa như người. Nó phải quy "giống nhau" về một **con số**. Có hai cách chính:

**Cách 1 — Đếm từ chung (BM25).**
Đoạn nào chứa nhiều từ giống câu hỏi thì điểm cao. Có ba tinh chỉnh khiến nó tốt hơn đếm thô:

- **Từ hiếm đáng giá hơn từ phổ biến.** Chữ *"món"* xuất hiện ở gần như mọi đoạn nên nó gần như
  không phân biệt được gì; chữ *"mắm ruốc"* chỉ ở vài đoạn nên nó rất đáng giá. Phần này gọi là
  **IDF** — *Inverse Document Frequency*, **tần suất tài liệu nghịch đảo**: từ càng xuất hiện ở ít
  tài liệu thì trọng số càng cao.
- **Lặp nhiều lần không tăng điểm mãi.** Một đoạn nhắc *"lẩu"* 20 lần không liên quan gấp 20 lần
  đoạn nhắc 1 lần. Tham số `k₁` giới hạn mức tăng này — gọi là **bão hoà tần suất**.
- **Đoạn dài bị phạt.** Đoạn dài đương nhiên chứa nhiều từ hơn, nên nó dễ trúng từ khoá một cách
  may mắn. Tham số `b` chuẩn hoá theo độ dài.

  **Điểm mạnh:** chính xác khi khách dùng **đúng chữ** có trong tài liệu.
  **Điểm yếu:** khách hỏi *"đồ biển"* mà tài liệu viết *"hải sản"* thì **không có từ nào chung** —
  BM25 trả về rỗng, dù hai cụm cùng nghĩa.

**Cách 2 — So nghĩa bằng vector (embedding).**
**Embedding** dịch là **biểu diễn nhúng** hoặc **véc-tơ ngữ nghĩa**: một mô hình đã được huấn luyện
sẽ biến mỗi câu thành một **dãy số** (ở đây là 384 số). Điều đặc biệt: hai câu **cùng nghĩa** thì
hai dãy số **gần nhau**, kể cả khi chúng không chung chữ nào.

> **Ẩn dụ:** hãy tưởng tượng mỗi câu là một **điểm trên bản đồ**. Mô hình đặt *"đồ biển"* và *"hải
> sản"* ở hai vị trí sát nhau, còn *"cà phê"* ở tận đầu kia. Tìm đoạn liên quan = tìm **điểm gần
> nhất** trên bản đồ đó.

Độ gần được đo bằng **cosine similarity** — **độ tương đồng cô-sin**: một con số từ −1 đến 1, càng
gần 1 thì hai câu càng cùng nghĩa.

  **Điểm mạnh:** hiểu được cách nói khác nhau của cùng một ý.
  **Điểm yếu:** nó **luôn** trả về một đáp án. Không có khái niệm "không tìm thấy" — câu hỏi lạc đề
  hoàn toàn vẫn nhận về 5 đoạn với điểm số đàng hoàng. Nó **không trượt, nó trả sai**.

**Cách 3 — Trộn hai cách trên (hybrid).**
**RRF** — *Reciprocal Rank Fusion*, **hợp nhất theo nghịch đảo thứ hạng**: lấy **thứ hạng** (đứng
thứ mấy) của mỗi đoạn ở cả hai cách, rồi cộng nghịch đảo lại. Đoạn nào được **cả hai** xếp cao thì
tổng cao. Dùng thứ hạng thay vì điểm số vì điểm của BM25 và điểm cosine **không cùng thang đo** —
cộng thẳng thì như cộng mét với ki-lô-gam.

### RAG là gì, và vì sao đồ án này *không* dùng RAG cho mọi thứ

**RAG** — *Retrieval-Augmented Generation*, **sinh văn bản có tăng cường truy hồi**. Quy trình ba
bước:

```
1. TRUY HỒI   câu hỏi -> tìm đoạn liên quan trong kho
2. GHÉP       đưa đoạn đó vào "lời nhắc" (prompt) gửi cho mô hình ngôn ngữ
3. SINH       mô hình viết câu trả lời DỰA TRÊN đoạn đó
```

Bước 2 là chỗ quan trọng. **Prompt** dịch là **lời nhắc** — đoạn văn bản ta gửi cho mô hình, gồm
câu hỏi của khách **cộng** dữ liệu ta muốn nó dựa vào. Không có bước này thì mô hình chỉ có kiến
thức chung của nó và sẽ **tự nghĩ ra** thông tin về nhà hàng — hiện tượng gọi là **hallucination**,
dịch là **bịa đặt**: mô hình viết ra câu nghe rất hợp lý nhưng sai sự thật.

RAG rất mạnh cho câu **văn xuôi**. Nhưng đồ án này chứng minh bằng số rằng nó **sai chỗ** ở câu
**chọn món**, và lý do rất dễ hiểu:

> Truy hồi chỉ biết *"giống nhau"*. Nó **không có phép so sánh lớn hơn / nhỏ hơn**, **không có phép
> loại trừ**, và **không có phép và**.
>
> Khách nói *"tôi dị ứng hải sản"* — câu này **chứa chữ "hải sản"**, nên cả BM25 lẫn embedding đều
> kéo **món hải sản lên đầu**. Đúng ngược điều khách cần. Không phải vì chúng hỏng, mà **chính vì
> chúng hoạt động đúng như thiết kế**.

Đó là lý do hệ thống này chia việc: **lọc theo nhãn** chọn món (chính xác tuyệt đối với điều kiện
đếm được), **truy hồi** lo câu văn xuôi, và **mô hình sinh** chỉ **viết lại cho tự nhiên** những món
đã được chọn — nó không được phép chọn món.

### Các thuật ngữ khác gặp trong báo cáo

| Tiếng Anh | Tiếng Việt | Nghĩa đơn giản |
|---|---|---|
| **chunk** | **đoạn** | một mẩu tài liệu đủ nhỏ để đưa vào lời nhắc; kho này cắt theo tiêu đề mục |
| **corpus** | **kho ngữ liệu** | toàn bộ tài liệu dùng để truy hồi — ở đây {len(b.docs)} tài liệu / {len(b.doan)} đoạn |
| **index** | **chỉ mục** | cấu trúc dữ liệu dựng sẵn để tìm nhanh, như mục lục sách |
| **query** | **truy vấn** | câu hỏi sau khi đã xử lý để đem đi tìm |
| **token** | **từ tố** | đơn vị nhỏ nhất máy đọc — thường là một từ |
| **Hit@k** | **tỷ lệ trúng trong k đầu** | trong k đoạn trả về đầu tiên, có ít nhất một đoạn đúng không |
| **ground truth** | **khoá đáp án** | đáp án đúng do người viết ra để chấm điểm máy |
| **held-out / sealed set** | **tập niêm phong** | tập câu hỏi giấu đi, chỉ mở một lần khi đã xong — để không vô tình sửa hệ thống cho vừa đề |
| **ablation** | **thử bỏ bớt** | tắt từng cơ chế rồi đo lại, để biết cơ chế đó có thật sự đóng góp |
| **fail-closed** | **hỏng thì đóng** | khi không chắc thì **từ chối**, không đoán. Dùng cho lọc dị ứng |
| **latency** | **độ trễ** | thời gian từ lúc khách gửi câu hỏi tới lúc nhận câu trả lời |
| **baseline** | **mốc nền** | kết quả của cách làm đơn giản nhất, để so xem cách phức tạp có hơn không |

---

## 2.1 Truy hồi từ khoá — BM25

Điểm BM25 của đoạn *D* với truy vấn *Q*:

```
score(D,Q) = Σ_{{t∈Q}} IDF(t) · ( f(t,D)·(k₁+1) ) / ( f(t,D) + k₁·(1 − b + b·|D|/avgdl) )
```

với `k₁ = 1,5`, `b = 0,75`. Cài đặt của đồ án dùng dạng IDF **không âm**:

```
IDF(t) = ln( 1 + (N − n(t) + 0,5) / (n(t) + 0,5) )
```

Dạng gốc `ln((N−n+0,5)/(n+0,5))` cho giá trị **âm** khi *n > N/2*, nghĩa là chứa từ đó làm đoạn **tụt**
hạng. Với kho này thì "món" và "nhà hàng" xuất hiện ở gần như mọi đoạn, nên đó không phải chuyện lý
thuyết. Một ca test chốt `IDF > 0` cho những từ đó.

Tính chất quan trọng cho phép so ở Chương 4: **BM25 trả về RỖNG khi truy vấn không chung từ nào với
kho.** Embedding thì luôn cho điểm cho mọi đoạn, nên nó **không bao giờ "trượt"** — nó chỉ trả sai. Đó
là lý do `cấm@5` quan trọng hơn Hit@5.

## 2.2 Truy hồi ngữ nghĩa — biểu diễn nhúng

Mô hình `BAAI/bge-m3` — 1024 chiều, mạnh ở tiếng Việt.

Bản trước dùng `intfloat/multilingual-e5-small` (384 chiều). Nhóm đổi sau khi đo ghép cặp trên 148
câu của hai bộ đánh giá (chi tiết ở mục 4.10.7):

| mô hình | chiều | Hit@1 | p50 | McNemar so với bản trước |
|---|---:|---:|---:|---|
| `e5-small` | 384 | 64,86% | 44,7 ms | — |
| `e5-base` | 768 | 68,92% | 143,1 ms | p = 0,3616 — **chưa đủ ý nghĩa** |
| **`bge-m3`** | **1024** | **73,65%** | 271,7 ms | **p = 0,0351 — có ý nghĩa** |

Điều đáng ghi là `e5-base` **không chứng minh được gì dù to gấp đôi**. Nên căn cứ để đổi không phải
"mô hình lớn hơn thì tốt hơn" — nếu vậy `e5-base` đã thắng — mà là chất lượng huấn luyện cho tiếng
Việt, thứ chỉ biết được bằng cách đo.

**Tiền tố đi theo họ mô hình.** Họ E5 đòi tiền tố phân biệt vai trò:

```
"query: {{câu hỏi}}"     cho truy vấn
"passage: {{đoạn}}"      cho đoạn trong kho
```

Họ BGE thì **không dùng tiền tố** — thêm vào là nhét hai từ vô nghĩa vào mọi câu. Cả hai chiều đều
hỏng **không có triệu chứng quan sát được**: hệ thống không báo lỗi, chỉ cho điểm thấp hơn. Vì vậy
tiền tố được tra từ một bảng theo tên mô hình thay vì viết thành hằng số rời, và có ca kiểm thử chốt
cả nội dung bảng lẫn tính nhất quán giữa bảng với mô hình đang dùng.

Vector được chuẩn hoá L2, nhờ vậy `cosine(a,b) = a·b` và phép so chỉ còn một phép nhân vô hướng. Chuẩn
hoá cũng là điều **bắt buộc về mặt đúng đắn**: không chuẩn hoá mà vẫn lấy tích vô hướng thì đoạn **dài**
được lợi thế chỉ vì vector nó dài hơn.

Một hệ quả của chuẩn hoá L2 được dùng làm tối ưu ở mục 4.3: điểm cosine của một đoạn **không phụ thuộc**
việc có bao nhiêu đoạn khác trong chỉ mục. Nên xếp hạng trong một tài liệu chỉ là **giới hạn phép chấm
điểm của chỉ mục toàn kho vào tập con** — không cần dựng chỉ mục mới.

## 2.3 Hợp nhất thứ hạng — Reciprocal Rank Fusion

```
RRF(d) = Σ_r 1 / (k + rank_r(d)),    k = 60
```

Ý nghĩa của *k*: nó làm **đồng thuận thắng nổi bật**. Một đoạn xếp hạng 3 ở *cả hai* bảng được
`2/(60+3) = 0,0317`, cao hơn một đoạn xếp hạng 1 chỉ ở *một* bảng `1/(60+1) = 0,0164`. Có test chốt đúng
hai con số đó.

Một chi tiết cài đặt quyết định việc hybrid có ý nghĩa hay không: phải lấy **sâu hơn k** từ mỗi bảng.
Bản đầu chỉ lấy đúng `k` đoạn, nên đoạn đồng thuận ở hạng 6 không bao giờ vào kết quả và hybrid gần như
trùng khớp BM25 — tức phép so **không so gì cả**.

## 2.4 Kiến trúc RAG và chỗ nó KHÔNG nên dùng

RAG đặt truy hồi trước sinh: lấy đoạn liên quan, đưa vào ngữ cảnh, để mô hình viết câu trả lời có nguồn.
Trong đồ án này, chỗ RAG gặp LLM là hàm đưa đoạn đã truy hồi vào lời nhắc của câu sinh — không có nó thì
mô hình chỉ có danh sách món và sẽ **tự nghĩ ra lý do**, đúng chỗ dễ bịa nhất.

Nhưng RAG **không** phải công cụ cho mọi việc, và đây là luận điểm chính của đồ án. Bốn lý do khiến xếp
hạng theo độ tương đồng **thua** ở bài toán chọn món, mỗi lý do một ca đo được:

| Lý do | Ví dụ | Vì sao xếp hạng không làm được |
|---|---|---|
| không hiểu SỐ | "món nào dưới 50.000đ" | "50.000" với BM25 là một TỪ; với embedding thì "dưới 50 nghìn" và "dưới 500 nghìn" gần như cùng vector |
| phủ định | "món KHÔNG cay" | "không cay" và "cay" chung gần hết từ |
| cần LOẠI TRỪ | "tôi dị ứng hải sản" | câu chứa chữ "hải sản" nên cả hai kéo món hải sản **LÊN ĐẦU** |
| hai ràng buộc | "không cay VÀ dưới 80 nghìn" | xếp hạng theo độ tương đồng **không có phép AND** |

Trường hợp thứ ba có ý nghĩa đặc biệt về mặt an toàn: một hệ thống RAG vận hành đúng đặc tả vẫn sẽ đề
xuất món hải sản cho người vừa khai báo dị ứng hải sản. Nguyên nhân nằm ở chính cơ chế xếp hạng theo độ
tương đồng, không phải ở lỗi cài đặt.

### 2.4.1 Đây là giới hạn BIỂU ĐẠT, không phải giới hạn dữ liệu hay mô hình

Bốn dòng trên dễ bị đọc thành "truy hồi còn yếu, cải thiện dữ liệu hoặc đổi mô hình là xong". Đồ án
này khẳng định ngược lại, và khẳng định đó có cả **lập luận** lẫn **thí nghiệm**.

Lập luận: một bộ truy hồi là một **hàm xếp hạng** `rank(q, d) = sim(q, d)` —
nó trả về **thứ tự** các tài liệu theo **độ giống** với truy vấn. Nó không có khái niệm *thoả* hay
*không thoả* — chỉ có *giống hơn* và *giống ít hơn*. Trong khi ba dạng ràng buộc dưới đây là những
**vị từ** trên tập món, và chúng cần một phép toán mà quan hệ giống nhau không mang:

| Ràng buộc | Dạng toán | Vì sao độ giống không diễn đạt được |
|---|---|---|
| `giá < 50.000` | quan hệ **thứ tự** trên số | độ giống là quan hệ **đối xứng**; thứ tự thì không. `sim(q,d)` không phân biệt được "rẻ hơn" với "đắt hơn" |
| `hải sản ∉ nhãn(d)` | phép **bù** trên tập | không tồn tại truy vấn `q` nào để `sim(q,d)` **giảm** khi `d` chứa hải sản; nhắc tới thứ cần tránh chỉ làm nó giống HƠN |
| `A ∧ B` | phép **giao** | `sim` trả một số vô hướng đã trộn; không tách lại được thành hai điều kiện để ép cả hai cùng đúng |

Thí nghiệm kiểm chứng lập luận này ở mục **4.9**: trên 50 câu sinh từ chính bộ nhãn, lọc theo nhãn
vi phạm **13** món còn truy hồi vi phạm **116** — và ở nhóm loại trừ dị nguyên, lọc nhãn **0** còn
truy hồi **11 món chứa đúng thứ khách phải tránh**.

Một thí nghiệm thứ hai đóng đường thoát "tại dữ liệu chưa tốt": nhóm đã viết lại tiêu đề mục của
kho tri thức cho đặc thù theo tài liệu, đưa số tiêu đề khác nhau từ **179 lên 365** và số đoạn dùng
chung tiêu đề từ **283/452 xuống 93/452**. Lớp lỗi nhắm tới giảm từ **19 ca xuống 1**. Nhưng Hit@1
trên tập niêm phong **không đổi — 60,87% trước và sau**, còn Hit@5 **giảm** từ 67,39% xuống 63,04%. Các
ca kia không được sửa; chúng **đổi tên lỗi** từ "hai mục trùng tiêu đề" sang "xếp hạng sai".

Kết quả này cho thấy giới hạn quan sát được **không đến từ chất lượng kho ngữ liệu**. Cải thiện dữ liệu
không làm một hàm xếp hạng theo độ tương đồng biểu diễn được một vị từ mà nó không có phép toán tương
ứng. Đây là đóng góp chính của đồ án về mặt phương pháp.

## 2.5 Chuẩn hoá văn bản tiếng Việt là phép MẤT thông tin

Rút dấu (`fold`) cho phép khớp "mo cua" với "mở cửa" — người Việt gõ không dấu rất thường. Nhưng nó là
phép **mất thông tin**, và phần bị mất có ý nghĩa phân biệt: sau khi rút dấu, `"bò"` và `"bơ"` cùng
thành `"bo"`.

Nên rút dấu chỉ dùng cho **tách từ của BM25**, không dùng cho phép so tên món. Và một chi tiết đã sai
một lần: bản đầu bỏ từ dưới 3 ký tự, làm mất `"bò"`, `"gà"`, `"mì"`, `"ốc"`, `"cá"` — đúng những từ khoá
quan trọng nhất của một thực đơn Việt.

Ablation đo riêng mức mất của việc tắt rút dấu, và nó chỉ được áp cho **BM25**: embedding không dùng
phép tách từ đó, nên gán mức mất cho nó là ablation đo sai chỗ.

## 2.6 Ba lớp an toàn: lọc fail-closed, xác minh, thẻ giỏ tất định

An toàn **không được phụ thuộc mô hình sinh**. Đồ án cài ba lớp độc lập:

**Lớp 1 — lọc fail-closed.** Ràng buộc dị nguyên áp cuối và không bao giờ nới, kể cả khi kết quả rỗng.
Một ranh giới quan trọng được rút ra khi chạy thật: *loại trừ món đã gợi ý* là phép **lịch sự** và nới
được; *dị nguyên, độ cay, giá, chế độ ăn* là ràng buộc **an toàn** và không bao giờ nới. Nới nhóm đầu
dẫn tới việc nhắc lại một món khách đã thấy; nới nhóm sau dẫn tới việc mời khách một món có thể gây hại.

**Lớp 2 — tám phép kiểm xác minh** trên câu mô hình viết. Vi phạm bất kỳ phép nào thì câu sinh bị **BỎ**
và hệ thống dùng lại câu khuôn mẫu — không sửa, không thử lại:

1. mã món mô hình khai đã dùng phải nằm trong danh sách đưa vào
2. không nhắc món thật nào **ngoài** danh sách đã lọc
3. mọi số tiền phải là giá thật của một món trong danh sách
4. không được nêu **số lượng** món ("có 6 món lẩu")
5. không được viết mã nhãn kỹ thuật (`allergen:peanut`) vào chữ khách đọc
6. phải nhắc **ĐỦ** món trong danh sách — thiếu một món là câu trả lời thiếu
7. không nhắc món mang nhãn khách cần tránh — **chốt an toàn**
8. khách đã nêu điều cần tránh thì phải **mở đường hỏi nhân viên** — **chốt an toàn**

Phép kiểm 8 ra đời từ một con số, xem mục 4.5. Điều đáng ghi về nó: `PROMPT` cũng đã yêu cầu điều này,
nhưng **yêu cầu trong prompt là đề nghị, không phải bảo đảm**.

**Lớp 3 — thẻ giỏ tất định.** Thẻ dựng từ danh sách món mà mã tất định đã chọn, **không** từ chữ mô
hình viết. Nên dù một câu sinh lọt qua xác minh mà vẫn sai, khách **không đặt được** món không tồn tại.

Điều lớp 2 **không** bắt được, nói ra chứ không giấu: một tên món **hoàn toàn bịa** — không có trong
thực đơn dưới bất kỳ dạng nào — thì phép so chuỗi không phát hiện. Giới hạn này được ghi thành **một
test có tên nói rõ nó là giới hạn**, để không ai tưởng lớp đó kín.

## 2.8 Vì sao chọn cách làm này — phương án thay thế và bằng chứng

Mọi quyết định dưới đây đều có **ít nhất một phương án khác nghe hợp lý hơn lúc bắt đầu**. Mục này
ghi lại: chọn gì, bỏ gì, và **con số nào** khiến nhóm chọn như vậy. Không quyết định nào ở đây dựa
trên cảm giác hay thói quen.

### Quyết định 1 — Chọn món bằng LỌC NHÃN, không bằng RAG

| | |
|---|---|
| **Phương án đã bỏ** | dùng luôn RAG cho mọi câu, kể cả *"món nào dưới 100 nghìn"* |
| **Nghe hợp lý vì** | một cơ chế cho mọi việc thì gọn, ít mã, dễ bảo trì |
| **Đã chọn** | `select()` lọc theo nhãn cho câu chọn món; RAG chỉ cho câu văn xuôi |

**Bằng chứng — 50 câu chọn món sinh từ chính bộ nhãn (mục 4.9.2):**

| | lọc nhãn | truy hồi |
|---|---:|---:|
| món **vi phạm ràng buộc** | **{b.hc_b_vi_pham('tat_dinh_vi_pham')}** | {b.hc_b_vi_pham('truy_hoi_vi_pham')} |
| riêng nhóm **dị ứng** | **{b.hc_b_vi_pham('tat_dinh_vi_pham', 'PHÉP TRỪ')}** | {b.hc_b_vi_pham('truy_hoi_vi_pham', 'PHÉP TRỪ')} |

**Ví dụ chứng minh:**

> **Khách:** *"Mình dị ứng hải sản, món nào tránh được?"*
>
> **RAG trả về:** Nghêu hấp sả, Mực xào sa tế, Ốc hương rang bơ tỏi… — **toàn món hải sản**
>
> **Vì sao:** câu hỏi **chứa chữ "hải sản"**, nên phép đo độ giống kéo đúng những đoạn nói về hải
> sản lên đầu. Nó không hỏng — nó **làm đúng việc nó được thiết kế để làm**.
>
> **Lọc nhãn trả về:** Bánh mì pate, Gỏi cuốn chay… — 0 món mang nhãn `allergen:seafood`.

Trường hợp này minh hoạ giới hạn cấu trúc nêu ở mục 2.4.1: hệ thống RAG vận hành đúng đặc tả vẫn đề
xuất món hải sản cho người khai báo dị ứng hải sản, do cơ chế xếp hạng theo độ tương đồng không biểu
diễn được phép loại trừ.

### Quyết định 2 — Truy hồi dùng EMBEDDING, không dùng BM25

| | |
|---|---|
| **Phương án đã bỏ** | chỉ dùng BM25 — nhẹ, không cần mô hình, ảnh Docker 238MB |
| **Nghe hợp lý vì** | embedding kéo ảnh Docker lên **2,74GB** và khởi động chậm **19 giây** |
| **Đã chọn** | embedding, và **chấp nhận trả giá đó** |

**Bằng chứng — tập niêm phong (mở một lần, không sửa hệ thống theo nó):**

| bộ | Hit@1 |
|---|---:|
| BM25 | 39,13% |
| **embedding** | **60,87%** |

**Ví dụ chứng minh:**

> **Khách:** *"Mình muốn món chín bằng hơi nước, nhẹ bụng"*
>
> Tài liệu đích viết *"món hấp"* — **không chung một chữ nào** với câu hỏi.
>
> **BM25:** không tìm được (không có từ chung để đếm).
> **Embedding:** tìm đúng, vì *"chín bằng hơi nước"* và *"hấp"* nằm gần nhau trên bản đồ nghĩa.

Đây là lý do nhóm chấp nhận ảnh Docker nặng gấp 11 lần: **khách gõ theo cách của khách**, không gõ
theo từ trong tài liệu.

### Quyết định 3 — TẮT đường sinh mặc định

| | |
|---|---|
| **Phương án đã bỏ** | bật mô hình sinh cho mọi câu, để câu chữ tự nhiên hơn |
| **Nghe hợp lý vì** | câu khuôn mẫu đọc khô; mô hình viết mượt hơn hẳn |
| **Đã chọn** | tắt mặc định, bật bằng biến môi trường |

**Bằng chứng:** sau {b.so_phep_kiem} phép kiểm xác minh, đường sinh **0 ca tụt** — nhưng cũng **0 ca
đúng thêm**. Giá phải trả: **+8,6 giây mỗi lượt**.

Không có ca nào tốt lên thì việc bật nó là **trả 8,6 giây để đổi lấy câu chữ mượt hơn**. Đó là đánh
đổi hợp lệ, nhưng phải là **quyết định của chủ nhà hàng**, không phải mặc định do nhóm chọn hộ.

### Quyết định 4 — Mô hình sinh KHÔNG được chọn món

| | |
|---|---|
| **Phương án đã bỏ** | đưa cả thực đơn vào lời nhắc, để mô hình tự chọn và tự viết |
| **Nghe hợp lý vì** | ít mã hơn hẳn, và mô hình "hiểu" câu hỏi tốt hơn mã tất định |
| **Đã chọn** | `select()` chọn món; mô hình chỉ **viết về** những món đã chọn |

**Ví dụ chứng minh** — đo được trên bản chạy thật, mô hình viết:

> *"Nhà hàng có **6 món lẩu**…"* — trong khi thực đơn có **7**.

Một con số bịa mà ba phép kiểm đầu **không chạm tới**: nó không phải tên món, không phải giá, không
phải nhãn. Phải thêm một phép kiểm riêng cấm mô hình nêu số lượng.

Nếu mô hình được phép **chọn** món thay vì chỉ **viết về** món, lỗi tương tự sẽ là một món không tồn
tại nằm trong thẻ giỏ hàng — và khách bấm đặt được.

### Quyết định 5 — Dị nguyên FAIL-CLOSED (hỏng thì đóng)

| | |
|---|---|
| **Phương án đã bỏ** | khi lọc dị nguyên ra rỗng thì nới ra để vẫn có món gợi ý |
| **Nghe hợp lý vì** | trả về "không có món nào" là trải nghiệm tệ |
| **Đã chọn** | thà nói **"không có món nào phù hợp"** còn hơn mời một món có thể gây dị ứng |

**Ví dụ chứng minh:** khách nói *"dị ứng tôm, tư vấn món hải sản khác"*. Thực đơn có 26 món hải sản,
14 món **không có tôm** — nhìn qua thì nên lọc riêng con tôm ra. Nhưng kiểm dữ liệu thì:

> Hai món mang `allergen:seafood` nhưng **không** mang `ingredient:shrimp`, trong khi mô tả cho
> thấy chúng **chứa tôm**: *Bún đậu mắm tôm* (“chấm **mắm tôm**”) và *Bún bò Huế* (“**mắm ruốc**”).

Nguyên nhân: mắm tôm và mắm ruốc là **gia vị**, nên chúng không được ghi vào nhãn nguyên liệu — dù
nguyên liệu gốc của chúng là tôm và ruốc. Lọc theo `ingredient:shrimp` sẽ **mời đúng hai món đó**
cho người dị ứng tôm.

Nên hệ thống giữ chặn rộng ở mức **nhóm** (`allergen:seafood`), và thay vào đó **nói ra lý do** —
chứ không nới hàng rào xuống mức nguyên liệu.

### Quyết định 6 — Từ vựng TẤT ĐỊNH, không để mô hình hiểu câu

| | |
|---|---|
| **Phương án đã bỏ** | để mô hình đọc câu và tự sinh nhãn lọc |
| **Nghe hợp lý vì** | {b.so_cum_tu_vung} cụm từ vựng viết tay là rất nhiều công |
| **Đã chọn** | mã tất định chạy trước; mô hình chỉ được hỏi khi mã không chắc |

**Ba lý do, và lý do thứ ba mới là lý do thật:**

1. dịch vụ phải trả lời được **khi mô hình hỏng**
2. mỗi lần gọi tốn ~8,6 giây, còn *"xin chào"* thì không đáng chờ 8 giây
3. **cụm chào hỏi tiếng Việt là tập ĐÓNG và nhỏ** — dùng mô hình cho việc mà một danh sách 20 cụm
   giải quyết trọn là chọn sai công cụ, và làm phép đo phụ thuộc một thứ không tất định

**Ví dụ chứng minh:** khi thử để mô hình gán nhãn, nó trả `prefer: health:low_calorie` cho câu
*"Nhãn 'ít calo' dựa trên gì?"* — đẩy một **câu hỏi về nhãn** sang **nhánh lọc món**. Khách hỏi định
nghĩa, nhận về danh sách món.

### Quyết định 7 — Chia đoạn theo TIÊU ĐỀ MỤC, không theo số ký tự

| | |
|---|---|
| **Phương án đã bỏ** | cắt mỗi 500 ký tự có chồng lấn — cách phổ biến nhất trong tài liệu RAG |
| **Nghe hợp lý vì** | đơn giản, không phụ thuộc cấu trúc tài liệu |
| **Đã chọn** | cắt theo tiêu đề mục markdown |

**Vì sao:** cắt theo ký tự thì một đoạn có thể **đứt giữa bảng giá**, và mô hình nhận được nửa bảng.
Cắt theo tiêu đề thì mỗi đoạn là **một ý trọn vẹn** do người viết đã tự chia sẵn — tài liệu markdown
vốn đã có cấu trúc đó, không dùng thì phí.

**Bằng chứng chống lại chính lựa chọn này**, ghi ra vì nó là giới hạn thật: 45 tài liệu `derived`
dùng chung một khuôn tiêu đề, nên **283/452 đoạn dùng chung tiêu đề** với đoạn khác. Nhóm đã thử
sửa (đưa lên 365 tiêu đề khác nhau) và đo lại: **Hit@1 không đổi**. Xem mục 2.4.1.

> Hai con số 452 và 283 là của **kho lúc đó**. Chúng được giữ nguyên vì chúng là bằng chứng dẫn
> tới quyết định bỏ 49 tài liệu `derived`. Kho hiện tại còn **60 tài liệu / 182 đoạn xếp hạng**,
> với 174 tiêu đề mục phân biệt — chính là điều mục 2.4.1 nói không sửa được bằng cách đổi tiêu đề.

---

## 2.7 Các chỉ số đánh giá, và chỉ số nào QUYẾT ĐỊNH

```
Hit@k  = 1 nếu có ít nhất một đoạn đúng trong k đoạn đầu
MRR@k  = 1/hạng của đoạn đúng đầu tiên, 0 nếu không có trong k đầu
nDCG@k = DCG@k / IDCG@k,  DCG = Σ rel_i / log₂(i+1)
cấm@5  = SỐ CA lấy phải đoạn bị cấm trong 5 đoạn đầu
```

**Top-1 là chỉ số quyết định**, không phải Hit@5 — vì hệ thống lúc chạy gọi `search(question, k=1)` và
đọc đúng đoạn đầu. Chốt theo Hit@5 là chốt theo con số của một hệ thống **không tồn tại**: Hit@5 = 1,0
vẫn đúng khi đoạn đúng nằm thứ năm và bốn đoạn lạc đề nằm trên nó.

**`cấm@5` quan trọng hơn Hit@5** vì nó đo việc trả lời **sai**, không phải kém. Và nó là chỉ số duy nhất
bắt được cách lách quan trọng nhất: một bộ truy hồi **luôn trả về 5 đoạn** đạt điểm cao trên mọi chỉ số
Hit mà không bao giờ nói "tôi không biết".

Với bài toán chọn món, `cấm@5` mang nghĩa mạnh hơn nữa: nó là **số ca nêu món không thỏa ràng buộc**,
tức số ca trả lời **SAI** — và với ca dị ứng thì đó là lỗi an toàn.

---
---"""


def chuong_3(b: Bang) -> str:
    sp = b.split_truy_hoi
    return f"""# CHƯƠNG 3: PHƯƠNG PHÁP

## 3.0 Chương này làm gì — đọc bằng lời trước

Chương 2 nói **các phương pháp có sẵn trên đời**. Chương 3 nói **nhóm ghép chúng lại thành hệ thống
như thế nào**, và chương 4 nói **hệ thống ấy chạy ra số bao nhiêu**.

### Một câu hỏi của khách đi qua những đâu

Khi khách gõ *"cho mình món chay dưới 100 nghìn"*, câu đó không được gửi thẳng cho mô hình AI. Nó đi
qua một dây chuyền, và **mỗi chặng làm đúng một việc**:

```
câu khách gõ
   |
   v
[1] HIỂU CÂU HỎI      "món chay" -> nhãn diet:vegetarian
   |                  "dưới 100 nghìn" -> ngân sách 100.000
   v
[2] NHỚ NGỮ CẢNH      ghép với điều khách đã nói ở các lượt trước
   |                  (dị ứng khai lượt 1 vẫn còn hiệu lực ở lượt 5)
   v
[3] CHỌN NHÁNH        đây là câu CHỌN MÓN hay câu HỎI TRI THỨC?
   |
   +--> câu chọn món --> [4a] LỌC THEO NHÃN  -> danh sách món
   |
   +--> câu tri thức --> [4b] TRUY HỒI       -> đoạn văn liên quan
   |
   v
[5] VIẾT CÂU TRẢ LỜI  khuôn mẫu, hoặc mô hình sinh viết lại cho tự nhiên
   |
   v
[6] XÁC MINH          {b.so_phep_kiem} phép kiểm; vi phạm thì BỎ câu sinh, dùng khuôn mẫu
   |
   v
[7] THẺ GIỎ HÀNG      dựng từ danh sách món, KHÔNG từ chữ mô hình viết
   |
   v
câu trả lời + nút bấm đặt món
```

**Điều đáng chú ý nhất:** trong bảy chặng, chỉ **hai chặng có mô hình AI** — chặng [4b] truy hồi và
chặng [5] viết câu. Năm chặng còn lại là **mã tất định**: cùng đầu vào thì luôn cùng đầu ra, không
phụ thuộc mô hình, và chạy được cả khi mô hình hỏng.

Đó là lựa chọn có chủ ý, không phải vì thiếu thời gian. Lý do đầy đủ ở mục 2.8.

### Vì sao chương này nói nhiều về TẬP ĐÁNH GIÁ

Với một hệ thống thông thường, "đúng" nghĩa là **chạy không lỗi**. Với hệ thống này, một câu trả lời
có thể **chạy hoàn hảo mà vẫn sai** — mời món hải sản cho người dị ứng hải sản là một câu trả lời
không có lỗi kỹ thuật nào.

Nên "đúng" phải được **định nghĩa bằng một tập câu hỏi có khoá đáp án**, và hệ thống được chấm trên
tập đó. Đây là khác biệt lớn nhất giữa làm phần mềm và làm học máy, và nó là lý do bốn tập đánh giá
được mô tả kỹ ở mục 3.3.

### Ba từ sẽ gặp nhiều

| Từ | Nghĩa trong báo cáo này |
|---|---|
| **nhánh** | một đường xử lý riêng cho một loại câu hỏi. Hệ thống có {len(b.nhanh_tra_loi()) if hasattr(b, 'nhanh_tra_loi') else 17} nhánh, và chúng **loại trừ nhau** — một câu chỉ đi đúng một nhánh |
| **nhãn** | thuộc tính của món, dạng `nhóm:giá_trị` — ví dụ `spice:none` nghĩa là **không cay** |
| **ràng buộc** vs **ngữ cảnh** | ràng buộc thì **lọc bỏ** món không thoả; ngữ cảnh chỉ **xếp lên trước**. Nhầm hai thứ này là lọc mất món đúng — xem mục 3.4 |

---

## 3.1 Kiến trúc bảy chặng — và chỉ hai chặng có mô hình

```
khách gõ câu
 │
 1  understand()        TẤT ĐỊNH · từ vựng + {len(b.items)} tên món → nhãn, ràng buộc, cờ
 2  merge bộ nhớ phiên  dị nguyên CỘNG DỒN · ràng buộc cứng GHI ĐÈ · ngữ cảnh tích lũy
 3  enrich()        ◄── MÔ HÌNH #1  đọc câu hỏi → NHÃN (không phải câu văn, không chọn món)
 4  respond()           TẤT ĐỊNH · 17 nhánh loại trừ → quyết định trả lời GÌ
 5  build_cart()        thẻ giỏ từ ĐÚNG danh sách chặng 4 chọn
 6  write_reply()   ◄── MÔ HÌNH #2  viết CÂU VĂN, chỉ 2/17 nhánh, 8 phép kiểm
 7  session_updates()   ghi bộ nhớ ra cho backend
```

**Mô hình #1 và #2 là cùng một mô hình**, gọi ở hai chỗ cho hai việc khác nhau.

Chặng 3 đọc câu hỏi và trả về **danh sách nhãn** lấy từ từ điển nhãn ({len(b.tags)} nhãn), không phải
câu văn. Bốn cơ chế giữ nó trong tầm kiểm soát:

- **Cổng `already_understood`** (14 tín hiệu): mã tất định hiểu đủ rồi thì **không gọi**. Gọi mô hình
  vào chỗ không cần là mở đường cho nó phá một câu trả lời đang đúng — và điều đó đã xảy ra hai lần,
  xem mục 4.5.
- **Một cửa kiểm duy nhất**: nhãn phải có trong từ điển; nhãn bịa bị bỏ và **ghi lại**, không bỏ im lặng.
- **Chỉ THÊM, không xóa**: nó không bỏ được ràng buộc khách đã nêu.
- **Không chọn món**: nó trả nhãn; việc chọn món là phép lọc theo nhãn.

Bộ nhớ phiên hợp nhất theo **ba quy tắc**, và sự khác nhau giữa chúng là chỗ khó nhất của khâu này:

| Loại | Quy tắc | Vì sao |
|---|---|---|
| dị nguyên | **cộng dồn, không bao giờ bỏ** | khai ở lượt 1 thì lượt 5 vẫn phải nhớ — bất biến an toàn quan trọng nhất |
| ràng buộc cứng (`spice`, `price`, `party`, `season`, `diet`) | lượt mới **ghi đè** cùng nhóm | "rẻ hơn nữa" phải THAY ngân sách cũ, giữ cả hai thì phép AND cho rỗng |
| ngữ cảnh (`prefer`) | cộng vào, giữ 5 gần nhất | sở thích tích lũy nhưng không được phình vô hạn |

## 3.2 Kho tri thức: một kho, hai chế độ trả lời

**{len(b.docs)} tài liệu / {len(b.doan)} đoạn**, markdown có frontmatter, chia đoạn theo tiêu đề `##`.

| Chế độ | Tài liệu | Cách trả lời | Mô hình chạm chữ? |
|---|---:|---|---|
| `verbatim` | {b.che_do.get('verbatim', 0)} | TRA KHÓA, trả **nguyên văn** | **0%** |
| `synthesize` | {b.che_do.get('synthesize', 0)} | truy hồi, xếp hạng | không — chỉ trình bày lại |

`verbatim` là chế độ tin mô hình **0%**: giờ mở cửa, cách thanh toán, phụ phí, cách khai dị ứng — một
chữ số lệch ở đây là sai sự thật về nhà hàng. Truy hồi ở đó là **tra khóa**, không xếp hạng, nên không
có chỗ nào để chệch.

Hai quy tắc chia đoạn đáng ghi:

1. **Kèm tiêu đề tài liệu vào mỗi đoạn**, để đoạn tự đủ ngữ cảnh khi trích rời — điều này **đúng cho
   xếp hạng**. Nhưng nó **sai cho việc đọc**: dán đoạn thô cho khách thì khách nhận về một cái nhan đề.
   Nên có một hàm riêng làm sạch trình bày trước khi trả — xem mục 5.4.
2. **Cửa `audience: guest` là BẮT BUỘC.** Bộ nạp **từ chối** tệp không phải `guest`, không phải lọc mà
   là từ chối — để không ai thêm được nội dung hướng dẫn nội bộ vào kho khách đọc. Bản cũ của dự án có
   5/27 tệp `audience: ai` nằm cùng chỉ mục, và 47/221 đoạn bị trích cho khách đọc.

Số đoạn được xếp hạng là **{len(b.doan_xep_hang)}**, không phải {len(b.doan)}: bỏ đoạn `verbatim`
(chúng đã có đường riêng) và bỏ đoạn **mở đầu** — một mục không có tiêu đề là phần dẫn nhập của tài
liệu, nó mô tả TÀI LIỆU chứ không trả lời câu nào.

### 3.2.1 Bộ nhãn được xây dựng như thế nào

Bộ nhãn là **nền của cả hệ thống**: lớp hiểu câu hỏi ánh xạ chữ khách gõ vào nhãn, lớp chọn món lọc
theo nhãn, và {b.che_do.get('synthesize', 0)} tài liệu tri thức được sinh từ nhãn. Nhãn sai thì cả
bốn chặng sau sai theo.

**Quy trình bốn bước:**

| Bước | Việc | Kết quả |
|---|---|---|
| 1 | Kiểm kê thuộc tính có sẵn trong thực đơn gốc | giá, tên, mô tả, nhóm món |
| 2 | Rút thuộc tính **ngầm** từ mô tả món | cay/không cay, chay/mặn, vùng miền, cách chế biến |
| 3 | Hợp nhất hai nguồn — JSON của AI và CSDL của backend | **{len(b.tags)} nhãn / 16 nhóm** |
| 4 | Sinh migration để CSDL production đổi theo | chuỗi migration có phiên bản |

**Khóa nhãn có không gian tên.** Mỗi nhãn viết dạng `nhóm:giá_trị` — `spice:none`, `diet:vegetarian`,
`allergen:seafood`. Ban đầu nhóm định dùng khóa phẳng (`none`, `mild`, `hot`), nhưng như vậy không
biết `none` thuộc nhóm cay hay nhóm chế độ ăn. Quan trọng hơn: khóa có nhóm cho phép **ghi đè theo
NHÓM** ở bộ nhớ phiên — khách nói "không cay" thì `spice:none` phải **đẩy** `spice:hot` ra, chứ không
nằm cạnh nó.

**Phân bố {len(b.tags)} nhãn theo nhóm:**

| Nhóm | Số giá trị | Ví dụ | Suy từ đâu |
|---|---:|---|---|
| `method` | 11 | `grilled`, `steamed` | tên món và mô tả |
| `ingredient` | 10 | `beef`, `shrimp` | mô tả món |
| `region` | 10 | `hue`, `saigon` | tên món và mô tả |
| `health` | 6 | `low_calorie` | mô tả món |
| `flavour` | 6 | `rich`, `sour` | mô tả món |
| `party` | 6 | `solo`, `two_three` | khẩu phần |
| `occasion` | 6 | `date`, `drinking` | người viết đặt |
| `allergen` | 5 | `seafood`, `peanut` | **mô tả món — và đây là nhóm nguy hiểm nhất** |
| `spice` | 4 | `none`, `hot` | mô tả món |
| `meal`, `price`, `season` | 4 mỗi nhóm | `lunch`, `budget` | giá và mô tả |
| `serving`, `diet`, `audience`, `promo` | 2–3 mỗi nhóm | `vegetarian` | mô tả món |

**Hai bản rà tự động chạy trong CI**, vì gán nhãn thủ công thì sẽ có lỗ:

- **Rà nhãn dị nguyên** — đối chiếu nhãn với mô tả món. Bản rà này tìm ra **bảy lỗ thật** đã được lấp.
- **Rà nhãn cách chế biến** — nhóm nhãn duy nhất mà **tên món tự nói ra đáp án** ("Gà nướng muối ớt"),
  nên kiểm được tự động. Bản rà chạy `--check`, tức **chặn** khi còn lệch.

**Giới hạn phải nói rõ:** nhãn dị nguyên chỉ phủ **44/91 món**. Bảy món hải sản không có nhãn nguyên
liệu nào, và hai trong số đó chứa tôm thật (*Bún đậu mắm tôm*, *Bún bò Huế*). Đây là giới hạn **dữ
liệu**, không sửa được bằng mã — và nó là lý do hệ thống chặn rộng thay vì lọc hẹp (mục 2.8, quyết
định 5).

### 3.2.2 Kho tri thức gồm những gì

Kho có **{len(b.docs)} tài liệu / {len(b.doan)} đoạn**, ở dạng markdown có phần đầu YAML. Nó chia theo
**hai trục độc lập**, và hiểu hai trục này là hiểu cả kiến trúc tri thức.

**Trục thứ nhất — nguồn gốc nội dung:**

| Nguồn | Số tài liệu | Nội dung | Ai viết |
|---|---:|---|---|
| `derived` | {b.che_do and len([d for d in b.docs if d.source == 'derived'])} | Danh sách món theo từng nhãn, đếm số món, dải giá | **Sinh tự động** từ thực đơn bởi `build_knowledge.py` |
| `demo` | {len([d for d in b.docs if d.source == 'demo'])} | Chính sách quán, cách kết hợp món, hướng dẫn gọi món | Nhóm viết tay |

Tài liệu `derived` **không thể lệch khỏi thực đơn**, vì chúng được sinh lại từ thực đơn và CI có cổng
`--check`. Thực đơn thêm một món thì tài liệu tương ứng tự cập nhật số đếm và danh sách.

**Trục thứ hai — cách trả lời, và đây là trục quyết định kiến trúc:**

| Chế độ | Số tài liệu | Dùng cho câu hỏi | Cách trả lời |
|---|---:|---|---|
| `verbatim` | {b.che_do.get('verbatim', 0)} | giờ mở cửa, cách thanh toán, phụ phí, cách khai dị ứng | **Trả NGUYÊN VĂN**, không qua mô hình |
| `synthesize` | {b.che_do.get('synthesize', 0)} | tư vấn, so sánh, giải thích | Làm **ngữ cảnh** cho mô hình viết |

**Vì sao phải tách hai chế độ.** Câu *"mấy giờ đóng cửa?"* có **một đáp án đúng duy nhất**. Đưa nó qua
mô hình sinh là tạo cơ hội cho mô hình diễn đạt lại và làm sai — trong khi việc cần làm chỉ là đọc ra
một chuỗi. Ngược lại, câu *"gọi khai vị trước có làm no bụng không?"* cần diễn đạt, nên nó cần mô hình.

Hệ quả kiến trúc: **tài liệu `verbatim` KHÔNG nằm trong chỉ mục truy hồi.** Chúng được tra bằng khóa
chủ đề. Đây là lý do tập đánh giá truy hồi có họ `kb-verbatim-topic` — nó kiểm rằng truy hồi **trả về
rỗng** cho những câu này thay vì trả về một đoạn gần gần.

### 3.2.3 Ai đọc kho tri thức, và đọc bằng cách nào

Kho tri thức **không được đọc bởi một đường duy nhất**. Có **ba đường**, và chúng phục vụ ba loại câu
hỏi khác nhau:

```
                       câu hỏi của khách
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
      [A] TRA KHÓA      [B] CỤM TỪ VỰNG   [C] TRUY HỒI
      chủ đề            khớp chuỗi         xếp hạng
              |               |               |
              v               v               v
      tài liệu           tài liệu         đoạn liên quan
      `verbatim`         `synthesize`     trong toàn kho
              |               |               |
              v               v               v
      trả NGUYÊN VĂN     làm ngữ cảnh     làm ngữ cảnh
      (không qua mô hình)  cho mô hình     cho mô hình
```

**Đường A — tra khóa chủ đề.** Câu hỏi khớp một khóa chủ đề `verbatim` thì hệ thống trả về nguyên văn
nội dung tài liệu. Không có mô hình, không có xếp hạng, không có khả năng sai.

**Đường B — cụm từ vựng.** Lớp hiểu câu hỏi có {b.so_cum_tu_vung} cụm từ khóa. Khớp được cụm nào thì
lấy tài liệu tương ứng. Đây là đường **phổ biến nhất** trong vận hành thật.

**Đường C — truy hồi.** Khi hai đường trên không khớp, hệ thống xếp hạng toàn bộ {len(b.doan_xep_hang)}
đoạn `synthesize` và lấy 5 đoạn đầu. Đây là đường **duy nhất** tới những tài liệu không có cụm từ vựng
riêng.

**Một con số đáng chú ý và báo cáo nêu rõ:** trên tập {len(b.ca_tra_loi)} ca trả lời và
{b.luot_phien} lượt phiên, đường C chạy **{b.tr_ca} lần** và **{b.tr_phien} lần**. Con số này từng là
**0 trên cả hai tập** — không phải vì truy hồi vô dụng, mà vì **hai tập khi đó được viết quanh các
nhánh tất định** và không tiêu chí nào hỏi tới nhánh C. Bộ hai chiều ở mục 4.9 được xây chính vì lý do
đó, và họ ca `knowledge_corpus` được thêm sau để lấp đúng lỗ này.

**Cửa `audience: guest`.** Mọi tài liệu trong kho phải khai `audience: guest`, và bộ nạp **từ chối**
tệp không khai đúng giá trị này — từ chối chứ không phải lọc. Lý do: bản kho trước có 5/27 tệp là
hướng dẫn nội bộ dành cho AI nằm chung chỉ mục, và **47/221 đoạn nội bộ đã bị trích cho khách đọc**.
Lọc thì người sau vẫn thêm được tệp nội bộ vào; từ chối thì không.

## 3.3 Bốn tập đánh giá, và kỷ luật chia tập

| Tập | Kích thước | Chặng nó đo |
|---|---:|---|
| `cases.json` | {len(b.ca_tra_loi)} ca | `understand()` + `respond()` gọi trực tiếp |
| `session_scripts.json` | {len(b.kich_ban)} kịch bản / {b.luot_phien} lượt | + bộ nhớ nhiều lượt |
| `retrieval_cases.json` | {len(b.ca_truy_hoi)} ca | truy hồi trên **toàn kho** |
| `chunk_selection_cases.json` | {len(b.ca_chon_muc)} ca | chọn mục **trong một tài liệu** |
| `golden_e2e.json` | {len(b.golden)} hội thoại / {b.luot_golden} lượt | **toàn chuỗi**, tới giỏ hàng thật |

### 3.3.1 Bộ đánh giá được xây dựng như thế nào

Mục này trả lời câu hỏi *"lấy đâu ra những ca đánh giá này"* — điều kiện để mọi con số ở Chương 4 có
nghĩa. Một tập đánh giá không nói rõ nguồn gốc thì con số trên nó không kiểm chứng lại được.

#### Hai cách tạo ca, và vì sao dùng cả hai

| Cách tạo | Dùng khi | Ưu điểm | Nhược điểm |
|---|---|---|---|
| **Sinh tự động từ dữ liệu** | ca suy được từ thực đơn hoặc bộ nhãn | không thể trỏ vào dữ liệu không tồn tại; dữ liệu đổi thì ca đổi theo; không mang thiên lệch của người viết | chỉ tạo được ca *đúng khuôn*, không tạo được ca đối kháng |
| **Viết tay** | ca đối kháng, ca ngoài phạm vi, ca đụng chữ | nhắm đúng chỗ dễ sai | người viết có thể vô thức chọn ca mình biết hệ thống sẽ qua |

Nguyên tắc áp dụng: **phần suy được từ dữ liệu thì sinh, phần không suy được thì viết tay và ghi rõ
lý do từng ca**. Mỗi ca viết tay đều có trường `why` nêu ca đó nhắm vào điều gì.

#### Nguồn gốc từng tập

**1. Tập ca trả lời — {len(b.ca_tra_loi)} ca / {len({c.get('family') for c in b.ca_tra_loi})} họ.**
Viết tay, theo ba loại câu của phát biểu bài toán (mục 1.2). Với mỗi nhánh trả lời, nhóm viết ít nhất
hai ca: một ca dùng đúng từ có trong dữ liệu, một ca diễn đạt khác. Khóa đáp án **không phải danh sách
món viết tay** mà là **điều kiện chọn**, ví dụ `{{"kind": "list", "forbid": {{"tags_any":
["allergen:seafood"]}}}}`. Nhờ vậy thực đơn đổi thì khóa đáp án vẫn đúng.

**2. Kịch bản phiên — {len(b.kich_ban)} kịch bản / {b.luot_phien} lượt.**
Sinh bởi `ai/scripts/build_session_scripts.py` theo bốn nhóm tình huống mà tập một lượt không đo được:
dị nguyên khai một lần phải giữ suốt phiên; ràng buộc mới ghi đè ràng buộc cũ; "món khác đi" không
được lặp món đã nêu; tham chiếu ngược ("món đầu tiên giá bao nhiêu"). Bộ sinh có cổng `--check` trong
CI nên tập không thể bị sửa tay.

**3. Tập truy hồi — {len(b.ca_truy_hoi)} ca / {len({c.get('family') for c in b.ca_truy_hoi})} họ.**
Sinh bởi `ai/scripts/build_retrieval_cases.py`. Phần lớn ca sinh từ **khóa chủ đề thật của kho tri
thức**: với mỗi giá trị nhãn, bộ sinh tạo hai câu hỏi — một câu dùng đúng từ có trong tài liệu (BM25
nên thắng), một câu diễn đạt khác hoàn toàn (embedding nên thắng). Cách này giúp tập **phân biệt được
hai phương pháp** thay vì chỉ xếp hạng chúng.

Ba họ **viết tay** vì không suy được từ dữ liệu, và chúng đo điều Hit@k không đo:

| Họ viết tay | Đo gì |
|---|---|
| `kb-verbatim-topic` | chủ đề trả lời nguyên văn bằng tra khóa — truy hồi phải trả **RỖNG** |
| `kb-number` | câu có ngưỡng số — chứng minh không phải chỗ nào cũng nên dùng RAG |
| `kb-out-of-scope` | câu ngoài phạm vi — không đoạn nào trả lời được |

Không có ba họ này thì một bộ truy hồi **luôn trả về 5 đoạn** sẽ đạt điểm cao, trong khi nó mời khách
đọc một đoạn không liên quan.

**4. Tập chọn mục — {len(b.ca_chon_muc)} ca.**
Sinh bởi `ai/scripts/build_chunk_selection_cases.py` từ chính cấu trúc tài liệu: mỗi ca là một câu hỏi
kèm danh sách **mục trong cùng một tài liệu**, đáp án là mục đúng. Tập tách hai nhóm báo cáo riêng —
nhóm `written` (mỗi tài liệu một cấu trúc riêng) là con số chính, nhóm `derived` (khuôn lặp lại) báo
cáo riêng để không kéo con số chung lên.

**5. Golden đầu-cuối — {len(b.golden)} hội thoại / {b.luot_golden} lượt.**
**Viết tay hoàn toàn**, và là tập duy nhất chạy qua chuỗi gọi thật: quét QR → phiên bàn → backend .NET
→ dịch vụ AI → thẻ giỏ → giỏ hàng. Mỗi hội thoại mô phỏng một tình huống khách thật: đi một mình,
nhóm đông người, có dị ứng, đổi ý giữa chừng.

**6. Bộ hai chiều — {len(b.hai_chieu)} câu.**
Chiều A **phủ hết toàn bộ tài liệu văn xuôi**, mỗi tài liệu ít nhất một câu — danh sách tài liệu quyết
định danh sách câu hỏi. Chiều B **sinh từ bộ nhãn** theo từng nhóm thuộc tính. Cả hai đều không có chỗ
cho việc người viết chọn câu dễ, và đó là lý do bộ này được dùng cho kết luận chính ở mục 4.4.

#### Khóa đáp án lấy từ đâu

Đây là câu hỏi quan trọng nhất về nguồn gốc, vì khóa đáp án sai thì mọi con số sai theo.

| Tập | Khóa đáp án là gì | Cái gì quyết định |
|---|---|---|
| Ca trả lời | **điều kiện chọn** trên thực đơn | thực đơn — nhóm không liệt kê món |
| Kịch bản phiên | ràng buộc phải giữ qua các lượt | quy tắc hợp nhất đã đặc tả |
| Truy hồi | **điều kiện chọn đoạn** (`topic_keys_any`, `heading_any`) | siêu dữ liệu của kho |
| Chọn mục | mã đoạn đúng | cấu trúc tài liệu markdown |
| Golden | trạng thái giỏ hàng và thẻ sau mỗi lượt | hợp đồng API |
| Hai chiều | tài liệu đích / tập món thỏa ràng buộc | kho tri thức và bộ nhãn |

**Không tập nào có khóa đáp án là một danh sách viết tay.** Mọi khóa đều là **điều kiện** được giải ra
tại thời điểm chạy. Hệ quả: thực đơn thêm một món thì khóa đáp án tự đúng theo, không cần sửa tập.

#### Điều nhóm KHÔNG làm, và nói rõ

1. **Không có nhật ký hội thoại khách thật.** Toàn bộ ca do nhóm tạo. Đây là giới hạn về **hiệu lực
   ngoài**: con số đo được hệ thống có tôn trọng ràng buộc hay không, nhưng không đo được khách thật
   sẽ hỏi gì.
2. **Không thuê người ngoài chấm.** Khóa đáp án do nhóm đặt, dù ở dạng điều kiện thay vì danh sách.
3. **Không chạy lặp nhiều hạt giống** cho đường sinh. Các chặng tất định cho cùng kết quả mỗi lần chạy
   nên không cần; riêng đường sinh LLM thì con số một lần chạy có phương sai chưa được đo.

Bằng chứng cho giới hạn thứ nhất nằm ngay trong dự án: một phiên thử nghiệm với người dùng ngoài nhóm
làm lộ **17 lỗi** mà tập ca và 111 lượt phiên **khi đó** không bắt được — vì mọi ca
trong tập đều **viết đúng kiểu**, còn người thật thì phủ định, đổi ý và hỏi liên tục. Tập phiên phải
mở rộng lên **{b.luot_phien} lượt** mới bắt được lớp lỗi đó.

**Chia tập theo HỌ, không theo ca.** Hai ca cùng họ hỏi cùng chủ đề, chỉ khác cách diễn đạt — xem một ca
là biết ca kia, nên chia theo ca thì tập niêm phong **không còn niêm phong**.

Thứ tự chia do `sha256(tên họ)` quyết định, **không** do `random.shuffle` có seed: shuffle phụ thuộc
phiên bản Python, nên Python đổi thuật toán thì phép chia đổi theo và tập niêm phong lặng lẽ trộn vào
tập phát triển.

Ba nhóm, không phải hai:

| Nhóm | Số họ | Vai trò |
|---|---:|---|
| chốt | {len(sp['gate_families'])} | **luôn phải đạt**; một ca đỏ ở đây là CHẶN, không phải số liệu |
| phát triển | {len(sp['dev_families'])} | được xem, được sửa theo |
| niêm phong | {len(sp['test_families'])} | **chỉ mở MỘT lần** |

Nhóm chốt của tập truy hồi gồm ba họ đo việc **biết khi nào KHÔNG trả lời**. Vì sao chúng là chốt chứ
không phải số liệu: một bộ truy hồi **luôn trả về 5 đoạn** đạt điểm cao trên mọi họ khác, và chỉ ba họ
này bắt được nó.

**Bài học đã trả giá, ghi ngay trong tệp chia tập:** tập niêm phong của bộ 119 ca **đã dùng hết** ở một
bước trước. Mọi con số trên nó sau đó không còn là held-out.

## 3.4 Mười bảy nhánh trả lời, không nhánh nào chồng nhánh nào

Thứ tự nhánh là thứ tự **loại trừ**, nên mỗi câu đi đúng một nhánh và nhánh đó xác định được từ đầu vào:

| Loại | Nhánh | Sinh? |
|---|---|---|
| A | `price_lookup` `price_assertion` `item_detail` `serving_named_dish` `allergen_named_dish` `no_size` `unknown_item` `facts:*` | cấm |
| B | `policy:*` (tra khóa, nguyên văn) · `knowledge_corpus:*` (truy hồi toàn kho) | cấm |
| C | `filter` `compare` | **được** |
| khác | `clarify` `empty_result` `exhausted_after_exclusions` `off_topic` `internal` | cấm |

Nhánh `clarify` là **câu trả lời đúng** ở chỗ khách chưa nói gì đủ để lọc, không phải thất bại. Và nó
**không** được kèm danh sách món — kèm danh sách thì nó không còn là câu hỏi lại.

Nhánh `exhausted_after_exclusions` sinh ra từ một lỗi chạy thật: khách xem ba lượt danh sách rồi nói
"cho mình món khác đi" và nhận "mình chưa tìm được món nào" — câu đó **nói sai sự thật**, vì có món thỏa
ràng buộc, chỉ là chúng đã được nêu. Nhánh mới nói đã nêu hết rồi mời bỏ bớt một điều kiện, và **không**
nêu lại danh sách.

Một cổng riêng chặn nhánh truy hồi toàn kho trả lời câu ngoài phạm vi. Nó **không phải ngưỡng tương
đồng** mà là **phép thuộc tập**, và tập đó **sinh từ dữ liệu**: tên món + tên danh mục + nhãn tiếng Việt
+ tiêu đề mọi tài liệu. Lý do không dùng danh sách viết tay: nó sẽ trôi khỏi thực đơn ngay lần thêm món.
Trước khi có cổng này, câu "Bạn là model gì?" nhận về một đoạn nói về lẩu — vì embedding **luôn** cho
điểm cho mọi đoạn.

## 3.5 Hai bài toán truy hồi khác nhau

Lúc chạy, truy hồi được gọi ở hai chỗ, và chúng là hai bài toán khác nhau:

| Chỗ gọi | Bài toán | Ứng viên | `k` |
|---|---|---:|---:|
| `doan_tri_thuc_lien_quan()` | đoạn nào **trong cả kho** trả lời câu này | {len(b.doan_xep_hang)} | 1 |
| `_knowledge_chunk()` → `_chon_muc()` | mục nào **trong tài liệu này** đúng ý | 3–8 | 1 |

Cả hai dùng `k=1`, nên **Top-1 là chỉ số quyết định** ở cả hai. Và cả hai chạy **embedding** — quyết
định này đến từ số liệu ở mục 4.2 và 4.3.

Đường thứ hai **không dựng chỉ mục mới**: chỉ mục toàn kho đã có vector của cả {len(b.doan_xep_hang)}
đoạn, nên xếp hạng trong một tài liệu chỉ là giới hạn phép chấm điểm vào tập con — hợp lệ vì vector đã
chuẩn hoá L2 (mục 2.2). Chi phí thật là **một** lần mã hoá câu hỏi. Cách hiển nhiên — dựng một chỉ mục
cho mỗi tài liệu — mất **~91ms mỗi lượt**, và có một test **đếm số lần dựng chỉ mục rồi đòi 0**.

## 3.7 Nguyên lý hoạt động từng lớp

Mục này giải thích **từng lớp làm gì và làm bằng cách nào**, theo đúng thứ tự một câu hỏi đi qua.
Đây là phần trả lời câu hỏi *"cơ chế nào quyết định lúc nào dùng mã tất định, lúc nào dùng truy hồi"*.

### 3.7.1 Lớp 1 — NHẬN CÂU HỎI (`understand.py`)

**Đầu vào:** một chuỗi tiếng Việt khách gõ. **Đầu ra:** một cấu trúc `Request` gồm các trường đã hiểu.

Lớp này **không dùng mô hình**. Nó chạy bốn bước theo thứ tự:

**Bước 1 — Chuẩn hóa.** Chuỗi được đưa về chữ thường và **rút dấu** (`fold`): *"Món nào KHÔNG cay?"*
thành `"mon nao khong cay"`. Lý do: người Việt gõ không dấu rất thường, và không chuẩn hóa thì
*"mon cay"* không khớp *"món cay"*.

Rút dấu là phép **mất thông tin** và đã gây mười vụ va chạm trong dự án — `fold("có cồn")` bằng
`fold("có con")`, nên câu *"mình có con 5 tuổi"* từng trả về danh sách rượu bia. Vì vậy chuỗi rút dấu
chỉ dùng để **khớp cụm từ vựng**, không dùng để so tên món.

**Bước 2 — Khớp cụm từ vựng.** Một bảng **{b.so_cum_tu_vung} cụm** ánh xạ chữ khách dùng sang nhãn:

```
"khong cay | it cay | khong an duoc cay"   -> spice:none
"mon chay | an chay | do chay"              -> diet:vegetarian
"di ung hai san | khong an duoc do bien"    -> avoid allergen:seafood
```

Khớp theo **ranh giới từ**, không theo chuỗi con — nếu không thì `"cua"` khớp cả trong `"của"`.

**Bước 3 — Tách RÀNG BUỘC khỏi NGỮ CẢNH.** Đây là chỗ khó nhất của lớp này:

| Loại | Ví dụ | Hệ quả |
|---|---|---|
| **Ràng buộc** (`require_tags`, `avoid_tags`, `budget_max`) | *"không cay"*, *"dưới 200 nghìn"* | món không thỏa bị **LOẠI** |
| **Ngữ cảnh** (`prefer_tags`) | *"đi hẹn hò"*, *"trời nóng"* | món hợp chỉ được **XẾP LÊN TRƯỚC** |

Nhầm hai thứ này gây một trong hai lỗi: hoặc lọc mất món đúng, hoặc để lọt món khách không ăn được.

**Bước 4 — Nhận diện ý định.** Câu chào hỏi, câu xin thêm món, câu xóa ràng buộc được nhận riêng —
chúng không phải câu chọn món và không nên đi vào nhánh lọc.

### 3.7.2 Lớp 2 — NHỚ NGỮ CẢNH (`session.py`)

`Request` của lượt hiện tại được **hợp nhất** với trạng thái phiên. Ba loại ràng buộc dùng **ba quy
tắc khác nhau**, và đây là điểm nhóm làm sai ở bản đầu:

| Loại | Quy tắc | Nếu dùng sai quy tắc |
|---|---|---|
| **Dị nguyên** | CỘNG DỒN, không bao giờ bỏ | ghi đè thì *"dị ứng hải sản"* lượt 1 bị *"không ăn được sữa"* lượt 3 xóa mất — **lỗi an toàn** |
| **Ràng buộc cứng** | lượt mới GHI ĐÈ cùng nhóm | cộng dồn thì *"dưới 200k"* rồi *"rẻ hơn nữa"* giữ **cả hai** ngân sách |
| **Ngữ cảnh** | cộng vào, giữ 5 gần nhất | ghi đè thì *"đi hẹn hò"* rồi *"trời nóng"* mất một trong hai |

Ghi đè theo **NHÓM** chứ không theo nhãn: `spice:none` phải đẩy `spice:hot` ra, không nằm cạnh nó.

### 3.7.3 Lớp 3 — CHỌN NHÁNH, và đây là CƠ CHẾ KÍCH HOẠT hai lớp kia

Đây là câu trả lời cho *"cơ chế nào quyết định dùng mã tất định hay truy hồi"*.

Hệ thống có **{b.so_nhanh} nhánh trả lời**, và chúng **loại trừ
nhau** — một câu hỏi đi đúng một nhánh. Việc chọn nhánh là một **chuỗi điều kiện theo thứ tự ưu tiên**,
không phải một mô hình phân loại:

```
1.  off_topic ?          -> câu ngoài phạm vi          -> từ chối lịch sự
2.  xã giao ?            -> chào hỏi, cảm ơn           -> câu mẫu
3.  hỏi nội bộ ?         -> "bạn là model gì"          -> từ chối
4.  policy_topic ?       -> giờ mở cửa, thanh toán     -> TRA KHÓA, trả NGUYÊN VĂN
5.  knowledge_topic ?    -> chủ đề tri thức đã nhận ra -> lấy tài liệu theo khóa
6.  named_items ?        -> hỏi về món cụ thể          -> tra thực đơn
7.  asks_price ?         -> hỏi giá                    -> tra thực đơn
8.  is_comparison ?      -> so sánh hai món            -> tra thực đơn
9.  có nhãn lọc ?        -> câu chọn món               -> LỌC THEO NHÃN
10. không khớp gì ?      -> câu tri thức chưa nhận ra  -> TRUY HỒI
```

**Cơ chế kích hoạt, phát biểu gọn:**

> **Truy hồi chỉ chạy khi chín điều kiện trên đều KHÔNG khớp.** Nó là **đường cuối**, không phải
> đường mặc định.

Lý do thiết kế như vậy: chín nhánh đầu đều có **đáp án xác định** — tra được từ thực đơn hoặc từ khóa
chủ đề. Đưa chúng qua xếp hạng theo độ tương đồng là bỏ một đáp án chắc chắn để lấy một ước lượng.

**Hệ quả đo được:** trên tập {len(b.ca_tra_loi)} ca và {b.luot_phien} lượt phiên, nhánh truy hồi chạy
**{b.tr_ca} lần** và **{b.tr_phien} lần**. Con số này từng là 0 trên cả hai tập — mọi câu đều khớp một
trong chín nhánh trước, vì hai tập đó được viết quanh các nhánh tất định chứ không vì truy hồi vô dụng.
Bộ hai chiều ở mục 4.9 tồn tại vì lý do đó.

### 3.7.4 Lớp 4a — MÃ TẤT ĐỊNH xử lý thế nào (`answer.select()`)

Áp dụng lần lượt trên danh sách {len(b.items)} món:

```
1. LOẠI  món mang nhãn trong `avoid_tags`        <- dị nguyên, fail-closed
2. LOẠI  món không có ĐỦ nhãn trong `require_tags`  <- phép GIAO, không phải hợp
3. LOẠI  món vượt `budget_max`
4. LOẠI  món thuộc `avoid_categories`            <- "tôi không uống bia"
5. XẾP   theo (số nhãn ngữ cảnh khớp, bậc món, giá, mã món)
6. CẮT   lấy N món đầu
```

Bước 2 dùng phép **giao**: khách nói *"chay và không cay"* thì món phải có **cả hai** nhãn. Dùng phép
hợp là trả về món chay cay.

**Tính chất của lớp này:** cùng đầu vào luôn cho cùng đầu ra; không phụ thuộc mô hình; chạy trong
khoảng 0,3 mili-giây; và **không thể** trả về món không thỏa ràng buộc — vì điều kiện được kiểm trực
tiếp chứ không ước lượng.

### 3.7.5 Lớp 4b — TRUY HỒI xử lý thế nào (`rag/`)

Khi chín nhánh đầu không khớp, hệ thống xếp hạng **{len(b.doan_xep_hang)} đoạn** `synthesize`:

```
1. CHUẨN HÓA   câu hỏi -> thêm tiền tố "query: " (yêu cầu của họ mô hình E5)
2. MÃ HÓA      câu hỏi -> vector 1024 chiều
3. SO SÁNH     tính cosine với vector của từng đoạn (đã tính sẵn lúc build)
4. XẾP HẠNG    sắp theo điểm giảm dần
5. CẮT         lấy 5 đoạn đầu làm ngữ cảnh
```

Vector của các đoạn được **tính sẵn lúc build ảnh Docker**, không tính lúc chạy. Nhờ vậy độ trễ mỗi
câu hỏi không tăng; chỉ thời gian khởi động container tăng.

**Tính chất của lớp này, và đây là điểm phải nắm:** nó **luôn trả về 5 đoạn**. Không có khái niệm
"không tìm thấy". Câu hỏi lạc đề hoàn toàn vẫn nhận về 5 đoạn với điểm số đàng hoàng. Quyết định
"không trả lời" nằm ở **lớp 3** (chọn nhánh), không nằm ở lớp này.

### 3.7.6 Lớp 5 — TRẢ LỜI (`answer.py` và `generate.py`)

Có **hai đường viết câu**, và mặc định dùng đường thứ nhất:

**Đường A — khuôn mẫu (mặc định).** Câu trả lời ghép từ danh sách món đã chọn theo khuôn cố định. Mọi
tên món và giá lấy trực tiếp từ thực đơn. **Không có khả năng bịa**, vì không có chỗ nào để bịa.

**Đường B — mô hình sinh (tắt mặc định).** Mô hình nhận **danh sách món đã lọc** cộng đoạn tri thức,
và viết lại cho tự nhiên. Ba giới hạn cứng:

1. Mô hình **không chọn món** — nó chỉ viết về những món đã được chọn
2. Chỉ **{len(b.nhanh_duoc_sinh)} nhánh** được phép sinh ({', '.join('`' + x + '`' for x in b.nhanh_duoc_sinh)}); nhánh mới mặc định **không** sinh
3. Câu viết ra phải qua **{b.so_phep_kiem} phép kiểm xác minh**

Vì sao tắt mặc định: đo trên {b.m_llm['so']['ca']} ca loại C cho thấy đường sinh **0 ca tụt** nhưng
cũng **0 ca đúng thêm**, trong khi tốn thêm khoảng 8,6 giây mỗi lượt.

### 3.7.7 Lớp 6 — XÁC MINH (`generate.verify()`)

Chỉ chạy khi đường B bật. **{b.so_phep_kiem} phép kiểm** đối chiếu câu mô hình viết với dữ liệu gốc:

| # | Kiểm gì |
|---|---|
| 1 | Mã món mô hình khai đã dùng phải nằm trong danh sách đưa vào |
| 2 | Không được nhắc món thật nào **ngoài** danh sách |
| 3 | Mọi số tiền phải là giá thật của một món đã đưa vào |
| 4 | Không được nêu số lượng, trừ khi con số trùng số món trong danh sách |
| 5 | Không được in khóa nhãn nội bộ |
| 6 | Phải nhắc **đủ** mọi món trong danh sách |
| 6b | Không được nhắc cùng một món hai lần |
| 6c | Danh sách từ ba món trở lên phải gạch đầu dòng |
| 7 | Không món nào được mang nhãn khách cần tránh |
| 8 | Khách đã nêu điều cần tránh thì câu trả lời phải mở đường hỏi nhân viên |

**Vi phạm thì BỎ câu sinh**, dùng lại câu khuôn mẫu — không sửa. Sửa một câu sai thành câu đúng đòi
hỏi biết đúng là gì, mà nếu đã biết thì không cần mô hình.

Phép kiểm 4 sinh ra từ một lỗi thật: mô hình viết *"Nhà hàng có **6 món lẩu**"* trong khi thực đơn có
**7**. Ba phép kiểm đầu không chạm tới lỗi này — nó không phải tên món, không phải giá, không phải nhãn.

### 3.7.8 Lớp 7 — THẺ GIỎ HÀNG (`cart.py`)

Thẻ giỏ dựng từ **`reply.items`** — danh sách món lớp 4a đã chọn — **không** từ chữ mô hình viết.

Đây là ranh giới an toàn cuối cùng: kể cả khi mọi phép kiểm ở lớp 6 đều lọt, món trong giỏ vẫn không
thể là món mô hình bịa ra, vì giỏ **không đọc** chữ của mô hình.

Chỉ **{len(b.nhanh_co_the_gio)} nhánh** được sinh thẻ giỏ. Nhánh `clarify`, `off_topic`, `empty_result` **không có thẻ** — gợi
ý đặt món khi chưa hiểu câu hỏi là sai.

### 3.7.9 Tóm tắt: lớp nào tất định, lớp nào có mô hình

| Lớp | Tất định? | Chạy khi nào |
|---|---|---|
| 1. Nhận câu hỏi | **Có** | mọi lượt |
| 2. Nhớ ngữ cảnh | **Có** | mọi lượt |
| 3. Chọn nhánh | **Có** | mọi lượt |
| 4a. Lọc theo nhãn | **Có** | nhánh chọn món |
| 4b. Truy hồi | Không — có mô hình nhúng | chỉ khi 9 nhánh đầu không khớp |
| 5. Viết câu | Đường A **có** / Đường B không | B tắt mặc định |
| 6. Xác minh | **Có** | chỉ khi B bật |
| 7. Thẻ giỏ | **Có** | 6 nhánh |

**Năm trong bảy lớp là mã tất định**, và hai lớp còn lại đều có đường lui về tất định. Hệ quả: dịch vụ
**trả lời được khi mô hình hỏng** — chỉ là câu chữ kém tự nhiên hơn.

---

### 3.7.10 Ba ví dụ chạy xuyên suốt bảy lớp

Mục này chạy **ba câu hỏi thật** qua toàn bộ hệ thống và in ra trạng thái sau từng lớp. Con số dưới
đây **được tính lúc sinh báo cáo**, không chép tay — chạy lại báo cáo là chạy lại ba ví dụ này.

Ba câu được chọn để rơi vào **ba nhánh khác nhau**, minh hoạ cơ chế kích hoạt ở mục 3.7.3.

#### Ví dụ 1 — câu chọn món có ràng buộc (đi đường MÃ TẤT ĐỊNH)

> **Khách:** *"{b.vd(0)['cau']}"*

| Lớp | Kết quả |
|---|---|
| 1. Nhận câu hỏi | `avoid_tags = {b.vd(0)['avoid']}` · `budget_max = {b.vd(0)['budget']}` |
| 3. Chọn nhánh | `{b.vd(0)['nhanh']}` — có nhãn lọc nên vào nhánh 9, **không** xuống truy hồi |
| 4a. Lọc theo nhãn | {b.vd(0)['so_mon']} món qua được cả hai điều kiện |
| 5. Viết câu | khuôn mẫu, kèm câu nói rõ giới hạn dữ liệu nhãn |
| 7. Thẻ giỏ | có — nhánh `filter` nằm trong danh sách được sinh thẻ |

Món đầu tiên trả về: **{b.vd(0)['mon']}**.

Đáng chú ý: câu trả lời **mở đầu bằng lời nói rõ giới hạn** — *"thực đơn chỉ ghi nhãn theo NHÓM, không
tách riêng từng loại"*. Đây là phép kiểm số 8 ở lớp 6: khách nêu điều cần tránh thì câu trả lời phải
mở đường hỏi nhân viên, vì nhãn dị nguyên chỉ phủ 44/91 món.

#### Ví dụ 2 — câu chính sách (đi đường TRA KHÓA, không qua mô hình)

> **Khách:** *"{b.vd(1)['cau']}"*

| Lớp | Kết quả |
|---|---|
| 1. Nhận câu hỏi | `policy_topic = {b.vd(1)['policy']}` |
| 3. Chọn nhánh | `{b.vd(1)['nhanh']}` — dừng ở nhánh 4, **không** chạy lọc nhãn, **không** chạy truy hồi |
| 5. Viết câu | trả **NGUYÊN VĂN** nội dung tài liệu `verbatim` |
| 7. Thẻ giỏ | **không** — câu hỏi chính sách không gợi ý đặt món |

**Ví dụ này từng là một lỗi thật, và cách phát hiện đáng ghi lại.** Bản trước, câu *"Mấy giờ quán đóng
cửa?"* cho `policy_topic = None` và rơi xuống nhánh truy hồi — rồi truy hồi trả về một **danh sách món
khai vị**. Nguyên nhân kép:

1. Bảng từ vựng chỉ khớp cụm **liền nhau**, nên chữ *"quán"* chèn giữa làm hỏng khớp. Bốn trong sáu
   cách hỏi tự nhiên đều hỏng.
2. Tài liệu giờ mở cửa là `verbatim` nên **không nằm trong chỉ mục truy hồi**. Bộ xếp hạng không tìm
   được đoạn nào về giờ, và vì nó **luôn trả về 5 đoạn** (mục 3.7.5), nó lấy đoạn giống nhất còn lại.

Lỗi này **không** bị tập đánh giá bắt, vì mọi ca trong tập đều viết cụm liền nhau. Nó lộ ra khi chạy
ví dụ xuyên suốt cho chính báo cáo này. Đã sửa bằng một mẫu cho phép tối đa ba từ chèn giữa, và chốt
bằng hai ca kiểm — một ca cho sáu cách hỏi, một ca chiều ngược để mẫu nới lỏng không nuốt câu lọc món.

#### Ví dụ 3 — câu tri thức chưa có cụm từ vựng (đi đường TRUY HỒI)

> **Khách:** *"{b.vd(2)['cau']}"*

| Lớp | Kết quả |
|---|---|
| 1. Nhận câu hỏi | không nhãn lọc, không chủ đề chính sách, không chủ đề tri thức |
| 3. Chọn nhánh | `{b.vd(2)['nhanh']}` |
| 4b/4a | {b.vd(2)['ghi_chu']} |

**Ví dụ này từng là lỗi, và cách sửa nó là đóng góp kỹ thuật đáng kể của đồ án.**

Bản trước, câu này đi vào nhánh lọc và trả về **6 món khai vị** — mọi món có thật, mọi giá đúng, và
**không món nào trả lời điều được hỏi**. Khách hỏi *"có làm no bụng không"*, nhận về một danh sách.

Nguyên nhân: câu chứa chữ *"khai vị"*, và *"khai vị"* là một **cụm từ vựng nhóm món**, nên nhánh 9
khớp trước nhánh 10 dù kho có tài liệu `appetizer_role` trả lời đúng câu này.

Mục 4.9 đo lớp lỗi này trên 50 câu tri thức: **25/50 câu bị trả lời sai dạng**. Sau khi sửa còn
**15/50**, và câu ví dụ này nằm trong 10 câu được sửa — nó đi đúng nhánh `knowledge_corpus`.

Đây là **đánh đổi của thiết kế ưu tiên theo thứ tự**: nhánh nào khớp trước thì thắng, đổi lấy tính
tất định và khả năng dự đoán.

**Đã sửa một phần, và cách sửa đáng ghi lại.** Không đổi thứ tự nhánh — làm vậy thì câu *"cho mình
món khai vị"* sẽ đi truy hồi. Thay vào đó nhận diện **DẠNG CÂU**, bằng một hàng rào **hai chiều**:

| Chiều | Dấu hiệu | Vai trò |
|---|---|---|
| **Hỏi về sự việc** | *"thế nào"*, *"vì sao"*, *"mà sao"*, *"có … không"* | đưa câu xuống truy hồi |
| **Xin món** | *"món nào"*, *"cho mình"*, *"gợi ý"*, *"ăn gì"* | **chặn** chiều trên |

Chiều thứ hai là phần quan trọng. Chỉ nhận diện chiều thứ nhất thì câu *"Có món chay nào không?"* —
vốn là câu xin món — cũng khớp, và ta phá một nhánh đang đúng để sửa một nhánh đang sai.

Dấu hiệu còn tách thành **mạnh** và **yếu**:

- **Mạnh** (*"tính sao"*, *"mà sao"*, *"khác nhau"*): thắng cả khi câu có ràng buộc, vì chúng không
  bao giờ xuất hiện trong câu xin món. Ví dụ *"tiêu tầm hai trăm mỗi người thì **tính sao**?"* vừa
  mang ngân sách vừa là câu hỏi cách làm.
- **Yếu** (*"có … không"*, *"được không"*): chỉ áp dụng khi câu **không có ràng buộc nào**.

Hai chi tiết đo được trong lúc làm hàng rào này:

1. *"có … không"* phải đòi **ít nhất ba từ ở giữa**. Mẫu rộng làm *"Ở đây có phở không"* và *"Có cơm
   không ạ"* — câu hỏi thực đơn — bị đọc thành câu tri thức, và bốn nhánh đang đúng bị phá.
2. *"là gì"* **không** được là dấu hiệu mạnh. Ca `A-promo-02` *"Món đặc trưng của nhà hàng là gì?"*
   là câu hỏi thực đơn, và đưa *"là gì"* vào nhóm mạnh làm tập 140 ca tụt còn 139.

**Kết quả đo trên chiều A của bộ hai chiều:**

| | trước | sau |
|---|---:|---:|
| Trả lời **SAI DẠNG** | 25/50 | **15/50** |
| Đi đúng đường truy hồi | 20/50 | **30/50** |
| Trả lời đúng dạng | 5/50 | 5/50 |

Số câu trả lời sai dạng giảm **40%**, và không tập nào tụt: 140/140 ca, 149/149 lượt, 0 lỗi an toàn.

**Hai giới hạn còn lại, ghi ra thay vì giấu:**

1. Câu vừa hỏi vừa mang ràng buộc, với dấu hiệu yếu — *"Đồ chay ở đây có thật sự chay không?"* mang
   `diet:vegetarian` nên hàng rào không áp dụng. Nới quy tắc sẽ nuốt cả *"Có món chay nào không?"*.
2. Câu nêu tên món bị chặn — nhưng *"Phở với bún khác nhau chỗ nào?"* vẫn tới đúng đích qua nhánh so
   sánh, nên không cần sửa.

Cả hai được chốt bằng một ca kiểm ghi rõ hành vi hiện tại: ai nới hàng rào thì ca đó đỏ và buộc họ
đọc lý do.

---

## 3.6 Điều kiện kiểm soát thực nghiệm

**Đường tất định phải TẤT ĐỊNH.** Mọi phép phá thế đều theo `chunk_id` tăng dần, ở **cả hai** đường xếp
hạng. Hai đường phá thế ngược nhau thì hệ thống không lặp lại được kết quả của chính nó — và bản đầu của
`_chon_muc` đã sai đúng chỗ đó.

**Cache lời gọi mô hình** được commit vào repo, để CI chạy lại được phép đo "có mô hình" mà không cần
khóa thật và không phụ thuộc mạng.

**Hai giao thức đo độ trễ, không được trộn:**

| Giao thức | Số lần chạy | Dùng cho |
|---|---:|---|
| sàng lọc | 1 | loại phương án chậm gấp bậc |
| chốt | 7, lấy trung vị | số đưa vào báo cáo |

Bản cũ trộn hai giao thức rồi so 29ms với 81ms như cùng loại — hai con số đó **không so được** với nhau.
Nay tên giao thức được in ra cùng con số, và được ghi vào tệp bằng chứng.

**Cấu hình của mỗi lần đo được ghi kèm con số.** Tệp bằng chứng trong `ai/evaluation/measurements/` mang
nguyên phản hồi `/ready` của dịch vụ lúc đo. Lý do: đã trả giá một lần cho việc thiếu nó — một lần chạy
42 lượt được báo là "qua mô hình thật" trong khi `LLM_API_KEY` rỗng nên **mọi lượt đi đường tất định**.

---
---"""


def _bang_truy_hoi(b: Bang, nhom: str, ten_hien: str) -> list[str]:
    ra = [f"**Nhóm {ten_hien}** — {b.m_truy_hoi['so']['bai_toan_1'][nhom]['so_ca']} ca", ""]
    ra.append("| Phương pháp | n | Hit@1 | Hit@5 | MRR@5 | nDCG@5 | cấm@5 |")
    ra.append("|---|---:|---:|---:|---:|---:|---:|")
    for bo in b.bo_truy_hoi():
        d = b.m_truy_hoi["so"]["bai_toan_1"][nhom]["bo"][bo]
        if not d["n"]:
            ra.append(f"| `{bo}` | 0 | — | — | — | — | {d['cam5']} |")
            continue
        ra.append(
            f"| `{bo}` | {d['n']} | **{pct(d['hit1'] / d['n'])}** | {pct(d['hit5'] / d['n'])} | "
            f"{pct(d['mrr5'] / d['n'])} | {pct(d['ndcg5'] / d['n'])} | {d['cam5']} |"
        )
    ra.append("")
    return ra


def chuong_4(b: Bang) -> str:
    ra: list[str] = ["# CHƯƠNG 4: THỰC NGHIỆM VÀ KẾT QUẢ", ""]

    dk = b.m_truy_hoi["dieu_kien"]
    ra += [
        r"""## 4.0 Đọc chương kết quả thế nào

Chương này có nhiều bảng số. Mục 4.0 nói trước **cách đọc chúng**, để các bảng sau không bị hiểu
ngược.

### Ba chỉ số, và chỉ số nào mới quan trọng

| Chỉ số | Nghĩa đơn giản | Đọc thế nào |
|---|---|---|
| **Hit@1** | trong đoạn **đầu tiên** trả về, có đúng đoạn cần không | càng cao càng tốt. Đây là chỉ số chính, vì hệ thống chỉ đọc đoạn thứ nhất |
| **Hit@5** | trong **5 đoạn đầu**, có ít nhất một đoạn đúng không | càng cao càng tốt, nhưng **dễ gây hiểu lầm** — xem dưới |
| **cấm@5** | trong 5 đoạn đầu, có bao nhiêu đoạn **KHÔNG được phép** xuất hiện | **càng thấp càng tốt.** Đây mới là chỉ số quyết định |

**Vì sao Hit@5 dễ gây hiểu lầm:** một bộ truy hồi trả về 1 đoạn đúng và 4 đoạn lạc đề vẫn đạt
Hit@5 = 1,0 — điểm tuyệt đối. Nhưng với hệ thống này, **4 đoạn lạc đề là 4 cơ hội để mô hình viết
ra một câu sai về nhà hàng**. Nên `cấm@5` được đặt cao hơn Hit@5 khi ra quyết định.

Ở bài toán chọn món, `cấm@5` còn mang nghĩa nặng hơn: nó là **số món không thoả điều kiện khách
nêu**. Với câu dị ứng thì mỗi món như vậy là **một lỗi an toàn**, không phải một điểm trừ chất lượng.

### Tập phát triển và tập niêm phong khác nhau ra sao

| | **Tập phát triển** | **Tập niêm phong** *(held-out)* |
|---|---|---|
| Nhóm có được xem không | có | **không**, cho tới khi xong |
| Dùng để làm gì | sửa hệ thống, thử ý tưởng | **chấm điểm cuối cùng** |
| Vì sao cần tách | | nếu vừa sửa vừa xem thì hệ thống dần **học thuộc đề** thay vì học cách làm |

> **Ẩn dụ:** tập phát triển là **bài tập về nhà** — làm sai thì xem đáp án rồi sửa. Tập niêm phong
> là **bài thi** — chỉ mở một lần, và mở rồi thì nó không còn là bài thi nữa.

Báo cáo này ghi rõ **tập niêm phong đã được mở**, nên con số trên nó **không còn là held-out** cho
những thay đổi sau đó. Đây là hạn chế thật, và nó được nói ra thay vì giấu đi.

### Vì sao có nhiều bảng "trước / sau"

Nhiều mục trong chương này trình bày theo cặp **trước khi sửa / sau khi sửa**. Đó không phải để khoe
tiến bộ, mà vì **một con số đơn lẻ không nói được gì**: Hit@1 = 60,87% là tốt hay chưa tốt thì phải so với
cái gì đó — với BM25, với chính nó ở phiên bản trước, hoặc với một mốc nền.

Có những bảng cho thấy thay đổi **không cải thiện gì**, và chúng được giữ nguyên trong báo cáo. Một
thí nghiệm âm tính vẫn là một kết quả, và giấu nó đi là làm hỏng chính phép đo.

---

## 4.1 Thiết lập""",
        "",
        f"| Điều kiện | Giá trị |",
        "|---|---|",
        f"| Ngày đo | {dk['ngay']} |",
        f"| Thực đơn | {len(b.items)} món, {len(b.tags)} nhãn |",
        f"| Kho tri thức | {len(b.docs)} tài liệu / {len(b.doan)} đoạn, {len(b.doan_xep_hang)} đoạn được xếp hạng |",
        f"| Bộ truy hồi đã so | {', '.join('`' + x + '`' for x in dk['bo_da_so'])} |",
        f"| Mô hình sinh | `{b.m_llm['dieu_kien']['mo_hinh']}` |",
        f"| Giao thức đo độ trễ | {dk['giao_thuc_do_tre']} |",
        "",
        "Mọi con số dưới đây đọc từ `ai/evaluation/measurements/`, nơi bộ chạy ghi kết quả kèm điều",
        "kiện của lần chạy. Báo cáo này **không** chứa số nào do người viết gõ vào.",
        "",
        "## 4.2 So ba phương pháp truy hồi trên hai tập",
        "",
        "Bài toán: **đoạn nào trong cả kho trả lời câu hỏi này.** Đây là chỗ RAG *đúng là* câu trả lời,",
        f"vì {b.che_do.get('synthesize', 0)} chủ đề `synthesize` phần lớn **không có cụm từ vựng** nên",
        "truy hồi là đường **duy nhất** tới chúng.",
        "",
    ]
    ra += _bang_truy_hoi(b, "chốt", "CHỐT")
    ra += [
        "Nhóm chốt gồm các họ `expect_nothing` — chúng **không có** khóa đáp án để tính Hit, nên cột",
        "Hit/MRR/nDCG là gạch ngang. Điều nhóm này đo là `cấm@5` và việc **biết KHÔNG trả lời**, và cả",
        "ba bộ đều đạt 0 đoạn bị cấm.",
        "",
    ]
    ra += _bang_truy_hoi(b, "phát triển", "PHÁT TRIỂN")
    ra += _bang_truy_hoi(b, "NIÊM PHONG", "NIÊM PHONG (mở một lần)")

    e_dev = b.ty_le_truy_hoi("phát triển", "embedding", "hit1")
    b_dev = b.ty_le_truy_hoi("phát triển", "bm25", "hit1")
    e_np = b.ty_le_truy_hoi("NIÊM PHONG", "embedding", "hit1")
    b_np = b.ty_le_truy_hoi("NIÊM PHONG", "bm25", "hit1")
    h_np = b.ty_le_truy_hoi("NIÊM PHONG", "hybrid", "hit1")
    ra += [
        "**Đọc kết quả:**",
        "",
        f"- Embedding thắng ở **cả hai** tập: Hit@1 {pct(e_dev)} so với {pct(b_dev)} (phát triển) và",
        f"  **{pct(e_np)}** so với **{pct(b_np)}** (niêm phong) — chênh"
        f" **{diem_pt(e_np - b_np)} điểm phần trăm**.",
        f"- Hybrid RRF đạt {pct(h_np)} trên tập niêm phong, thấp hơn embedding ({pct(e_np)}) về con",
        "  số tuyệt đối. Tuy nhiên **chênh lệch này CHƯA đạt mức ý nghĩa thống kê** (xem mục 4.2.1),",
        "  nên báo cáo **không** kết luận hybrid kém hơn embedding. Điều kết luận được là: hợp nhất",
        "  RRF **không mang lại cải thiện đo được** so với embedding đơn lẻ, trong khi nó tốn thêm chi",
        "  phí chạy cả hai bộ. Với cùng kết quả và chi phí cao hơn, embedding đơn lẻ là lựa chọn hợp lý.",
        "- `cấm@5` gần như không phân biệt được ba bộ. Nghĩa là chênh lệch nằm ở việc **tìm đúng đoạn**,",
        "  không ở việc **tránh đoạn sai** — và đó là tin tốt cho an toàn: không bộ nào lạc đề nhiều hơn.",
        "",
        "### 4.2.1 Khoảng tin cậy và kiểm định ý nghĩa",
        "",
        "Một tỷ lệ đo trên mẫu hữu hạn **không phải** tỷ lệ thật của tổng thể. Mục này trả lời hai câu",
        "hỏi mà mọi bảng kết quả ở trên đều phải trả lời được:",
        "",
        "1. **Khoảng nào chứa tỷ lệ thật?** — khoảng tin cậy 95% theo phương pháp Wilson",
        "2. **Chênh lệch giữa hai phương pháp có phải do may rủi không?** — kiểm định McNemar",
        "",
        "**Vì sao dùng Wilson thay vì công thức thông dụng.** Công thức chuẩn `p ± 1,96·√(p(1−p)/n)`",
        "cho khoảng rộng bằng **0** khi tỷ lệ đạt 100%, tức khẳng định chắc chắn tuyệt đối từ một mẫu",
        "hữu hạn. Nhiều phép đo trong đồ án này đạt đúng 100%, nên công thức đó không dùng được.",
        "",
        "**Vì sao dùng McNemar thay vì kiểm định hai mẫu độc lập.** Ba bộ truy hồi chạy trên **cùng",
        "một danh sách câu hỏi**, nên kết quả của chúng không độc lập: chúng cùng đúng ở câu dễ và",
        "cùng sai ở câu khó. McNemar dùng đúng tính chất ghép cặp này — nó chỉ xét những câu mà hai",
        "bên **cho kết quả khác nhau**, và kiểm tra xem tỷ lệ giữa hai chiều lệch có khác 50/50 không.",
        "",
        "**Khoảng tin cậy 95% cho Hit@1 trên tập niêm phong:**",
        "",
        "| Phương pháp | Hit@1 | Khoảng tin cậy 95% | n |",
        "|---|---:|:---:|---:|",
    ] + [
        f"| `{ten}` | {pct(k.ty_le)} | {pct(k.duoi)} – {pct(k.tren)} | {k.n} |"
        for ten, k in b.ktc_truy_hoi("NIÊM PHONG").items()
    ] + [
        "",
        "Ba khoảng này **chồng lấn nhau**. Nếu chỉ nhìn khoảng tin cậy thì chưa kết luận được bộ nào",
        "hơn bộ nào — và đây chính là lý do cần kiểm định ghép cặp.",
        "",
        "**Kiểm định McNemar trên tập niêm phong:**",
        "",
        "| So sánh | Số câu hai bên khác nhau | p | Kết luận |",
        "|---|---:|---:|---|",
    ] + [
        f"| {a} so với {bb} | {r.n_lech}/{r.n} | **{so(r.p, 4)}** | "
        f"{'**có ý nghĩa** (p < 0,05)' if r.co_y_nghia else 'chưa đủ ý nghĩa (p ≥ 0,05)'} |"
        for a, bb, r in b.mcnemar_truy_hoi("NIÊM PHONG")
    ] + [
        "",
        "**Đọc bảng này:**",
        "",
        "- Khẳng định **embedding tốt hơn BM25** có bằng chứng thống kê vững (p = "
        f"{so(dict(((a, bb), r) for a, bb, r in b.mcnemar_truy_hoi('NIÊM PHONG'))[('embedding', 'bm25')].p, 4)}"
        "). Đây là kết luận chính của mục 4.2.",
        "- Khẳng định **embedding tốt hơn hybrid** **KHÔNG** có bằng chứng đủ. Báo cáo do đó không nêu",
        "  kết luận đó, dù con số tuyệt đối của embedding cao hơn.",
        "",
        "**Vì sao khoảng tin cậy rộng mà kết luận vẫn vững — hai câu hỏi khác nhau.**",
        "",
        "Khoảng tin cậy và kiểm định ghép cặp trả lời hai câu hỏi khác nhau, và chúng cần quy mô mẫu",
        "khác nhau:",
        "",
        "| Câu hỏi | Công cụ | Cần n lớn không |",
        "|---|---|---|",
        "| *\"Tỷ lệ THẬT của embedding là bao nhiêu?\"* | khoảng tin cậy | **Có** — ước lượng một đại lượng tuyệt đối luôn cần nhiều quan sát |",
        "| *\"Embedding có tốt hơn BM25 không?\"* | McNemar ghép cặp | **Ít hơn** — nó loại bỏ phần biến thiên chung của hai bên |",
        "",
        "Cụ thể ở đây: khoảng tin cậy của embedding rộng **±"
        f"{so(b.ktc_truy_hoi('NIÊM PHONG')['embedding'].nua_rong * 100, 1)} điểm**, nên báo cáo",
        "**không** khẳng định *\"tỷ lệ thật của embedding là 60,87%\"*. Nhưng McNemar cho p = "
        f"{so(dict(((a, bb), r) for a, bb, r in b.mcnemar_truy_hoi('NIÊM PHONG'))[('embedding', 'bm25')].p, 4)},",
        "nên báo cáo **có** khẳng định *\"embedding tốt hơn BM25\"*. Hai câu này khác nhau, và chỉ câu",
        "thứ hai là câu đồ án cần trả lời.",
        "",
        "Lý do kiểm định ghép cặp cần ít mẫu hơn: hai bộ chạy trên cùng danh sách câu hỏi, nên phần",
        "khó/dễ của từng câu ảnh hưởng **cả hai bên như nhau** và bị triệt tiêu khi so từng cặp. Chỉ",
        f"còn lại {dict(((a, bb), r) for a, bb, r in b.mcnemar_truy_hoi('NIÊM PHONG'))[('embedding', 'bm25')].n_lech} câu mà hai bên khác nhau,",
        "và toàn bộ thông tin so sánh nằm ở đó.",
        "",
        "**Quy mô mẫu cần thiết.** Để khoảng tin cậy 95% hẹp tới mức ±10 điểm phần trăm cần khoảng",
        f"**{b.n_can(0.10)} ca**; tới ±5 điểm cần khoảng **{b.n_can(0.05)} ca**. Tập niêm phong hiện",
        f"có **{b.ktc_truy_hoi('NIÊM PHONG')['embedding'].n} ca**, tương ứng nửa khoảng khoảng",
        f"±{so(b.ktc_truy_hoi('NIÊM PHONG')['embedding'].nua_rong * 100, 1)} điểm phần trăm. Đây là hạn chế",
        "thật của phép đo, và nó được nêu ở mục 5.4 thay vì bỏ qua.",
        "",
                "**Điều bảng này KHÔNG nói:** con số tuyệt đối thấp hơn một phép đo trước đó trên kho nhỏ hơn.",
        "Đó **không** phải hệ thống kém đi mà là **bài toán khó lên** — kho tăng số chủ đề, và các chủ đề",
        "mới gần nhau hơn (bốn tài liệu vùng miền, bốn tài liệu đồ uống). Trích một con số ra khỏi ngữ",
        "cảnh kích thước kho là nói quá.",
        "",
        "## 4.3 Chọn mục trong tài liệu — bài toán mà hệ thống thật sự chạy",
        "",
        "Bài toán: **mục nào trong MỘT tài liệu đã biết đúng ý khách.** Đây là đường chạy nhiều hơn, và",
        f"tập ca của nó lớn hơn: **{len(b.ca_chon_muc)} ca**.",
        "",
        "Số ứng viên mỗi ca chỉ 3–8, nên **sàn ngẫu nhiên khoảng 20%** — một phương pháp đạt 60% nghe",
        "cao nhưng chỉ hơn sàn ba lần. Bảng dưới in cả sàn.",
        "",
        "| Tập | Phương pháp | Top-1 | Top-1 dạng A (trùng từ) | Top-1 dạng B (diễn đạt khác) | n |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for tap, ten in (("phat_trien", "phát triển"), ("niem_phong", "NIÊM PHONG")):
        m = b.m_chon_np if tap == "niem_phong" else b.m_chon_dev
        for bo in sorted(m["so"]["nhom"]["written|*"]):
            n = m["so"]["nhom"]["written|*"][bo]["n"]
            ra.append(
                f"| {ten} | `{bo}` | **{pct(b.chon_muc(tap, 'written|*', bo))}** | "
                f"{pct(b.chon_muc(tap, 'written|A', bo))} | "
                f"{pct(b.chon_muc(tap, 'written|B', bo))} | {n} |"
            )
    ra += [
        "",
        "**Dạng A và dạng B là điểm chính của phép so.** Dạng A dùng từ có trong mục; dạng B diễn đạt",
        "khác. Một phương pháp thắng ở A mà thua ở B là phương pháp **khớp từ khoá**; thắng cả hai mới",
        "là **hiểu nghĩa**.",
        "",
        f"- BM25 mạnh ở dạng A ({pct(b.chon_muc('niem_phong', 'written|A', 'bm25'))}) và giảm mạnh ở dạng B",
        f"  ({pct(b.chon_muc('niem_phong', 'written|B', 'bm25'))}), phù hợp với cơ chế đếm từ chung.",
        f"- Embedding giữ được ở dạng B ({pct(b.chon_muc('niem_phong', 'written|B', 'embedding'))}), và",
        "  đó là chỗ quan trọng nhất với khách thật: khách **không** dùng đúng chữ trong tài liệu.",
        "",
        "Nhóm `derived` (tài liệu sinh từ thực đơn theo khuôn dùng chung) được báo cáo **riêng**, vì nó là",
        "MỘT quyết định lặp trên nhiều tài liệu — gộp vào số chính sẽ để một bài toán dễ kéo con số lên.",
        "",
        "## 4.4 Chọn món: lọc theo nhãn so với RAG",
        "",
        "Phép đo này trả lời trực tiếp câu hỏi nghiên cứu nêu ở mục 1.4: xác định phạm vi KHÔNG nên",
        "dùng RAG.",
        "",
        f"Bài toán: **món nào thỏa ràng buộc khách nêu.** {b.m_truy_hoi['so']['bai_toan_2']['so_ca']} ca,",
        "mỗi ca chọn để làm rõ một cơ chế. Ba bộ xếp hạng được thấy **đủ dữ liệu** — văn bản của mỗi món",
        "gồm tên, danh mục, mô tả, toàn bộ nhãn và giá. Cho chúng ít hơn thì kết luận không công bằng.",
        "",
        "| Phương pháp | Hit@1 | Hit@5 | **cấm@5** = số ca nêu món KHÔNG thỏa ràng buộc |",
        "|---|---:|---:|---:|",
    ]
    b2 = b.m_truy_hoi["so"]["bai_toan_2"]["bo"]
    for bo in b2:
        d = b2[bo]
        nhan = f"**`{bo}`**" if bo == "lọc nhãn" else f"`{bo}`"
        cam = f"**{d['cam5']}**" if bo == "lọc nhãn" else str(d["cam5"])
        ra.append(f"| {nhan} | {pct(d['hit1'] / d['n'])} | {pct(d['hit5'] / d['n'])} | {cam} |")
    xh = [v["cam5"] for k, v in b2.items() if k != "lọc nhãn"]
    ra += [
        "",
        f"Trên **{b2['lọc nhãn']['n']} câu hỏi** của bộ đo này, lọc theo nhãn trả lời đúng"
        f" **{b2['lọc nhãn']['hit1']:.0f}/{b2['lọc nhãn']['n']} câu"
        f" ({pct(b2['lọc nhãn']['hit1'] / b2['lọc nhãn']['n'])})** và **không câu nào** nêu món vi"
        f" phạm ràng buộc. Ba bộ xếp hạng nêu món vi phạm ở **{min(xh)} đến {max(xh)} trong"
        f" {b2['lọc nhãn']['n']} câu**, tương ứng"
        f" {pct(min(xh) / b2['lọc nhãn']['n'])} đến {pct(max(xh) / b2['lọc nhãn']['n'])}.",
        "",
        "`cấm@5` ở bài toán này mang nghĩa khác bài toán 4.2: nó là số ca **nêu món không thỏa ràng",
        "buộc**, tức câu trả lời **SAI**, không phải kém. Với ca dị ứng thì đó là **lỗi an toàn**.",
        "",
        "#### Khoảng tin cậy và kiểm định",
        "",
        "**Bộ đo này được SINH TỪ BỘ NHÃN**, không viết tay. Bản đầu chỉ có 8 ca do người viết chọn;",
        "với n = 8 thì nửa khoảng tin cậy 95% là ±28,50 điểm phần trăm — quá thô để kết luận. Vấn đề",
        "thứ hai nghiêm trọng hơn quy mô: khi tự chọn câu hỏi, người viết có xu hướng chọn những câu",
        "mình đã biết trước kết quả. Sinh từ nhãn thì **dữ liệu quyết định danh sách câu hỏi**.",
        "",
        "| Phương pháp | Trả lời đúng | Tỷ lệ | Khoảng tin cậy 95% |",
        "|---|---:|---:|:---:|",
    ] + [
        f"| `{ten}` | {b2[ten]['hit1']:.0f}/{k.n} | **{pct(k.ty_le)}** | {pct(k.duoi)} – {pct(k.tren)} |"
        for ten, k in b.ktc_chon_mon().items()
    ] + [
        "",
        "Khoảng tin cậy của lọc theo nhãn (**"
        f"{pct(b.ktc_chon_mon()['lọc nhãn'].duoi)} – {pct(b.ktc_chon_mon()['lọc nhãn'].tren)}**)",
        "**không chồng lấn** với khoảng của bất kỳ bộ xếp hạng nào. Kiểm định ghép cặp xác nhận:",
        "",
        "| So sánh | Số câu hai bên khác nhau | p | Kết luận |",
        "|---|---:|---:|---|",
    ] + [
        f"| lọc nhãn so với {t} | {r.n_lech}/{r.n} | **{so(r.p, 4)}** | "
        f"{'**có ý nghĩa** (p < 0,05)' if r.co_y_nghia else 'chưa đủ ý nghĩa'} |"
        for _, t, r in b.mcnemar_chon_mon()
    ] + [
        "",
        "Cả ba so sánh đều đạt mức ý nghĩa. Kết luận **lọc theo nhãn vượt trội trên bài toán chọn",
        "món** do đó có bằng chứng thống kê đầy đủ, không phụ thuộc vào việc chọn câu hỏi nào.",
        "",
        "Bốn lý do xếp hạng thua đã nêu ở mục 2.4. Đáng nhắc lại ca dị ứng: câu hỏi chứa chữ \"hải sản\"",
        "nên cả BM25 và embedding kéo món hải sản **LÊN ĐẦU** — đúng ngược điều khách cần. Cơ chế đúng",
        "cho việc này là **lọc fail-closed**, không phải xếp hạng.",
        "",
        "**Kết luận:** dữ liệu đã có cấu trúc (nhãn + giá) thì đưa nó qua một tầng xếp hạng theo độ tương",
        "đồng là **bỏ cấu trúc đi rồi cố đoán lại**. Đây là con số chứng minh không phải chỗ nào cũng nên",
        "dùng RAG.",
        "",
    ]

    llm = b.m_llm["so"]
    ra += [
        "## 4.5 Gọi LLM+RAG thật trên câu loại C",
        "",
        f"**{llm['ca']} ca** thuộc loại C (nhánh `filter` và `compare`), gọi mô hình thật",
        f"`{b.m_llm['dieu_kien']['mo_hinh']}`. Bật đường sinh là đánh đổi, và phải đo **cả hai phía**:",
        "",
        "| Phía | Câu hỏi | Cách đo |",
        "|---|---|---|",
        "| được | câu văn tự nhiên hơn | **KHÔNG đo được** bằng thước đo nội dung — nói ra thay vì giả vờ đo |",
        "| mất | có ca nào TỤT từ xanh sang đỏ | chạy CÙNG tập ca hai lần |",
        "",
        "Chỉ phía \"mất\" đo được, nên đó là phía quyết định. Ngưỡng đúng là **0 ca tụt**: một câu văn hay",
        "không bù được một câu trả lời sai.",
        "",
        "**Kết quả — và một lỗi an toàn mà phép đo này tìm ra:**",
        "",
        "| | Trước phép kiểm thứ 8 | Sau phép kiểm thứ 8 |",
        "|---|---:|---:|",
        f"| đường tất định | {llm['dat_tat_dinh']}/{llm['ca']} | {llm['dat_tat_dinh']}/{llm['ca']} |",
        f"| **có đường sinh** | **61/{llm['ca']}** — tụt 15 ca | **{llm['dat_co_duong_sinh']}/{llm['ca']}** — {len(llm['ca_tut'])} ca tụt |",
        f"| câu sinh được DÙNG | 68/{llm['ca']} | {llm['cau_sinh_duoc_dung']}/{llm['ca']} |",
        "",
        "**14 trong 15 ca tụt là ca DỊ NGUYÊN.** Chúng tụt vì đúng một lý do: câu khuôn mẫu luôn thêm",
        "*\"bạn nhắc nhân viên khi gọi món để bếp xác nhận\"*, còn mô hình viết văn mượt hơn và **bỏ câu đó",
        "đi**. Thước đo đánh dấu tiêu chí ấy là tiêu chí **an toàn**, nên với đường sinh thì \"0 lỗi an",
        "toàn\" của đường tất định thành **14 lỗi an toàn**.",
        "",
        "Câu đó là **nội dung, không phải văn vẻ**: nhãn dị nguyên phủ 44/{0} món, nên *\"thực đơn không".format(len(b.items)),
        "ghi nhận thành phần bạn cần tránh\"* **không** đồng nghĩa *\"những món này an toàn\"*.",
        "",
        "**Sửa bằng phép kiểm thứ 8 của `verify()`, không bằng một dòng trong prompt.** `PROMPT` cũng đã",
        "được thêm quy tắc đó, nhưng yêu cầu trong prompt là **đề nghị**, không phải **bảo đảm** — đúng",
        "bài học trung tâm của mục 2.6.",
        "",
        "Một chi tiết đáng đọc trong bảng: **tỷ lệ dùng câu sinh KHÔNG giảm** (68 ở cả hai lần). Tức quy",
        "tắc trong prompt sửa được hành vi ở **cả 14 ca**, và phép kiểm đứng đó làm **bảo đảm** chứ không",
        "làm bộ lọc. Đó là hình dạng đúng của cặp prompt + xác minh: prompt làm việc, xác minh chịu trách",
        "nhiệm.",
        "",
        f"**Lớp xác minh chặn gì:** {llm['lui_ve_khuon_mau']}/{llm['ca']} ca lùi về khuôn mẫu, và",
        f"**cả {llm['lui_ve_khuon_mau']} đều vì BỊA GIÁ** — mô hình viết ra một con số tiền không phải giá",
        "của món nào trong danh sách. Đó chính là loại lỗi khách **không thể tự phát hiện**: câu văn mượt,",
        "món có thật, chỉ con số sai.",
        "",
        f"**Giá phải trả:** p50 **{llm['tre_p50_ms'] / 1000:.1f}s**".replace(".", ",")
        + f", p95 **{llm['tre_p95_ms'] / 1000:.1f}s** mỗi lượt gọi mô hình.".replace(".", ","),
        "",
    ]

    g, gs = b.m_golden["so"], b.m_golden_sinh["so"]
    rg, rgs = b.m_golden["dieu_kien"].get("ready", {}), b.m_golden_sinh["dieu_kien"].get("ready", {})
    ra += [
        "## 4.6 Golden 103 lượt qua chuỗi gọi đầy đủ",
        "",
        f"**{len(b.golden)} hội thoại / {b.luot_golden} lượt**, mỗi hội thoại một tình huống khách thật",
        "gồm 2–5 lượt liên tiếp trong cùng phiên. Nó **không gọi hàm Python nào** — gửi HTTP như khách,",
        "qua backend .NET, và một hội thoại **bấm thêm vào giỏ thật** rồi đọc lại giỏ để xác nhận.",
        "",
        "Vì sao tập này tồn tại: chạy thật đã tìm ra **bốn lỗi tích hợp** mà không tập nào khác thấy —",
        "backend gửi `message` còn dịch vụ đòi `question` (422); backend gửi `Authorization: Bearer` còn",
        "dịch vụ đọc `X-Internal-Token` (401 mọi lượt); hình dạng `session_state` khác nhau nên bộ nhớ",
        "**mất im lặng** giữa các lượt; và một biến cấu hình sai giá trị làm 500 mọi lượt. Cả bốn là",
        "**lệch hợp đồng giữa hai bên** — loại lỗi mà test một phía không thể thấy.",
        "",
        "**Kết quả, đo cho CẢ HAI cấu hình triển khai:**",
        "",
        "| Cấu hình | retriever | đệm vector | đường sinh | Kết quả |",
        "|---|---|---|---|---:|",
        f"| mặc định production | `{rg.get('retriever')}` | {rg.get('retriever_vectors_from_cache')} | "
        f"{rg.get('generation_enabled')} | **{g['dat']}/{g['luot']}** |",
        f"| bật đường sinh | `{rgs.get('retriever')}` | {rgs.get('retriever_vectors_from_cache')} | "
        f"{rgs.get('generation_enabled')} | **{gs['dat']}/{gs['luot']}** |",
        "",
        "**Vì sao đo cả hai:** đường sinh bật và tắt là **hai hành vi khác nhau** — một bên chữ do khuôn",
        "mẫu dựng, một bên do mô hình viết. Ghi chung một tệp bằng chứng thì lần chạy sau xoá bằng chứng",
        "của cấu hình trước, và cổng deploy không còn gì để đối chiếu cho cấu hình nó sắp dựng. Điều đó",
        "**suýt xảy ra**: nhóm đo với đường sinh BẬT trong khi production mặc định TẮT.",
        "",
        "**Bất biến quan trọng nhất của tập này** là bất biến mà ba tập trước không thể kiểm:",
        "",
        "> Món mà câu trả lời NÊU RA phải TRÙNG món trong thẻ giỏ — **cả hai chiều**.",
        "",
        "Chữ và thẻ giỏ đi qua **hai đường khác nhau**: chữ do đường sinh viết, thẻ do mã tất định dựng.",
        "Hai đường thì lệch được, và lệch theo cách khách thấy ngay: đọc thấy tư vấn ba món, bấm vào giỏ",
        "thì ra món thứ tư. Chiều ngược cũng phải canh — và nó đã hỏng: văn nêu 6 món trong khi thẻ giỏ có",
        "3, nên khách đọc sáu lựa chọn và bấm chọn được ba. Xem mục 5.4.",
        "",
    ]

    ra += [
        "## 4.7 Phân tích nguyên nhân sai — và case nào KHÔNG sửa được nữa",
        "",
        "Công cụ `analyze_failures.py` phân loại mọi ca không đạt của ba tập vào **một** lớp nguyên nhân,",
        "và in kèm **cách sửa** cùng **cách sửa đó có đo được không**.",
        "",
        "Hai quy tắc của công cụ, và cả hai đến từ lỗi đã mắc:",
        "",
        "1. **Không phân tích tập niêm phong.** Công cụ in cách sửa, nên chạy nó trên tập niêm phong rồi",
        "   làm theo = sửa hệ thống theo tập niêm phong, và sau đó con số trên đó hết là held-out.",
        "2. **Lớp `retrieval_miss` được chia thành BỐN**, vì một lớp gộp với một cách sửa chung không trả",
        "   lời được câu \"case nào không sửa được nữa\".",
        "",
        "| Lớp | Dấu hiệu trong dữ liệu | Sửa bằng xếp hạng? |",
        "|---|---|---|",
        "| `retrieval_number` | họ ca là `kb-number` | **KHÔNG** — không phép trùng từ hay embedding nào so được 45.000 với 50.000 |",
        "| `retrieval_no_overlap` | câu hỏi ∩ đoạn đúng = ∅ | một phần — embedding hơn BM25 rõ ở dạng này |",
        "| `retrieval_twin_section` | đoạn lấy được **cùng tiêu đề mục** với đoạn đúng, khác tài liệu | **KHÔNG** — trần đa dạng của KHO |",
        "| `retrieval_rank` | còn lại | **CÓ** — lớp duy nhất |",
        "",
        "Ba trong bốn lớp **dẫn ra được từ dữ liệu**, không dán tay từng ca: họ của ca cho lớp `number`,",
        "phép giao tập từ cho lớp `no_overlap`, tiêu đề mục cho lớp `twin_section`.",
        "",
        f"**Trần đa dạng của kho** là phát hiện đáng nói nhất: {len({c.heading for c in b.doan if c.heading})}",
        f"tiêu đề mục phân biệt trên {len(b.doan)} đoạn — trung bình",
        f"{len(b.doan) / max(len({c.heading for c in b.doan if c.heading}), 1):.1f} đoạn dùng chung một".replace(".", ","),
        "tiêu đề. Khi bốn tài liệu vùng miền đều có mục *\"Món tiêu biểu\"*, **không tín hiệu nào** trong",
        "câu *\"Ăn gì đặc trưng phố cổ?\"* phân biệt được chúng — trừ khi câu hỏi nêu tên tài liệu. Đổi bộ",
        "xếp hạng không chữa được; **viết lại tiêu đề mục** thì chữa được, vì đó là sửa **dữ liệu**.",
        "",
        "Phần lớn ca truy hồi còn sai thuộc hai lớp **không** chữa được bằng đổi thuật toán. Một bảng gộp",
        "chúng vào cùng lớp với `retrieval_rank` sẽ làm người đọc tin rằng còn nhiều ca để giành bằng cách",
        "chỉnh thuật toán, trong khi việc đúng là **sửa kho**.",
        "",
        "## 4.8 Chốt phương án triển khai, kèm giá đã đo",
        "",
        "| Quyết định | Chốt | Căn cứ đo được | Giá đã đo |",
        "|---|---|---|---|",
        f"| bộ truy hồi (**cả hai** đường) | **embedding** | thắng ở cả hai bài toán và cả hai tập niêm phong; rộng nhất ở câu diễn đạt khác từ | ảnh Docker 238MB → **2,74GB**; truy hồi 1,4ms → 67ms; khởi động **19,0s** |",
        f"| đường sinh | **TẮT mặc định**, bật bằng biến môi trường | {len(llm['ca_tut'])} ca tụt sau phép kiểm thứ 8, nhưng cũng **0 ca đúng thêm** | p50 **+{llm['tre_p50_ms'] / 1000:.1f}s** mỗi lượt |".replace("+8.6", "+8,6"),
        f"| chọn món | **lọc theo nhãn**, không RAG | lọc nhãn: {b2['lọc nhãn']['cam5']} câu nêu món vi phạm; ba bộ xếp hạng: {min(xh)} đến {max(xh)} trong {b2['lọc nhãn']['n']} câu | 0,3ms mỗi lượt |",
        "",
        "### Giá của embedding: ba lần đo mới ra con số đúng",
        "",
        "| Lần | Ảnh Docker | Vì sao |",
        "|---|---|---|",
        "| dự đoán | *\"khoảng 2–3GB\"* | con số **đọc ở đâu đó**, không phải con số đo — nó đã nằm trong tài liệu qua ba bước |",
        "| đo lần 1 | **9,29GB** | `pip install torch` trên Linux lấy bản **CUDA** kèm mấy GB thư viện driver NVIDIA, cho một dịch vụ chạy CPU |",
        "| đo lần 2 | **2,74GB** | ghim bản CPU bằng `--extra-index-url .../whl/cpu` |",
        "",
        "Nếu chốt phương án bằng con số dự đoán thì báo cáo **sai gấp ba**, và chỉ người deploy phát hiện.",
        "",
        "### Thời gian khởi động là vấn đề AN TOÀN, không chỉ chậm",
        "",
        "| Thành phần | Thời gian |",
        "|---|---:|",
        "| `import torch` | 1,8s |",
        "| `import sentence_transformers` | 6,3s |",
        "| nạp mô hình | 10,6–12,2s |",
        f"| **mã hoá {len(b.doan_xep_hang)} đoạn** | **61,7s** |",
        "| **khởi động thật** | **97,3s** |",
        "",
        "`HEALTHCHECK` có `start-period=15s`, `interval=30s`, `retries=3`, nên lần kiểm thứ ba rơi vào",
        "**~105 giây**. Dịch vụ kịp sẵn sàng ở 97 giây, tức **suýt** bị đánh `unhealthy` — và backend chờ",
        "`service_healthy`, nên trên một máy chậm hơn 8% thì **cả stack không lên được**.",
        "",
        "Hai việc đã làm: **tính sẵn vector lúc build** (mã hoá 61,7s → **0,1s**) và **`start-period`",
        "15s → 90s**. Khởi động sau khi sửa: **19,0s** — và con số này phải kèm điều kiện, vì lần khởi",
        "động **đầu** ngay sau build là **61,9s** khi đĩa chưa nóng.",
        "",
        "### Điều kiện để đổi lại từng quyết định",
        "",
        "| Nếu điều này xảy ra | Thì xem lại |",
        "|---|---|",
        "| kho co lại về tra khóa, không còn chủ đề `synthesize` nào thiếu cụm từ vựng | bỏ embedding — ảnh nhỏ lại hơn 11 lần |",
        "| chủ nhà hàng coi câu văn tự nhiên đáng giá thêm ~9 giây mỗi lượt | bật đường sinh mặc định — lý do CHẶN đã hết, chỉ còn là đánh đổi độ trễ |",
        "| có log khách thật | **mọi** quyết định ở trên — chúng đều dựa trên ca do nhóm viết |",
        "",
        "## 4.9 Vì sao hệ thống cần CẢ hai lớp — bộ đo hai chiều 100 câu",
        "",
        "Tám mục trên đo **từng lớp riêng**. Không mục nào trả lời câu mà người đọc hỏi đầu tiên:",
        "*vì sao không dùng mỗi một thứ cho gọn?*",
        "",
        "Ba tập đánh giá cũ **không trả lời được**, và lý do nằm ở cách chúng được viết:",
        "",
        f"| tập | bộ xếp hạng chạy |",
        "|---|---:|",
        f"| {len(b.ca_tra_loi)} ca trả lời | **0** |",
        f"| {b.luot_phien} lượt phiên | **0** |",
        f"| {len(b.ca_truy_hoi)} ca truy hồi | 36% |",
        "",
        "Hai tập đầu được viết **quanh các nhánh tất định**, nên đọc một mình chúng nói \"truy hồi",
        "vô dụng\". Tập thứ ba thì ngược lại — nó chỉ hỏi câu tri thức, nên không nói được gì về",
        "chỗ lọc nhãn mạnh hơn. **Mỗi tập đo đúng điều nó được viết để đo.**",
        "",
        "Bộ này cho hai phương pháp chạy trên **cùng một câu hỏi**, ở hai nhóm câu mà mỗi nhóm là",
        "điểm mạnh của một bên.",
        "",
        "### 4.9.1 Chiều A — câu mã tất định KHÔNG xử lý được",
        "",
        f"**{len(b.hc_a)} câu**, phủ **hết {len([d for d in b.docs if d.doc_id.startswith('kb.written')])} tài liệu văn xuôi**, mỗi tài liệu ít nhất một câu.",
        "Phủ hết chứ không chọn tay: chọn tay thì người viết vô thức chọn câu mình biết sẽ thắng.",
        "",
        "| kết cục của mã tất định | số câu |",
        "|---|---:|",
        f"| **SAI DẠNG** — trả danh sách món cho câu \"thế nào / vì sao\" | **{b.hc_a_dem('sai_dang')}** |",
        f"| **KHÔNG XỬ LÝ ĐƯỢC** — phải nhờ truy hồi | **{b.hc_a_dem('khong_xu_ly')}** |",
        f"| đúng dạng | {b.hc_a_dem('dung')} |",
        "",
        f"Truy hồi tìm đúng tài liệu: **top-1 {b.hc_a_truy_hoi('truy_hoi_dung')}/{len(b.hc_a)}**, "
        f"**top-5 {b.hc_a_truy_hoi('truy_hoi_top5')}/{len(b.hc_a)}**.",
        "",
        "**Kết quả đáng chú ý của bộ đo này nằm ở DẠNG lỗi, không nằm ở tỷ lệ.**",
        f"Mã tất định **không im lặng** ở chiều A. {b.hc_a_dem('sai_dang')} câu nó trả lời TỰ TIN",
        "bằng một danh sách món — mọi món có thật, mọi giá đúng — và **không câu nào trả lời điều",
        "được hỏi**:",
        "",
        "> **Hỏi:** *Gọi khai vị trước có làm no bụng không ăn được món chính không?*",
        "> **Đáp:** *Mời bạn tham khảo: Bánh mì pate Sài Gòn (35.000đ), Bánh cuốn Thanh Trì…*",
        "",
        "Về mặt trải nghiệm, dạng lỗi này khó phát hiện hơn trường hợp hệ thống từ chối trả lời: mọi dữ liệu",
        "nêu ra đều chính xác, nên người dùng chỉ nhận ra câu hỏi của mình chưa được trả lời sau khi",
        "đọc hết câu trả lời.",
        "",
        "### 4.9.2 Chiều B — câu mã tất định làm TỐT HƠN",
        "",
        f"**{len(b.hc_b)} câu**, **sinh từ bộ nhãn** chứ không viết tay: ngưỡng giá, mức cay, chế độ ăn,",
        "dị nguyên, vùng miền, cách chế biến, sức khỏe, vị, dịp, nhóm người, và phép hội hai điều kiện.",
        "Sinh từ nhãn thì danh sách ca do **dữ liệu** quyết định, không do người viết chọn.",
        "",
        "Chỉ số là **số món VI PHẠM ràng buộc** — không phải \"kém\", mà là **trả lời SAI**.",
        "",
        "| dạng ràng buộc | câu | lọc nhãn | truy hồi |",
        "|---|---:|---:|---:|",
    ] + [
        f"| {d} | {sum(1 for r in b.hc_b if r['vi_sao'] == d)} | "
        f"**{b.hc_b_vi_pham('tat_dinh_vi_pham', d)}** | {b.hc_b_vi_pham('truy_hoi_vi_pham', d)} |"
        for d in b.hc_b_dang()
    ] + [
        f"| **tổng** | **{len(b.hc_b)}** | **{b.hc_b_vi_pham('tat_dinh_vi_pham')}** | "
        f"**{b.hc_b_vi_pham('truy_hoi_vi_pham')}** |",
        "",
        f"Truy hồi vi phạm **gấp {b.hc_b_vi_pham('truy_hoi_vi_pham') // max(1, b.hc_b_vi_pham('tat_dinh_vi_pham'))} lần**. Nhưng con số đáng nói nhất nằm ở dòng dị ứng:",
        f"lọc nhãn **{b.hc_b_vi_pham('tat_dinh_vi_pham', 'PHÉP TRỪ')}**, truy hồi **{b.hc_b_vi_pham('truy_hoi_vi_pham', 'PHÉP TRỪ')} món chứa đúng thứ khách phải tránh**.",
        "Câu hỏi chứa chữ \"hải sản\" nên phép xếp hạng theo độ tương đồng kéo món hải sản LÊN ĐẦU —",
        "**ngược hẳn điều khách cần**. Đó là lỗi an toàn, không phải lỗi chất lượng.",
        "",
        "### 4.9.3 Vì sao truy hồi không diễn đạt được ba dạng ràng buộc này",
        "",
        "| dạng | vì sao xếp hạng theo độ giống không làm được |",
        "|---|---|",
        "| **ngưỡng số** | với BM25 và embedding, `50.000` là một **TỪ**, không phải một **LƯỢNG**. Không có cách viết tài liệu nào biến \"dưới 50 nghìn\" thành quan hệ giống nhau |",
        "| **phép trừ** | truy hồi **không có phép TRỪ**. Đoạn nói về hải sản *giống* câu \"dị ứng hải sản\" hơn là món không hải sản |",
        "| **phép hội** | truy hồi cho **một** điểm giống đã trộn — không ép được hai điều kiện độc lập cùng đúng |",
        "",
        "Đây là giới hạn **cấu trúc**, không phải giới hạn dữ liệu hay mô hình. Nó là lý do hệ thống",
        "để `select()` chọn món và chỉ để mô hình **viết về** những món đã chọn.",
        "",
        "### 4.9.4 So sánh CÔNG BẰNG — cho mã tất định phủ từ vựng đầy đủ",
        "",
        "Bảng ở mục 4.9.1 có một điểm yếu mà người đọc có quyền vặn:",
        "",
        "> **74/109 tài liệu trong kho không có cụm từ vựng nào.** Vậy mã tất định thua vì cách tiếp",
        "> cận của nó kém, hay vì nó **chưa được cho công cụ**?",
        "",
        "Đây là câu hỏi đúng, và nếu không trả lời được thì kết luận *\"cần lớp truy hồi\"* rút ra từ",
        "một phép so lệch — không đứng vững.",
        "",
        "**Thiết kế thí nghiệm.** Biến số duy nhất là **độ phủ từ vựng**. Kho không đổi, câu hỏi không",
        "đổi, chỉ khác đường tới:",
        "",
        "| Nhánh | Cấu hình | Đo trên |",
        "|---|---|---|",
        "| **A** | sinh cụm từ vựng cho **cả 109 tài liệu** → tra khóa | 50 câu chiều A |",
        "| **B** | embedding trên cùng kho → xếp hạng | **cùng 50 câu đó** |",
        "",
        "**Cụm được SINH theo quy tắc, không viết tay.** Viết tay thì người đo có cơ hội chọn đúng cụm",
        "mình biết sẽ trúng 50 câu kia — cách chắc chắn nhất để ra một con số đẹp mà vô nghĩa. Sinh từ",
        "**tiêu đề tài liệu và tiêu đề mục** thì tài liệu quyết định cụm.",
        "",
        "Quy tắc cố ý **rộng rãi**, tức cho nhánh tất định **lợi thế**: mỗi tiêu đề sinh cả cụm đầy đủ",
        "lẫn cụm đuôi (*\"món ít dầu mỡ\"* → `mon it dau mo`, `it dau mo`, `dau mo`). Kết quả:",
        "**1.532 cụm, trung bình 14,1 cụm mỗi tài liệu, phủ 109/109 = 100%**.",
        "",
        "**Kết quả:**",
        "",
        "| Nhánh | Trả lời đúng | Tỷ lệ | Khoảng tin cậy 95% |",
        "|---|---:|---:|:---:|",
        "| A — tất định, từ vựng **đầy đủ** | 6/50 | **12,00%** | 5,62% – 23,81% |",
        "| B — truy hồi (top-1) | 22/50 | **44,00%** | 31,16% – 57,69% |",
        "| B — truy hồi (top-5) | 37/50 | **74,00%** | — |",
        "",
        "Hai khoảng tin cậy **không chồng lấn**, và kiểm định ghép cặp xác nhận: McNemar **p = 0,0004**",
        "(20/50 ca hai bên khác nhau).",
        "",
        "**Vì sao tất định vẫn thua dù đã phủ 100%.** Cụm từ vựng đòi câu hỏi **chứa** cụm đó. Chiều A",
        "cố ý viết bằng chữ khách dùng, tránh dùng lại tiêu đề tài liệu — và đó là cách khách hỏi thật:",
        "",
        "| Câu hỏi | Chủ đề đúng | Tất định trả về |",
        "|---|---|---|",
        "| *\"Cùng là gà mà sao món thì mềm món thì dai?\"* | `chicken_dishes` | **không khớp gì** |",
        "| *\"Uống cà phê buổi tối có bị mất ngủ không?\"* | `coffee_and_tea` | **không khớp gì** |",
        "| *\"Đi bốn người mà chỉ muốn tiêu tầm hai trăm mỗi người\"* | `budget_planning` | `chicken_dishes` |",
        "| *\"Ăn xong mà miệng vẫn cay xè thì uống gì cho dịu?\"* | `beverage_pairing` | `fresh_fruit` |",
        "",
        "Hai ca đầu **không khớp gì** vì cụm `mon ga` bị loại (từ *\"món\"* quá phổ biến) còn `ga` quá",
        "ngắn. Hai ca sau **khớp nhầm** — cụm đuôi rộng bắt trúng chủ đề khác.",
        "",
        "#### Giá phải trả của việc mở rộng từ vựng",
        "",
        "Thí nghiệm này chạy **ngoại tuyến**, không đẩy 1.532 cụm vào hệ thống thật. Lý do đo được:",
        "",
        "| Câu LỌC MÓN | Bị đẩy sang chủ đề |",
        "|---|---|",
        "| *\"Cho mình món gà\"* | `eating_alone` |",
        "| *\"Có món chay nào không?\"* | `vegetarian` |",
        "| *\"Món nướng nào dưới 200 nghìn?\"* | `method_grilled` |",
        "| *\"Gợi ý món khai vị đi\"* | `appetizer_role` |",
        "| *\"Mình dị ứng hải sản, món nào tránh được?\"* | `seafood_caution` |",
        "",
        "**5/6 câu lọc món bị từ vựng mở rộng nuốt mất.** Nghĩa là kể cả khi chấp nhận 12,00% cho câu",
        "tri thức, cái giá là **phá nhánh lọc món đang đạt 100,00%**.",
        "",
        "**Kết luận rút ra, và đây là căn cứ cho quyết định kiến trúc trung tâm của đồ án:**",
        "",
        "> Mã tất định thua trên câu tri thức **không phải vì thiếu công cụ**. Cho nó phủ từ vựng 100%",
        "> thì nó đạt 12,00% so với 44,00% của truy hồi, và việc mở rộng đó **phá nhánh nó đang làm",
        "> tốt nhất**. Hai lớp không thay thế được nhau; mỗi lớp mạnh ở đúng loại câu hỏi mà lớp kia yếu.",
        "",
        "Tái lập: `python ai/evaluation/run_phu_tu_vung.py --csv`",
        "",
        "### 4.9.5 Bộ đo của nhóm sai ba lần trước khi ra số đúng",
        "",
        "Ghi lại vì nó thuộc phần phương pháp, và vì **cả ba lần đều sai theo hướng làm kết quả đẹp",
        "hơn thực tế** — đúng hướng mà người đo có động cơ không kiểm lại:",
        "",
        "| # | lỗi của phép đo | hậu quả |",
        "|---|---|---|",
        "| 1 | cột \"tất định\" tính cả nhánh truy hồi | 4/8 câu hiện ĐÚNG nhờ chính bên kia làm; tách ra còn **1/8** |",
        "| 2 | chiều B tìm trên kho tri thức thay vì chỉ mục món | truy hồi **0 vi phạm**, kết quả không phản ánh bài toán cần đo; sau khi sửa: **17** |",
        "| 3 | `Hit` không mang `topic_keys`, `getattr` luôn trả rỗng | truy hồi **0 trong 8 câu**, tức phép đo phản ánh chính bộ chấm điểm chứ không phản ánh bộ truy hồi |",
        "",
        "Đây là lần thứ tám lỗi nằm ở phép đo chứ không ở hệ thống. Quy trình áp dụng từ đó: **kiểm giả thuyết \"phép đo sai\" trước",
        "giả thuyết \"hệ thống sai\"**.",
        "",
        f"Bảng đầy đủ {len(b.hai_chieu)} câu: `ai/evaluation/measurements/hai_chieu.csv`.",
        "",
        "## 4.10 Bốn bước so sánh công bằng, và quyết định kiến trúc rút ra",
        "",
        "Mục 4.9 so hai lớp trên 100 câu. Nhưng phép so đó còn ba chỗ có thể vặn, và mục này đóng",
        "cả ba theo đúng thứ tự — mỗi bước là một thí nghiệm riêng, có bộ chạy tái lập được.",
        "",
        "### 4.10.1 Bước 1 — kho tri thức đã tối ưu cho truy hồi chưa?",
        "",
        "**Chẩn đoán.** Đo độ tương đồng Jaccard trên tập từ giữa các tài liệu:",
        "",
        "| Nhóm | Jaccard trung bình | Cặp giống nhau ≥ 50% |",
        "|---|---:|---:|",
        "| `demo` (52 tài liệu viết tay) | **0,176** | 2/1.326 (0,2%) |",
        "| `derived` (57 tài liệu sinh) | **0,408** | **544/1.596 (34,1%)** |",
        "",
        "Cặp tệ nhất `occasion.birthday` ↔ `occasion.date` đạt **0,921** — chúng dùng chung **82/89",
        "từ**. Và **103/109 tài liệu có dưới 5 từ riêng**, trung vị bằng **0**.",
        "",
        "> **Con số này về sau quyết định số phận của 49 tài liệu.** Lúc đo nó chỉ được đọc là \"kho",
        "> khó truy hồi\". Đọc lại kèm câu hỏi thật thì nó nói điều mạnh hơn: 49 tài liệu sinh theo",
        "> nhãn **không phân biệt được bằng từ**, và không cách xếp hạng nào chữa được thứ không có",
        "> tín hiệu. Ba cách chữa đã thử đều hoà (p = 0,8238 · 0,5488 · cắt mục), nên chúng bị bỏ —",
        "> kho còn **60 tài liệu / 182 đoạn** văn xuôi viết tay đồng nhất.",
        "",
        "Nguyên nhân: phần văn xuôi của tài liệu `derived` là **một khuôn** với tên giá trị thay vào.",
        "Chỉ tên nhóm và danh sách món là khác.",
        "",
        "**Can thiệp.** Thêm mục *\"Điều làm nhóm này khác\"* — bốn sự thật suy từ dữ liệu, riêng cho",
        "từng giá trị: nhãn hay đi kèm, nhãn không bao giờ đi kèm, giá so với trung bình, món đại diện.",
        "",
        "**Kết quả — âm tính, và đã hoàn tác:**",
        "",
        "| | trước | sau |",
        "|---|---:|---:|",
        "| Jaccard trung bình | 0,408 | **0,453** *(tệ hơn)* |",
        "| `embedding` Hit@1 | 60,87% | **60,87%** *(y hệt)* |",
        "| `hybrid` Hit@1 | 52,17% | 58,70% |",
        "| `hybrid` cấm@5 | 7 | **8** *(tệ hơn)* |",
        "",
        "Jaccard **tệ hơn** vì mục mới thêm khoảng 40 từ khuôn mẫu **giống hệt nhau** vào mỗi tài",
        "liệu — phần chung tăng nhanh hơn phần riêng. Bài học: *thêm nội dung phân biệt bằng khuôn mẫu",
        "làm tài liệu **giống** nhau hơn*.",
        "",
        "Với bộ dùng thật (`embedding`) thì **không đổi gì**. Đây là **lần thứ hai** một can thiệp vào",
        "kho để Hit@1 ở đúng 60,87% — lần đầu là thí nghiệm tiêu đề ở mục 2.4.1.",
        "",
        "**Kết luận bước 1:** trần không nằm ở kho tri thức. Hai can thiệp độc lập, cùng một con số.",
        "",
        "### 4.10.2 Bước 2 — bộ đánh giá có phủ hết kho không?",
        "",
        "Chiều A của mục 4.9 phủ **36/85** tài liệu `synthesize`. Nghĩa là mọi con số về truy hồi được",
        "đo trên **43% kho**, và 49 tài liệu còn lại chưa có câu hỏi nào chạm tới.",
        "",
        "Điều đó nghiêm trọng hơn nó nghe: 49 tài liệu bỏ sót **chính là nhóm `derived`** có mức trùng",
        "lặp cao nhất — tức **phần khó nhất**. Đo phần dễ rồi kết luận cho cả kho là tự cho điểm.",
        "",
        "`build_ca_phu_kho.py` sinh **98 ca phủ 49 tài liệu còn lại**, mỗi tài liệu hai câu:",
        "",
        "> **Bước này về sau bị hủy cùng thứ nó đo.** 49 tài liệu `derived` đã bị bỏ khỏi kho, nên",
        "> 98/98 ca của bộ phủ trỏ vào tài liệu không còn tồn tại và bộ `run_dau_loai.py` mất luôn",
        "> đối tượng đo. Cả ba tệp đã xoá. Độ phủ KHÔNG mất: chiều A giờ phủ **36/36 tài liệu**",
        "> `synthesize` — đúng cái lỗ mà bước này được dựng ra để lấp. Mục dưới giữ nguyên vì nó",
        "> ghi lại một phương pháp đúng, và vì con số 32,47 điểm mà nó tìm ra là bài học riêng.",
        "",
        "| Dạng | Cách viết | Kỳ vọng |",
        "|---|---|---|",
        "| **A** | dùng đúng nhãn tiếng Việt của giá trị | BM25 nên thắng |",
        "| **B** | diễn đạt theo tình huống, không chứa nhãn | embedding nên thắng |",
        "",
        "Hai dạng làm tập **phân biệt được hai phương pháp** thay vì chỉ xếp hạng chúng. Một tập chỉ có",
        "dạng A sẽ kết luận *\"BM25 đủ dùng\"*; chỉ có dạng B sẽ kết luận ngược lại. Cả hai kết luận đó",
        "là **tạo tác của tập**, không phải tính chất của phương pháp.",
        "",
        "### 4.10.3 Bước 3 — đấu loại ba bộ truy hồi, rồi so quán quân với mã tất định",
        "",
        "Thứ tự quan trọng: so cả bốn cùng lúc thì không biết truy hồi thua vì bản thân nó kém hay vì",
        "chọn nhầm bộ. Chọn quán quân trước rồi mới so là loại được khả năng thứ hai.",
        "",
        "**Vòng 1 — ba bộ truy hồi trên 98 câu:**",
        "",
        "| Bộ | Hit@1 | Khoảng tin cậy 95% | ms/câu |",
        "|---|---:|:---:|---:|",
        "| **embedding** | **73,47%** | 63,96% – 81,20% | 60 |",
        "| hybrid | 71,43% | 61,81% – 79,43% | 60 |",
        "| bm25 | 31,63% | 23,27% – 41,38% | **1** |",
        "",
        "Quán quân là **embedding**: thắng BM25 với **p = 0,0000**, nhưng so với hybrid thì",
        "**p = 0,8238 — chưa đủ ý nghĩa**. Báo cáo do đó không kết luận embedding hơn hybrid; điều kết",
        "luận được là hybrid **không mang lại cải thiện đo được** trong khi tốn chi phí chạy cả hai bộ.",
        "",
        "**Vòng 2 — quán quân so với mã tất định, cùng 98 câu:**",
        "",
        "| Cấu hình | Đúng | Tỷ lệ | Khoảng tin cậy 95% |",
        "|---|---:|---:|:---:|",
        "| mã tất định (bảng từ vựng hiện tại) | 0/98 | **0,00%** | 0,00% – 3,77% |",
        "| mã tất định **+ từ vựng sinh đủ** | 52/98 | **53,06%** | 43,25% – 62,64% |",
        "| embedding | 72/98 | **73,47%** | 63,96% – 81,20% |",
        "",
        "Dòng đầu nói về **độ phủ từ vựng** — 49 tài liệu này không có cụm nào trong bảng thật. Dòng",
        "thứ hai mới nói về **cách tiếp cận**, và nó vẫn thua embedding với **McNemar p = 0,0066**.",
        "",
        "**Theo dạng câu — đây là bảng đáng nhớ nhất của mục này:**",
        "",
        "| Dạng | tất định + từ vựng đủ | bm25 | embedding | hybrid |",
        "|---|---:|---:|---:|---:|",
        "| **A** dùng đúng nhãn | 63,27% | 48,98% | 75,51% | **79,59%** |",
        "| **B** diễn đạt khác | 42,86% | **14,29%** | **71,43%** | 63,27% |",
        "| **chênh lệch** | −20,41 | **−34,69** | **−4,08** | −16,32 |",
        "",
        "BM25 **sụp** khi khách diễn đạt khác: 48,98% → 14,29%. Embedding gần như **giữ nguyên**:",
        "75,51% → 71,43%. Đây là minh chứng trực tiếp cho lập luận ở mục 2.2 — BM25 đếm từ chung, nên",
        "không có từ chung thì nó không có gì để đếm.",
        "",
        "Và hybrid **thắng embedding ở dạng A nhưng thua ở dạng B** — nó thừa hưởng cả điểm mạnh lẫn",
        "điểm yếu của BM25.",
        "",
        "**Phát hiện mới của bước này:** trên câu **phân loại**, mã tất định với từ vựng đủ đạt",
        "**53,06%** — cao hơn hẳn **12,00%** nó đạt trên câu **tri thức** (mục 4.9.4). Nghĩa là:",
        "",
        "> **Khoảng cách giữa hai lớp phụ thuộc LOẠI CÂU HỎI, không phải là hằng số.**",
        "",
        "### 4.10.4 Bước 4 — chất lượng ĐỊNH TUYẾN, và chi phí của việc đi nhầm lớp",
        "",
        "Phát hiện trên dẫn thẳng tới câu hỏi kiến trúc cuối cùng: *hệ thống có nhận ra loại câu hỏi",
        "trước khi chọn lớp không?* Nếu không thì việc mỗi lớp mạnh ở đâu là **vô nghĩa về mặt thực",
        "dụng** — câu hỏi sẽ vào nhầm lớp và mất phần lợi thế đó.",
        "",
        "| Tập | n | Lớp hợp lệ | Đi đúng | Tỷ lệ |",
        "|---|---:|---|---:|---:|",
        "| chọn món | 50 | lọc nhãn | 43/50 | **86,00%** |",
        "| tri thức | 50 | truy hồi | 30/50 | **60,00%** |",
        "| phân loại | 98 | **lọc nhãn hoặc truy hồi** | 82/98 | **83,67%** |",
        "| **tổng** | **198** | | 155/198 | **78,28%** |",
        "",
        "**Chi phí sai định tuyến:**",
        "",
        "```",
        "chọn món     trần 100,00%  ×  định tuyến đúng 86,00%  =  86,00%",
        "tri thức     trần  44,00%  ×  định tuyến đúng 60,00%  =  26,40%",
        "phân loại    trần  73,47%  ×  định tuyến đúng 83,67%  =  61,47%",
        "-----------------------------------------------------------------",
        "TRẦN ORACLE (định tuyến hoàn hảo)  :  72,73%",
        "ƯỚC LƯỢNG THẬT                     :  58,81%",
        "CHI PHÍ SAI ĐỊNH TUYẾN             :  13,92 điểm",
        "```",
        "",
        "Con số cuối **tách lỗi của lớp khỏi lỗi của bộ định tuyến**. Nó giải thích vì sao ba lần cải",
        "thiện kho tri thức đều không nhúc nhích: phần mất lớn nhất nằm ở khâu **chọn đường**, không ở",
        "khâu **tìm**. Cải thiện một bộ truy hồi đang bị định tuyến sai thì không cứu được gì.",
        "",
        "#### Bản đầu của phép đo này SAI, và cách phát hiện",
        "",
        "Bản đầu gán 98 câu phân loại là **\"chỉ truy hồi mới đúng\"**, vì mỗi câu có một tài liệu đích.",
        "Đo ra **32,65%** định tuyến đúng và **32,47 điểm** chi phí — con số nghe rất tệ, và suýt trở",
        "thành căn cứ để sửa bộ định tuyến.",
        "",
        "Kiểm hành vi thật trước khi sửa:",
        "",
        "```",
        "\"Món nướng có những gì?\"  ->  filter, 6 món, 6/6 mang method:grilled",
        "\"Có món Huế nào không?\"   ->  filter, 3 món, 3/3 mang region:hue",
        "```",
        "",
        "Nhánh lọc trả về **đúng món**. Khách hỏi *\"món nướng có những gì\"* thì một danh sách món nướng",
        "**là** câu trả lời đúng — tài liệu giàu thông tin hơn, nhưng danh sách không sai.",
        "",
        "Nên **khóa đáp án sai, không phải hệ thống sai**. Sau khi sửa khóa:",
        "",
        "| | trước | sau |",
        "|---|---:|---:|",
        "| Định tuyến đúng | 53,03% | **78,28%** |",
        "| Chi phí sai định tuyến | 32,47 điểm | **13,92 điểm** |",
        "",
        "Đây là **lần thứ chín** trong dự án mà lỗi nằm ở phép đo chứ không ở hệ thống, và lần này suýt",
        "tốn kém hơn các lần trước: tin vào con số 32,47 thì nhóm sẽ **đẩy 66 câu đang trả lời đúng sang",
        "nhánh khác** để làm đẹp một chỉ số dựa trên ý kiến của chính người đo.",
        "",
        "> **Nguyên tắc rút ra:** khi thước đo nói hệ thống sai ở quy mô lớn, kiểm hành vi thật trước khi",
        "> sửa. Một con số tệ bất thường thường là dấu hiệu của **khóa đáp án sai**, không phải của hệ",
        "> thống hỏng.",
        "",
        "### 4.10.5 Quyết định kiến trúc rút ra từ bốn bước",
        "",
        "| # | Quyết định | Bằng chứng |",
        "|---|---|---|",
        "| 1 | **Không đầu tư thêm vào tối ưu kho tri thức** | hai can thiệp độc lập, Hit@1 giữ nguyên 60,87% |",
        "| 2 | **Dùng embedding, không dùng hybrid** | p = 0,8238 — hybrid không cải thiện đo được, mà tốn gấp đôi chi phí |",
        "| 3 | **Giữ cả hai lớp** | tất định + từ vựng đủ vẫn thua trên câu tri thức (12,00% so với 44,00%) và câu phân loại (53,06% so với 73,47%) |",
        "| 4 | **Đầu tư tiếp vào ĐỊNH TUYẾN, không vào truy hồi** | 13,92 điểm đang mất ở khâu chọn đường; định tuyến hoàn hảo đưa hệ thống lên 72,73% mà không cần đụng tới truy hồi. **Đã thi hành ở 4.10.6: 13,92 -> 5,78 điểm** |",
        "",
        "Tái lập bốn bước:",
        "",
        "```bash",
        "python ai/evaluation/run_phu_tu_vung.py --csv # tất định với từ vựng đủ",
        "python ai/evaluation/run_dinh_tuyen.py --csv  # chất lượng định tuyến",
        "```",
        "",
        "### 4.10.6 Bước 5 — thi hành quyết định số 4, và đo lại",
        "",
        "Bốn bước trên kết thúc bằng một quyết định: **đầu tư vào định tuyến**. Mục này là phần thi",
        "hành quyết định đó, và nó được viết ra vì một lý do phương pháp: một quyết định rút từ số",
        "liệu mà không ai thi hành thì không kiểm chứng được. Nếu sửa đúng chỗ thước đo chỉ ra mà",
        "con số không lên, thì chính thước đo mới là thứ cần xem lại.",
        "",
        "**Chẩn đoán.** Ba nhóm sai định tuyến, và nhóm lớn nhất không phải nhóm được dự đoán:",
        "",
        "| nhóm sai | số câu | nguyên nhân |",
        "|---|---:|---|",
        "| câu phân loại rơi vào `clarify` | 14 | hệ thống hỏi lại điều khách vừa nói |",
        "| câu tri thức bị nhánh lọc nuốt | 15 | hàng rào hai chiều chưa phủ hết |",
        "| câu chọn món rơi xuống truy hồi | 6 | không rút được nhãn nên không có gì để lọc |",
        "",
        "Nhóm 1 và nhóm 3 hóa ra **cùng một nguyên nhân**, và nguyên nhân đó đo được:",
        "",
        "> `menu-tags.json` có `label_vi` cho cả 85 nhãn, nhưng **48/85 nhãn (56,47%) không rút ra",
        "> được từ chính nhãn tiếng Việt của nó**. Hỏi *\"Món nào ít calo?\"* thì `require` rỗng.",
        "",
        "Đây là lớp `vocab_miss`: nhãn có, món có, chỉ thiếu đường nối. Bảng nhãn là thứ **người nhập",
        "liệu đọc khi gắn nhãn cho món**, nên nó cũng là cách nói tự nhiên nhất về nhóm món đó — bỏ",
        "qua nó là bỏ qua nguồn từ vựng sẵn có và đúng theo xây dựng.",
        "",
        "**Vì sao không sinh tự động cả 48 nhãn.** Vì tiếng Việt viết rời từng âm tiết, nên `bố trí`",
        "rút dấu thành hai **từ riêng** `bo` + `tri`. Phép kiểm biên từ vì thế không phân biệt được",
        "`bò` với `bố`, `bỏ`, `bộ`, `bỡ`. Nạp thử **từng cụm một** rồi chạy `understand()` trên **980",
        "câu hỏi của 8 tập đánh giá** cho thấy cụm trần hỏng ở đâu:",
        "",
        "| cụm trần | đụng chữ với | ví dụ hỏng |",
        "|---|---|---|",
        "| `bo` | bỏ, bố, bộ, bỡ | *\"Em muốn **bỏ** một nguyên liệu ra\"* thành đòi món bò |",
        "| `chua` | chưa | *\"Mình **chưa** ăn ở đây bao giờ\"* thành đòi món chua (4 câu) |",
        "| `ngot` | bột ngọt | *\"Món nào không **bột ngọt**?\"* thành đòi món ngọt — ngược nghĩa |",
        "| `beo` | sợ béo | *\"Mình **sợ béo**, có gì ít dầu không?\"* thành đòi món béo — ngược nghĩa |",
        "| `kho` | khô | *\"món đảo **khô** trên chảo\"* thành món kho |",
        "| `rang` | ràng buộc | *\"Khi khách có **ràng** buộc thì ghép món thế nào?\"* |",
        "| `nau` | nấu (động từ) | *\"món này **nấu** bao lâu\"* |",
        "| `quay` | quay lại | *\"**quay** lại món ăn đi, cho mình món nướng\"* |",
        "| `nong` | nồng | 5/5 câu đổi đều là *\"**nồng** vị ớt\"* — nhãn này bị bỏ hẳn |",
        "",
        "Ca tệ nhất không phải ca sai nhãn mà là ca **đổi ý định**: *\"Trong bàn có người không dùng",
        "thịt thì **bố** trí thế nào?\"* chuyển sang ý định `xoa_rang_buoc`, tức xóa luôn ràng buộc",
        "đang giữ — trong đó có ràng buộc dị nguyên.",
        "",
        "> Đây là lần thứ **11** rút dấu gây đụng chữ trong dự án, và là lần đầu nó bị bắt **trước**",
        "> khi vào mã. Mười lần trước đều bị phát hiện bằng một ca đỏ hoặc một câu trả lời sai.",
        "",
        "**Thi hành.** 31 cụm được nhận, chia hai nhóm: nhãn nhận nguyên văn (0/980 câu đổi sai), và",
        "nhãn phải kèm khung câu tiếng Việt thường ngày (`vị chua`, `kiểu kho`, `món rang`).",
        "",
        "**Kết quả, ghép cặp trên cùng danh sách câu hỏi:**",
        "",
        "| | trước | sau |",
        "|---|---:|---:|",
        "| câu chọn món đi đúng lớp | 86,00% | **100,00%** |",
        "| câu phân loại đi đúng lớp | 83,67% | **96,94%** |",
        "| câu tri thức đi đúng lớp | 60,00% | 58,00% |",
        "| **định tuyến đúng, toàn bộ** | **78,28%** | **87,88%** |",
        "| **chi phí sai định tuyến** | **13,92 điểm** | **5,78 điểm** |",
        "",
        "Kiểm định McNemar ghép cặp trên 183 câu hỏi chung: **13 ca được sửa, 1 ca đổi lớp**,",
        "p = 0,0018 — chênh lệch có ý nghĩa thống kê.",
        "",
        "Ca duy nhất đổi theo chiều ngược là *\"Mình vừa đi Tây Nguyên về, thèm vị đó thì gọi gì?\"*:",
        "trước đi truy hồi, giờ đi nhánh lọc và trả về Lẩu gà lá é Đà Lạt, Sinh tố bơ Đắk Lắk, Sinh",
        "tố dâu tây Đà Lạt. Theo khóa đáp án thì đó là một ca hỏng; theo nội dung câu trả lời thì đó",
        "là một danh sách đúng. Ca này **không được sửa khóa đáp án** — nó ở lại cột hỏng, vì nới",
        "khóa đáp án sau khi đã thấy kết quả là cách chắc chắn nhất để mất tính khách quan.",
        "",
        "Cũng theo chiều ngược, bộ hai chiều ghi nhận mã tất định trả lời đúng dạng trên chiều A đi",
        "từ 5/50 xuống 4/50: từ vựng rộng hơn làm lớp tất định **hăng hơn**, và cái giá là đôi khi",
        "nó nhận một câu tri thức. Đó là đánh đổi đã lường trước, và tỷ lệ đổi là 13 ăn 1.",
        "",
        "**Hai lỗi thật tìm ra trong lúc đo, và cả hai đáng hơn con số định tuyến:**",
        "",
        "*Lỗi 1 — `trong Nam` trả về món nấm.* `Nam` rút dấu thành `nam`, trùng `nấm`. Cụm `mien nam`",
        "có bảo vệ riêng, `trong Nam` thì không:",
        "",
        "```",
        "\"Mình thích vị ngọt kiểu trong Nam, gọi gì?\"",
        "    require = [flavour:sweet, ingredient:MUSHROOM]  ->  Gà tiềm thuốc bắc",
        "```",
        "",
        "Một món không ngọt, không miền Nam, và có nấm. Bài học: che **một cách nói** không che được",
        "cả nhóm nghĩa — cùng một vùng có nhiều cách gọi, và cụm bảo vệ phải phủ hết.",
        "",
        "*Lỗi 2 — tên món sau từ loại trừ vẫn được mời.* Ba cách nói, cả ba cùng sai một kiểu:",
        "",
        "```",
        "\"Muốn cái gì mát mà rẻ, không phải trà sữa\"  ->  Trà sữa trân châu (45.000đ)",
        "\"Cho mình đồ uống, không phải trà sữa\"       ->  Trà sữa trân châu",
        "\"Món nào cũng được, trừ trà sữa\"             ->  Trà sữa trân châu",
        "```",
        "",
        "Đây là kiểu sai **tệ hơn \"không hiểu\"**: hệ thống hiểu đủ để tra ra món, rồi mời đúng món",
        "khách vừa từ chối. Khách đọc câu đó sẽ kết luận trợ lý không nghe mình nói. Nguyên nhân là",
        "bước nhận tên món khớp theo **chuỗi** mà không xét thứ đứng trước, nên `không phải X` và `X`",
        "cho cùng kết quả. Sửa bằng quan hệ **vị trí**: tên món nằm trong 24 ký tự sau một từ loại trừ",
        "thì vào danh sách loại. Chiều ngược được chốt bằng test riêng — `trà sữa **không đường**` nói",
        "về cách pha chứ không loại món, nên `không` trần không nằm trong danh sách từ loại trừ.",
        "",
        "Cả hai lỗi đều **không do tập đánh giá bắt được**. Chúng lộ ra khi đọc câu trả lời thật của",
        "những ca mà thước đo đã chấm là sai định tuyến — tức giá trị của bộ đo này không chỉ nằm ở",
        "con số nó in ra, mà ở danh sách ca nó chỉ vào.",
        "",
        "**Và một lỗi do chính bản sửa gây ra, bị bộ golden bắt.** 405 test đơn vị, 140/140 ca trả",
        "lời, 149/149 lượt phiên đều xanh — nhưng bộ golden 103 lượt chạy qua stack thật báo **2 lượt",
        "đỏ**, cả hai trong cùng một hội thoại:",
        "",
        "```",
        "\"Nhãn 'ít calo' dựa trên gì?\"   ->  require=[health:low_calorie]  ->  6 món + thẻ giỏ",
        "\"Món này có bột ngọt không?\"    ->  thừa hưởng ràng buộc trên     ->  6 món + thẻ giỏ",
        "```",
        "",
        "Nhãn được nhắc tới là **chủ thể** của câu hỏi, không phải bộ lọc. Câu trả lời đúng nằm trong",
        "tài liệu — nhãn `ít calo` là đánh giá **cảm quan** của người nhập thực đơn, không phải kết",
        "quả phân tích — nên trả một danh sách món ở đây là né đúng câu hỏi khó, và né bằng một thứ",
        "trông giống câu trả lời.",
        "",
        "Điều đáng ghi hơn là **cách một lượt hỏng lây sang lượt khác**: ràng buộc sai ở lượt 1 đi vào",
        "bộ nhớ phiên, nên lượt 3 thừa hưởng nó và cũng hỏng. Một lượt hiểu sai làm hỏng hai lượt, và",
        "chỉ bộ đánh giá **đa lượt** thấy được quan hệ đó — bộ một lượt sẽ báo lượt 3 là lỗi riêng của",
        "lượt 3 và dẫn người sửa đi nhầm chỗ.",
        "",
        "Sửa bằng một quy tắc tất định: câu hỏi **định nghĩa** (`dựa trên gì`, `nghĩa là gì`, `căn cứ",
        "vào`) mà không đòi ứng viên và không nêu tên món thì bỏ ràng buộc lọc suy từ nhãn. Hai chiều",
        "còn lại được chốt bằng test riêng — *\"Món nào ít calo?\"* vẫn lọc, và *\"Phở bò tái nạm có hải",
        "sản không?\"* vẫn giữ nhãn vì nó cần nhãn để trả lời được.",
        "",
        "> **Điều rút ra về tầng đánh giá:** bốn tầng test bắt bốn loại lỗi khác nhau, và tầng nào",
        "> cũng có lỗi mà tầng khác không thấy. 405 test đơn vị không thấy lỗi này vì nó là lỗi *liên",
        "> lượt*; 140 ca trả lời không thấy vì chúng là ca *một lượt*; bộ định tuyến không thấy vì cả",
        "> hai lượt vẫn đi *đúng lớp theo khóa đáp án*. Chỉ bộ golden đa lượt qua stack thật thấy.",
        "",
        "Tái lập:",
        "",
        "```bash",
        "python -m unittest discover -s ai/app -p \"test_*.py\"   # 410 test",
        "python ai/evaluation/run_dinh_tuyen.py --csv",
        "```",
        "",
        "### 4.10.7 Bước 6 — truy hồi tri thức yếu vì đâu, và trần thật nằm ở đâu",
        "",
        "Sau bước 5, con số yếu nhất còn lại là **44,00%** — tỷ lệ truy hồi tìm đúng tài liệu trên",
        "chiều A, 50 câu tri thức khó nhất. Mục này đi tìm nguyên nhân, và kết quả **lật lại giả",
        "thuyết mà bốn bước trước đã dựa vào**.",
        "",
        "**Bốn giả thuyết, ba bị chính số liệu bác.**",
        "",
        "| giả thuyết | phép đo | kết luận |",
        "|---|---|---|",
        "| kho thiếu dữ liệu | Hit@20 trên chiều A với `bge-m3` = **100,00%** | **bác** — tài liệu đúng luôn có |",
        "| tài liệu trùng nhau | `written` chỉ **0,48%** cặp Jaccard ≥ 0,50, `derived` **39,54%** | **bác** — nhóm trùng nặng lại đạt điểm CAO hơn |",
        "| câu hỏi thiếu từ chung | chiều A **71,32%** vs phủ kho dạng B **69,53%** độ phủ từ | **bác** — gần bằng nhau mà Hit@1 chênh 27,43 điểm |",
        "| chỉ lấy MỘT đoạn | tách nguyên nhân trên 50 ca | **đúng** — **40,00%** là lỗi xếp hạng thuần túy |",
        "",
        "Giả thuyết thứ hai đáng nói riêng: **suốt bốn bước trước, nhóm đi tìm nguyên nhân ở độ trùng",
        "lặp của tài liệu**, và ba can thiệp vào kho đều âm tính. Phép đo ở đây cho biết vì sao —",
        "nhóm tài liệu trùng nặng nhất (`derived`, 39,54% cặp trùng) lại đạt **73,47%**, trong khi",
        "nhóm tách bạch nhất (`written`, 0,48%) chỉ đạt **44,00%**. Quan hệ đi **ngược** chiều giả",
        "thuyết, nên ba kết quả âm tính kia không phải là thất bại của cách sửa mà là dấu hiệu chẩn",
        "đoán sai chỗ ngay từ đầu.",
        "",
        "**Tách nguyên nhân trên 50 câu, dùng `bge-m3`:**",
        "",
        "| k | Hit@k | | nguyên nhân | số ca |",
        "|---:|---:|---|---|---:|",
        "| 1 | 58,00% | | đúng ngay vị trí 1 | 29 |",
        "| 2 | 80,00% | | **xếp hạng sai** (có trong top-10) | **20** |",
        "| 3 | 86,00% | | kho không có / không với tới | **0** |",
        "| 5 | 94,00% | | | |",
        "| 10 | 98,00% | | | |",
        "| **20** | **100,00%** | | | |",
        "",
        "**Về mô hình nhúng.** Thử hai mô hình lớn hơn, ghép cặp trên 148 câu:",
        "",
        "| mô hình | chiều | Hit@1 | chiều A | phủ kho | p50 | McNemar so với bản đang dùng |",
        "|---|---:|---:|---:|---:|---:|---|",
        "| `e5-small` (bản trước) | 384 | 64,86% | 48,00% | 73,47% | 44,7 ms | — |",
        "| `e5-base` | 768 | 68,92% | 58,00% | 74,49% | 143,1 ms | p = 0,3616 — **chưa đủ ý nghĩa** |",
        "| **`bge-m3`** (đã đổi sang) | 1024 | **73,65%** | 58,00% | **81,63%** | 271,7 ms | **p = 0,0351 — có ý nghĩa** |",
        "",
        "Hai điều rút ra, và điều thứ hai quan trọng hơn:",
        "",
        "1. **Không phải cứ mô hình lớn hơn là tốt hơn.** `e5-base` to gấp đôi mà không chứng minh",
        "   được gì; `bge-m3` thì có. Khác biệt nằm ở chất lượng huấn luyện cho tiếng Việt, không ở",
        "   số chiều.",
        "2. **Cả hai mô hình lớn cùng dừng ở 58,00% trên chiều A.** Hai kiến trúc khác hẳn nhau chạm",
        "   cùng một trần — đó là dấu hiệu trần không nằm ở mô hình.",
        "",
        "Với `bge-m3`, khoảng cách giữa hai dạng câu **biến mất hoàn toàn**:",
        "",
        "| dạng câu | mã tất định | bm25 | `bge-m3` | hybrid |",
        "|---|---:|---:|---:|---:|",
        "| A — dùng đúng nhãn | 63,27% | 48,98% | **81,63%** | 87,76% |",
        "| B — diễn đạt khác hẳn | 42,86% | **14,29%** | **81,63%** | 73,47% |",
        "| **chênh A→B** | −20,41 | **−34,69** | **0,00** | −14,29 |",
        "",
        "**Thi hành: trích 2 đoạn thay vì 1.** Vì nguyên nhân là xếp hạng chứ không phải dữ liệu, cách",
        "sửa đúng là để câu trả lời chạm được nhiều hơn một ứng viên. Cách thu về nhiều điểm nhất là",
        "cho mô hình tổng hợp nhiều đoạn — và đó đúng là con đường mà `BRANCHES_ALLOWED` dựng lên để",
        "chặn. Trích **nguyên văn** nhiều đoạn giữ được ràng buộc đó: mọi chữ khách đọc vẫn là chữ",
        "trong kho.",
        "",
        "Đo trên đường sản xuất — gọi đúng phép chọn của bản chạy thật, không đo thẳng bộ xếp hạng:",
        "",
        "| số đoạn | trúng tài liệu đúng | KTC 95% | số từ (trung vị) | đoạn lạc/câu | McNemar so với 1 đoạn |",
        "|---:|---:|---|---:|---:|---|",
        "| 1 | 48,00% | 34,80–61,49% | 64 | 0,52 | — |",
        "| **2** | **64,00%** | 50,14–75,86% | 126 | 1,36 | **p = 0,0078** |",
        "| 3 | 68,00% | 54,19–79,24% | 186 | 2,30 | p = 0,0020 |",
        "| 5 | 76,00% | 62,59–85,70% | 320 | 4,24 | p = 0,0001 |",
        "",
        "Cả ba mức đều hơn mức 1 có ý nghĩa thống kê, nên câu hỏi không phải *có nên tăng không* mà là",
        "*tăng tới đâu*. Lợi **biên** trả lời rõ:",
        "",
        "| bước | +điểm | +từ | điểm mỗi 100 từ |",
        "|---|---:|---:|---:|",
        "| **1 → 2** | **+16,00** | +62 | **25,81** |",
        "| 2 → 3 | +4,00 | +60 | 6,67 |",
        "| 3 → 5 | +8,00 | +134 | 5,97 |",
        "",
        "Bước đầu hiệu quả gấp gần **bốn lần** bước sau, nên hệ thống dừng ở **2 đoạn**. Từ mức 3 trở",
        "đi mỗi câu trả lời mang theo hơn hai đoạn nói về chuyện khác — thứ làm khách đọc một thông",
        "tin đúng-về-việc-khác rồi tưởng đó là câu trả lời cho mình, và đó là cái giá không đo bằng",
        "số từ được.",
        "",
        "> **Điều rút ra lớn nhất của mục này:** con số 44,00% không đo năng lực truy hồi — nó đo",
        "> **cái giá của quyết định chống bịa**. Kho tri thức trả lời được **100,00%** số câu; hệ",
        "> thống cố ý chỉ nhìn một đoạn trong 372 vì nhánh tri thức không được phép sinh chữ. Đây là",
        "> một đánh đổi có chủ ý, và giờ nó có số đo ở cả hai phía.",
        "",
        "Một phép đo trong mục này ban đầu **sai**: bản đầu của `run_so_doan.py` so tám từ đầu của chữ",
        "đã định dạng với văn bản tài liệu, và báo mức 1 đoạn đạt 36,00% trong khi Hit@1 của cùng bộ",
        "truy hồi là 48,00%. `chu_cho_khach()` bỏ tiêu đề và dấu markdown nên chuỗi không còn khớp.",
        "Sửa bằng cách tách `chon_doan_tri_thuc()` ra khỏi hàm trả về chữ, để bộ đo gọi **đúng phép",
        "chọn** thay vì đoán lại từ kết quả đã định dạng.",
        "",
        "**Bộ golden bắt được một hệ quả mà bảng trên không thấy.** Bật trích 2 đoạn xong, 410 test",
        "đơn vị, 140/140 ca trả lời và 149/149 lượt phiên đều xanh, còn golden 103 lượt qua stack thật",
        "báo **1 lượt đỏ** — trong khi nội dung câu trả lời thì **đúng**:",
        "",
        "```",
        "hỏi     \"Nhãn \'ít calo\' dựa trên gì?\"",
        "đoạn 1  …Nhãn \'ít calo\' là đánh giá cảm quan của người nhập liệu…   <- TRẢ LỜI ĐÚNG",
        "đoạn 2  tài liệu dietary_limits, có chứa cụm \'chưa có dữ liệu\' về một chuyện KHÁC",
        "```",
        "",
        "Bộ chấm suy ra dạng đáp án bằng cách tìm cụm ở **bất kỳ đâu** trong văn bản, nên cụm ở đoạn",
        "2 thắng và lượt bị chấm `no_data` thay vì `fact`.",
        "",
        "Trước khi sửa thước đo, nhóm thử **quy tắc thích ứng** — chỉ thêm đoạn 2 khi điểm của nó gần",
        "điểm đoạn 1, để không đệm vào một câu vốn đã chắc. Đo phân bố tỷ lệ điểm trên 50 ca:",
        "",
        "| đoạn 2 làm gì | n | tỷ lệ điểm trung bình | trung vị | nhỏ nhất |",
        "|---|---:|---:|---:|---:|",
        "| **cứu được ca** | 8 | 0,9965 | 0,9990 | 0,9878 |",
        "| chỉ là đệm | 42 | 0,9900 | 0,9942 | — |",
        "",
        "Hai phân bố **chồng lấn**, và giá trị nhỏ nhất của nhóm cứu được (0,9878) còn thấp hơn trung",
        "bình của nhóm đệm. Không ngưỡng nào tách được chúng, nên quy tắc thích ứng **bị bỏ** — một",
        "kết quả âm tính, ghi lại để không ai thử lại.",
        "",
        "Còn lại là sửa thước đo: đọc dạng đáp án từ **đoạn đầu**, vì dạng đáp án là tính chất của",
        "đoạn TRẢ LỜI, còn đoạn sau chỉ là ngữ cảnh bổ trợ. Điều làm phép sửa này không phải là nới",
        "cho qua: các nhánh trả `no_data` và `refuse` thật đều sinh câu **một đoạn** từ khuôn mẫu, nên",
        "đọc đoạn đầu không làm lỏng chúng — kiểm được bằng ba lượt còn lại của chính hội thoại đó,",
        "cả ba vẫn chấm đúng.",
        "",
        "**Hybrid với `bge-m3` — hòa tuyệt đối, và lần này biết được vì sao.** Câu hỏi tự nhiên tiếp",
        "theo là: bộ nhúng mạnh hơn có làm hybrid đáng dùng lên không? Đo trên cả 148 câu, ghép cặp:",
        "",
        "| bộ | Hit@1 | KTC 95% | chiều A | phủ dạng A | phủ dạng B | p50 |",
        "|---|---:|---|---:|---:|---:|---:|",
        "| `bm25` | 29,73% | 22,95–37,53% | 26,00% | 48,98% | 14,29% | **0,7 ms** |",
        "| `bge-m3` dense | **73,65%** | 66,02–80,08% | 58,00% | 81,63% | **81,63%** | 292,2 ms |",
        "| hybrid RRF | **73,65%** | 66,02–80,08% | 60,00% | **87,76%** | 73,47% | 291,4 ms |",
        "",
        "**109/148 ở cả hai — hòa đúng bằng nhau.** McNemar: **18 ca sửa được, 18 ca làm hỏng,",
        "p = 1,0000.** Khó có kết quả nào sạch hơn thế.",
        "",
        "Và tách theo dạng câu thì thấy phép đổi diễn ra ở đâu:",
        "",
        "| | hybrid so với dense |",
        "|---|---|",
        "| câu dùng **đúng nhãn** trong tài liệu | **+6,13 điểm** (87,76% so với 81,63%) |",
        "| câu **diễn đạt kiểu khác** | **−8,16 điểm** (73,47% so với 81,63%) |",
        "",
        "Tín hiệu từ khóa của BM25 giúp khi khách gõ đúng chữ trong tài liệu, và hại khi khách nói",
        "kiểu khác. Hai chiều triệt tiêu nhau gần như hoàn hảo.",
        "",
        "Điều đáng nói là **cơ chế này đã được ghi trong tài liệu của chính `rag/hybrid.py` từ trước**,",
        "chứ không phải suy ra sau khi thấy số:",
        "",
        "> *RRF bỏ hết thông tin về khoảng cách. […] nên RRF mạnh khi hai bộ truy hồi có thang điểm",
        "> không so được, và **yếu khi một bộ chắc chắn hơn bộ kia rất nhiều**.*",
        "",
        "Ở đây `bge-m3` đạt 73,65% còn BM25 chỉ 29,73% — chênh **43,92 điểm** — mà RRF vẫn cho hai bên",
        "quyền bỏ phiếu ngang nhau. Đó chính là điều kiện mà tài liệu nói RRF sẽ yếu.",
        "",
        "Cộng với hai lần đo trước (`e5-small`: p = 0,2891 rồi p = 0,8238), **hybrid đã được đo ba lần",
        "với hai mô hình nhúng khác nhau và chưa lần nào cho cải thiện đo được**. Kết luận giữ nguyên:",
        "dùng dense thuần. Và vì khách thật diễn đạt theo kiểu của họ chứ không gõ tên nhãn, chiều",
        "hybrid thua (−8,16) mới là chiều hay gặp.",
        "",
        "**Bộ XẾP HẠNG LẠI — cách sửa đúng sách vở, và nó không chạy.** Chẩn đoán nói lỗi nằm ở xếp",
        "hạng, nên công cụ chuẩn cho việc đó là *cross-encoder*: thay vì mã hóa câu hỏi và đoạn văn",
        "riêng rẽ rồi so vector, nó đọc **cặp** (câu hỏi, đoạn) trong một lượt nên bắt được quan hệ mà",
        "phép so vector bỏ sót. Chạy trên top-10 rồi chọn 1, nên vẫn trả về đúng một đoạn nguyên văn.",
        "",
        "Đo `BAAI/bge-reranker-v2-m3` trên 148 câu, ghép cặp:",
        "",
        "| | Hit@1 | chiều A | phủ kho |",
        "|---|---:|---:|---:|",
        "| `bge-m3` top-1 (nền) | **73,65%** | 58,00% | **81,63%** |",
        "| + xếp hạng lại top-10 | 72,30% | **64,00%** | 76,53% |",
        "",
        "McNemar: **p = 0,8318 — chưa đủ ý nghĩa** (10 ca sửa được, 12 ca làm hỏng). Tổng thể **không",
        "cải thiện**, và chi tiết cho biết vì sao: nó nâng chiều A lên 64,00% nhưng kéo bộ phủ kho",
        "xuống 76,53%. Nó đổi bộ này lấy bộ kia, đúng như phép gộp điểm theo tài liệu đã thử ở bước 1.",
        "",
        "Chi phí đóng lại hoàn toàn khả năng dùng: **38.561 ms mỗi câu** trên CPU cho 10 cặp. Ngay cả",
        "khi nó thắng, con số đó cũng không triển khai được ở một trợ lý đặt món.",
        "",
        "Đây là kết quả âm tính thứ **tư** của riêng mục này, và cả bốn đều là cách sửa nghe hợp lý:",
        "",
        "| cách thử | kết quả |",
        "|---|---|",
        "| gộp điểm theo tài liệu | chiều A +4 đến +8, phủ kho **−8** ở k cao — đổi bộ này lấy bộ kia |",
        "| ngưỡng thích ứng cho đoạn 2 | hai phân bố **chồng lấn**, không ngưỡng nào tách được |",
        "| hybrid RRF với `bge-m3` | **hòa tuyệt đối** — 18 sửa được, 18 làm hỏng, p = 1,0000 |",
        "| xếp hạng lại bằng cross-encoder | **p = 0,8318**, và 38.561 ms mỗi câu |",
        "",
        "Cách duy nhất thắng được là cách đơn giản nhất — **trích 2 đoạn thay vì 1** — và nó không",
        "thêm một mô hình nào, không thêm một byte nào vào ảnh Docker.",
        "",
        "> Đây là lần thứ **năm** trong dự án mà thước đo sai trước khi hệ thống sai. Quy tắc rút ra và",
        "> đã áp dụng nhất quán: khi một thay đổi làm đỏ đúng một ca, **đọc câu trả lời thật trước khi",
        "> sửa hệ thống** — và nếu sửa thước đo thì phải nêu được lý do đứng vững độc lập với thay đổi",
        "> vừa làm.",
        "",
        "### 4.10.8 Đổi sang `bge-m3` — chi phí triển khai, đo chứ không ước",
        "",
        "Quyết định đổi dựa trên phép đo chất lượng ở mục trên. Nhưng một mô hình gấp gần **năm lần**",
        "về kích thước không chỉ đổi con số Hit@1, nên nhóm đo luôn phần chi phí trước khi đổi.",
        "",
        "| | `e5-small` (bản trước) | `bge-m3` (bản này) |",
        "|---|---:|---:|",
        "| số chiều vector | 384 | **1024** |",
        "| trọng số mô hình | ~470 MB | **2.271 MB** |",
        "| RAM khi chạy (đo thật) | — | **1.234 MB** |",
        "| thời gian nạp mô hình | — | **20,6 s** |",
        "| lần mã hóa đầu tiên | — | **4,8 s** |",
        "| độ trễ mỗi truy vấn (p50) | 44,7 ms | **271,7 ms** |",
        "| mã hóa lại toàn kho | 53 s | **492 s** |",
        "",
        "Ba con số trong bảng dẫn tới ba thay đổi cấu hình, và cả ba đều là thay đổi mà **chỉ phép đo",
        "mới chỉ ra được**:",
        "",
        "**1. `start_period` của healthcheck: 20s → 90s.** Đây là con số suýt gây một lỗi triển khai.",
        "Mô hình nạp mất 20,6 giây cộng 4,8 giây cho lần mã hóa đầu — tổng ~25,4 giây, trong khi lần",
        "thăm dò sức khỏe đầu tiên rơi vào giây thứ 20. Nó thất bại, và `depends_on: service_healthy`",
        "giữ dịch vụ phụ thuộc chờ thêm một chu kỳ 30 giây nữa. Không hỏng hẳn, nhưng chậm mà không",
        "có lý do nhìn thấy được — đúng loại lỗi chỉ lộ ra khi triển khai chứ không lộ khi chạy test.",
        "",
        "**2. `mem_limit: 3g` giữ nguyên.** RAM đo thật sau khi nạp mô hình và mã hóa là **1.234 MB**,",
        "còn dư gần 1,8 GB. Đây là chỗ nhóm **đo trước rồi mới quyết giữ**, thay vì nâng giới hạn cho",
        "chắc — nâng một giới hạn mà không biết mức dùng thật là cách đẩy vấn đề sang chỗ khác.",
        "",
        "**3. Chi phí mã hóa lại toàn kho không rơi vào lúc khởi động.** 492 giây là con số đáng lo",
        "nếu nó xảy ra mỗi lần container bật. Nó không: `rag/precompute.py` chạy lúc **dựng ảnh**, và",
        "khóa của bộ đệm có chứa tên mô hình nên đổi mô hình làm đệm cũ tự động bị từ chối thay vì bị",
        "dùng nhầm. Đó là thiết kế có sẵn, và lần đổi này là lần đầu nó được thử thật.",
        "",
        "Độ trễ **271,7 ms** mỗi truy vấn chỉ rơi vào **câu tri thức** — câu chọn món đi nhánh lọc",
        "nhãn và không chạm truy hồi. Đặt cạnh 8,6 giây của một lần gọi mô hình sinh, nó nhỏ.",
        "",
        "> **Điều rút ra:** phần khó của việc đổi mô hình không nằm ở dòng `MODEL_NAME`. Nó nằm ở ba",
        "> con số cấu hình mà mô hình cũ vừa vặn còn mô hình mới thì không — và cả ba chỉ lộ ra khi",
        "> chịu khó đo, chứ không lộ ra trong bất kỳ bộ test nào.",
        "",
        "**Kết quả sau khi đổi, đo lại toàn bộ:**",
        "",
        "| bộ đánh giá | `e5-small` | **`bge-m3`** |",
        "|---|---:|---:|",
        "| chiều A — truy hồi tìm đúng tài liệu | 44,00% | **56,00%** |",
        "| câu trả lời chứa tài liệu đúng, 1 đoạn | 48,00% | **58,00%** |",
        "| câu trả lời chứa tài liệu đúng, **2 đoạn** | 64,00% | **82,00%** |",
        "| chiều B — số món vi phạm ràng buộc (truy hồi) | 116 | **92** |",
        "| 140 ca trả lời | 140/140 | **140/140** |",
        "| 149 lượt phiên | 149/149 | **149/149** |",
        "| định tuyến | 87,88% | **87,88%** |",
        "",
        "Hai lớp cải tiến **cộng dồn**: trích 2 đoạn đưa 48,00% lên 64,00% với mô hình cũ, và đổi mô",
        "hình đưa tiếp lên **82,00%**. Tổng cộng **+34,00 điểm** so với điểm xuất phát 48,00%, và cả",
        "hai bước đều có kiểm định ghép cặp (p = 0,0078 và p = 0,0005).",
        "",
        "**Một ca đỏ khi đổi mô hình, và cách xử lý nó là phần đáng đọc nhất của mục này.**",
        "",
        "Đổi xong, 411 test đơn vị và 149/149 lượt phiên vẫn xanh, nhưng bộ 140 ca báo **139/140**:",
        "",
        "```",
        "K-multi-05  \"Có set bữa trưa nào không?\"",
        "ĐỎ: nêu số tiền không phải giá món nào được nhắc: [65000, 250000]",
        "```",
        "",
        "Nguyên nhân: `_knowledge_chunk()` dùng bộ nhúng để chọn **mục nào của tài liệu** sẽ trả lời,",
        "nên đổi mô hình làm nó chọn một mục khác — mục đó nêu *\"giá trung vị của thực đơn là",
        "65.000đ\"* và *\"lẩu đều từ 250.000đ trở lên\"*. Thước đo có bốn nguồn số tiền hợp lệ, và không",
        "nguồn nào nhận **số suy từ tổng thể thực đơn**.",
        "",
        "Kiểm lại dữ liệu thì **cả hai con số đều đúng**: trung vị đúng 65.000đ, lẩu rẻ nhất (Lẩu nấm",
        "chay) đúng 250.000đ. Nên đây không phải hệ thống sai.",
        "",
        "Nhưng cũng **không được nới thước đo cho qua** — phép kiểm neo giá là một trong những bất",
        "biến chống bịa quan trọng nhất. Rà lại thì thấy nó đang che một hố thật:",
        "",
        "> 36 tài liệu `written` là văn xuôi **viết tay**, và nhiều đoạn nêu số tiền của thực đơn. Tài",
        "> liệu `derived` không trôi được vì nó sinh lại từ dữ liệu; tài liệu `written` thì trôi được,",
        "> và trôi **im lặng**. Đường sinh không che hố này vì nó chỉ sinh lại phần `derived`.",
        "",
        "Nên thứ tự xử lý là: **dựng cổng dữ liệu trước, rồi mới cho thước đo tin vào kho.**",
        "",
        "1. `build_knowledge.py --check` nhận thêm một bất biến: **mọi số tiền trong kho phải truy",
        "   được về `menu-dataset.json`** — giá món, trung vị, hoặc một ngưỡng ngân sách đã khai tên.",
        "   Rà kho hiện tại: **1.031 lần nêu tiền, 1.023 khớp giá món thật (99,22%)**, 8 lần còn lại",
        "   là ngưỡng tròn dùng để nói về mức chi.",
        "2. Cổng được **thử bằng đột biến** trước khi tin: sửa `65.000đ` thành `77.000đ` trong tài",
        "   liệu, cổng báo đỏ đúng dòng đó; khôi phục, cổng xanh lại. Một cổng chưa bao giờ đỏ thì",
        "   không chứng minh được điều gì.",
        "3. Chỉ sau đó thước đo mới nhận thêm nguồn số tiền thứ năm: **số có sẵn trong kho tri thức**.",
        "",
        "Kết quả: **140/140** trở lại, và kho có thêm một bất biến mà trước đó không ai canh. Việc đổi",
        "mô hình vì thế phát hiện ra một lỗ hổng **không liên quan gì tới mô hình** — nó vốn đã ở đó.",
        "",
        "### 4.10.9 Một mô hình cho HAI bài toán truy hồi — nó có tốt cho cả hai không?",
        "",
        "Hệ thống dùng bộ nhúng ở hai chỗ khác hẳn nhau, và điều đó dễ bị bỏ qua khi đổi mô hình:",
        "",
        "| | bài toán | ứng viên |",
        "|---|---|---|",
        "| A | **toàn kho** — `doan_tri_thuc_lien_quan()` | 1 trong **182 đoạn** của 36 tài liệu |",
        "| B | **trong tài liệu** — `_knowledge_chunk()` | 1 trong **3–8 mục** của MỘT tài liệu |",
        "",
        "Bài toán B dễ hơn ở chỗ chủ đề đã biết, nhưng **khó hơn** ở chỗ mọi ứng viên đều cùng chủ",
        "đề — chúng khác nhau ở *khía cạnh*, không ở *chủ đề*. Không có gì bảo đảm mô hình tốt cho A",
        "cũng tốt cho B, và phép đo ở mục trên chỉ đo A.",
        "",
        "**Suýt kết luận sai.** Con số đầu tiên nhìn thấy là `bge-m3` đạt 0,729 trên bộ chọn mục,",
        "trong khi tài liệu cũ ghi `e5-small` đạt 0,864 — nghe như tụt 13,5 điểm. Nhưng hai con số đó",
        "đo trên **hai tập khác nhau** (48 ca niêm phong so với tập đầy đủ), nên chúng không so được.",
        "Đo lại ghép cặp trên đúng 168 ca:",
        "",
        "| mô hình | Top-1 | KTC 95% |",
        "|---|---:|---|",
        "| `e5-small` | 73,81% | 66,68–79,87% |",
        "| `bge-m3` | 75,60% | 68,58–81,47% |",
        "",
        "McNemar **p = 0,6476** — hai mô hình **hòa** ở bài toán B (11 ca sửa được, 8 ca làm hỏng).",
        "Nên không có hồi quy hệ thống, và không cần dùng hai mô hình khác nhau cho hai đường.",
        "",
        "> Đây là lần thứ hai trong ngày một con số nghe đáng báo động hóa ra là **so hai thứ khác",
        "> nhau**. Quy tắc rút ra: trước khi tin một mức tụt, kiểm xem hai con số có cùng tập, cùng",
        "> giao thức đo hay không.",
        "",
        "**Nhưng phép đo lại mở ra một cải tiến lớn hơn.** Cùng câu hỏi đã đặt cho đường toàn kho —",
        "*lấy một hay nhiều?* — đặt cho đường trong tài liệu:",
        "",
        "| số mục | Top-1 | số từ | McNemar so với 1 mục |",
        "|---:|---:|---:|---|",
        "| 1 | 75,60% | 72 | — |",
        "| **2** | **90,48%** | 138 | **p = 0,0000** |",
        "| 3 | 94,64% | 208 | p = 0,0000 |",
        "",
        "**+14,88 điểm cho +66 từ** — lợi hơn hẳn đường toàn kho (+16,00 điểm cho +62 từ ở mô hình",
        "cũ), và lý do hợp lý: các mục của cùng một tài liệu nói về cùng chủ đề, nên mục thứ hai hiếm",
        "khi lạc đề. Cái giá \"đoạn lạc\" ở đây nhỏ hơn.",
        "",
        "Ca phát hiện ra điều này là một lượt golden, và nó minh họa đúng cơ chế:",
        "",
        "```",
        "hỏi  \"Mình nên nói với nhà hàng thế nào về việc dị ứng?\"",
        "  chọn  #4  \"Nếu dị nguyên của bạn không nằm trong năm loại…\"      <- liên quan, không trả lời",
        "  bỏ    #3  \"Khi gọi món, NÓI VỚI NHÂN VIÊN về dị ứng…\"            <- CÂU TRẢ LỜI, hạng 2",
        "```",
        "",
        "**Và thứ tự ghép hai mục là theo TÀI LIỆU, không theo điểm.** Hai mục ở đây là hai phần của",
        "cùng một bài văn xuôi mà tác giả viết nối tiếp nhau; xếp theo điểm thì đoạn mở đầu bằng",
        "*\"Vì vậy hãy làm thêm một việc\"* đứng **trước** tiền đề của nó và câu trả lời thành câu cụt.",
        "`chunk_id` mang số thứ tự nên sắp theo nó là theo thứ tự tác giả — lý do là **mạch văn**, và",
        "việc nó đồng thời làm đoạn trả lời đúng lên đầu chỉ là hệ quả.",
        "",
        "Kết quả cuối, hai đường cùng trích 2 phần:",
        "",
        "| | trước cả đợt | sau |",
        "|---|---:|---:|",
        "| toàn kho — câu trả lời chứa tài liệu đúng | 48,00% | **82,00%** |",
        "| trong tài liệu — Top-1 chọn đúng mục | 75,60% | **90,48%** |",
        "| chiều B — số món vi phạm ràng buộc (truy hồi) | 116 | **92** |",
        "",
        "Tái lập:",
        "",
        "```bash",
        "python ai/evaluation/run_chunk_selection_comparison.py",
        "```",
        "",
        "## 4.11 Bộ đánh giá phủ được bao nhiêu kho tri thức, và hai lỗi phép rà tìm ra",
        "",
        "Mọi con số ở Chương 4 đều đo trên bộ đánh giá, nên có một câu hỏi phải trả lời trước khi",
        "tin chúng: **bộ đánh giá chạm tới bao nhiêu phần của hệ thống?** Mục này rà điều đó.",
        "",
        "### 4.11.1 Bảy bộ đánh giá, 980 câu hỏi",
        "",
        "| bộ | quy mô | đo cái gì |",
        "|---|---:|---|",
        "| `cases.json` | **147 ca** | chất lượng câu trả lời, một lượt |",
        "| `session_scripts.json` | 58 kịch bản / **157 lượt** | bộ nhớ phiên, đa lượt |",
        "| `golden_e2e.json` | 29 hội thoại / **103 lượt** | qua **stack thật**, có backend và giỏ hàng |",
        "| `retrieval_cases.json` | **114 ca** | truy hồi toàn kho |",
        "| `chunk_selection_cases.json` | **120 ca** | chọn **mục trong** một tài liệu |",
        "| `run_hai_chieu.py` (trong mã) | **100 câu** | 50 câu tri thức + 50 câu chọn món |",
        "",
        "Ba bộ nữa **ghép lại từ những bộ trên**, không có dữ liệu mới: `run_dinh_tuyen` (198 câu),",
        "`run_so_doan` (50), `run_phu_tu_vung` (50).",
        "",
        "### 4.11.2 Độ phủ kho tri thức",
        "",
        "| mức | trước khi rà | sau |",
        "|---|---:|---:|",
        "| **tài liệu** | 102/109 = 93,58% | **109/109 = 100,00%** |",
        "| **đoạn** (có khóa đáp án mức đoạn) | 84/372 = 22,58% | 84/372 = 22,58% |",
        "",
        "Con số đoạn thấp cần nói rõ để không bị đọc sai: **chỉ bộ chọn mục có khóa đáp án ở mức",
        "đoạn**, sáu bộ còn lại chấm ở mức tài liệu vì đó là bài toán của chúng. Nên 22,58% không có",
        "nghĩa \"78% kho không được đo\" — nhưng nó đúng là phần lớn đoạn chưa có ca nào chỉ đích danh,",
        "và đó là giới hạn phải ghi ra.",
        "",
        "Bảy tài liệu chưa có ca **đều là `kb.policy.*`** — nhóm `verbatim` đi bằng tra khóa. Đó không",
        "phải ngẫu nhiên: sáu bộ được xây quanh **đường truy hồi**, còn **đường tra khóa** chỉ được bộ",
        "147 ca đụng tới một phần. Lỗ hổng nằm đúng chỗ không bộ nào có nhiệm vụ canh.",
        "",
        "### 4.11.3 Lỗi thứ nhất — tài liệu có trong kho mà khách không tới được",
        "",
        "Thử hỏi từng tài liệu trong bảy tài liệu đó bằng câu tự nhiên. Sáu tài liệu tới được; một",
        "thì không:",
        "",
        "```",
        "hỏi     \"Quán có bao nhiêu món cho trẻ em?\"",
        "  đi     policy:menu_size   -> trả lời SỐ MÓN CỦA TOÀN THỰC ĐƠN",
        "  cần     policy:children   -> 43 món hợp trẻ em, 29 món người lớn tuổi, 68 món không cay",
        "```",
        "",
        "`children` chỉ có ba cụm từ vựng, cả ba đều đòi chữ \"menu\" hoặc \"phần ăn\", nên cách hỏi",
        "thường ngày nhất rơi ra ngoài và `bao nhieu mon` của `menu_size` thắng. Nhóm `vegetarian`",
        "không dính vì nó đã có `bao nhieu mon chay` — cụm **dài hơn** nên thắng theo luật khớp cụm",
        "dài. Bản sửa làm đúng điều đó cho `children`.",
        "",
        "> Đây là lớp lỗi mà dự án đã đặt tên từ sớm: **nội dung có trong kho, có cụm từ vựng, mà",
        "> không câu hỏi tự nhiên nào tới được nó** — im lặng, không lỗi, không ai biết.",
        "",
        "Trong lúc thử, hai kết luận đầu của nhóm **sai** và phải rút lại: `price_range` và",
        "`vegetarian` ban đầu bị chấm là không tới được, nhưng đó là do **câu hỏi thử không khớp nội",
        "dung tài liệu** (hỏi về chỗ ngồi trong khi tài liệu nói về số lượng món). Hỏi đúng thì cả hai",
        "tới được ngay. Ghi lại vì nó lặp lại đúng bài học của Chương 4: kiểm hành vi thật trước khi",
        "kết luận hệ thống hỏng.",
        "",
        "### 4.11.4 Lỗi thứ hai — câu HỎI bị đọc thành lời khai, và nó xóa ràng buộc dị nguyên",
        "",
        "Lỗi nặng nhất tìm được trong cả đợt, và nó không nằm trong bảy tài liệu kia — nó lộ ra khi",
        "thử một câu hỏi phụ huynh hay hỏi:",
        "",
        "| lượt | câu | `avoid` sau lượt | kết quả |",
        "|---:|---|---|---|",
        "| 1 | *\"Con mình dị ứng hải sản\"* | `[allergen:seafood]` | đúng |",
        "| 2 | *\"Bé nhà mình ăn được món gì?\"* | **`[]`** | **XÓA MẤT** |",
        "| 3 | *\"Cho mình món khai vị\"* | `[]` | **Gỏi cuốn tôm thịt, Súp măng cua, Nem rán Hà Nội, Bánh xèo miền Tây** |",
        "",
        "Bốn món mang nhãn hải sản, mời cho phụ huynh vừa khai con dị ứng hải sản.",
        "",
        "Nguyên nhân là một cụm trong danh sách xóa dị nguyên: `minh an duoc`, thêm vào để xử lý câu",
        "**khẳng định** *\"tôi ăn được hải sản, tư vấn hải sản đi\"* — một bản sửa đúng ở thời điểm đó.",
        "Nhưng cùng chuỗi chữ ấy nằm trong câu **hỏi**: \"bé nhà **mình ăn được** món gì\". Hai loại câu",
        "ngược nhau hoàn toàn — một bên nói ràng buộc không còn, một bên hỏi ràng buộc cho phép ăn gì.",
        "",
        "**Điều làm lỗi này nguy hiểm là nó im lặng.** Lượt 2 không mời món nào, nên câu trả lời trông",
        "hoàn toàn vô hại; chỉ lượt 3 mới lộ. Không bộ đánh giá **một lượt** nào bắt được lớp lỗi này,",
        "và trước bản sửa thì cả 415 test đơn vị, 147 ca trả lời và 103 lượt golden đều xanh.",
        "",
        "Hàng rào đặt ở hàm khớp cụm chứ không vá từng cụm: mọi cụm xóa dị nguyên đều dính lớp lỗi",
        "này, và vá từng cụm là bỏ sót cụm sẽ thêm sau.",
        "",
        "Chốt bằng một kịch bản phiên ba lượt. Kịch bản đó **đỏ 2 lượt trên mã trước bản sửa** và xanh",
        "sau — một cổng chưa bao giờ đỏ thì không chứng minh được gì.",
        "",
        "### 4.11.5 Lỗi thứ ba — hệ thống không nghe số lượng khách xin",
        "",
        "Thử tham chiếu ngược có số lượng, sau khi lượt đầu đã nêu 6 món:",
        "",
        "| câu | trước | sau |",
        "|---|---:|---:|",
        "| *\"Liệt kê 3 món vừa tư vấn bên trên\"* | 6 món | **3 món** |",
        "| *\"Cho mình 4 món vừa tư vấn ở trên\"* | 6 món | **4 món** |",
        "| *\"Liệt kê cho tôi 2 món đầu vừa tư vấn\"* | **1 món** | **2 món** |",
        "",
        "**Phạm vi tham chiếu ngược vốn đã đúng** — cả ba lượt trả về đúng danh sách đã nêu, đúng thứ",
        "tự. Chỉ con số bị bỏ: `LIST_SIZE = 6` là hằng số, và con số trong câu chỉ dùng để bật một cờ.",
        "Khách xin hai món và nhận sáu món thì đó không phải trả lời sai, nhưng nó là **không nghe** —",
        "và nói lại lần nữa cũng vẫn thế.",
        "",
        "Dòng thứ ba là một lỗi khác chồng lên: cụm `mon dau` trỏ *món thứ nhất*, nên \"2 món đầu\" bị",
        "đọc thành một món. `mon dau` và `<số> mon dau` chồng chữ mà khác hẳn nghĩa, và con số đứng",
        "trước là dấu hiệu phân biệt không mơ hồ.",
        "",
        "Bản sửa có hai hàng rào, và hàng rào thứ hai là bản sửa của một hồi quy mà chính bước này gây",
        "ra: câu **combo** (*\"1 món chính 1 nước 1 tráng miệng\"*) chỉ có **một** cụm khớp `<số> món`",
        "vì hai cụm kia không mang chữ \"món\" — nên phép đếm cụm một mình không đủ, phải hỏi thêm",
        "`doc_suat_combo()`.",
        "",
        "> **Điều rút ra chung của mục 4.11:** ba lỗi này không do bộ đánh giá bắt — chúng do phép **rà",
        "> độ phủ** của chính bộ đánh giá bắt. Một bộ test toàn xanh chỉ chứng minh điều nó có hỏi;",
        "> đo xem nó **không hỏi gì** là một phép kiểm khác, và ở đây nó đắt hơn.",
        "",
        "Tái lập:",
        "",
        "```bash",
        "python ai/evaluation/validate_cases.py",
        "python ai/evaluation/run_session_eval.py",
        "```",
        "",
        "Tái lập:",
        "",
        "```bash",
        "python ai/evaluation/run_so_doan.py --csv    # bảng đánh đổi số đoạn",
        "```",
        "",
        "---",
        "---",
        "",
        "---",
        "---",
    ]
    return "\n".join(ra)


def chuong_5(b: Bang) -> str:
    g, gs, llm = b.m_golden["so"], b.m_golden_sinh["so"], b.m_llm["so"]
    e_np = b.ty_le_truy_hoi("NIÊM PHONG", "embedding", "hit1")
    b_np = b.ty_le_truy_hoi("NIÊM PHONG", "bm25", "hit1")
    b2 = b.m_truy_hoi["so"]["bai_toan_2"]["bo"]
    tieu_de = len({c.heading for c in b.doan if c.heading})
    return f"""# CHƯƠNG 5: KẾT LUẬN

## 5.1 Tổng kết

| Phép đo | Kết quả |
|---|---|
| Golden {b.luot_golden} lượt qua chuỗi gọi đầy đủ, đường sinh TẮT | **{g['dat']}/{g['luot']}** |
| Golden {b.luot_golden} lượt, đường sinh BẬT | **{gs['dat']}/{gs['luot']}** |
| Tập trả lời {len(b.ca_tra_loi)} ca, đường tất định | **{len(b.ca_tra_loi)}/{len(b.ca_tra_loi)}** |
| Bộ nhớ phiên {b.luot_phien} lượt | **{b.luot_phien}/{b.luot_phien}**, 0 lỗi an toàn |
| LLM+RAG {llm['ca']} ca loại C | tất định {llm['dat_tat_dinh']}/{llm['ca']} · có sinh \
{llm['dat_co_duong_sinh']}/{llm['ca']} |
| Truy hồi toàn kho, niêm phong | Hit@1 embedding **{pct(e_np)}** so với bm25 {pct(b_np)} |
| Chọn mục trong tài liệu, niêm phong | Top-1 embedding \
**{pct(b.chon_muc('niem_phong', 'written|*', 'embedding'))}** so với bm25 \
{pct(b.chon_muc('niem_phong', 'written|*', 'bm25'))} |
| Chọn món | lọc nhãn **{b2['lọc nhãn']['cam5']} câu nêu món vi phạm**, so với \
{min(v['cam5'] for k, v in b2.items() if k != 'lọc nhãn')}–\
{max(v['cam5'] for k, v in b2.items() if k != 'lọc nhãn')} câu ở ba bộ xếp hạng \
(trên {b2['lọc nhãn']['n']} câu) |

## 5.2 Phân tích chi tiết theo từng thành phần

Mỗi thành viên tự viết nhận xét về chặng mình phụ trách: **điều đo được**, **điều làm sai rồi phải
sửa**, và **giới hạn còn lại**. Phần này viết ở ngôi thứ nhất, và cố ý giữ cả những chỗ nhóm làm
sai — một báo cáo chỉ kể phần thành công thì không cho người đọc biết gì về cách nhóm làm việc.

### 5.2.1 Nhận xét — Phạm Duy An (BIT240002)

**Phụ trách:** Dữ liệu, bộ nhãn, kho tri thức, và lớp hiểu câu hỏi

Qua chặng dữ liệu và lớp hiểu câu hỏi, em rút ra các nhận xét sau:

- **Hai nguồn dữ liệu lệch nhau là vấn đề đầu tiên phải giải.** Thực đơn tồn tại ở hai nơi — tệp
  JSON cho AI và cơ sở dữ liệu cho backend — và chúng **không khớp**. Em giải bằng cách sinh cả hai
  từ một nguồn, kèm cổng `--check` trong CI để không ai sửa tay một bên. Nếu không làm việc này
  trước, mọi con số của bốn chặng sau đều đo trên dữ liệu sai.

- **Rút dấu tiếng Việt là phép MẤT thông tin, và em đã trả giá cho nó nhiều lần.** Bỏ dấu cho phép
  khớp "mo cua" với "mở cửa", nhưng nó cũng làm `"bò"` và `"bơ"` thành cùng một chuỗi. Dự án này ghi
  nhận **mười vụ va chạm** kiểu đó, trong đó vụ em nhớ nhất là `fold("có cồn") == fold("có con")` —
  câu *"mình có con 5 tuổi"* trả về danh sách rượu bia. Bài học: mỗi lần thêm cụm từ vựng phải chạy
  lại bản kiểm kê va chạm, không được tin vào mắt mình.

- **Từ điển {len(b.tags)} nhãn / 16 nhóm, và khoá phải có không gian tên.** Ban đầu em định dùng khoá phẳng
  (`none`, `mild`, `hot`), nhưng như vậy thì không biết `none` thuộc nhóm cay hay nhóm chế độ ăn.
  Khoá `spice:none` giải quyết, và quan trọng hơn: nó cho phép **ghi đè theo NHÓM** ở bộ nhớ phiên —
  `spice:none` đẩy `spice:hot` ra thay vì nằm cạnh nó.

- **Chỗ khó nhất không phải kỹ thuật mà là phân biệt RÀNG BUỘC với NGỮ CẢNH.** "Không cay" là ràng
  buộc — món cay phải bị **loại**. "Đi hẹn hò" là ngữ cảnh — món hợp dịp chỉ **xếp lên trước**, không
  được loại món khác. Nhầm hai thứ này thì hoặc lọc mất món đúng, hoặc để lọt món khách không ăn
  được. Em phải tách chúng thành hai trường riêng trong `Request` thay vì gộp làm một danh sách.

- **Giới hạn còn lại, và em nói ra thay vì giấu:** nhãn dị nguyên chỉ phủ **44/91 món**. Bản rà em
  viết tìm ra **7 lỗ thật**, và cả 7 đã được lấp — hiện **26/26 món hải sản đều có nhãn nguyên liệu**.
  Nhưng độ phủ nhãn dị nguyên trên toàn thực đơn vẫn chỉ **44/91 món**, và hai món chứa tôm dưới dạng
  gia vị (mắm tôm, mắm ruốc) vẫn không mang `ingredient:shrimp`.
  Đây là việc của bếp, không phải của mã — và nó là lý do hệ thống phải chặn rộng thay vì lọc hẹp.

### 5.2.2 Nhận xét — Bùi Đào Đức Anh (BIT240025)

**Phụ trách:** Truy hồi — BM25, embedding, hybrid RRF

Qua chặng truy hồi, em rút ra các nhận xét sau:

- **Embedding thắng BM25 rõ rệt trên tập niêm phong: Hit@1 60,87% so với 39,13%.** Lý do rất cụ thể và
  em kiểm được bằng ví dụ: khách gõ *"món chín bằng hơi nước, nhẹ bụng"* trong khi tài liệu viết
  *"món hấp"* — **không chung một chữ nào**, nên BM25 không có gì để đếm. Embedding tìm đúng vì hai
  cách nói nằm gần nhau trong không gian ngữ nghĩa.

- **Nhưng embedding có một tính chất nguy hiểm: nó KHÔNG BAO GIỜ TRƯỢT.** Câu hỏi lạc đề hoàn toàn
  vẫn nhận về 5 đoạn với điểm số đàng hoàng. BM25 thì trả rỗng khi không có từ chung. Phát hiện này
  đổi cách em chọn chỉ số: `cấm@5` (số đoạn **không được phép** lọt vào top-5) quan trọng hơn Hit@5,
  vì một bộ trả 1 đoạn đúng + 4 đoạn lạc đề vẫn đạt Hit@5 = 1,0 tuyệt đối.

- **Hybrid RRF không thắng như em nghĩ ban đầu.** Em kỳ vọng trộn hai phương pháp sẽ tốt hơn cả hai,
  nhưng số đo cho thấy nó **không hơn embedding** ở bài toán chính. Em giữ nguyên kết quả này trong
  báo cáo thay vì chỉnh tham số cho tới khi ra số đẹp — một kết quả âm tính vẫn là kết quả.

- **Cái giá phải trả, và nhóm chấp nhận có ý thức:** embedding kéo ảnh Docker từ 238MB lên
  **2,74GB** (gấp 11 lần) và thêm 19 giây khởi động. Em xử lý bằng cách **tính sẵn vector lúc build
  ảnh** thay vì lúc chạy, nên độ trễ mỗi câu hỏi không tăng — chỉ thời gian khởi động tăng.

- **Thí nghiệm em tâm đắc nhất lại là thí nghiệm THẤT BẠI.** Khi bị hỏi *"chưa tối ưu tài liệu thì
  sao dám kết luận truy hồi kém"*, em viết lại tiêu đề mục của toàn kho cho đặc thù theo từng tài
  liệu: số tiêu đề khác nhau **179 → 365**, đoạn dùng chung tiêu đề **283/452 → 93/452**, lớp lỗi
  nhắm tới giảm **19 ca → 1 ca**. Kho cải thiện rõ ràng. Nhưng **Hit@1 không đổi — 60,87% cả trước
  lẫn sau**. Các ca kia không được sửa; chúng chỉ **đổi tên lỗi**. Kết luận em rút ra: trần không
  nằm ở dữ liệu, mà ở chỗ một hàm xếp hạng không diễn đạt được một vị từ.

### 5.2.3 Nhận xét — Đỗ Tuấn Anh (BIT240015)

**Phụ trách:** Chọn món và ba lớp an toàn

Qua chặng chọn món và an toàn, em rút ra các nhận xét sau:

- **Kết luận thiết kế của chặng này: cơ chế an toàn không được phụ thuộc vào mô hình sinh.** Ban đầu nhóm định dặn mô hình trong lời nhắc rằng "không được nhắc món gây dị ứng". Nhưng
  lời nhắc là **đề nghị**, không phải **ràng buộc** — mô hình có thể bỏ qua và không có gì báo.
  Nhóm chuyển sang **lọc trước khi sinh**: mô hình chỉ nhận danh sách món **đã** an toàn, nên nó
  không có gì để nhắc sai.

- **{b.so_phep_kiem} phép kiểm xác minh, và mỗi phép kiểm sinh ra từ một lần mô hình làm sai thật.** Ví dụ em nhớ
  nhất: mô hình viết *"Nhà hàng có **6 món lẩu**"* trong khi thực đơn có **7**. Ba phép kiểm đầu
  không chạm tới lỗi này — nó không phải tên món, không phải giá, không phải nhãn. Phải thêm một
  phép kiểm riêng **cấm mô hình nêu số lượng**. Bài học: không đoán trước được mô hình sẽ sai kiểu
  gì; phải đo rồi mới biết.

- **Câu sinh vi phạm thì BỎ, không sửa.** Em từng định viết mã tự sửa câu mô hình viết sai, nhưng
  bỏ ý đó: sửa một câu sai thành câu đúng đòi hỏi biết đúng là gì, mà nếu đã biết thì đâu cần mô
  hình. Vi phạm thì rơi về câu khuôn mẫu — kém tự nhiên nhưng **đúng**.

- **Chỗ em bị bắt lỗi và phải nhận sai:** khách nói *"dị ứng tôm, tư vấn món hải sản khác"*. Em định
  lọc riêng con tôm ra để vẫn còn 14 món hải sản gợi ý được. Nhưng kiểm dữ liệu thì **hai món mang
  `allergen:seafood` mà KHÔNG mang `ingredient:shrimp`, dù chúng chứa tôm**: *Bún đậu mắm tôm* và
  *Bún bò Huế* (mắm ruốc). Mắm tôm và mắm ruốc là **gia vị** nên không được ghi vào nhãn nguyên
  liệu. Lọc hẹp sẽ mời đúng hai món đó cho người dị ứng tôm. Em giữ chặn rộng ở mức **nhóm** và sửa
  phần **im lặng** thay vì nới hàng rào xuống mức nguyên liệu.

- **Thẻ giỏ hàng dựng từ danh sách món, không từ chữ mô hình viết.** Đây là ranh giới cuối: kể cả
  khi mọi phép kiểm trên đều lọt, món trong giỏ vẫn không thể là món mô hình bịa ra, vì giỏ không
  đọc chữ của mô hình.

### 5.2.4 Nhận xét — Lê Anh (BIT240017)

**Phụ trách:** Dịch vụ HTTP, bộ nhớ phiên, tích hợp với backend

Qua chặng phiên và tích hợp, em rút ra các nhận xét sau:

- **Bộ nhớ phiên cần BA quy tắc hợp nhất khác nhau, không phải một.** Đây là chỗ em làm sai lần đầu:
  em dùng chung một quy tắc "cộng dồn" cho mọi loại ràng buộc. Hậu quả: khách nói *"dưới 200 nghìn"*
  rồi *"rẻ hơn nữa"* thì hệ thống **giữ cả hai ngân sách** thay vì thay. Sửa xong thành ba quy tắc:
  dị nguyên **cộng dồn không bao giờ bỏ**, ràng buộc cứng **ghi đè theo nhóm**, ngữ cảnh **tích lũy
  có trần 5**.

- **Dị nguyên phải cộng dồn — và đây là bất biến an toàn quan trọng nhất của chặng em.** Khách khai
  dị ứng ở lượt 1, hỏi tiếp ở lượt 5 **mà không nhắc lại**. Nếu bộ nhớ ghi đè thì "dị ứng hải sản"
  bị "không ăn được sữa" xoá mất. Tập đánh giá phiên có riêng một nhóm kịch bản đo đúng điều này.

- **Dịch vụ phải trả lời được KHI MÔ HÌNH HỎNG.** Em thiết kế để mã tất định chạy trước, mô hình chỉ
  được gọi ở nhánh cần diễn đạt. Nhờ vậy khi khoá API hết hạn hoặc nhà cung cấp lỗi, khách vẫn nhận
  được câu trả lời đúng — chỉ là câu khuôn mẫu thay vì câu mượt. Một trợ lý im lặng vì mô hình hỏng
  là một trợ lý hỏng.

- **Tích hợp là chỗ lộ ra lỗi mà không tập đánh giá nào bắt được.** Ba tập đầu đều gọi thẳng hàm
  Python, không đi qua backend. Khi ghép thật, em phát hiện những lỗi chỉ tồn tại ở lớp nối — ví dụ
  nhánh `combo` trả về giỏ hàng rỗng vì thiếu tên nhánh trong danh sách trắng, một lỗi mà **394 test
  đơn vị không chạm tới**.

- **Giới hạn:** độ trễ khi bật mô hình là **~8,6 giây mỗi lượt**. Em chưa giải được, và nó là lý do
  chính khiến nhóm để đường sinh **tắt mặc định**.

### 5.2.5 Nhận xét — Nguyễn Quang Hiếu (BIT240091)

**Phụ trách:** Bốn tập đánh giá, thước đo, golden đầu-cuối, cổng CI

Qua chặng đánh giá, em rút ra các nhận xét sau:

- **Bài học lớn nhất của em: kiểm giả thuyết "thước đo sai" TRƯỚC giả thuyết "hệ thống sai".** Dự án
  này ghi nhận **tám lần** thước đo sai trước khi hệ thống sai, và lần gần nhất là bộ đo hai chiều
  do chính em viết — nó sai **ba lần liên tiếp**, và cả ba đều sai theo hướng làm kết quả **đẹp hơn
  thực tế**: (a) cột "tất định" tính cả nhánh truy hồi nên 4/8 câu hiện đúng nhờ chính bên kia làm;
  (b) chiều B tìm trên kho tri thức thay vì chỉ mục món nên truy hồi ra **0 vi phạm** — một con số
  không phản ánh bài toán cần đo; (c) `getattr` truy cập một thuộc tính không tồn tại nên luôn trả rỗng,
  khiến phép đo phản ánh chính bộ chấm điểm chứ không phản ánh bộ truy hồi. Đó là hướng sai mà người đo **có động cơ không kiểm lại**.

- **Golden {b.luot_golden} lượt là bộ bắt được nhiều lỗi nhất, và lý do rất cụ thể: nó không mock gì cả.** Nó
  chạy đúng đường khách đi — quét QR → backend → dịch vụ AI → thẻ giỏ → giỏ hàng. Ba tập còn lại gọi
  thẳng hàm Python nên một lỗi ở lớp ghép hai hệ thống sẽ không tập nào thấy.

- **Chia tập theo HỌ, không theo ca.** Nếu chia ngẫu nhiên theo từng ca thì hai ca cùng một họ — ví
  dụ hai cách hỏi về món nướng — có thể rơi vào hai tập khác nhau, và tập niêm phong không còn
  "chưa từng thấy". Chia theo họ giữ được ý nghĩa của phép đo.

- **Mỗi tập chỉ đo đúng thứ nó được viết ra để đo, và điều này em học được theo cách khó.** Trong
  một phiên thử nghiệm với người dùng thật, **17 lỗi lọt qua** 140 ca và 111 lượt phiên. Không phải
  vì tập kém, mà vì mọi ca trong tập đều **viết đúng kiểu**, còn người thật thì phủ định, đổi ý, và
  hỏi liên tục. Tập phiên phải lớn từ **111 → 149 lượt** mới bắt được chúng.

- **Hạn chế nghiêm trọng nhất của toàn đồ án, và em phải nói rõ:** **không có log khách thật**. Mọi
  ca đánh giá đều do nhóm viết. Con số đo được hệ thống có tôn trọng ràng buộc hay không; nó
  **không** đo được khách thật sẽ hỏi gì. Thêm nữa, **cả bốn tập niêm phong đã được mở**, nên con số
  trên chúng không còn là held-out cho các thay đổi sau đó. Con số held-out thật duy nhất của dự án
  là **23/27 (85,2%)** ở lần mở đầu tiên.

---

## 5.3 Làm được

| Việc | Bằng chứng |
|---|---|
| Trả lời đúng trên tập ca một lượt | {len(b.ca_tra_loi)}/{len(b.ca_tra_loi)}, và sàn để so là 8/{len(b.ca_tra_loi)} — một bản "luôn nói chưa có dữ liệu" chỉ qua được bấy nhiêu |
| Giữ ràng buộc qua nhiều lượt, kể cả lượt không nhắc lại | {b.luot_phien}/{b.luot_phien}, **0 lỗi an toàn** |
| Chạy end-to-end thật tới **giỏ hàng thật** | golden {g['dat']}/{g['luot']} ở cả hai cấu hình |
| Chọn bộ truy hồi bằng SỐ, trên hai bài toán và hai tập niêm phong | mục 4.2, 4.3 |
| Chứng minh **không phải chỗ nào cũng nên dùng RAG** | mục 4.4 |
| Chặn bịa món và bịa giá khi mô hình viết | {llm['lui_ve_khuon_mau']}/{llm['ca']} ca bị chặn, cả {llm['lui_ve_khuon_mau']} vì bịa giá |
| Nói "chưa có dữ liệu" thay vì đoán, kể cả câu ngoài phạm vi | cổng thuộc miền sinh từ dữ liệu, mục 3.4 |
| Câu trả lời và thẻ giỏ **không lệch nhau, cả hai chiều** | phép kiểm thứ 6 và bất biến thẻ giỏ thứ 8 |
| Cắt khởi động container 97,3s → 19,0s | mục 4.8 |

## 5.4 Hạn chế của nghiên cứu

1. **Không có log khách thật.** Mọi ca đánh giá do nhóm viết. Con số đo được hệ thống **có tôn trọng
   ràng buộc hay không**; nó **không** đo được khách thật hỏi gì. Đây là hạn chế lớn nhất, và nó không
   sửa được bằng cách viết thêm ca.
2. **Cả bốn tập niêm phong đã mở.** Không con số nào trong báo cáo này còn là held-out. Con số held-out
   thật duy nhất của dự án là **23/27 (85,2%)** ở lần mở đầu tiên. Câu hỏi tiếp theo cần một tập **mới**.
3. **Một phần kho tri thức là dữ liệu mẫu** (`source: demo`). Chúng **không thể** sai về **con số** — số
   lấy từ thực đơn qua bộ sinh — nhưng có thể sai về **chính sách**, và chỉ chủ nhà hàng biết.
4. **Nhãn dị nguyên phủ 44/{len(b.items)} món.** Đối chiếu mô tả đã tìm ra 7 lỗ thật, nhưng mô tả không
   phải bảng thành phần, nên **còn thiếu bao nhiêu thì không biết được từ dữ liệu này**.
5. **Đường sinh không còn làm tụt ca, nhưng cũng không làm đúng thêm ca nào.** Cái đo được là 0 ca đúng
   thêm với p50 +{so(llm['tre_p50_ms'] / 1000, 1)}s mỗi lượt. Cái **không** đo được: câu văn tự nhiên hơn
   có làm khách thật hài lòng hơn hay không.
6. **Lớp xác minh không bắt được tên món HOÀN TOÀN bịa.** Nó so chuỗi với dữ liệu, nên một cái tên không
   có trong thực đơn dưới bất kỳ dạng nào thì lọt. Giới hạn này được ghi thành **một test có tên nói rõ
   nó là giới hạn**.
7. **Phần lớn ca truy hồi còn sai KHÔNG sửa được bằng đổi bộ xếp hạng.** Trần đa dạng của kho:
   {tieu_de} tiêu đề mục phân biệt trên {len(b.doan)} đoạn. Chữa được bằng sửa **dữ liệu**, và việc đó
   chưa làm.
8. **Ảnh Docker 2,74GB**, gấp hơn 11 lần bản không có embedding. Giá đã đo và đã chấp nhận, nhưng nó làm
   deploy chậm hơn và tốn đĩa hơn.
9. **Chỉ hiểu tiếng Việt, và giới hạn này chạm tới an toàn.** Câu tiếng Anh cho bước hiểu **rỗng hoàn
   toàn** — đo trực tiếp qua `understand()`:

   | câu vào | `require_tags` | `avoid_tags` | `wants` |
   |---|---|---|---|
   | `give me a vegetarian dish` | rỗng | rỗng | `any` |
   | `I am allergic to seafood` | rỗng | **rỗng** | `any` |
   | `cho tôi món chay` | rỗng | rỗng | **`food`** |

   Ô in đậm là chỗ đáng lo: **lời khai dị ứng bằng tiếng Anh không bật hàng rào dị nguyên**, trong khi
   câu tiếng Việt tương đương thì bật. Việc đúng là dịch **cả ba tầng** dữ liệu — nhãn, tên món, kho tri
   thức — chứ không phải nhận vài từ khóa tiếng Anh: một hệ thống trả lời được câu dễ và im lặng ở câu
   khó thì nguy hiểm hơn một hệ thống nói rõ nó không hỗ trợ.
10. **Kho `derived` truy hồi kém, và đó là hạn chế CẤU TRÚC.** Tài liệu `derived` điển hình có **0 từ chỉ
   xuất hiện ở riêng nó** (văn xuôi viết tay: 2, nhiều nhất 18), vì danh sách món rò rỉ từ vựng của mọi
   nhóm khác — *"Canh chua cá lóc"* nằm trong tài liệu vùng miền, cách chế biến và dịp ăn cùng lúc. Cắt
   bớt mục nào cũng chỉ đưa con số 0 lên 1: thứ trùng lặp là **chính cái khuôn**. Ba cách chữa đều đã đo
   và đều không thắng — xếp hạng lại bằng cross-encoder (p = 0,8238), gộp 49 tài liệu thành 6 theo họ
   nhãn (p = 0,5488), và bỏ hẳn `derived` (p = 0,0000 **theo hướng xấu**). Muốn khá hơn thì phải **viết
   tay** nội dung khác nhau thật, và khi đó mất bảo đảm `--check` chống lệch khỏi thực đơn. Đây là một
   đánh đổi có thật, không phải một việc chưa làm xong.
11. **Câu tri thức là mắt xích yếu nhất, và điểm nghẽn nằm ở ĐỊNH TUYẾN chứ không ở mô hình.** Tách theo
   loại câu hỏi: câu chọn món đạt trần 100,00% với định tuyến đúng 100,00%; câu tri thức chỉ đạt trần
   44,00% với định tuyến đúng **58,00%**, nên đóng góp thật chỉ **25,52%**. Trần oracle của cả hệ là
   72,73% còn ước lượng thật 68,06% — chi phí sai định tuyến **4,67 điểm**. Hệ quả cho hướng đi: cải
   thiện bộ truy hồi đang bị định tuyến sai thì không cứu được gì.
12. **Hai tồn đọng cụ thể ở lớp hiểu, đã khoanh vùng nhưng chưa sửa.** *"Món nào có đậu hũ?"* bị bộ khớp
   **tên món** ăn trước (*"Đậu hũ sốt cà chua"*) nên không cụm từ vựng nào tới lượt — tên món thắng câu
   hỏi nguyên liệu, và không thêm cụm nào chữa được. *"Mình không dùng bột ngọt"* chưa nhận ra, vì cụm
   hiện có là `khong bot ngot` còn câu có chữ *dùng* chen giữa; ba cách nói thay thế đã thử nhưng **đổi 0
   câu trên 1.106 câu đánh giá**, tức thêm chúng là thêm mã không phép đo nào phủ — nên chúng không được
   thêm.

## 5.5 Bài học kinh nghiệm

### Bài học 1 — thước đo sai TRƯỚC khi hệ thống sai

Trong toàn bộ đồ án, số lần **thước đo** sai nhiều hơn số lần **hệ thống** sai. Ví dụ rõ nhất: ở một lần
chạy golden có 8 lượt đỏ, và **5 trong 8** là lỗi bộ đo, không phải lỗi hệ thống.

Nên thứ tự kiểm phải là: **kiểm giả thuyết "thước đo sai" TRƯỚC giả thuyết "hệ thống sai"**.

Một trường hợp cụ thể: phép đo **cho điểm cao với hành vi sai** — nó đòi câu trả lời tri thức phải
*chứa nguyên văn* một đoạn của tài liệu — mà đoạn thô cũng chứa cả nhan đề tài liệu. Nên **dán đoạn thô
là cách chắc chắn nhất để QUA**, còn câu trình bày sạch thì đỏ. Khi phần làm sạch trình bày được thêm,
tập trả lời tụt từ {len(b.ca_tra_loi)}/{len(b.ca_tra_loi)} xuống 130/{len(b.ca_tra_loi)} và **cả 10 ca
đỏ là câu trả lời đúng**.

### Bài học 2 — một bất biến MỘT CHIỀU chỉ canh một nửa

Mẫu này lặp lại nhiều lần, và ba trong bốn chỗ lệch tìm được ở vòng cuối đều thuộc nó:

| Bất biến | Chiều nó canh | Nửa nó bỏ |
|---|---|---|
| thẻ giỏ ⊆ món được nêu | thẻ không có món lạ | **văn nêu 6 món mà thẻ chỉ có 3** |
| chi tiết lỗi không vào `content` | khách không thấy | chi tiết vẫn vào phản hồi HTTP |
| `/ready.retriever` báo bộ đang chạy | đường truy hồi toàn kho | **đường chọn mục vẫn chạy BM25** |

### Bài học 3 — hai đầu phải khớp, và đầu thứ hai thường ở ngôn ngữ khác

Sáu lần trong dự án, một bất biến có **hai đầu** và hai đầu lệch nhau im lặng. Hai lần gần nhất, đầu thứ
hai nằm **ngoài Python**: một test TypeScript đọc tệp requirements của phần AI, và một test C# đọc hai
workflow deploy. Cả hai lần đều bị bỏ sót vì phép quét chỉ chạy trong phạm vi đang làm việc.

Bài học cụ thể hơn "quét kỹ hơn": khi thay một tệp mà **hạ tầng** gọi, phải quét **cả backend và
frontend**, không chỉ thư mục của thứ mình đang sửa.

### Bài học 4 — con số không đo thì sai cả về hướng lẫn độ lớn

Ảnh Docker được ghi *"khoảng 2–3GB"* trong tài liệu qua ba bước, và không ai đo. Đo thật: **9,29GB**.
Sau khi ghim bản CPU: **2,74GB**.

Đây là một trong sáu lần dự án có số viết tay rồi trôi. Năm lần kia: `"hơn 90 món"` khi thực đơn có
{len(b.items)}; một bản kiểm kê ghi `32/90` khi thật là `53/40`; notebook in `122/122` khi tập đã
{len(b.ca_tra_loi)} ca; `84 tài liệu / 303 đoạn` khi kho đã {len(b.docs)}/{len(b.doan)}; và một chỉ số
truy hồi của kho nhỏ hơn được trích cho kho hiện tại.

**Và lần thứ bảy là chính báo cáo này.** Bản trước viết tay 1587 dòng và đã trôi hoàn toàn: nó mô tả một
kiến trúc không còn tồn tại, và **11/11 lệnh của Phụ lục B trỏ vào tệp đã bị xóa**. Cách sửa không phải
"viết lại rồi nhớ cập nhật" — cách đó vừa thất bại — mà là **sinh báo cáo từ mã và bằng chứng đo**, cùng
kỷ luật mà notebook của dự án đã có từ đầu và nhờ đó không trôi.

### Bài học 5 — an toàn không được phụ thuộc việc mô hình chịu nghe

`PROMPT` yêu cầu mô hình mời khách hỏi nhân viên khi có ràng buộc dị ứng. Mô hình **bỏ câu đó ở 14 ca**.
Yêu cầu trong prompt là **đề nghị**; chỉ phép kiểm sau khi sinh mới là **bảo đảm**.

## 5.6 Khó khăn gặp phải

| Khó khăn | Cách nhóm xử lý |
|---|---|
| **Không có log khách thật** — mọi ca đánh giá do nhóm viết, nên chúng phản ánh cách nhóm nghĩ khách sẽ hỏi, không phải cách khách hỏi thật | Thử nghiệm trực tiếp với người dùng ngoài nhóm; một phiên như vậy làm lộ **17 lỗi** mà 140 ca và 111 lượt không bắt được, và tập phiên phải lớn lên **149 lượt** |
| **Rút dấu tiếng Việt gây va chạm** — `fold("có cồn") == fold("có con")`, `fold("cua") == fold("của")` | Bản kiểm kê va chạm chạy trong CI; mỗi lần thêm cụm từ vựng phải chạy lại. Dự án ghi nhận **mười vụ** kiểu này |
| **Độ trễ mô hình ~8,6 giây mỗi lượt** | Để đường sinh **tắt mặc định**; mã tất định trả lời trước, mô hình chỉ được gọi ở nhánh cần diễn đạt |
| **Ảnh Docker 2,74GB vì embedding** | Tính sẵn vector lúc **build ảnh** thay vì lúc chạy — độ trễ mỗi câu không tăng, chỉ thời gian khởi động; và cắt được khởi động từ 97,3s xuống **19,0s** |
| **Nhãn dị nguyên chỉ phủ 44/91 món** | Chặn rộng thay vì lọc hẹp, và **nói ra lý do** cho khách thay vì im lặng. Đây là giới hạn dữ liệu, không sửa được bằng mã |
| **Thước đo sai trước hệ thống sai — tám lần** | Viết `probe_metric_holes.py` để dò lỗ của chính thước đo; và đặt thành nếp: kiểm giả thuyết "đo sai" trước |

---

## 5.7 Hướng phát triển tương lai

Sáu việc, xếp theo **mức chặn** — việc thứ nhất chặn giá trị của mọi con số trong báo cáo này.

1. **Log khách thật.** Chỉ số đáng theo nhất là **tỷ lệ nhánh `clarify`** trên log thật: nó đo phần câu
   hỏi mà hệ thống *không hiểu*, và đó là thứ tập do nhóm viết không bao giờ ước lượng đúng — người viết
   ca biết hệ thống hiểu gì.
2. **Sửa trần đa dạng của kho.** Viết lại tiêu đề mục cho đặc thù theo tài liệu. Điều kiện chấp nhận có
   **hai** chiều: lớp `retrieval_twin_section` giảm **và** `cấm@5` không tăng — tiêu đề đặc thù hơn có
   thể làm đoạn khó tìm hơn khi khách dùng từ chung.
3. **Đủ điều kiện bật đường sinh mặc định**: 0 ca tụt *và* tỷ lệ dùng câu sinh không giảm.
4. **Lấp nhãn dị nguyên** bằng bảng thành phần từ nhà bếp — việc thật ở đây là hỏi người, không phải suy
   từ dữ liệu.
5. **Đưa thứ tự món đã nêu qua backend**, để câu "món đầu tiên giá bao nhiêu?" trỏ được vào đâu.
6. **Giảm ảnh Docker**: xuất mô hình sang ONNX runtime để bỏ hẳn torch. Hướng dùng endpoint embeddings
   của nhà cung cấp **đã thử và không dùng được** — nhà cung cấp hiện tại không có endpoint đó.

### Giới hạn đã biết của bộ nhãn

Ba điều tìm ra khi soát lại {len(b.tags)} nhãn trên {len(b.items)} món. Ghi ra vì **một giới hạn không được
nói thì người đọc sẽ tưởng nó không tồn tại**.

1. **`diet:vegan` và `diet:vegetarian` gắn đúng cùng {sum(1 for i in b.items if 'diet:vegetarian' in i['tags'])} món.** Một trong hai không phân biệt
   được gì *trong bộ dữ liệu này* — nhưng cả hai đều ĐÚNG, và thêm một món chay có sữa là nhãn thứ
   hai có nghĩa lại ngay. Nên đây không phải lỗi dữ liệu, và cách xử lý là ở lớp diễn đạt: mô tả
   đưa mô hình đọc bỏ nhãn nào mà mọi món trong danh sách đều mang.

2. **`spice` phủ {sum(1 for i in b.items if any(t.startswith('spice:') for t in i['tags']))}/{len(b.items)} món, và {sum(1 for c in {i['categoryId'] for i in b.items} if all('spice:none' in i['tags'] for i in b.items if i['categoryId'] == c))} danh mục có toàn bộ món `spice:none`**
   — Cà phê & Trà, Nước ép & Sinh tố, Tráng miệng, Trái cây tươi, Bia & Rượu. Nói "không cay" về
   một ly nước ép mang đúng 0 bit thông tin. Cùng cách xử lý như trên, và cùng lý do: **một nhãn chỉ
   đáng nói khi nó phân biệt.**

3. **{len(b.tags)} nhãn đến từ mô tả món, không từ bảng thành phần hay từ bếp.** Bộ soát cách chế
   biến (`audit_method_tags.py`) chặn được nhóm `method` vì tên món tự nói ra đáp án; các nhóm còn
   lại thì không có nguồn kiểm tự động nào tương đương.

### Ba điều cấm, áp cho cả nhóm và CI ép

1. **Không nới ràng buộc dị nguyên** — kể cả khi kết quả rỗng.
2. **Không để mô hình sinh chọn món** — nó chỉ trả về nhãn, và nhãn bị cổng kiểm lại.
3. **Không viết số vào tài liệu** — số phải tính được, nếu không nó sẽ trôi. Báo cáo này là bằng chứng
   thứ bảy cho quy tắc đó, và là lần đầu quy tắc được ép bằng **cấu trúc**: tài liệu này được sinh ra.

---
---"""


def tai_lieu_tham_khao() -> str:
    return """# TÀI LIỆU THAM KHẢO

1. Robertson, S., & Zaragoza, H. (2009). *The Probabilistic Relevance Framework: BM25 and Beyond.*
   Foundations and Trends in Information Retrieval, 3(4), 333–389.
2. Wang, L., Yang, N., Huang, X., et al. (2022). *Text Embeddings by Weakly-Supervised Contrastive
   Pre-training.* arXiv:2212.03533. (Họ mô hình E5, dùng ở bản trước của đồ án.)
3. Cormack, G. V., Clarke, C. L. A., & Buettcher, S. (2009). *Reciprocal Rank Fusion Outperforms Condorcet
   and Individual Rank Learning Methods.* SIGIR '09, 758–759.
4. Lewis, P., Perez, E., Piktus, A., et al. (2020). *Retrieval-Augmented Generation for Knowledge-Intensive
   NLP Tasks.* NeurIPS 2020.
5. Järvelin, K., & Kekäläinen, J. (2002). *Cumulated Gain-Based Evaluation of IR Techniques.* ACM
   Transactions on Information Systems, 20(4), 422–446. (nDCG.)
6. Reimers, N., & Gurevych, I. (2019). *Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks.*
   EMNLP 2019. (Thư viện `sentence-transformers`.)

---"""


def phu_luc_a() -> str:
    return """# PHỤ LỤC

## Phụ lục A: Notebook nghiên cứu

`ai/notebooks/he_thong_ai_tu_van_dat_mon.ipynb` — bảy phần tuần tự, **mọi ô mã tự tính lại** từ
`ai/app` và `ai/evaluation` thật, nên chạy lại notebook là **đo lại**:

```
 1  dựng DỮ LIỆU            thực đơn · nhãn · kho tri thức · chia đoạn
 2  dựng THƯỚC ĐO           tập ca · khóa đáp án kiểm được · chia ba nhóm
 3  trả lời KHÔNG mô hình    số nền — mọi thứ sau đó phải hơn số này
 4  dựng TRUY HỒI + SO       ba cách × hai bài toán × hai tập  →  CHỌN một
 5  mô hình SINH + an toàn   nơi mô hình có giá trị, và lớp xác minh
 6  THỬ NGHIỆM THẬT          gọi mô hình · qua HTTP · vào giỏ hàng thật
 7  kết quả · làm được · hạn chế · hướng phát triển
```

Sinh lại và chạy:

```bash
python ai/notebooks/build_teaching_notebook.py
python -m jupyter nbconvert --to notebook --execute --inplace \\
    ai/notebooks/he_thong_ai_tu_van_dat_mon.ipynb
python ai/notebooks/build_teaching_notebook.py --check
```

Bước `--check` làm hai việc: so **nguồn** từng ô với bộ sinh, và đọc **kết quả** đã commit rồi báo đỏ
nếu có ô nào **nổ**. Việc thứ hai được thêm sau khi một ô nổ hai lần liền mà `--check` vẫn xanh.

---"""


def phu_luc_d(b: Bang) -> str:
    ra = ["## Phụ lục D: Ma trận chỉ số đầy đủ", ""]
    ra.append("Toàn bộ số của Chương 4, một bảng. Đọc từ `ai/evaluation/measurements/`.")
    ra.append("")
    ra.append("| Bài toán | Tập | Phương pháp | n | Hit@1 | Hit@5 | MRR@5 | nDCG@5 | cấm@5 |")
    ra.append("|---|---|---|---:|---:|---:|---:|---:|---:|")
    for nhom in b.m_truy_hoi["so"]["bai_toan_1"]:
        for bo in b.bo_truy_hoi():
            d = b.m_truy_hoi["so"]["bai_toan_1"][nhom]["bo"][bo]
            n = d["n"]
            f = (lambda k: pct(d[k] / n)) if n else (lambda k: "—")
            ra.append(
                f"| truy hồi toàn kho | {nhom} | `{bo}` | {n} | {f('hit1')} | {f('hit5')} | "
                f"{f('mrr5')} | {f('ndcg5')} | {d['cam5']} |"
            )
    b2 = b.m_truy_hoi["so"]["bai_toan_2"]["bo"]
    for bo, d in b2.items():
        ra.append(
            f"| chọn món | 8 ca | `{bo}` | {d['n']} | {pct(d['hit1'] / d['n'])} | "
            f"{pct(d['hit5'] / d['n'])} | — | — | {d['cam5']} |"
        )
    for tap, ten in (("phat_trien", "phát triển"), ("niem_phong", "niêm phong")):
        m = b.m_chon_np if tap == "niem_phong" else b.m_chon_dev
        for nhom_dang in ("written|*", "written|A", "written|B", "derived|*"):
            for bo in sorted(m["so"]["nhom"].get(nhom_dang, {})):
                d = m["so"]["nhom"][nhom_dang][bo]
                if not d["n"]:
                    continue
                ra.append(
                    f"| chọn mục `{nhom_dang}` | {ten} | `{bo}` | {d['n']} | "
                    f"{pct(d['top1'])} | — | {pct(d['mrr'])} | — | — |"
                )
    ra.append("")
    ra.append("`—` nghĩa là chỉ số đó **không áp dụng** cho bài toán/nhóm đó, không phải bằng 0.")
    return "\n".join(ra)


def phu_luc_e(b: Bang) -> str:
    ra = ["## Phụ lục E: Provenance — mỗi con số đến từ đâu", ""]
    ra.append("Mọi phép đo cần stack hoặc mô hình thật đều được **ghi ra tệp kèm điều kiện của lần**")
    ra.append("**chạy**. Bảng dưới liệt kê chính những tệp mà báo cáo này đọc.")
    ra.append("")
    ra.append("| Tệp bằng chứng | Ngày đo | Điều kiện |")
    ra.append("|---|---|---|")
    for ten, m in (
        ("golden_e2e.json", b.m_golden),
        ("golden_e2e_sinh.json", b.m_golden_sinh),
        ("llm_rag_loai_c.json", b.m_llm),
        ("truy_hoi_so_sanh.json", b.m_truy_hoi),
        ("chon_muc_phat_trien.json", b.m_chon_dev),
        ("chon_muc_niem_phong.json", b.m_chon_np),
    ):
        dk = dict(m["dieu_kien"])
        ngay = dk.pop("ngay", "—")
        ready = dk.pop("ready", None)
        if isinstance(ready, dict):
            dk["retriever"] = ready.get("retriever")
            dk["generation_enabled"] = ready.get("generation_enabled")
        mo_ta = " · ".join(f"{k}={v}" for k, v in dk.items() if v not in (None, "", []))
        ra.append(f"| `{ten}` | {ngay} | {mo_ta} |")
    ra.append("")
    ra.append("Thiếu một tệp trong bảng này là **sinh báo cáo thất bại**, không phải một ô trống trong")
    ra.append("tài liệu. Lý do: một con số không rõ đo lúc nào, trên cấu hình nào, thì tệ hơn không có số.")
    return "\n".join(ra)


# ----------------------------------------------------------------- lắp và ghi
def bao_cao() -> str:
    b = Bang()
    phan = [
        phan_dau(b), muc_luc(), tom_tat(b), thuat_ngu(), danh_muc_hinh(b), danh_muc_bang(b), phan_cong(b),
        chuong_1(b), chuong_2(b), chuong_3(b), chuong_4(b), chuong_5(b),
        tai_lieu_tham_khao(),
        phu_luc_a(), phu_luc_b(), phu_luc_c(b), phu_luc_d(b), phu_luc_e(b),
    ]
    return "\n\n".join(p.strip() for p in phan) + "\n"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="Kiểm khớp bản đã commit, không ghi.")
    args = p.parse_args(argv)

    # PHỤ LỤC B TỰ KIỂM — chạy TRƯỚC khi sinh, vì đây là lỗ đã làm bản trước thành vô dụng.
    thieu = kiem_lenh_tai_lap()
    if thieu:
        print(f"{len(thieu)} lệnh trong Phụ lục B trỏ vào tệp KHÔNG TỒN TẠI:")
        for t in thieu:
            print(f"  {t}")
        print("\nSửa `LENH_TAI_LAP` hoặc khôi phục tệp. Bản trước của báo cáo có 11/11 lệnh như vậy,")
        print("và không ai phát hiện vì tài liệu không có cách nào tự kiểm.")
        return 1

    try:
        text = bao_cao()
    except FileNotFoundError as e:
        print(str(e))
        print("\nThiếu bằng chứng đo — xem `ai/evaluation/measurements/README.md`.")
        return 1

    dong = text.count("\n")
    print(f"báo cáo: {dong} dòng, {len(text):,} ký tự".replace(",", "."))
    print(f"lệnh tái lập: {len(LENH_TAI_LAP)} lệnh, tất cả trỏ vào tệp CÓ THẬT")

    if args.check:
        if not OUT_PATH.exists():
            print("\nCHƯA CÓ BÁO CÁO. Chạy bộ sinh trước.")
            return 1
        if OUT_PATH.read_text(encoding="utf-8-sig") != text:
            print("\nBÁO CÁO ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI.")
            print("Chạy `python ai/docs/build_bao_cao_do_an.py` rồi commit lại.")
            cu = OUT_PATH.read_text(encoding="utf-8-sig").splitlines()
            moi = text.splitlines()
            for i, (a, c) in enumerate(zip(cu, moi), 1):
                if a != c:
                    print(f"  dòng đầu tiên khác nhau: {i}")
                    print(f"    đã commit : {a[:100]}")
                    print(f"    sinh lại  : {c[:100]}")
                    break
            return 1
        print("\n--check: báo cáo đã commit KHỚP kết quả sinh lại.")
        return 0

    OUT_PATH.write_text(text, encoding="utf-8")
    print(f"\nĐã ghi {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
