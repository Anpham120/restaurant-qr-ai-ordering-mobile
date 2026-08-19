# -*- coding: utf-8 -*-
"""So BM25 / embedding / hybrid trên HAI bài toán, không phải một.

Vì sao hai bài toán
-------------------
Câu hỏi "phương pháp nào tốt hơn" không có câu trả lời chung. Nó có câu trả lời **theo bài toán**,
và hệ thống này có đúng hai bài toán truy hồi khác nhau về bản chất:

    1. TRUY HỒI TRI THỨC   đoạn nào trả lời câu hỏi về chính sách, cách kết hợp món, vùng miền?
                           ứng viên: BM25 / embedding / hybrid
    2. CHỌN MÓN            món nào thỏa ràng buộc khách nêu?
                           ứng viên: BM25 / embedding / LỌC THEO NHÃN (cách hệ thống đang dùng)

Bài toán 2 là phần đáng báo cáo nhất, vì nó chứng minh **bằng số** rằng không phải chỗ nào cũng
nên dùng RAG. "Món nào dưới 50.000đ" — BM25 và embedding không hiểu số; lọc theo nhãn `price` đúng
tuyệt đối. Một dự án chỉ đo bài toán 1 sẽ kết luận "dùng RAG cho mọi thứ", và đó là kết luận sai.

Vì sao `forbidden@5` quan trọng hơn Hit@5
----------------------------------------
Hit@5 = 1,0 vẫn đúng khi bộ truy hồi trả 1 đoạn đúng và 4 đoạn lạc đề. Với hệ thống này thì 4 đoạn
lạc đề là 4 cơ hội để mô hình viết ra một câu trả lời sai về nhà hàng. Nên chỉ số quyết định là:

    forbidden@5     tỷ lệ ca lấy phải đoạn BỊ CẤM. Càng thấp càng tốt. Đây là chỉ số CHẶN.
    abstain         với ca `expect_nothing`: có biết KHÔNG trả lời không?

`abstain` bắt được cách lách quan trọng nhất: một bộ truy hồi **luôn trả về 5 đoạn** không bao giờ
"trượt" theo Hit@k — nó chỉ trả sai. Embedding luôn cho điểm cho mọi đoạn nên nó luôn trả đủ 5;
BM25 trả rỗng khi không chung từ nào. Khác biệt đó chỉ hiện ra ở chỉ số này.

Ba nhóm ca, và tập niêm phong chỉ mở MỘT LẦN
-------------------------------------------
    chốt         `kb-verbatim-topic`, `kb-out-of-scope`, `kb-number` — đo việc BIẾT KHI NÀO KHÔNG
                 TRẢ LỜI. Đỏ ở đây là CHẶN.
    phát triển   được xem, được sửa theo.
    niêm phong   `--sealed` mới chạy. Bài học đã trả giá: tập niêm phong của 119 ca đã dùng hết ở
                 bước 4, nên mọi con số sau đó không còn là held-out.

Giao thức đo độ trễ: SÀNG LỌC và CHỐT là hai giao thức khác nhau
----------------------------------------------------------------
    sàng lọc   1 lần chạy mỗi truy vấn. Đủ để loại phương án chậm gấp bậc.
    chốt       7 lần, lấy trung vị. Dùng cho số đưa vào báo cáo.

Bản cũ trộn hai giao thức rồi so 29ms với 81ms như cùng loại — hai con số đó không so được với
nhau. Ở đây `--latency-protocol` phải chọn rõ, và tên giao thức được IN RA cùng con số.

    python ai/evaluation/run_retrieval_comparison.py                    # chốt + phát triển
    python ai/evaluation/run_retrieval_comparison.py --sealed           # MỞ tập niêm phong
    python ai/evaluation/run_retrieval_comparison.py --ablation         # tắt từng cơ chế
    python ai/evaluation/run_retrieval_comparison.py --latency-protocol release
"""
from __future__ import annotations

import argparse
import collections
import datetime
import json
import math
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))

import chunk_selectors as CS  # noqa: E402
from rag import embedding as EMB  # noqa: E402
from rag.base import tokenize  # noqa: E402
from rag.bm25 import Bm25Index  # noqa: E402
from rag.hybrid import HybridRetriever  # noqa: E402

CASES_PATH = HERE / "retrieval_cases.json"
SPLIT_PATH = HERE / "retrieval_split.json"
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"
KNOWLEDGE_PATH = REPO_ROOT / "ai" / "knowledge"

# SỐ ĐOẠN hệ thống thật sự trích cho một câu trả lời tri thức.
#
# Đọc từ `answer.py` chứ không viết lại con số: thước đo chấm ở k khác k hệ thống dùng thì nó đo
# một hệ thống KHÔNG TỒN TẠI.
#
# Đây đúng là chuyện vừa xảy ra. `SO_DOAN_TRI_THUC` đổi từ 1 lên 2 sau khi đo được nó đưa tỷ lệ
# câu trả lời chứa tài liệu đúng từ 48,00% lên 64,00% (McNemar p = 0,0078) — nhưng bảng truy hồi
# vẫn chấm Hit@1, nên nó báo `written` 67,86% trong khi hệ thống vận hành ở **85,71%**.
#
# Chênh 17,85 điểm, và chênh theo hướng làm hệ thống trông tệ hơn thực tế.
try:
    import answer as _ANSWER  # noqa: E402
    SO_DOAN_VAN_HANH = _ANSWER.SO_DOAN_TRI_THUC
except Exception:  # pragma: no cover - chỉ xảy ra khi `ai/app` không nạp được
    SO_DOAN_VAN_HANH = 1

K = 5

# Số lần chạy mỗi truy vấn theo giao thức. Xem docstring: hai giao thức, không trộn.
LATENCY_RUNS = {"screening": 1, "release": 7}


# --------------------------------------------------------------------------- chỉ số
def hit_at(lay: list[str], dung: set[str], n: int) -> float:
    return 1.0 if set(lay[:n]) & dung else 0.0


def mrr_at(lay: list[str], dung: set[str], n: int) -> float:
    """Nghịch đảo hạng của đoạn ĐÚNG ĐẦU TIÊN. 0 nếu không có đoạn đúng nào trong n đầu."""
    for r, cid in enumerate(lay[:n], 1):
        if cid in dung:
            return 1.0 / r
    return 0.0


