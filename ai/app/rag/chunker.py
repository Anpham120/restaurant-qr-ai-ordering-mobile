# -*- coding: utf-8 -*-
"""Đọc tài liệu tri thức và chia thành đoạn cho bộ truy hồi.

Vì sao cần chia đoạn
--------------------
Kho tri thức là MỘT kho (`ai/knowledge/`) với HAI chế độ trả lời, khai bằng `answer_mode`:

    verbatim    trả NGUYÊN VĂN cho khách. Mô hình không chạm vào chữ.
    synthesize  là ĐẦU VÀO cho mô hình viết câu trả lời.

Trước đây đây là hai KHO riêng: `data/restaurant-facts.json` tra khóa, và
`ai/knowledge/*.md` truy hồi. Lý do tôi từng viết cho việc tách — "tra khóa vs truy hồi xếp
hạng" — hóa ra SAI: cả 60 tài liệu markdown đều có đúng một `topic_keys` nên chúng cũng tra
khóa được. Ranh giới thật luôn là chế độ trả lời, và nó không cần hai kho.

Vì sao phải hai chế độ chứ không một:

- Gộp tất cả về `synthesize` → "mấy giờ đóng cửa" sẽ do mô hình viết, và nó **có thể** viết
  22h30. Giờ đóng cửa, giá, và nhãn dị nguyên là loại thông tin **không được phép diễn đạt
  lại**. Mất bảo đảm không-bóp-méo mà không được gì.
- Gộp tất cả về `verbatim` → phải nén "món miền Trung có gì đặc trưng" vào một câu nguyên văn
  viết tay, nhưng câu trả lời thật là danh sách nhiều món kèm ghi chú dị nguyên. Nén là mất nội
  dung, và mất luôn khả năng trả lời loại câu hỏi nhiều mặt.

Nói cách khác: số **kho lưu trữ** là chuyện gọn gàng nên gộp được; số **chế độ trả lời** là
chuyện an toàn nên không.

Việc gộp còn xóa được một lớp lỗi. Khi còn hai kho, `answer.py` tra kho thứ nhất trước, nên một
chủ đề có ở cả hai thì tài liệu ở kho thứ hai **không bao giờ tới lượt** mà vẫn chiếm chỗ trong
chỉ mục truy hồi — im lặng, không lỗi. Bất biến rời-nhau khi đó phải do một test đối chiếu hai
nguồn khác định dạng. Một kho thì một chủ đề **không thể** nằm hai chỗ, và phép kiểm còn lại chỉ
là kiểm trùng khóa bình thường trong `load_all()`.

Hai bộ đọc cho hai phía dùng, để không ai lấy lẫn:

    verbatim_answers()    {khóa chủ đề: chuỗi} — `answer.py::load_facts()` dùng
    retrievable_chunks()  chỉ đoạn `synthesize` — bộ truy hồi dùng

Ba quy tắc chia đoạn
--------------------
1. **Chia theo heading `##`.** Người viết đã chia ý bằng heading, nên chia theo heading là chia
   theo ý nghĩa. Chia theo số ký tự thì cắt giữa câu.

2. **Kèm tiêu đề tài liệu vào mỗi đoạn.** Đoạn bị trích ra khỏi tài liệu phải tự đủ nghĩa.
   Đoạn "Có 11 món, phần lớn ở nhóm Món gà." không nói được nó nói về cái gì; thêm tiêu đề
   "Món nướng" vào thì nói được.

3. **`chunk_id` tất định**: `{doc_id}#{index}`. Nhờ vậy tập đánh giá truy hồi trỏ vào đoạn cụ
   thể được, và trỏ đó không đổi khi sinh lại.

Vì sao `audience: guest` bị ép chặt
-----------------------------------
Bản cũ có 27 tài liệu tri thức, và **5 trong đó mang `audience: ai`** — chúng là hướng dẫn cho
AI đọc: phong cách trả lời, ví dụ phản hồi sai, hướng dẫn phân biệt ngữ cảnh. Cả 27 tài liệu
bị chặt vào **cùng một chỉ mục truy hồi**, nên bộ truy hồi trích được đoạn hướng dẫn nội bộ ra
cho khách đọc. **47/221 đoạn** đã bị trích như vậy, nhiều tháng không ai phát hiện.

Nên bộ nạp này **TỪ CHỐI** tệp không phải `audience: guest`, chứ không lọc bỏ. Khác biệt quan
trọng: lọc thì người ta vẫn thêm được tệp nội bộ vào thư mục và nó chỉ im lặng bị bỏ qua; từ
chối thì việc thêm bị chặn ngay, kèm thông báo lý do.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

# Đoạn dài hơn ngưỡng này bị chia tiếp theo heading `###`. Ngưỡng tính bằng TỪ, không phải ký
# tự, vì tiếng Việt có dấu nên đếm ký tự lệch nhiều so với lượng thông tin.
MAX_WORDS_PER_CHUNK = 400

# Đoạn ngắn hơn ngưỡng này bị GỘP vào đoạn liền sau, không phát ra thành đoạn riêng.
#
# Vì sao cần: nhiều tài liệu mở đầu bằng `# Tiêu đề` rồi vào ngay `## Mục đầu tiên`. Phần trước
# heading đầu khi đó chỉ có dòng tiêu đề — một "đoạn" như vậy không mang tín hiệu nào để truy
# hồi, nhưng vẫn chiếm một chỗ trong top-k và đẩy một đoạn có ích ra ngoài.
#
# Gộp thay vì bỏ, vì dòng tiêu đề vẫn là ngữ cảnh có ích cho đoạn sau nó.
MIN_WORDS_PER_CHUNK = 12

ALLOWED_AUDIENCE = "guest"
ALLOWED_SOURCES = ("derived", "demo", "restaurant")

# `answer_mode` là trường quyết định MÔ HÌNH ĐƯỢC TIN BAO NHIÊU với tài liệu này. Nó là ranh
# giới an toàn của cả kho, nên nó bắt buộc và chỉ nhận đúng hai giá trị.
#
#   verbatim    Nội dung đi tới khách NGUYÊN VĂN, mô hình không chạm vào chữ. Dùng cho thông
#               tin không được phép diễn đạt lại: giờ mở cửa, cách thanh toán, phụ phí, cách
#               khai dị ứng. Một chữ số bị mô hình viết lệch ở đây là sai sự thật về nhà hàng.
#
#   synthesize  Nội dung là ĐẦU VÀO cho mô hình viết câu trả lời. Dùng cho nội dung dài, nhiều
#               mặt, không nén được vào một câu: "đặc sản miền Trung có gì", "gọi bao nhiêu món
#               cho 6 người".
#
# Vì sao phải hai chế độ chứ không một — cả hai chiều gộp đều mất thật:
#   gộp về synthesize → "mấy giờ đóng cửa" do mô hình viết, và nó CÓ THỂ viết 22h30
#   gộp về verbatim   → phải nén danh sách 12 món kèm ghi chú dị nguyên vào một câu viết tay
#
# Số KHO lưu trữ thì gộp được, và đã gộp: cả hai chế độ nằm chung `ai/knowledge/`. Số CHẾ ĐỘ
# TRẢ LỜI thì không, vì nó là chuyện an toàn chứ không phải chuyện gọn gàng.
VERBATIM = "verbatim"
SYNTHESIZE = "synthesize"
ALLOWED_ANSWER_MODES = (VERBATIM, SYNTHESIZE)


class KnowledgeError(ValueError):
    """Tài liệu tri thức viết sai. Là lỗi nội dung, không phải lỗi hệ thống."""


@dataclass(frozen=True)
class KnowledgeChunk:
    """Một đoạn tri thức, tự đủ nghĩa khi bị trích rời khỏi tài liệu."""

    chunk_id: str          # "{doc_id}#{index}" — tất định
    doc_id: str
    title: str             # tiêu đề tài liệu
    heading: str           # tiêu đề mục, "" nếu là đoạn mở đầu
    topic_keys: tuple[str, ...]
    source: str            # derived | demo | restaurant
    answer_mode: str       # verbatim | synthesize
    text: str              # đã kèm tiêu đề tài liệu

    @property
    def word_count(self) -> int:
        return len(self.text.split())


@dataclass
class KnowledgeDoc:
    doc_id: str
    title: str
    topic_keys: tuple[str, ...]
    source: str
    answer_mode: str
    path: Path
    body: str
    chunks: list[KnowledgeChunk] = field(default_factory=list)

    @property
    def verbatim_answer(self) -> str:
        """Câu trả lời nguyên văn của tài liệu `verbatim`, đã bỏ dòng `# Tiêu đề`.

        Khoảng trắng được thu về một dấu cách, nên tài liệu có thể **ngắt dòng thoải mái** mà
        chuỗi trả ra không đổi. Điều này quan trọng: một câu trả lời 68 từ thì người sửa sẽ ngắt
        dòng cho dễ đọc, và nếu ngắt dòng làm đổi chuỗi thì câu trả lời tới khách sẽ có ký tự
        xuống dòng ở giữa.
        """
        if self.answer_mode != VERBATIM:
            raise KnowledgeError(
                f"{self.path.name}: chỉ tài liệu `answer_mode: {VERBATIM}` có câu trả lời "
                f"nguyên văn, tài liệu này là {self.answer_mode!r}"
            )
        lines = [l for l in self.body.splitlines() if not l.startswith("# ")]
        return " ".join(" ".join(lines).split())


_FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)


def parse_frontmatter(text: str, path: Path) -> tuple[dict[str, str], str]:
    """Tách frontmatter YAML tối giản khỏi phần thân.

    Chỉ đọc `khóa: giá trị` một dòng và danh sách dạng `[a, b]` — không dùng thư viện YAML,
    vì kho tri thức chỉ cần đúng năm khóa và thêm một phụ thuộc cho việc đó là quá đắt.
    """
    match = _FRONTMATTER.match(text)
    if match is None:
        raise KnowledgeError(f"{path.name}: thiếu frontmatter `---` ở đầu tệp")
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise KnowledgeError(f"{path.name}: dòng frontmatter không có dấu hai chấm: {line!r}")
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, text[match.end():]


def load_doc(path: Path) -> KnowledgeDoc:
    text = path.read_text(encoding="utf-8-sig")
    meta, body = parse_frontmatter(text, path)

    for required in ("id", "title", "source", "audience", "answer_mode"):
        if not meta.get(required):
            raise KnowledgeError(f"{path.name}: thiếu khóa frontmatter bắt buộc `{required}`")

    # TỪ CHỐI, không lọc. Xem docstring đầu tệp: bản cũ trộn hướng dẫn cho AI vào cùng chỉ mục
    # truy hồi và 47/221 đoạn bị trích cho khách đọc.
    if meta["audience"] != ALLOWED_AUDIENCE:
        raise KnowledgeError(
            f"{path.name}: audience={meta['audience']!r} bị từ chối. Kho tri thức chỉ nhận "
            f"`audience: {ALLOWED_AUDIENCE}` — nội dung dành cho AI đọc (phong cách trả lời, "
            "ví dụ phản hồi sai) KHÔNG được nằm ở đây, vì bộ truy hồi sẽ trích nó cho khách."
        )
    if meta["source"] not in ALLOWED_SOURCES:
        raise KnowledgeError(
            f"{path.name}: source={meta['source']!r} không hợp lệ, phải là một trong "
            f"{ALLOWED_SOURCES}"
        )

    if meta["answer_mode"] not in ALLOWED_ANSWER_MODES:
        raise KnowledgeError(
            f"{path.name}: answer_mode={meta['answer_mode']!r} không hợp lệ, phải là một trong "
            f"{ALLOWED_ANSWER_MODES}. Xem giải thích ở đầu tệp chunker.py — trường này quyết "
            "định mô hình có được diễn đạt lại nội dung hay không, nên không có giá trị mặc định."
        )

    raw_keys = meta.get("topic_keys", "").strip().strip("[]")
    keys = tuple(k.strip() for k in raw_keys.split(",") if k.strip())

    # Tài liệu `verbatim` phải là MỘT khối, không có mục `##`. Có mục thì không xác định được
    # phần nào đi tới khách — và câu trả lời nguyên văn thì phải xác định được chính xác.
    if meta["answer_mode"] == VERBATIM and any(
        line.startswith("## ") for line in body.splitlines()
    ):
        raise KnowledgeError(
            f"{path.name}: tài liệu `answer_mode: {VERBATIM}` không được có mục `##` — câu trả "
            "lời nguyên văn phải là một khối duy nhất. Nội dung nhiều mục thì dùng "
            f"`answer_mode: {SYNTHESIZE}`."
        )

    doc = KnowledgeDoc(
        doc_id=meta["id"],
        title=meta["title"],
        topic_keys=keys,
        source=meta["source"],
        answer_mode=meta["answer_mode"],
        path=path,
        body=body,
    )
    doc.chunks = chunk_doc(doc)

    if doc.answer_mode == VERBATIM and not doc.verbatim_answer:
        raise KnowledgeError(f"{path.name}: tài liệu `verbatim` không có câu trả lời nào")
    return doc


def _split_sections(body: str) -> list[tuple[str, str]]:
    """(tiêu đề mục, nội dung) theo heading `##`. Đoạn trước heading đầu có tiêu đề rỗng.

    Dòng `# Tiêu đề` (H1) bị BỎ khỏi nội dung, vì `chunk_doc` đã ghép `doc.title` vào đầu mỗi
    đoạn — để nó lại thì tiêu đề xuất hiện HAI LẦN trong `text`.

    Đây không phải chuyện thẩm mỹ. Trùng tiêu đề **thổi phồng tần số từ** của đúng những từ
    trong tiêu đề, và BM25 xếp hạng theo tần số từ. Tức nó làm lệch chính phép so
    BM25/embedding/hybrid mà bước sau sẽ chạy — một thiên lệch nằm trong dữ liệu, không nằm
    trong phương pháp, nên đọc kết quả sẽ không thấy nó.
    """
    parts: list[tuple[str, str]] = []
    current_heading = ""
    buffer: list[str] = []
    for line in body.splitlines():
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            if "".join(buffer).strip():
                parts.append((current_heading, "\n".join(buffer).strip()))
            current_heading = line[3:].strip()
            buffer = []
        else:
            buffer.append(line)
    if "".join(buffer).strip():
        parts.append((current_heading, "\n".join(buffer).strip()))
    return parts


def _split_long(heading: str, text: str) -> list[tuple[str, str]]:
    """Mục quá dài thì chia tiếp theo `###`; vẫn dài thì chia theo đoạn văn."""
    if len(text.split()) <= MAX_WORDS_PER_CHUNK:
        return [(heading, text)]

    subs: list[tuple[str, str]] = []
    sub_heading = heading
    buffer: list[str] = []
    for line in text.splitlines():
        if line.startswith("### "):
            if "".join(buffer).strip():
                subs.append((sub_heading, "\n".join(buffer).strip()))
            sub_heading = f"{heading} — {line[4:].strip()}"
            buffer = []
        else:
            buffer.append(line)
    if "".join(buffer).strip():
        subs.append((sub_heading, "\n".join(buffer).strip()))

    # Vẫn còn mục dài sau khi chia theo `###` thì cắt theo đoạn văn — thà đoạn hơi dài còn
    # hơn cắt giữa câu.
    out: list[tuple[str, str]] = []
    for head, chunk_text in subs:
        if len(chunk_text.split()) <= MAX_WORDS_PER_CHUNK:
            out.append((head, chunk_text))
            continue
        paragraphs = [p.strip() for p in chunk_text.split("\n\n") if p.strip()]
        acc: list[str] = []
        for para in paragraphs:
            acc.append(para)
            if len(" ".join(acc).split()) >= MAX_WORDS_PER_CHUNK:
                out.append((head, "\n\n".join(acc)))
                acc = []
        if acc:
            out.append((head, "\n\n".join(acc)))
    return out


def _merge_short(pieces: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Gộp mảnh quá ngắn vào mảnh liền sau (hoặc liền trước nếu nó là mảnh cuối).

    Chạy TRƯỚC khi cấp `chunk_id`, để mã đoạn vẫn liên tục 0,1,2... Nếu gộp sau khi cấp mã thì
    dãy mã bị khuyết và tập đánh giá truy hồi trỏ vào mã không tồn tại.
    """
    if len(pieces) <= 1:
        return pieces
    out: list[tuple[str, str]] = []
    carry: tuple[str, str] | None = None
    for heading, text in pieces:
        if carry is not None:
            heading = carry[0] or heading
            text = f"{carry[1]}\n\n{text}"
            carry = None
        if len(text.split()) < MIN_WORDS_PER_CHUNK:
            carry = (heading, text)
            continue
        out.append((heading, text))
    if carry is not None:
        if out:
            last_heading, last_text = out[-1]
            out[-1] = (last_heading, f"{last_text}\n\n{carry[1]}")
        else:
            out.append(carry)
    return out


