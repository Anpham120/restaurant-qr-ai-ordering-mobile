# -*- coding: utf-8 -*-
"""Truy NGUYÊN NHÂN của mọi ca không đạt, trên cả BA tập đánh giá.

Vì sao là công cụ chứ không phải một mục viết tay trong báo cáo
--------------------------------------------------------------
Yêu cầu "phân tích cả những trường hợp sai cho biết rõ lý do vì sao" viết tay được đúng một lần.
Lần sửa sau thì bảng nguyên nhân trong báo cáo thành sai, và không ai biết. Nên nó là công cụ: nó
đọc trạng thái HIỆN TẠI của hệ thống và in ra chuỗi nguyên nhân truy được về một bước cụ thể.

Ba tập, ba loại "không đạt" khác nhau
------------------------------------
    119 ca trả lời    ĐỎ = câu trả lời không đạt tiêu chí
    138 ca truy hồi   TRƯỢT = không lấy được đoạn đúng · CẤM = lấy phải đoạn bị cấm
    65 lượt phiên     KHOẢNG CÁCH = `aspirational`, hệ thống chưa làm được và tập ca nói ra

Gộp cả ba là cố ý: tập 119 ca hiện **0 đỏ**, nên một công cụ chỉ đọc tập đó sẽ in "không có gì để
phân tích" và người đọc kết luận hệ thống không còn chỗ sai. Thực tế còn hàng chục ca truy hồi
trượt hoặc lấy đoạn lạc đề, và 9 lượt tham chiếu ngược chưa làm được. Che chúng bằng cách chọn tập
là cách dễ nhất để một báo cáo nói dối mà không câu nào sai.

Con số cụ thể KHÔNG viết ở đây, mà do chính công cụ in ra — số viết trong tài liệu thì trôi, và dự
án này đã mắc đúng lỗi đó một lần với con số kiểm kê đụng chữ.

Bảy lớp nguyên nhân, mỗi ca rơi vào ĐÚNG MỘT lớp
------------------------------------------------
    vocab_miss           từ vựng không có cụm khách dùng -> hiểu được 0 ràng buộc
    retrieval_miss       lấy sai đoạn tri thức (hoặc không lấy được đoạn nào)
    constraint_conflict  ràng buộc xung đột -> kết quả rỗng
    data_gap             dữ liệu không có (dinh dưỡng, thời gian nấu, còn hàng, nhãn thiếu)
    criterion_too_strict tiêu chí của CA sai, không phải hệ thống sai
    model_error          mô hình đọc sai ràng buộc
    capability_missing   khả năng CHƯA ĐƯỢC DỰNG — không thiếu từ, không thiếu dữ liệu

Kế hoạch của dự án nêu SÁU lớp. Lớp thứ bảy được thêm vì phép đo chỉ ra nó, và vì gán sai lớp thì
công cụ **chỉ người sau đi sửa sai chỗ**: 9 lượt tham chiếu ngược ("món đầu tiên giá bao nhiêu?")
ban đầu bị xếp `vocab_miss`, nhưng thêm bao nhiêu cụm vào từ vựng cũng không sửa được chúng — hệ
thống không lưu DANH SÁCH CÓ THỨ TỰ các món đã nêu, nên "món đầu tiên" không có gì để trỏ vào.
(`suggested_item_ids` có lưu món, nhưng nó là TẬP dùng để không gợi lại, không phải dãy có thứ tự.)

Lớp `criterion_too_strict` quan trọng nhất và dễ bị bỏ qua nhất: ở dự án này **thước đo sai 3 lần
trước khi hệ thống sai**. Nên công cụ phải nêu được khả năng "ca này viết sai" chứ không mặc định
hệ thống sai. Dấu hiệu nhận ra: nhiều ca đỏ với CÙNG một thông báo.

    python ai/evaluation/analyze_failures.py            # bảng nguyên nhân
    python ai/evaluation/analyze_failures.py --chi-tiet # chuỗi nguyên nhân từng ca
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))

import answer  # noqa: E402
import chunk_selectors as CS  # noqa: E402
import run_session_eval as RSE  # noqa: E402
from answer_metric import Answer, score  # noqa: E402
from rag import embedding as EMB  # noqa: E402
from rag.bm25 import Bm25Index  # noqa: E402
from understand import understand  # noqa: E402

# Tên tập ĐẾM TỪ DỮ LIỆU, không viết tay.
#
# Bản đầu viết tay `{"119 ca trả lời": 119, "138 ca truy hồi": 138, "65 lượt phiên": 65}`. Ba tập đã
# lên 140 / 210 / 87, nên công cụ in "62/138" trong khi nó vừa chạy 210 ca — mẫu số sai thì mọi tỷ
# lệ đọc từ bảng đó đều sai, và không có gì báo.
#
# Cùng lớp lỗi với con số 0,921 ở dưới: một số đúng-lúc-viết nằm trong chuỗi ký tự sẽ lạc hậu im
# lặng. Cách sửa bằng cấu trúc là không cho phép viết nó ra bằng tay.
def _dem(path, khoa: str) -> int:
    return len(json.loads(path.read_text(encoding="utf-8-sig"))[khoa])


CASES_PATH = HERE / "cases.json"
RETRIEVAL_PATH = HERE / "retrieval_cases.json"
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"

# Nhãn ba tập KHÔNG mang con số. Bản đầu đặt tên là "119 ca trả lời", nên khi tập lên 140 ca thì
# chính CÁI TÊN thành sai — và tên sai còn khó thấy hơn mẫu số sai.
TEN_TAP_TRA_LOI = "tập trả lời"
TEN_TAP_TRUY_HOI = "tập truy hồi"
TEN_TAP_PHIEN = "tập lượt phiên"

VOCAB_MISS = "vocab_miss"
RETRIEVAL_MISS = "retrieval_miss"

# Bốn lớp con của `retrieval_miss`. Chia ra vì câu hỏi cần trả lời là "case nào KHÔNG sửa được
# nữa", và một lớp gộp 62 ca với một cách sửa chung không trả lời được câu đó.
#
# Ba trong bốn lớp dẫn ra được TỪ DỮ LIỆU, không dán tay: họ của ca cho lớp `number`, phép giao tập
# từ cho lớp `no_overlap`, tiêu đề mục cho lớp `twin_section`. Dán tay thì nhãn trôi khỏi dữ liệu.
RETRIEVAL_NUMBER = "retrieval_number"
RETRIEVAL_NO_OVERLAP = "retrieval_no_overlap"
RETRIEVAL_TWIN_SECTION = "retrieval_twin_section"
RETRIEVAL_RANK = "retrieval_rank"

# Lớp nào CÒN sửa được bằng cách sửa xếp hạng, và lớp nào KHÔNG. Ghi thành dữ liệu thay vì để trong
# văn xuôi, vì bảng in ra phải nói được điều này ở từng dòng.
SUA_DUOC_BANG_XEP_HANG = {RETRIEVAL_RANK}
CONSTRAINT_CONFLICT = "constraint_conflict"
DATA_GAP = "data_gap"
CRITERION_TOO_STRICT = "criterion_too_strict"
MODEL_ERROR = "model_error"
CAPABILITY_MISSING = "capability_missing"

MOI_LOP = (
    VOCAB_MISS,
    RETRIEVAL_NUMBER, RETRIEVAL_NO_OVERLAP, RETRIEVAL_TWIN_SECTION, RETRIEVAL_RANK,
    CONSTRAINT_CONFLICT, DATA_GAP,
    CRITERION_TOO_STRICT, MODEL_ERROR, CAPABILITY_MISSING,
)

CACH_SUA = {
    VOCAB_MISS: (
        "Thêm cụm vào `VOCAB` của understand.py — TẤT ĐỊNH. "
        "ĐO ĐƯỢC: nạp từng cụm rồi chạy understand() trên cả tập, giữ cụm nào đổi đúng ca nó nhắm "
        "và không đổi ca nào khác. Đã làm đúng vậy cho 23 cụm ở lần trước."
    ),
    RETRIEVAL_NUMBER: (
        "KHÔNG sửa được bằng truy hồi, và đừng thử. "
        "Câu về số phải đi đường lọc theo trường có cấu trúc — `price`, `spice`, `party` — vì cả "
        "BM25 lẫn embedding đều không so được 45.000 với 50.000. "
        "ĐO ĐƯỢC: chính các ca này là nhóm CHỐT của tập truy hồi, và chúng đo việc hệ thống KHÔNG "
        "trả đoạn nào — trả đoạn cho câu về số là trả lời sai một cách tự tin."
    ),
    RETRIEVAL_NO_OVERLAP: (
        "Sửa bằng embedding, hoặc viết lại đoạn cho chứa từ khách thật sự dùng. "
        "ĐO ĐƯỢC: họ `kb-paraphrase` tách riêng đúng để đo lớp này, và số nói embedding hơn BM25 "
        "18,2 điểm Top-1 trên đúng họ đó."
    ),
    RETRIEVAL_TWIN_SECTION: (
        "KHÔNG sửa được bằng xếp hạng. Đây là trần đa dạng của KHO, không phải lỗi bộ xếp hạng: "
        "hai mục cùng tiêu đề ở hai tài liệu thì không tín hiệu nào trong câu hỏi phân biệt được "
        "chúng, trừ khi câu hỏi nêu tên tài liệu. "
        "Sửa được bằng cách viết lại tiêu đề mục cho đặc thù theo tài liệu — tức sửa DỮ LIỆU. "
        "ĐO ĐƯỢC: đếm tiêu đề mục phân biệt trên tổng số đoạn; 184/449 nghĩa là trung bình 2,4 đoạn "
        "dùng chung một tiêu đề."
    ),
    RETRIEVAL_RANK: (
        "Sửa cách xếp hạng — và đây là lớp DUY NHẤT trong bốn lớp truy hồi mà việc đó giúp được. "
        "ĐO ĐƯỢC: run_retrieval_comparison.py, và chỉ số quyết định là `forbidden@5` chứ không "
        "phải Hit@5 — Hit@5 = 1,0 vẫn đúng khi 1 đoạn đúng đi cùng 4 đoạn lạc đề."
    ),
    CONSTRAINT_CONFLICT: (
        "Nói thẳng 'không có món nào thỏa cả hai điều' — KHÔNG nới ràng buộc. "
        "ĐO ĐƯỢC: run_baseline.py chốt fail-closed, nới là lỗi an toàn."
    ),
    DATA_GAP: (
        "Nói 'tôi chưa có dữ liệu về câu hỏi này' rồi chuyển nhân viên. "
        "KHÔNG ĐO ĐƯỢC bằng dữ liệu hiện có: chỉ chủ nhà hàng bổ sung được. Đây là giới hạn phải "
        "NÓI RA, không phải chỗ để đề xuất sửa."
    ),
    CRITERION_TOO_STRICT: (
        "Sửa TIÊU CHÍ, không sửa hệ thống. "
        "ĐO ĐƯỢC: probe_metric_holes.py + test hai chiều của thước đo. Dấu hiệu: nhiều ca đỏ với "
        "CÙNG một thông báo."
    ),
    MODEL_ERROR: (
        "Chặn ở cổng kiểm nhãn, và đưa cách nói đó về mã tất định. "
        "ĐO ĐƯỢC: run_with_model.py so hai chế độ; mô hình hiện đổi 0 ca nên lớp này đang rỗng."
    ),
    CAPABILITY_MISSING: (
        "DỰNG khả năng đó — ở đây là lưu DÃY CÓ THỨ TỰ các món đã nêu trong `SessionState`, rồi "
        "cho understand.py nhận cụm chỉ vị trí ('món đầu tiên', 'cái thứ ba', 'món vừa rồi'). "
        "ĐO ĐƯỢC: 9 lượt `aspirational` của nhóm `context_reference` chuyển từ khoảng cách sang "
        "đạt, mà `allergy_persists` 25/25 không tụt. "
        "KHÔNG phải vocab_miss: thêm bao nhiêu cụm cũng không sửa được, vì không có gì để trỏ vào."
    ),
}


@dataclass
class Nguyennhan:
    tap: str
    ca: str
    cau: str
    lop: str
    chuoi: list[str] = field(default_factory=list)


def load_menu() -> list[dict]:
    return json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))["items"]


# ------------------------------------------------------- tập 1: 119 ca trả lời
def _hieu_duoc_gi(r) -> list[str]:
    co = []
    if r.require_tags:
        co.append(f"require={r.require_tags}")
    if r.prefer_tags:
        co.append(f"prefer={r.prefer_tags}")
    if r.avoid_tags:
        co.append(f"avoid={r.avoid_tags}")
    if r.categories:
        co.append(f"categories={r.categories}")
    if r.budget_max is not None:
        co.append(f"budget={r.budget_max}")
    if r.policy_topic:
        co.append(f"policy={r.policy_topic}")
    if r.named_items:
        co.append(f"named={r.named_items}")
    return co


def phan_tich_tra_loi(items: list[dict]) -> list[Nguyennhan]:
    data = json.loads(CASES_PATH.read_text(encoding="utf-8-sig"))
    cases = data["cases"]
    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    ra: list[Nguyennhan] = []
    for c in cases:
        r = understand(c["question"], items)
        reply = answer.respond(r, items)
        v = score(c, Answer(text=reply.text, items=reply.items, kind=reply.kind,
                            asks_back=reply.asks_back), menu, data["named_selectors"])
        if v.passed:
            continue
        hieu = _hieu_duoc_gi(r)
        chuoi = [
            f"hiểu   : {' '.join(hieu) if hieu else 'KHÔNG hiểu gì'}",
            f"nhánh  : {reply.branch}",
            # `Verdict` khai trường này là `failures`; `reasons` chưa bao giờ tồn
            # tại. Dòng chỉ chạy khi có ca ĐỎ, nên bộ phân tích nguyên nhân sai
            # tự hỏng đúng lần đầu nó tìm thấy một cái sai — và im lặng suốt thời
            # gian mọi ca còn xanh.
            f"đỏ     : {'; '.join(v.failures)}",
        ]
        if not hieu:
            lop = VOCAB_MISS
        elif reply.branch.startswith("policy:") or "chưa có dữ liệu" in reply.text:
            lop = DATA_GAP
        elif not reply.items and (r.require_tags or r.avoid_tags):
            lop = CONSTRAINT_CONFLICT
        else:
            lop = CRITERION_TOO_STRICT
        ra.append(Nguyennhan(TEN_TAP_TRA_LOI, c["id"], c["question"], lop, chuoi))
    return ra


# ------------------------------------------------------ tập 2: 138 ca truy hồi
def bo_truy_hoi_tot_nhat() -> tuple[object, str]:
    """Bộ truy hồi TỐT NHẤT có mặt, kèm tên để in ra.

    Phân tích nguyên nhân bằng bộ KÉM nhất là phóng đại số ca sai, nên phải dùng bộ đang chạy thật.

    Con số trích ra ĐÃ TỪNG SAI ở đây: bản đầu ghi "Hit@5 0,921 so với bm25 0,711", đo kho 303 đoạn
    / 60 chủ đề. Kho nay 449 đoạn / 84 chủ đề, và trên nó embedding đạt Hit@5 0,674. Trích số của
    một kho DỄ HƠN rồi in cạnh phân tích của kho hiện tại là nói quá — cùng lỗi mà
    `build_retrieval_split.py` đã ghi ra để tránh, và nó vẫn lọt vào đây vì con số nằm trong một
    chuỗi ký tự chứ không phải trong một phép đo.

    Nay chỉ trích SO SÁNH GIỮA HAI BỘ, thứ đúng ở cả hai kho, và không trích trị tuyệt đối.

    Thiếu thư viện thì phải chạy tiếp bằng BM25 và **in rõ** — không bỏ qua âm thầm.
    """
    chunks = CS.corpus()
    bm25 = Bm25Index.build(chunks)
    if not EMB.available():
        return bm25, f"bm25 (embedding không có: {EMB.why_unavailable()})"
    emb = EMB.EmbeddingIndex.build(chunks)
    return emb, "embedding (hơn bm25 ở CẢ HAI kho đã đo; lần gần nhất Hit@1 0,609 so với 0,391)"


# Từ quá phổ biến để mang tín hiệu. Dẫn ra bằng cách đếm trên kho thì tốt hơn, nhưng ở đây danh
# sách chỉ dùng để TRẢ LỜI CÓ/KHÔNG cho câu "câu hỏi và đoạn đúng có chung từ mang nghĩa nào không",
# nên một danh sách ngắn viết tay là đủ và không ảnh hưởng con số nào khác.
TU_RONG = frozenset(
    "co khong la thi ma nao gi nhu cua cho voi va hay den tu o mot cai nay do duoc an mon "
    "minh ban toi em nen ra vao lam ai dau sao bao nhieu the nhung con neu".split()
)


def _tu_mang_nghia(s: str) -> set[str]:
    """Tập từ đã rút dấu, bỏ từ rỗng. Dùng `answer`-level `fold` để trùng cách BM25 tách từ."""
    from understand import fold

    return {t for t in fold(s).split() if len(t) > 1 and t not in TU_RONG}


def _phan_lop_truy_hoi(c: dict, dung: set[str], lay: list[str], theo_id: dict) -> str:
    """Lớp con của một ca truy hồi trượt. Dẫn từ DỮ LIỆU, không dán tay từng ca.

    Thứ tự xét là thứ tự "không sửa được" giảm dần, vì một ca có thể thuộc nhiều lớp và lớp nặng
    hơn phải thắng: một câu về SỐ mà cũng không chung từ nào thì gọi nó là `no_overlap` sẽ khiến
    người sau đi sửa embedding cho một ca mà embedding không giúp được.
    """
    if c["family"] == "kb-number":
        return RETRIEVAL_NUMBER

    tu_cau = _tu_mang_nghia(c["query"])
    if dung and not any(tu_cau & _tu_mang_nghia(theo_id[d].text) for d in dung if d in theo_id):
        return RETRIEVAL_NO_OVERLAP

    # Tiêu đề mục TRÙNG giữa đoạn lấy được và đoạn đúng, nhưng khác tài liệu: hai mục cùng tên thì
    # không tín hiệu nào trong câu hỏi phân biệt được chúng. Đây là trần đa dạng của kho.
    tieu_de_dung = {theo_id[d].heading for d in dung if d in theo_id and theo_id[d].heading}
    for got in lay:
        if got in theo_id and theo_id[got].heading in tieu_de_dung and got not in dung:
            return RETRIEVAL_TWIN_SECTION

    return RETRIEVAL_RANK


def phan_tich_truy_hoi(index, ten_bo: str) -> tuple[list[Nguyennhan], int, int]:
    """Ca truy hồi trượt, KHÔNG tính tập niêm phong.

    Vì sao lọc tập niêm phong ở đây — lỗi nặng nhất trong ba lỗi của bản đầu
    ------------------------------------------------------------------------
    Bản đầu đọc TOÀN BỘ `retrieval_cases.json`, cả 50 ca niêm phong. Công cụ này in kèm "CÁCH SỬA"
    từng lớp, nên đầu ra của nó là một danh sách việc phải làm — và làm theo nó nghĩa là sửa hệ
    thống theo tập niêm phong. Sau lần đó con số trên tập niêm phong không còn là held-out.

    Dự án đã trả đúng giá này một lần ở bước 4 và ghi lại để không trả lần hai. Nó vẫn lọt vào đây
    vì phép lọc split nằm ở `run_retrieval_comparison.py` chứ không nằm ở chỗ đọc tệp ca — tức mỗi
    công cụ mới đọc tệp đó lại phải tự nhớ mà lọc. Cấu trúc mời gọi lỗi này.

    Trả về `(nguyên nhân, số ca đã xét, số ca niêm phong đã bỏ)` để phần in ra nói được mẫu số thật.
    """
    cases = json.loads(RETRIEVAL_PATH.read_text(encoding="utf-8-sig"))["cases"]
    split = json.loads((HERE / "retrieval_split.json").read_text(encoding="utf-8-sig"))
    niem_phong = set(split["test_families"])

    theo_id = {ch.chunk_id: ch for ch in CS.corpus()}
    ra: list[Nguyennhan] = []
    da_xet = 0
    for c in cases:
        if c["family"] in niem_phong:
            continue
        da_xet += 1
        dung = CS.select_many(c["expected"]) if c["expected"] else set()
        cam = CS.select_many(c["forbidden"]) if c["forbidden"] else set()
        lay = [h.chunk_id for h in index.search(c["query"], k=5)]

        pham_cam = cam & set(lay)
        truot = bool(dung) and not (dung & set(lay))
        if not pham_cam and not truot:
            continue

        chuoi = [f"lấy    : {lay or 'KHÔNG đoạn nào'}"]
        if pham_cam:
            chuoi.append(f"CẤM    : {sorted(pham_cam)} — lạc chủ đề, mô hình có thể viết sai từ đó")
        if truot:
            chuoi.append(f"trượt  : cần một trong {len(dung)} đoạn, không có đoạn nào trong 5 đầu")
        if truot and not lay:
            chuoi.append(f"chú ý  : {ten_bo.split()[0]} trả RỖNG — không chung từ nào với kho")

        lop = _phan_lop_truy_hoi(c, dung, lay, theo_id) if truot else RETRIEVAL_RANK
        if lop not in SUA_DUOC_BANG_XEP_HANG:
            chuoi.append("kết luận: KHÔNG sửa được bằng cách sửa xếp hạng — xem cách sửa của lớp")
        ra.append(Nguyennhan(TEN_TAP_TRUY_HOI, c["id"], c["query"], lop, chuoi))
    return ra, da_xet, len(cases) - da_xet


# ------------------------------------------------------ tập 3: 65 lượt phiên
def phan_tich_phien(items: list[dict]) -> list[Nguyennhan]:
    data = json.loads(RSE.SCRIPTS_PATH.read_text(encoding="utf-8-sig"))
    ra: list[Nguyennhan] = []
    for s in data["scripts"]:
        ghi = RSE.chay_kich_ban(s, items)
        for j, bg in enumerate(ghi):
            do = RSE.cham_luot(bg, ghi[:j])
            if not do:
                continue
            asp = bool(bg["expect"].get("aspirational"))
            chuoi = [
                f"lượt   : {j + 1}/{len(ghi)} trong {s['id']}",
                f"hiểu   : {' '.join(_hieu_duoc_gi(bg['request'])) or 'KHÔNG hiểu gì'}",
                f"nhánh  : {bg['reply'].branch}",
                f"{'khoảng cách' if asp else 'đỏ':7}: {'; '.join(do)}",
            ]
            # Lượt tham chiếu ngược thiếu ĐÚNG một thứ: hệ thống không lưu THỨ TỰ món đã nêu, nên
            # "món đầu tiên" không trỏ vào đâu được. `suggested_item_ids` có lưu món, nhưng nó là
            # TẬP dùng để không gợi lại — không phải danh sách có thứ tự để tham chiếu.
            #
            # Đây là `capability_missing`, KHÔNG phải `vocab_miss` — và phân biệt hai lớp này là
            # việc chính của công cụ. Bản đầu xếp chúng vào `vocab_miss`, tức chỉ người sau đi thêm
            # cụm vào từ vựng: một việc không thể sửa được ca nào trong 9 ca này.
            lop = CAPABILITY_MISSING if asp else CONSTRAINT_CONFLICT
            ra.append(Nguyennhan(TEN_TAP_PHIEN, f"{s['id']}#{j + 1}", bg["user"], lop, chuoi))
    return ra


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--chi-tiet", action="store_true", help="In chuỗi nguyên nhân từng ca.")
    args = p.parse_args(argv)

    items = load_menu()
    bo, ten_bo = bo_truy_hoi_tot_nhat()

    nn_truy_hoi, th_da_xet, th_bo_qua = phan_tich_truy_hoi(bo, ten_bo)
    tat_ca = phan_tich_tra_loi(items) + nn_truy_hoi + phan_tich_phien(items)

    print("PHÂN TÍCH NGUYÊN NHÂN — cả ba tập đánh giá\n")
    print(f"  bộ truy hồi dùng để phân tích: {ten_bo}")
    print(f"  ĐÃ BỎ {th_bo_qua} ca thuộc họ NIÊM PHONG — công cụ này in cách sửa, nên phân tích")
    print("  trên tập niêm phong là sửa hệ thống theo nó, và sau đó con số hết là held-out.\n")
    theo_tap = collections.Counter(n.tap for n in tat_ca)
    tong = {
        TEN_TAP_TRA_LOI: _dem(CASES_PATH, "cases"),
        TEN_TAP_TRUY_HOI: th_da_xet,
        TEN_TAP_PHIEN: sum(len(s["turns"]) for s in json.loads(
            RSE.SCRIPTS_PATH.read_text(encoding="utf-8-sig"))["scripts"]),
    }
    print(f"  {'tập':22}{'không đạt':>11}{'tổng':>7}")
    print("  " + "-" * 42)
    for tap, t in tong.items():
        print(f"  {tap:22}{theo_tap.get(tap, 0):>11}{t:>7}")

    print(f"\n  {'lớp nguyên nhân':24}{'ca':>4}  {'sửa được?':<11} ví dụ")
    print("  " + "-" * 88)
    theo_lop = collections.defaultdict(list)
    for n in tat_ca:
        theo_lop[n.lop].append(n)
    LOP_TRUY_HOI = {RETRIEVAL_NUMBER, RETRIEVAL_NO_OVERLAP, RETRIEVAL_TWIN_SECTION, RETRIEVAL_RANK}
    for lop in MOI_LOP:
        ns = theo_lop.get(lop, [])
        vd = f"{ns[0].ca} — {ns[0].cau[:34]}" if ns else "(rỗng)"
        # Cột này chỉ có nghĩa cho lớp truy hồi; các lớp khác để trống thay vì điền bừa.
        if lop not in LOP_TRUY_HOI:
            sua = ""
        else:
            sua = "xếp hạng" if lop in SUA_DUOC_BANG_XEP_HANG else "KHÔNG"
        print(f"  {lop:24}{len(ns):>4}  {sua:<11} {vd}")

    khong_sua = sum(len(theo_lop.get(l, [])) for l in LOP_TRUY_HOI - SUA_DUOC_BANG_XEP_HANG)
    if khong_sua:
        print(
            f"\n  {khong_sua} ca truy hồi KHÔNG sửa được bằng cách đổi bộ xếp hạng. Đổi bộ xếp hạng "
            "để chữa\n  chúng là làm việc không có tác dụng, và bảng gộp một lớp đã che mất điều đó."
        )

    print("\n  Cách sửa từng lớp, và cách sửa đó có ĐO ĐƯỢC không:")
    for lop in MOI_LOP:
        if not theo_lop.get(lop):
            continue
        print(f"\n    {lop} ({len(theo_lop[lop])} ca)")
        for dong in CACH_SUA[lop].split(". "):
            if dong.strip():
                print(f"      {dong.strip().rstrip('.')}.")

    # Dấu hiệu tiêu chí sai: nhiều ca cùng một thông báo. Đây là chỗ dự án đã sai 3 lần.
    thong_bao = collections.Counter(
        d.split(":", 1)[-1].strip()[:60] for n in tat_ca for d in n.chuoi if d.startswith("đỏ")
    )
    lap = [(m, c) for m, c in thong_bao.most_common() if c >= 3]
    if lap:
        print("\n  CẢNH BÁO — nhiều ca đỏ với CÙNG thông báo, khả năng TIÊU CHÍ sai:")
        for m, c in lap:
            print(f"    {c:>3} ca: {m}")

    if args.chi_tiet:
        print("\n\nCHUỖI NGUYÊN NHÂN TỪNG CA")
        for n in tat_ca:
            print(f"\n  [{n.lop}] {n.ca}  {n.cau!r}")
            for d in n.chuoi:
                print(f"      {d}")
            print(f"      SỬA   : {CACH_SUA[n.lop].split('.')[0]}.")

    # `sum(tong.values())`, không phải một số viết tay — số viết tay ở đây đã là 322 trong khi ba
    # tập cộng lại là 387. Cùng lỗi với mẫu số và với 0,921: số đúng-lúc-viết thì lạc hậu im lặng.
    print(f"\n  Tổng {len(tat_ca)} ca không đạt trên {sum(tong.values())} ca/lượt của cả ba tập.")
    print("  Công cụ này KHÔNG trả mã lỗi: nó phân tích, còn việc CHẶN thuộc run_baseline.py,")
    print("  run_session_eval.py và run_retrieval_comparison.py.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