def ndcg_at(lay: list[str], dung: set[str], n: int) -> float:
    """nDCG nhị phân: mọi đoạn đúng có độ liên quan 1.

    Chuẩn hóa bằng IDCG của **số đoạn đúng thật sự có**, giới hạn ở n. Chuẩn hóa bằng n thay vì
    bằng `min(n, |đúng|)` sẽ trừng phạt ca chỉ có 1 đoạn đúng: nó không thể đạt 1,0 dù xếp hoàn
    hảo, và điểm trung bình khi đó phụ thuộc số đoạn đúng của từng ca hơn là phụ thuộc bộ truy hồi.
    """
    if not dung:
        return 0.0
    dcg = sum(1 / math.log2(r + 1) for r, cid in enumerate(lay[:n], 1) if cid in dung)
    idcg = sum(1 / math.log2(r + 1) for r in range(1, min(n, len(dung)) + 1))
    return dcg / idcg if idcg else 0.0


@dataclass
class Ketqua:
    n: int = 0
    hit1: float = 0.0
    hit5: float = 0.0
    mrr5: float = 0.0
    ndcg5: float = 0.0
    # forbidden@5 và abstain đếm theo SỐ CA, không lấy trung bình điểm — chúng là biến cố.
    forbidden_hits: int = 0
    abstain_cases: int = 0
    abstain_ok: int = 0
    # Ca `expect_nothing` mà tầng truy hồi KHÔNG đo được (không có đoạn cấm để tránh). Đếm riêng và
    # in ra, chứ không cộng vào `abstain_ok` — cộng vào là tự cho điểm.
    abstain_khong_do_duoc: int = 0
    # Hit tại k HỆ THỐNG DÙNG — xem `SO_DOAN_VAN_HANH`. Hit@1 vẫn được giữ vì nó là con số
    # so sánh chuẩn giữa các bộ truy hồi; con số này là con số VẬN HÀNH.
    hit_vh: float = 0.0
    scored_cases: int = 0     # ca có `expected`, dùng làm mẫu số cho Hit/MRR/nDCG
    latencies_ms: list[float] = None
    # Hit@1 của TỪNG ca, theo đúng thứ tự ca. Cần cho kiểm định GHÉP CẶP (McNemar): hai bộ chạy
    # trên cùng danh sách ca nên kết quả của chúng không độc lập, và chỉ có bảng theo-ca mới nói
    # được "hai bên khác nhau ở những ca nào". Bảng tổng không đủ để kiểm định.
    hit1_theo_ca: list[bool] = None
    ma_ca: list[str] = None

    def __post_init__(self):
        if self.latencies_ms is None:
            self.latencies_ms = []
        if self.hit1_theo_ca is None:
            self.hit1_theo_ca = []
        if self.ma_ca is None:
            self.ma_ca = []

    def them(self, lay: list[str], dung: set[str], cam: set[str], expect_nothing: bool,
             ma: str = "") -> None:
        self.n += 1
        if cam & set(lay[:K]):
            self.forbidden_hits += 1
        if expect_nothing:
            self.abstain_cases += 1
            # Ca `expect_nothing` KHÔNG có đoạn cấm thì tầng này không đo được gì.
            #
            # Bản trước tính "không lấy đoạn cấm nào" là đạt, nên với `forbidden` rỗng thì phép giao
            # luôn rỗng và abstain = 100% với MỌI phương pháp — kể cả một phương pháp trả bừa. Đó là
            # tiêu chí mã chết, và bằng chứng là golden bắt được truy hồi trả lời "Bạn là model gì?"
            # bằng một đoạn nói về lẩu trong khi bảng này báo 20/20.
            #
            # Nguyên nhân sâu hơn: một bộ truy hồi LUÔN trả về gì đó. Quyết định "không trả lời" nằm
            # ở lớp TRÊN nó (`answer.thuoc_mien` cùng vị trí của nhánh), nên nó không đo được ở đây.
            # Xem mục "CỔNG KHÔNG TRẢ LỜI" ở cuối báo cáo.
            if not cam:
                self.abstain_khong_do_duoc += 1
            elif not (cam & set(lay[:K])):
                self.abstain_ok += 1
            return
        self.scored_cases += 1
        h1 = hit_at(lay, dung, 1)
        self.hit1_theo_ca.append(bool(h1))
        self.ma_ca.append(ma)
        self.hit1 += h1
        self.hit_vh += hit_at(lay, dung, SO_DOAN_VAN_HANH)
        self.hit5 += hit_at(lay, dung, K)
        self.mrr5 += mrr_at(lay, dung, K)
        self.ndcg5 += ndcg_at(lay, dung, K)

    def hang(self, ten: str) -> str:
        # 0 ca chấm được thì in "-", KHÔNG in 0.000. In 0.000 nói "đã đo và bằng không", còn thật
        # ra là "không có ca nào để đo" — nhóm chốt toàn ca `expect_nothing` nên nó không có đoạn
        # đúng nào, và một bảng hiện 0.000 ở đó làm người đọc kết luận bộ truy hồi trượt sạch.
        m = self.scored_cases
        p50 = statistics.median(self.latencies_ms) if self.latencies_ms else 0.0
        p95 = (
            statistics.quantiles(self.latencies_ms, n=20)[18]
            if len(self.latencies_ms) >= 20 else max(self.latencies_ms, default=0.0)
        )
        if not self.abstain_cases:
            ab = "-"
        elif self.abstain_khong_do_duoc:
            do_duoc = self.abstain_cases - self.abstain_khong_do_duoc
            ab = (f"{self.abstain_ok}/{do_duoc}+{self.abstain_khong_do_duoc}?"
                  if do_duoc else f"0/0+{self.abstain_khong_do_duoc}?")
        else:
            ab = f"{self.abstain_ok}/{self.abstain_cases}"
        if m:
            diem = (f"{self.hit1 / m:>8.3f}{self.hit_vh / m:>8.3f}"
                    f"{self.hit5 / m:>8.3f}"
                    f"{self.mrr5 / m:>8.3f}{self.ndcg5 / m:>8.3f}")
        else:
            diem = f"{'-':>8}{'-':>8}{'-':>8}{'-':>8}{'-':>8}"
        return (
            f"{ten:12}{self.n:>5}{diem}"
            f"{self.forbidden_hits:>10}{ab:>9}{p50:>9.1f}{p95:>8.1f}"
        )


HEADER = (
    f"{'phương pháp':12}{'ca':>5}{'Hit@1':>8}{'Hit@' + str(SO_DOAN_VAN_HANH) + '*':>8}"
    f"{'Hit@5':>8}{'MRR@5':>8}{'nDCG@5':>8}"
    f"{'cấm@5':>10}{'abstain':>9}{'p50 ms':>9}{'p95':>8}"
)


# ------------------------------------------------- bài toán 1: truy hồi tri thức
def load_cases() -> list[dict]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8-sig"))["cases"]


def load_split() -> dict:
    return json.loads(SPLIT_PATH.read_text(encoding="utf-8-sig"))