def chunk_doc(doc: KnowledgeDoc) -> list[KnowledgeChunk]:
    pieces: list[tuple[str, str]] = []
    for heading, text in _split_sections(doc.body):
        pieces.extend(_split_long(heading, text))

    # Ngưỡng đoạn tối thiểu tồn tại vì đoạn ngắn chiếm chỗ trong top-k mà không mang tín hiệu.
    # Tài liệu `verbatim` không đi qua xếp hạng nên lý do đó không áp dụng — và câu trả lời
    # nguyên văn thì NGẮN LÀ ĐÚNG ("Có wifi miễn phí..." đúng 16 từ).
    if doc.answer_mode == SYNTHESIZE:
        pieces = _merge_short(pieces)

    chunks: list[KnowledgeChunk] = []
    for index, (heading, text) in enumerate(pieces):
        # Quy tắc 2: kèm tiêu đề tài liệu, để đoạn tự đủ nghĩa khi trích rời.
        prefix = doc.title if not heading else f"{doc.title} — {heading}"
        chunks.append(
            KnowledgeChunk(
                chunk_id=f"{doc.doc_id}#{index}",
                doc_id=doc.doc_id,
                title=doc.title,
                heading=heading,
                topic_keys=doc.topic_keys,
                source=doc.source,
                answer_mode=doc.answer_mode,
                text=f"{prefix}\n{text}",
            )
        )
    if not chunks:
        raise KnowledgeError(f"{doc.path.name}: tài liệu không có nội dung nào để chia đoạn")
    return chunks