def build_retrievers(*, fold_accents: bool = True, normalize: bool = True,
                     use_prefix: bool = True) -> list:
    """Dựng ba bộ truy hồi. Embedding bị BỎ QUA nếu thiếu thư viện — có ghi rõ.

    `fold_accents=False` chỉ đổi văn bản mà **BM25** thấy, không đổi văn bản embedding thấy. Bản
    đầu của tôi đổi chung, nên bảng ablation báo "tắt rút dấu làm embedding mất 0,011" — một con
    số vô nghĩa: rút dấu là cơ chế tách từ của BM25, embedding không dùng nó. Ablation gán mức mất
    cho phương pháp không có cơ chế đó là ablation đo sai chỗ.
    """
    chunks = CS.corpus()
    chunks_bm25 = chunks if fold_accents else _khong_rut_dau(chunks)

    bm25 = Bm25Index.build(chunks_bm25)
    ds = [bm25]
    if EMB.available():
        emb = EMB.EmbeddingIndex.build(chunks, normalize=normalize, use_prefix=use_prefix)
        ds.append(emb)
        ds.append(HybridRetriever(retrievers=[bm25, emb]))
    return ds


class _KhongRutDau:
    """Bọc một đoạn, giữ nguyên dấu khi tách từ — dùng cho ablation.

    Không sửa `tokenize` toàn cục: sửa hàm dùng chung để làm ablation là cách chắc chắn để một
    phép đo làm sai lệch phép đo khác. Ở đây chỉ đổi VĂN BẢN, còn hàm tách từ giữ nguyên.
    """

    def __init__(self, chunk):
        self.chunk_id = chunk.chunk_id
        # Thay dấu bằng ký tự không phải chữ để `fold` không rút được nữa: mục đích là mô phỏng
        # "không rút dấu", tức "muối" và "muoi" thành hai từ KHÁC nhau.
        self.text = chunk.text.replace("ê", "éx").replace("ô", "óx")


def _khong_rut_dau(chunks):
    return [_KhongRutDau(c) for c in chunks]


# Sáu nhóm nhãn TỪNG sinh tài liệu riêng. Kho không còn chúng — xem `build_knowledge.generate`.
#
# Phép phân loại giữ lại nhánh `derived` chứ không xoá: nếu ai đó sinh lại nhóm tài liệu ấy, bảng
# này phải TÁCH chúng ra ngay chứ không lặng lẽ gộp vào `written`. Gộp hai bài toán khác độ khó
# vào một con số là đúng thứ hàm này được viết ra để chặn.
NHOM_DERIVED = ("flavour", "health", "ingredient", "method", "occasion", "region")


def _loai_tai_lieu() -> dict:
    """doc_id -> 'written' | 'derived' | 'policy'.

    `derived` hiện luôn rỗng. `in_bang` bỏ qua nhóm không có ca nào, nên bảng tự gọn lại.
    """
    from rag.chunker import load_all

    ra = {}
    for d in load_all(KNOWLEDGE_PATH):
        if d.answer_mode == "verbatim":
            ra[d.doc_id] = "policy"
        elif d.doc_id.count(".") >= 2 and d.doc_id.split(".")[1] in NHOM_DERIVED:
            ra[d.doc_id] = "derived"
        else:
            ra[d.doc_id] = "written"
    return ra


def _nhom_cua_ca(case: dict, theo_khoa: dict, loai: dict) -> str:
    """Ca này nhắm vào loại tài liệu nào."""
    dich = set()
    for sel in case.get("expected", []):
        for k in sel.get("topic_keys_any", []):
            dich |= theo_khoa.get(k, set())
    ten = {loai.get(d) for d in dich}
    if len(ten) == 1:
        return ten.pop() or "?"
    return "trộn" if ten else "?"


def theo_loai_tai_lieu(retrievers, cases: list[dict], runs: int) -> None:
    """Tách con số truy hồi theo LOẠI TÀI LIỆU, không chỉ theo split.

    Vì sao phép tách này cần thiết
    ------------------------------
    Bảng theo split (chốt / phát triển / niêm phong) trộn hai bài toán khác hẳn nhau vào một con
    số. Kho có ba loại tài liệu, và chỉ hai loại nằm trong chỉ mục xếp hạng:

        policy   24 tài liệu, KHÔNG xếp hạng — tới bằng tra khóa, khớp chính xác
        written  36 tài liệu, văn xuôi viết tay — 174 tiêu đề mục khác nhau
        derived  49 tài liệu, sinh từ nhãn qua MỘT khuôn — đúng 4 tiêu đề mục cho cả 49

    Hai loại trong chỉ mục có độ khó khác nhau rất xa. Đo trên bộ chọn mục:

        written  Top-1 0,921
        derived  Top-1 0,674

    Và tài liệu `derived` điển hình có **0 từ riêng** — không từ nào mà tài liệu `derived` khác
    không có. Bộ nhúng không có gì bám vào ngoài tên nhãn, nên nó phải chọn giữa 4 mục gần giống
    hệt nhau, nhân 49 lần.

    Bộ 222 ca trộn **101 ca `written` với 110 ca `derived`**, nên con số tổng là trung bình cộng
    của hai bài toán khác độ khó — và tỷ lệ trộn 101:110 là ngẫu nhiên, không phản ánh gì. Đổi tỷ
    lệ đó là đổi con số mà hệ thống không đổi một dòng.

    Đây KHÔNG phải lý do bỏ `derived`: đo thật cho thấy bỏ nó khỏi chỉ mục làm 55/198 ca hỏng
    (60,10% -> 33,84%, McNemar p = 0,0000). Nó gánh phần lớn câu hỏi theo nhãn — chỉ là gánh kém.
    Việc phải làm là **tách con số**, không phải xóa tài liệu.
    """
    from rag.chunker import load_all

    loai = _loai_tai_lieu()
    theo_khoa: dict = {}
    for d in load_all(KNOWLEDGE_PATH):
        for k in d.topic_keys:
            theo_khoa.setdefault(k, set()).add(d.doc_id)

    theo_nhom: dict = {}
    for c in cases:
        theo_nhom.setdefault(_nhom_cua_ca(c, theo_khoa, loai), []).append(c)

    print("\n" + "=" * 78)
    print("TRUY HỒI TÁCH THEO LOẠI TÀI LIỆU — hai bài toán, không phải một")
    print("=" * 78)
    for ten_nhom in ("written", "derived", "trộn", "?"):
        cs = theo_nhom.get(ten_nhom)
        if not cs:
            continue
        nhan = {
            "written": "văn xuôi viết tay — BÀI TOÁN RAG THẬT",
            "derived": "sinh từ nhãn qua một khuôn — dữ liệu có cấu trúc",
            "trộn": "ca nhắm vào CẢ hai loại — không tách được",
            "?": "không tra được đích",
        }[ten_nhom]
        in_bang(f"nhóm `{ten_nhom}` ({len(cs)} ca) — {nhan}",
                do_bai_toan_1(retrievers, cs, runs))
    print("  Không gộp bốn bảng trên thành một con số: chúng đo những việc khác nhau, và tỷ lệ")
    print("  trộn giữa chúng là tính chất của TẬP CA chứ không phải của hệ thống.")


def do_bai_toan_1(retrievers, cases: list[dict], runs: int) -> dict[str, Ketqua]:
    kq = {r.name: Ketqua() for r in retrievers}
    for case in cases:
        dung = CS.select_many(case["expected"]) if case["expected"] else set()
        cam = CS.select_many(case["forbidden"]) if case["forbidden"] else set()
        for r in retrievers:
            batdau = time.perf_counter()
            for _ in range(runs):
                hits = r.search(case["query"], k=K)
            kq[r.name].latencies_ms.append((time.perf_counter() - batdau) * 1000 / runs)
            kq[r.name].them([h.chunk_id for h in hits], dung, cam, case["expect_nothing"],
                            case.get("case_id", ""))
    return kq


# ------------------------------------------------------- bài toán 2: chọn món
@dataclass
class MonAsChunk:
    """Món ăn đóng gói như một đoạn, để BM25/embedding xếp hạng được.

    Văn bản gồm tên, danh mục, mô tả và nhãn — tức MỌI thứ có trong dữ liệu. Cho chúng ít hơn thì
    phép so thành không công bằng: kết luận "lọc theo nhãn thắng" phải đúng cả khi hai bộ kia được
    thấy đủ dữ liệu.
    """

    chunk_id: str
    text: str


def load_menu() -> list[dict]:
    return json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))["items"]


def mon_thanh_doan(items: list[dict]) -> list[MonAsChunk]:
    ra = []
    for i in items:
        nhan = " ".join(t.split(":")[1].replace("_", " ") for t in i["tags"])
        ra.append(MonAsChunk(
            chunk_id=i["id"],
            text=f"{i['name']}. {i.get('categoryName', '')}. "
                 f"{i.get('description', '')} {nhan} {i['price']}",
        ))
    return ra


# Ca cho bài toán CHỌN MÓN. Khóa đáp án là ĐIỀU KIỆN, giải ra danh sách món khi chạy — cùng lối
# nghĩ với `menu_selectors.py`: danh sách viết tay không kiểm được, và bản cũ có 96 khóa trỏ sai.
#
# Mỗi ca kèm cách LỌC THEO NHÃN tương ứng, để phương pháp thứ ba có gì mà chạy.
def _sinh_ca_chon_mon() -> list[dict]:
    """Sinh bộ ca chọn món TỪ BỘ NHÃN, không viết tay.

    Vì sao phải sinh
    ----------------
    Bản đầu của bộ này viết tay **8 ca**. Với n = 8, nửa khoảng tin cậy 95% là **±28,5 điểm phần
    trăm** — quá thô để rút bất kỳ kết luận nào, trong khi nó lại đứng ở mục trả lời câu hỏi nghiên
    cứu chính của đồ án.

    Vấn đề thứ hai nghiêm trọng hơn quy mô: **8 ca đó do người viết chọn**. Khi tự chọn câu hỏi,
    người viết có xu hướng chọn những câu mình đã biết trước kết quả — và ở đây người viết đã biết
    trước rằng xếp hạng theo độ tương đồng sẽ thua ở ngưỡng số và phép loại trừ.

    Sinh từ bộ nhãn thì **dữ liệu quyết định danh sách câu hỏi**. Mỗi nhóm nhãn đóng góp số ca tỷ lệ
    với số giá trị nó có, không theo ý người viết.

    Năm dạng ràng buộc, và mỗi dạng là một phép toán khác nhau trên tập món:

        ngưỡng số   quan hệ THỨ TỰ trên số        "dưới 50.000đ"
        phân loại   thuộc/không thuộc một tập     "món miền Trung"
        phủ định    phần bù trong một nhóm        "không cay"
        phép trừ    phần bù trên toàn thực đơn    "tránh hải sản"
        phép hội    giao của hai điều kiện        "chay VÀ dưới 60 nghìn"
    """
    ra: list[dict] = []

    def them(ma, cau, loc, dang, vi_sao):
        ra.append({"id": ma, "query": cau, "loc": loc, "dang": dang, "why": vi_sao})

    # --- NGƯỠNG SỐ: xếp hạng theo độ tương đồng không có quan hệ thứ tự trên số ---
    for i, gia in enumerate((30_000, 50_000, 70_000, 100_000, 150_000, 200_000, 300_000), 1):
        them(f"pick-price-{i:02d}", f"Món nào dưới {gia // 1000} nghìn?", {"price_max": gia},
             "ngưỡng số",
             "Với BM25 và embedding, con số là một TỪ chứ không phải một LƯỢNG. Không có cách "
             "viết tài liệu nào biến 'dưới 50 nghìn' thành quan hệ giống nhau.")

    # --- PHỦ ĐỊNH và mức độ: 'không cay' chung gần hết chữ với 'cay' ---
    for i, (ten, nhan) in enumerate(
            (("không cay", "spice:none"), ("cay nhẹ", "spice:mild"),
             ("cay vừa", "spice:medium"), ("cay đậm", "spice:hot")), 1):
        them(f"pick-spice-{i:02d}", f"Món nào {ten}?", {"tags_all": [nhan]},
             "phủ định" if "không" in ten else "phân loại",
             "Bốn mức cay có mặt đủ để một bộ luôn trả 'không cay' không thể qua được cả bốn.")

    # --- PHÉP TRỪ: câu hỏi CHỨA chữ cần tránh, nên độ giống kéo đúng thứ đó lên đầu ---
    for i, (ten, nhan) in enumerate(
            (("hải sản", "allergen:seafood"), ("đậu phộng", "allergen:peanut"),
             ("sữa", "allergen:dairy"), ("trứng", "allergen:egg"),
             ("gluten", "allergen:gluten")), 1):
        them(f"pick-allergen-{i:02d}", f"Mình dị ứng {ten}, món nào tránh được?",
             {"tags_none": [nhan]}, "phép trừ",
             f"AN TOÀN. Câu hỏi chứa chữ '{ten}' nên phép đo độ giống kéo món CÓ {ten} lên đầu — "
             "ngược điều khách cần. Xếp hạng theo độ tương đồng không có phép trừ.")

    # --- PHÂN LOẠI: chế độ ăn, vùng miền, cách chế biến, sức khỏe ---
    for i, (ten, nhan) in enumerate((("chay", "diet:vegetarian"), ("thuần chay", "diet:vegan")), 1):
        them(f"pick-diet-{i:02d}", f"Mình ăn {ten}, có món nào không?", {"tags_all": [nhan]},
             "phân loại", "Chỗ BM25 tương đối mạnh vì tài liệu món chay có chữ 'chay'.")

    for i, (ten, nhan) in enumerate(
            (("miền Bắc", "region:north"), ("miền Trung", "region:central"),
             ("miền Nam", "region:south"), ("Hà Nội", "region:hanoi"),
             ("Huế", "region:hue"), ("Sài Gòn", "region:saigon")), 1):
        them(f"pick-region-{i:02d}", f"Có món {ten} nào không?", {"tags_all": [nhan]},
             "phân loại", "Nhãn vùng miền — lọc gộp được nhiều giá trị cùng nghĩa.")

    for i, (ten, nhan) in enumerate(
            (("nướng", "method:grilled"), ("hấp", "method:steamed"),
             ("chiên", "method:fried"), ("xào", "method:stir_fried")), 1):
        them(f"pick-method-{i:02d}", f"Món {ten} có những gì?", {"tags_all": [nhan]},
             "phân loại", "Cách chế biến thường có trong tên món, nên BM25 có cơ hội.")

    for i, (ten, nhan) in enumerate(
            (("ít calo", "health:low_calorie"), ("nhiều đạm", "health:high_protein"),
             ("thanh nhẹ", "health:light"), ("ít dầu mỡ", "health:low_fat")), 1):
        them(f"pick-health-{i:02d}", f"Món nào {ten}?", {"tags_all": [nhan]},
             "phân loại", "Nhãn sức khỏe hiếm khi có trong mô tả món.")

    for i, (ten, nhan) in enumerate(
            (("đậm đà", "flavour:rich"), ("chua", "flavour:sour"),
             ("ngọt", "flavour:sweet"), ("béo", "flavour:fatty"),
             ("thơm khói", "flavour:smoky"), ("mặn", "flavour:salty")), 1):
        them(f"pick-flavour-{i:02d}", f"Món nào vị {ten}?", {"tags_all": [nhan]},
             "phân loại", "Nhãn vị — mô tả món đôi khi có, đôi khi không.")

    for i, (ten, nhan) in enumerate(
            (("hẹn hò", "occasion:date"), ("tiếp khách", "occasion:business"),
             ("sinh nhật", "occasion:birthday"), ("đi nhậu", "occasion:drinking")), 1):
        them(f"pick-occasion-{i:02d}", f"Món nào hợp {ten}?", {"tags_all": [nhan]},
             "phân loại", "Nhãn dịp ăn gần như không bao giờ có trong mô tả món.")

    for i, (ten, nhan) in enumerate(
            (("một mình", "party:solo"), ("2-3 người", "party:two_three")), 1):
        them(f"pick-party-{i:02d}", f"Món nào hợp ăn {ten}?", {"tags_all": [nhan]},
             "phân loại", "Nhãn số người ăn — suy từ khẩu phần, không có trong chữ.")

    # --- PHÉP HỘI: hai điều kiện độc lập cùng lúc ---
    hoi = [
        ("Món nào vừa không cay vừa dưới 80 nghìn?",
         {"tags_all": ["spice:none"], "price_max": 80_000}),
        ("Món chay nào dưới 60 nghìn?",
         {"tags_all": ["diet:vegetarian"], "price_max": 60_000}),
        ("Món miền Trung nào không cay?",
         {"tags_all": ["region:central", "spice:none"]}),
        ("Món nướng nào dưới 200 nghìn?",
         {"tags_all": ["method:grilled"], "price_max": 200_000}),
        ("Mình dị ứng hải sản, món nào dưới 100 nghìn?",
         {"tags_none": ["allergen:seafood"], "price_max": 100_000}),
        ("Món chay nào không cay dưới 70 nghìn?",
         {"tags_all": ["diet:vegetarian", "spice:none"], "price_max": 70_000}),
    ]
    for i, (cau, loc) in enumerate(hoi, 1):
        them(f"pick-combo-{i:02d}", cau, loc, "phép hội",
             "HAI ràng buộc độc lập. Điểm giống là một số vô hướng đã trộn, không tách lại được "
             "thành hai điều kiện để ép cả hai cùng đúng.")

    return ra