def load_all(root: Path) -> list[KnowledgeDoc]:
    """Nạp mọi tài liệu trong `root`, sắp theo `doc_id` để thứ tự đoạn tất định."""
    docs = [load_doc(p) for p in sorted(root.rglob("*.md"))]
    seen: dict[str, Path] = {}
    for doc in docs:
        if doc.doc_id in seen:
            raise KnowledgeError(
                f"{doc.path.name}: id {doc.doc_id!r} trùng với {seen[doc.doc_id].name}"
            )
        seen[doc.doc_id] = doc.path

    # Khóa chủ đề phải duy nhất trong CẢ kho. Trước khi gộp, kho tri thức nằm ở hai chỗ và bất
    # biến này là "hai kho không được trùng chủ đề" — một test phải nhớ đối chiếu hai nguồn. Gộp
    # về một kho biến nó thành phép kiểm trùng lặp bình thường, và đó là cả điểm của việc gộp:
    # lớp lỗi bị chặn bằng cấu trúc, không bằng việc ai đó nhớ kiểm.
    owner: dict[str, str] = {}
    for doc in sorted(docs, key=lambda d: d.doc_id):
        for key in doc.topic_keys:
            if key in owner:
                raise KnowledgeError(
                    f"{doc.path.name}: khóa chủ đề {key!r} đã thuộc {owner[key]!r}. Mỗi chủ đề "
                    "chỉ được một tài liệu phụ trách — hai tài liệu cùng khóa thì tài liệu tra "
                    "sau không bao giờ tới lượt mà vẫn chiếm chỗ trong chỉ mục."
                )
            owner[key] = doc.doc_id
    return sorted(docs, key=lambda d: d.doc_id)