CA_CHON_MON = _sinh_ca_chon_mon()


def _loc_theo_nhan(dieu_kien: dict, items: list[dict]) -> list[str]:
    ra = list(items)
    if "tags_all" in dieu_kien:
        ra = [i for i in ra if all(t in i["tags"] for t in dieu_kien["tags_all"])]
    if "tags_any" in dieu_kien:
        ra = [i for i in ra if any(t in i["tags"] for t in dieu_kien["tags_any"])]
    if "tags_none" in dieu_kien:
        ra = [i for i in ra if not any(t in i["tags"] for t in dieu_kien["tags_none"])]
    if "price_max" in dieu_kien:
        ra = [i for i in ra if i["price"] <= dieu_kien["price_max"]]
    return [i["id"] for i in ra]


class LocTheoNhan:
    """Phương pháp thứ ba của bài toán 2 — cách hệ thống đang dùng thật.

    Nó KHÔNG phải một bộ truy hồi: nó không xếp hạng, nó quyết định. Đưa vào cùng bảng là cố ý, vì
    câu hỏi cần trả lời là "chỗ này có nên dùng RAG không", và câu trả lời chỉ có nghĩa khi cách
    không-RAG cũng có trong bảng.
    """

    name = "lọc nhãn"

    def __init__(self, items, cases):
        self.items = items
        self.dieu_kien = {c["query"]: c["loc"] for c in cases}

    def search(self, query: str, k: int = 5):
        from rag.base import Hit
        dk = self.dieu_kien.get(query)
        if dk is None:
            return []
        # Xếp theo giá rồi theo id — tất định, và giống thứ tự `answer.py` dùng.
        ids = _loc_theo_nhan(dk, self.items)
        theo_id = {i["id"]: i for i in self.items}
        ids.sort(key=lambda x: (theo_id[x]["price"], x))
        return [Hit(cid, 1.0, r) for r, cid in enumerate(ids[:k], 1)]


def do_bai_toan_2(retrievers, items: list[dict], runs: int) -> dict[str, Ketqua]:
    kq = {r.name: Ketqua() for r in retrievers}
    for case in CA_CHON_MON:
        dung = set(_loc_theo_nhan(case["loc"], items))
        # `forbidden` cho bài toán chọn món = mọi món KHÔNG thỏa ràng buộc. Đây là điểm khác quan
        # trọng so với bài toán 1: ở đó "bị cấm" là chủ đề lạc; ở đây nêu một món không thỏa ràng
        # buộc chính là câu trả lời SAI, không phải câu trả lời kém.
        cam = {i["id"] for i in items} - dung
        for r in retrievers:
            batdau = time.perf_counter()
            for _ in range(runs):
                hits = r.search(case["query"], k=K)
            kq[r.name].latencies_ms.append((time.perf_counter() - batdau) * 1000 / runs)
            kq[r.name].them([h.chunk_id for h in hits], dung, cam, False, case.get("id", ""))
    return kq


# ------------------------------------------------------------------------- in ấn
def in_bang(tieu_de: str, kq: dict[str, Ketqua], ghi_chu: str = "") -> None:
    """In một bảng kết quả.

    Cột `Hit@N*` là con số VẬN HÀNH — N lấy từ `answer.SO_DOAN_TRI_THUC`, tức số đoạn hệ thống
    thật sự trích. Hit@1 vẫn được in vì nó là con số so sánh chuẩn giữa các bộ truy hồi, nhưng
    nó KHÔNG phải con số hệ thống chạy ở đó.
    """
    print(f"\n{tieu_de}")
    if ghi_chu:
        print(f"  {ghi_chu}")
    print("  " + HEADER)
    print("  " + "-" * len(HEADER))
    for ten, k in kq.items():
        print("  " + k.hang(ten))


def theo_ho(retrievers, cases: list[dict]) -> None:
    """Bảng theo HỌ — chỗ duy nhất thấy được BM25 và embedding mạnh ở đâu khác nhau.

    Tỷ lệ chung che mất điều đó: hai phương pháp có thể cùng đạt 0,85 mà mạnh ở hai họ trái ngược.
    """
    ho = collections.defaultdict(list)
    for c in cases:
        ho[c["family"]].append(c)
    tens = [r.name for r in retrievers]
    print(f"\n  {'họ':22}{'ca':>4}" + "".join(f"{t:>12}" for t in tens) + "   (Hit@5)")
    print("  " + "-" * (26 + 12 * len(tens)))
    for ten_ho in sorted(ho):
        cs = ho[ten_ho]
        dong = f"  {ten_ho:22}{len(cs):>4}"
        for r in retrievers:
            k = Ketqua()
            for c in cs:
                dung = CS.select_many(c["expected"]) if c["expected"] else set()
                cam = CS.select_many(c["forbidden"]) if c["forbidden"] else set()
                k.them([h.chunk_id for h in r.search(c["query"], k=K)], dung, cam,
                       c["expect_nothing"])
            if k.scored_cases:
                dong += f"{k.hit5 / k.scored_cases:>12.3f}"
            else:
                # Họ toàn ca `expect_nothing` — không có đoạn đúng nào nên Hit@5 vô nghĩa ở đây.
                dong += f"{'(abstain)':>12}"
        print(dong)