def all_chunks(root: Path) -> list[KnowledgeChunk]:
    return [c for doc in load_all(root) for c in doc.chunks]


def retrievable_chunks(root: Path) -> list[KnowledgeChunk]:
    """Đoạn mà bộ truy hồi được phép xếp hạng — chỉ tài liệu `synthesize`.

    Đoạn của tài liệu `verbatim` bị loại khỏi chỉ mục vì chúng đã có đường tới khách riêng
    (tra khóa, trả nguyên văn). Để chúng trong chỉ mục thì có hai đường tới cùng một nội dung,
    và đường xếp hạng có thể trích một câu chính sách ra giữa câu tư vấn món.
    """
    return [c for c in all_chunks(root) if c.answer_mode == SYNTHESIZE]


def doan_toan_kho(root: Path) -> list[KnowledgeChunk]:
    """Đúng tập đoạn mà bộ truy hồi TOÀN KHO lúc chạy xếp hạng.

    Vì sao hàm này tồn tại thay vì viết lại phép lọc ở mỗi chỗ dùng
    --------------------------------------------------------------
    Phép lọc chỉ là một dòng, nên nó đã bị viết lại ở hai chỗ — và hai chỗ viết KHÁC nhau:

        answer.py::_bo_truy_hoi_toan_kho   [c for c in retrievable_chunks(...) if c.heading]
        bước tính sẵn vector lúc build     retrievable_chunks(...)          <- KHÔNG lọc heading

    Hậu quả đo được: bước build tính vector cho 425 đoạn, lúc chạy cần vector cho tập ĐÃ LỌC, nên
    hàm băm nội dung không khớp và hệ thống **tính lại toàn bộ** — 60 giây mỗi lần container khởi
    động, trong khi log build in "da ghi ... cho 425 doan" và mọi dấu hiệu bề ngoài nói đã có đệm.

    Không có gì báo. Đệm hoạt động đúng như thiết kế (khóa lệch thì tính lại, không dùng vector sai),
    nên nó im lặng làm điều đúng và che mất việc nó chưa bao giờ được dùng.

    Đây cùng lớp lỗi với `COPY backend/data` từng thiếu và với tên biến `AI_EMBEDDING_CACHE`: hai
    đầu phải khớp, và cách sửa duy nhất không dựa vào việc ai đó nhớ là để **một nguồn duy nhất**.

    Vì sao lọc `heading` rỗng
    -------------------------
    Đoạn không có tiêu đề mục là phần mở đầu tài liệu — với `chunker` thì nó chỉ mang dòng tiêu đề
    tài liệu, không mang tín hiệu nào để xếp hạng, và trích nó cho khách đọc là trích một cái tên.
    """
    return [c for c in retrievable_chunks(root) if c.heading]


def verbatim_answers(root: Path) -> dict[str, str]:
    """{khóa chủ đề: câu trả lời nguyên văn} cho mọi tài liệu `verbatim`.

    Đây là thứ `answer.py::load_facts()` dùng. Trả chuỗi nguyên văn, không qua mô hình, không
    qua xếp hạng — nên không có chỗ nào để chệch.
    """
    out: dict[str, str] = {}
    for doc in load_all(root):
        if doc.answer_mode != VERBATIM:
            continue
        for key in doc.topic_keys:
            out[key] = doc.verbatim_answer
    return out