def chay_ablation(cases: list[dict], runs: int) -> None:
    """Tắt từng cơ chế rồi đo mức mất — CHỈ trên phương pháp thật sự có cơ chế đó.

    Mỗi cơ chế khai rõ nó thuộc phương pháp nào. Bản đầu in cả ba phương pháp cho mọi cơ chế, nên
    bảng có những dòng như "tắt chuẩn hóa vector · bm25 · +0.000 <-- cơ chế này DƯ" — BM25 không
    có vector nào để chuẩn hóa, nên dòng đó không nói gì mà lại đọc như một kết luận.

    `hybrid` được tính vào mọi cơ chế của cả hai bộ con, vì nó hợp nhất bảng của chúng: một cơ chế
    của BM25 vẫn ảnh hưởng hybrid qua bảng BM25.
    """
    print("\n\nABLATION — tắt từng cơ chế, đo mức mất")
    print("  Chỉ in phương pháp THẬT SỰ có cơ chế đó. Cơ chế không mất ca nào là cơ chế DƯ, và")
    print("  điều đó phải nói ra chứ không giữ lại vì 'nó nên có tác dụng'.")

    bien_the = [
        ("tắt rút dấu", {"fold_accents": False}, ("bm25", "hybrid"),
         "tách từ của BM25 — người Việt gõ không dấu rất thường"),
    ]
    if EMB.available():
        bien_the += [
            ("tắt chuẩn hóa L2", {"normalize": False}, ("embedding", "hybrid"),
             "cosine cần vector đơn vị; không chuẩn hóa thì đoạn DÀI được lợi"),
            ("tắt tiền tố E5", {"use_prefix": False}, ("embedding", "hybrid"),
             "họ mô hình E5 đòi 'query:'/'passage:'"),
        ]
    else:
        print(f"\n  BỎ QUA hai ablation của embedding: {EMB.why_unavailable()}")

    rs_goc = build_retrievers()
    kq_goc = do_bai_toan_1(rs_goc, cases, runs)
    goc = {
        ten: ((k.hit5 / k.scored_cases if k.scored_cases else 0.0), k.forbidden_hits)
        for ten, k in kq_goc.items()
    }

    print(f"\n  {'cơ chế bị tắt':20}{'phương pháp':12}{'Hit@5':>8}{'cấm@5':>8}"
          f"{'mất Hit@5':>11}   nhận xét")
    print("  " + "-" * 92)
    for ten, k in kq_goc.items():
        h = (k.hit5 / k.scored_cases) if k.scored_cases else 0.0
        print(f"  {'(bản đầy đủ)':20}{ten:12}{h:>8.3f}{k.forbidden_hits:>8}{'':>11}")

    for nhan, kw, ap_dung, giai_thich in bien_the:
        rs = build_retrievers(**kw)
        kq = do_bai_toan_1(rs, cases, runs)
        for ten in ap_dung:
            if ten not in kq:
                continue
            k = kq[ten]
            h = (k.hit5 / k.scored_cases) if k.scored_cases else 0.0
            d = h - goc[ten][0]
            d_cam = k.forbidden_hits - goc[ten][1]

            # Kết luận phải dùng `forbidden@5` làm chỉ số quyết định, đúng như docstring của tệp
            # này tuyên bố. Chỉ xem Hit@5 thì bảng tự mâu thuẫn với chính nó: tắt tiền tố E5 làm
            # Hit@5 TĂNG mà `cấm@5` cũng TĂNG, tức bộ truy hồi lấy được nhiều đoạn đúng hơn nhưng
            # kéo theo nhiều đoạn lạc đề hơn — và đoạn lạc đề là chỗ mô hình viết ra câu sai về
            # nhà hàng. Một công cụ kết luận "tắt đi tốt hơn" ở dòng đó là công cụ nói ngược lại
            # thước đo mà nó tự đặt ra.
            if abs(d) < 1e-9 and d_cam == 0:
                nx = "KHÔNG đổi gì -> cơ chế DƯ với kho này"
            elif d > 0 and d_cam > 0:
                nx = (f"Hit@5 tăng nhưng cấm@5 tăng {d_cam:+d} -> cơ chế VẪN ĐÁNG GIỮ, "
                      "vì cấm@5 là chỉ số quyết định")
            elif d > 0:
                nx = "TẮT ĐI LẠI TỐT HƠN ở CẢ hai chỉ số -> khẳng định của tôi về cơ chế này SAI"
            else:
                nx = giai_thich
            print(f"  {nhan:20}{ten:12}{h:>8.3f}{k.forbidden_hits:>8}{d:>+11.3f}   {nx}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sealed", action="store_true",
                   help="MỞ tập niêm phong. Chỉ được làm MỘT lần, và phải ghi vào tài liệu.")
    p.add_argument("--ablation", action="store_true", help="Tắt từng cơ chế, đo mức mất.")
    p.add_argument("--latency-protocol", choices=sorted(LATENCY_RUNS), default="screening",
                   help="screening=1 lần/truy vấn (sàng lọc) · release=7 lần lấy trung vị (báo cáo)")
    args = p.parse_args(argv)

    runs = LATENCY_RUNS[args.latency_protocol]
    cases = load_cases()
    split = load_split()
    retrievers = build_retrievers()

    print("SO BA CÁCH TRUY HỒI TRÊN HAI BÀI TOÁN")
    print(f"  kho              : {len(CS.corpus())} đoạn (chỉ `answer_mode: synthesize`)")
    print(f"  ca truy hồi      : {len(cases)} / {len({c['family'] for c in cases})} họ")
    print(f"  phương pháp      : {', '.join(r.name for r in retrievers)}")
    print(f"  giao thức độ trễ : {args.latency_protocol} ({runs} lần/truy vấn) — "
          "hai giao thức KHÔNG so được với nhau")
    if not EMB.available():
        print(f"\n  !! embedding và hybrid BỊ BỎ QUA: {EMB.why_unavailable()}")
        print("     Con số dưới đây KHÔNG phải phép so ba phương pháp. Cài "
              "`sentence-transformers` rồi chạy lại.")

    nhom = {
        "chốt": set(split["gate_families"]),
        "phát triển": set(split["dev_families"]),
    }
    if args.sealed:
        nhom["NIÊM PHONG"] = set(split["test_families"])
        print("\n  !! ĐANG MỞ TẬP NIÊM PHONG. Ghi ngày vào retrieval_split.json và tài liệu.")

    chan = 0
    # GHI LẠI để bộ sinh BÁO CÁO đọc, thay vì người viết chép tay.
    #
    # Vì sao cần: `docs/ai/BAO_CAO_DO_AN_HOC_MAY_KPDL.md` viết tay toàn bộ số liệu, và sau khi phần AI
    # được dựng lại nó mô tả một hệ thống KHÔNG CÒN TỒN TẠI — 0 lần nhắc `understand.py`/`answer.py`,
    # và 11/11 lệnh của Phụ lục B trỏ vào tệp đã xóa. Notebook tránh được vì mọi ô tự tính lại; báo
    # cáo thì không, nên nó trôi.
    #
    # Số cần embedding KHÔNG tính lại được trong bộ sinh báo cáo: CI cài từng gói chứ không cài cả
    # `requirements.txt`, nên `--check` sẽ đỏ vì lý do không liên quan. Ghi ra tệp là cách đúng —
    # cùng cách `golden_e2e.json` đã làm.
    ghi_lai: dict = {"bai_toan_1": {}, "bai_toan_2": {}}
    for ten_nhom, ho in nhom.items():
        cs = [c for c in cases if c["family"] in ho]
        kq = do_bai_toan_1(retrievers, cs, runs)
        ghi_lai["bai_toan_1"][ten_nhom] = {
            "so_ca": len(cs),
            "bo": {
                ten: {
                    # `hit1_theo_ca` cần cho kiểm định GHÉP CẶP McNemar ở báo cáo — hai bộ chạy
                    # trên cùng danh sách ca nên bảng tổng không đủ để so sánh có ý nghĩa.
                    "hit1_theo_ca": k.hit1_theo_ca, "ma_ca": k.ma_ca,
                    "n": k.scored_cases, "hit1": k.hit1, "hit5": k.hit5,
                    "mrr5": k.mrr5, "ndcg5": k.ndcg5, "cam5": k.forbidden_hits,
                }
                for ten, k in kq.items()
            },
        }
        ghi = "đỏ ở đây là CHẶN, không phải số liệu" if ten_nhom == "chốt" else ""
        in_bang(f"BÀI TOÁN 1 — TRUY HỒI TRI THỨC · nhóm {ten_nhom} ({len(cs)} ca)", kq, ghi)
        if ten_nhom == "chốt":
            for ten, k in kq.items():
                if k.forbidden_hits:
                    print(f"  CHẶN: {ten} lấy đoạn BỊ CẤM ở {k.forbidden_hits} ca nhóm chốt")
                    chan += 1
                # Chỉ chặn trên số ca ĐO ĐƯỢC ở tầng này.
                #
                # Bản trước chặn trên `abstain_cases`, và sau khi `abstain` được sửa để không tự cho
                # điểm thì mọi ca `expect_nothing` không có đoạn cấm rơi vào ô "không đo được" — nên
                # phép chặn báo 20/20 hỏng trong khi hệ thống hoàn toàn đúng.
                #
                # Một phép chặn đọc chỉ số không đo được là báo động sai, và báo động sai làm người
                # ta bỏ qua phép chặn. Việc "hệ thống có biết không trả lời hay không" được đo ở mục
                # KHÔNG TRẢ LỜI CÂU KHÔNG TRẢ LỜI ĐƯỢC bên dưới, nơi nó đo được thật.
                do_duoc = k.abstain_cases - k.abstain_khong_do_duoc
                if do_duoc and k.abstain_ok < do_duoc:
                    print(f"  CHẶN: {ten} không biết KHÔNG trả lời ở "
                          f"{do_duoc - k.abstain_ok}/{do_duoc} ca đo được")
                    chan += 1

    theo_ho(retrievers, [c for c in cases if c["family"] in
                         set(split["gate_families"]) | set(split["dev_families"])])

    theo_loai_tai_lieu(retrievers, [c for c in cases if c["family"] in
                                    set(split["gate_families"]) | set(split["dev_families"])],
                       runs)

    items = load_menu()
    mon_doan = mon_thanh_doan(items)
    bm25_mon = Bm25Index.build(mon_doan)
    rs2 = [bm25_mon]
    if EMB.available():
        emb_mon = EMB.EmbeddingIndex.build(mon_doan)
        rs2 += [emb_mon, HybridRetriever(retrievers=[bm25_mon, emb_mon])]
    rs2.append(LocTheoNhan(items, CA_CHON_MON))

    kq2 = do_bai_toan_2(rs2, items, runs)
    ghi_lai["bai_toan_2"] = {
        "so_ca": len(CA_CHON_MON),
        "bo": {
            ten: {"n": k.scored_cases, "hit1": k.hit1, "hit5": k.hit5, "cam5": k.forbidden_hits,
                  # Cần cho McNemar ở mục 4.4 — cùng lý do với bài toán 1.
                  "hit1_theo_ca": k.hit1_theo_ca, "ma_ca": k.ma_ca}
            for ten, k in kq2.items()
        },
    }
    in_bang(
        f"BÀI TOÁN 2 — CHỌN MÓN ({len(CA_CHON_MON)} ca)", kq2,
        "'cấm@5' ở đây = số ca nêu món KHÔNG thỏa ràng buộc. Đó là câu trả lời SAI, không phải kém.",
    )
    print("\n  Từng ca — vì sao mỗi ca có mặt:")
    for c in CA_CHON_MON:
        print(f"    {c['id']:16} {c['query']}")
        print(f"        {c['why']}")

    # --- CỔNG KHÔNG TRẢ LỜI: đo quyết định thật, không đo bộ xếp hạng --------------------
    #
    # Vì sao mục này tách khỏi bảng ba phương pháp: một bộ truy hồi LUÔN trả về gì đó, nên "biết
    # không trả lời" không phải tính chất của bộ xếp hạng. Nó là tính chất của lớp trên —
    # `answer.thuoc_mien()` cùng VỊ TRÍ của nhánh truy hồi trong `respond()`.
    #
    # Nhét con số này vào bảng ba phương pháp sẽ ngụ ý rằng đổi phương pháp thì abstain đổi, mà
    # không phải: cả ba dùng chung một cổng.
    #
    # Bằng chứng mục này cần tồn tại: bảng abstain cũ báo 20/20 cho cả ba phương pháp, trong khi
    # golden 103 lượt bắt được truy hồi trả lời "Bạn là model gì?" bằng một đoạn nói về lẩu.
    ca_abstain = [c for c in cases if c.get("expect_nothing")]
    if ca_abstain:
        # Đo HỆ THỐNG, không đo cổng đơn lẻ.
        #
        # Bản đầu của mục này đo `answer.thuoc_mien()` và ra 4/24 — nghe như hệ thống hỏng nặng.
        # Nhưng cổng đó là lớp CUỐI, không phải lớp duy nhất: "Nhà hàng mấy giờ mở cửa?" bị nhánh
        # chính sách bắt trước, "Món nào dưới 50.000đ?" bị bộ lọc giá bắt, "Gợi ý gì đó đi" bị cờ
        # `asks_suggestion` bắt. Với những câu đó, cổng không bao giờ được hỏi tới.
        #
        # Câu hỏi đúng là: hệ thống có TRẢ LỜI một câu không trả lời được bằng một đoạn tri thức hay
        # không. Đo bằng `reply.branch`: nhánh `knowledge_corpus:*` nghĩa là câu trả lời đến từ truy
        # hồi toàn kho, và với ca `expect_nothing` thì đó là câu trả lời SAI.
        from answer import respond  # noqa: PLC0415 — chỉ mục này cần
        from understand import understand  # noqa: PLC0415

        items = load_menu()
        theo_nhanh: dict[str, list[str]] = {}
        sai: list[str] = []
        for c in ca_abstain:
            rep = respond(understand(c["query"], items), items)
            nhom = rep.branch.split(":")[0]
            theo_nhanh.setdefault(nhom, []).append(c["id"])
            if rep.branch.startswith("knowledge_corpus"):
                sai.append(f"{c['id']}: {c['query']}")
        n = len(ca_abstain)
        print(f"\nKHÔNG TRẢ LỜI CÂU KHÔNG TRẢ LỜI ĐƯỢC ({n} ca `expect_nothing`)")
        print("  Đo HỆ THỐNG, không đo bộ xếp hạng: `expect_nothing` mà nhánh là")
        print("  `knowledge_corpus:*` nghĩa là truy hồi đã trả lời một câu không có đáp án.")
        print(f"  đúng : {n - len(sai)}/{n}")
        print("  nhánh nào xử lý những câu này:")
        for nhom, ids in sorted(theo_nhanh.items(), key=lambda t: -len(t[1])):
            print(f"      {nhom:22} {len(ids):2}  {', '.join(ids[:3])}"
                  + ("..." if len(ids) > 3 else ""))
        if sai:
            print(f"  SAI  : {len(sai)}/{n} — truy hồi trả lời câu không có đáp án:")
            for x in sai:
                print(f"      {x}")

    if args.ablation:
        chay_ablation([c for c in cases if c["family"] in
                       set(split["gate_families"]) | set(split["dev_families"])], runs)

    # Chỉ ghi khi lần chạy này ĐẦY ĐỦ HƠN HOẶC BẰNG bằng chứng đang có.
    #
    # Ba điều kiện, và cả ba đến từ một lỗi thật: CI có bước chạy bộ so này **không** `--sealed` và
    # **không có** `sentence-transformers`. Bản đầu ghi vô điều kiện, nên bước CI đó **ghi đè bằng chứng
    # đã commit** bằng một bản chỉ có BM25 và không có nhóm niêm phong — rồi bước kiểm báo cáo ngay sau
    # đó nổ `KeyError: 'NIÊM PHONG'`.
    #
    # Hai hậu quả, và hậu quả thứ hai tệ hơn: CI đỏ (thấy được), và **bằng chứng bị làm nghèo đi** trong
    # thư mục làm việc (không thấy được nếu ai đó commit tiếp).
    #
    # Đây cùng lớp lỗi với `--chi` của golden — một lần chạy HẸP ghi đè kết quả RỘNG. Đã chặn ở đó và
    # bỏ sót ở đây.
    du_bo = len(retrievers) >= 3
    du_nhom = bool(args.sealed)
    if args.ablation or not du_bo or not du_nhom:
        thieu = []
        if args.ablation:
            thieu.append("đang chạy --ablation")
        if not du_bo:
            thieu.append(f"chỉ có {len(retrievers)} bộ ({', '.join(r.name for r in retrievers)}), cần 3")
        if not du_nhom:
            thieu.append("thiếu --sealed nên không có nhóm niêm phong")
        print(f"\nKHÔNG ghi bằng chứng: {'; '.join(thieu)}.")
        print("  Bằng chứng đã commit RỘNG HƠN lần chạy này, nên ghi đè là làm nó nghèo đi.")
    else:
        import results

        duong = results.ghi(
            "truy_hoi_so_sanh",
            ghi_lai,
            {
                "ngay": datetime.date.today().isoformat(),
                "so_doan": len(CS.corpus()),
                "bo_da_so": sorted(r.name for r in retrievers),
                "mo_niem_phong": bool(args.sealed),
                "giao_thuc_do_tre": args.latency_protocol,
            },
        )
        print(f"\nđã ghi {duong.name}")

    if chan:
        print(f"\nCHẶN: {chan} vấn đề ở nhóm chốt.")
        return 1
    print("\nNhóm chốt không có vấn đề.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
