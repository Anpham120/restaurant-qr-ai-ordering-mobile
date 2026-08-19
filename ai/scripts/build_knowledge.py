# -*- coding: utf-8 -*-
"""Sinh tài liệu tri thức tính từ thực đơn, và kiểm toàn bộ kho tri thức.

Vì sao SINH thay vì viết tay
----------------------------
Kho tri thức bản cũ có `menu.md` — 159 dòng **kể lại thực đơn bằng văn xuôi**: tên món, mã
món, mô tả từng món. Nó ghi *"hơn 90 món"* trong khi thực đơn có **đúng 91 món**. Con số viết
tay, không ai canh, và nó sai ngay từ lúc viết.

Đó là lớp lỗi không thể tránh bằng cách cẩn thận: **văn xuôi kể lại dữ liệu thì luôn trôi khỏi
dữ liệu.** Cách duy nhất chặn được là **tính lại từ dữ liệu mỗi lần**.

Nên kho tri thức chia hai loại, và phân biệt này là quyết định trung tâm của khâu dữ liệu:

    derived  — SINH từ menu-dataset.json. Không thể lệch, vì nó LÀ thực đơn diễn đạt lại.
    demo     — người viết. Chính sách nhà hàng, gợi ý kết hợp — dữ liệu không suy ra được.

Script này sinh **8 tài liệu chính sách** có số tính từ thực đơn (khoảng giá, món chay, món cho
trẻ em...). Mỗi câu trong đó truy được về một con số cụ thể.

Nó TỪNG sinh thêm 49 tài liệu, mỗi giá trị nhãn một tài liệu. Chúng đã bị bỏ sau khi đo — xem
`generate()`. Bài học đáng giữ: `derived` bảo đảm tài liệu **không lệch khỏi dữ liệu**, nhưng
không bảo đảm tài liệu ấy **có ai đọc**.

    python ai/scripts/build_knowledge.py --check   # kiểm, không ghi
    python ai/scripts/build_knowledge.py           # sinh lại tài liệu derived
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))

from rag.chunker import SYNTHESIZE, KnowledgeError, load_all  # noqa: E402

MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"
DICT_PATH = REPO_ROOT / "data" / "menu-tags.json"
KNOWLEDGE_ROOT = REPO_ROOT / "ai" / "knowledge"
DERIVED_DIR = KNOWLEDGE_ROOT / "derived"
WRITTEN_DIR = KNOWLEDGE_ROOT / "written"
POLICY_DIR = KNOWLEDGE_ROOT / "policy"

# Bảng `DERIVED_GROUPS` (6 nhóm nhãn) đã bị xoá cùng 49 tài liệu nó sinh.
#
# Tiêu chí chọn nhóm khi đó nghe rất hợp lý: "nhóm này có câu hỏi nào mà LỚP TRA KHÓA không trả
# lời được không?". Nó sai ở chỗ không ai ngờ — 106 ca nhắm vào chúng đều là câu CHỌN MÓN, tức
# việc của nhánh lọc nhãn, không phải của truy hồi. Xem `generate()`.
#
# Ghi ra thay vì xoá lặng: cùng lập luận ấy đã đúng khi KHÔNG sinh cho `spice`/`price`/`party`/
# `season` ngay từ đầu. Lần đó nhìn ra ngay; lần này phải đo trên câu hỏi thật mới thấy.


DANH_MUC_DO_UONG = ("cat_drink", "cat_juice", "cat_alcohol")


def money(value: int) -> str:
    return f"{value:,}".replace(",", ".") + "đ"


# `build_derived_doc` (146 dòng) và bảng `DERIVED_GROUPS` đã bị xoá cùng 49 tài liệu chúng sinh.
#
# Chúng sinh một tài liệu cho mỗi giá trị nhãn — 190/372 đoạn của chỉ mục — và không đường nào
# tới chúng ngoài truy hồi toàn kho. Xem `generate()` bên dưới để biết vì sao bỏ.
#
# Giữ lại phần sinh CHÍNH SÁCH: tám tài liệu có SỐ tính từ thực đơn nên chúng phải do máy sinh,
# nếu không con số sẽ trôi khi thực đơn đổi giá.


def _policy_doc(topic: str, title: str, answer: str) -> str:
    """Một tài liệu chính sách `verbatim`: một khối, không mục `##`.

    Ngắt dòng ở 96 ký tự cho dễ đọc — an toàn vì `KnowledgeDoc.verbatim_answer` thu khoảng
    trắng về một dấu cách, nên chuỗi tới khách không đổi theo cách ngắt dòng.
    """
    lines, cur = [], ""
    for word in " ".join(answer.split()).split():
        if cur and len(cur) + 1 + len(word) > 96:
            lines.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    if cur:
        lines.append(cur)
    body = "\n".join(lines)
    return (
        "---\n"
        f"id: kb.policy.{topic}.v1\n"
        f"title: {title}\n"
        f"topic_keys: [{topic}]\n"
        "source: derived\n"
        "audience: guest\n"
        "answer_mode: verbatim\n"
        "---\n\n"
        f"# {title}\n\n"
        f"{body}\n"
    )


def build_policy_derived(menu: dict, dictionary: dict) -> dict[Path, str]:
    """Tám tài liệu chính sách có SỐ tính từ thực đơn, nên chúng phải do máy sinh.

    Mười sáu tài liệu chính sách còn lại (`giờ mở cửa`, `wifi`, `đỗ xe`...) là chính sách thật
    của nhà hàng, không suy được từ thực đơn — chúng là tệp tĩnh trong `knowledge/policy/` và
    script này không chạm vào.

    Phần này trước đây nằm ở `build_restaurant_facts.py`, sinh ra `restaurant-facts.json`. Kho
    tri thức đã gộp về một chỗ nên script đó nghỉ, và logic tính chuyển về đây nguyên văn — mọi
    con số phải giữ đúng như cũ, nếu không 112 ca sẽ đổi kết quả.

    Ghi nhận từ lúc viết phần này: `diet:vegan` và `diet:vegetarian` gắn trên ĐÚNG CÙNG 17 món,
    nên trong bộ dữ liệu này một trong hai nhãn không phân biệt được gì. Với món chay Việt thì
    hợp lý (chay Phật giáo vốn không dùng sữa, trứng), nhưng nghĩa là câu "có món thuần chay
    không" và "có món chay không" cho cùng kết quả — và câu trả lời nói ra điều đó thay vì để
    khách tự đoán.
    """
    items = menu["items"]
    categories = menu["categories"]
    prices = sorted(m["price"] for m in items)
    cheapest = min(items, key=lambda m: m["price"])
    priciest = max(items, key=lambda m: m["price"])

    def names(tag: str) -> list[str]:
        return sorted(m["name"] for m in items if tag in m["tags"])

    preorder = names("serving:preorder")
    takeaway = names("serving:takeaway")
    child = names("audience:child")
    elderly = names("audience:elderly")
    vegetarian = names("diet:vegetarian")
    vegan = names("diet:vegan")
    no_spice = names("spice:none")

    allergen_groups = sorted(
        entry["label_vi"] for entry in dictionary["tags"].values() if entry["group"] == "allergen"
    )
    labelled = len({m["id"] for m in items if any(t.startswith("allergen:") for t in m["tags"])})

    facts = {
        "menu_size": (
            "Quy mô thực đơn",
            f"Thực đơn hiện có {len(items)} món, chia {len(categories)} nhóm: "
            + ", ".join(c["name"] for c in categories)
            + ".",
        ),
        "price_range": (
            "Khoảng giá",
            f"Giá món từ {money(prices[0])} đến {money(prices[-1])}, phần lớn quanh "
            f"{money(prices[len(prices) // 2])}. Món rẻ nhất là {cheapest['name']} "
            f"({money(cheapest['price'])}), món cao nhất là {priciest['name']} "
            f"({money(priciest['price'])}).",
        ),
        "preorder": (
            "Món cần đặt trước",
            f"Có {len(preorder)} món cần đặt trước vì phải chuẩn bị lâu, gồm "
            + ", ".join(preorder[:4])
            + f" và {len(preorder) - 4} món khác. Bạn nói với nhân viên trước khi gọi "
            "để bếp chuẩn bị kịp nhé.",
        ),
        "takeaway_items": (
            "Món mang đi được",
            f"Thực đơn ghi nhận {len(takeaway)} món phù hợp mang đi. Đây là thông tin "
            "về từng món, còn việc nhà hàng có giao hàng hay không thì bạn xem phần "
            "giao hàng — hai việc khác nhau.",
        ),
        "children": (
            "Món cho trẻ em",
            f"Thực đơn ghi nhận {len(child)} món phù hợp trẻ em và {len(elderly)} món "
            f"phù hợp người lớn tuổi. Trong đó có {len(no_spice)} món không cay trên "
            "toàn thực đơn để bạn dễ chọn.",
        ),
        "vegetarian": (
            "Món chay",
            f"Có {len(vegetarian)} món chay, và cả {len(vegan)} món đều là thuần chay "
            "— không dùng sữa hay trứng. Nhóm Món chay riêng có 7 món, phần còn lại "
            "nằm rải ở các nhóm khác.",
        ),
        "spice_levels": (
            "Mức cay",
            "Mỗi món đều được ghi một trong bốn mức: không cay, cay nhẹ, cay vừa, cay "
            f"đậm. Toàn thực đơn có {len(no_spice)} món không cay, nên bạn nói mức cay "
            "muốn ăn là mình lọc được ngay.",
        ),
        # Mục quan trọng nhất nhóm này, và là mục duy nhất nói về GIỚI HẠN của dữ liệu.
        "allergen_labelling": (
            "Cách thực đơn ghi nhận dị nguyên",
            "Thực đơn ghi nhận "
            + ", ".join(g.lower() for g in allergen_groups)
            + f". Hiện {labelled}/{len(items)} món có ghi nhận dị nguyên, nghĩa là món "
            "KHÔNG có ghi nhận thì chỉ có nghĩa thực đơn chưa ghi, chứ không có nghĩa "
            "món đó không chứa. Vì vậy khi bạn có dị ứng, mình luôn nhắc xác nhận lại "
            "với nhân viên và bếp trước khi gọi.",
        ),
    }
    return {
        POLICY_DIR / f"{topic.replace('_', '-')}.md": _policy_doc(topic, title, answer)
        for topic, (title, answer) in facts.items()
    }


def generate(menu: dict, dictionary: dict) -> dict[Path, str]:
    """Chỉ còn sinh tài liệu CHÍNH SÁCH. 49 tài liệu theo nhãn đã bị bỏ — xem bên dưới.

    VÌ SAO BỎ 49 TÀI LIỆU SINH THEO NHÃN
    ------------------------------------
    Chúng chiếm **190/372 = 51% chỉ mục truy hồi** và không phục vụ ai.

    1. Nhánh lọc nhãn KHÔNG đọc chúng. `select(request, items)` chỉ nhận thực đơn — không có
       đường nào để nó mở kho tri thức.
    2. Tra khóa KHÔNG tới được chúng: 0/49 `topic_keys` có mặt trong từ vựng.
    3. Nên chỉ truy hồi toàn kho đọc chúng — và 106 ca từng nhắm vào chúng đều là **câu chọn
       món** ("Món Hà Nội có gì?"), tức câu của nhánh lọc. Sau khi thêm 36 cụm từ vựng,
       **99,1% (105/106)** số ca ấy đi thẳng nhánh lọc và không còn chạm truy hồi.

    Và chúng làm HỎNG phần truy hồi còn lại: 49 tài liệu dùng chung đúng 4 tiêu đề mục, tài liệu
    điển hình có **0 từ chỉ xuất hiện ở riêng nó** (văn xuôi viết tay: 2, nhiều nhất 18), vì danh
    sách món rò rỉ từ vựng của mọi nhóm khác. Bộ nhúng phải chọn giữa 190 đoạn gần trùng nhau.

    Ba cách chữa đã đo, cả ba đều không thắng — xếp lại bằng cross-encoder (p = 0,8238), gộp
    thành 6 tài liệu theo họ (p = 0,5488), cắt bớt mục (0 từ riêng lên 1). Thứ trùng lặp là chính
    cái khuôn, nên cách duy nhất còn lại là **bỏ hẳn**.

    Kết quả: chỉ mục còn **182 đoạn văn xuôi viết tay đồng nhất** — đúng thứ bài toán RAG cần.
    Nội dung mất đi không mất thật: mọi thứ 49 tài liệu ấy nói (danh sách món mang nhãn X, dị
    nguyên trong nhóm, dải giá) đều tính được từ nhãn, và nhánh lọc làm việc đó **chính xác
    100,00%** thay vì 54,40%.
    """
    return build_policy_derived(menu, dictionary)


def inspect(problems: list[str]) -> tuple[int, int, Counter, Counter]:
    """Nạp toàn bộ kho, kiểm bất biến, trả về (số tài liệu, số đoạn, đếm theo nguồn)."""
    try:
        docs = load_all(KNOWLEDGE_ROOT)
    except KnowledgeError as exc:
        problems.append(str(exc))
        return 0, 0, Counter(), Counter()

    chunks = [c for d in docs for c in d.chunks]
    sources = Counter(d.source for d in docs)
    modes = Counter(d.answer_mode for d in docs)

    # Bất biến 1: chunk_id không trùng. Tập đánh giá truy hồi trỏ vào chunk_id, nên trùng là
    # hai đoạn khác nhau cùng một địa chỉ.
    dupes = [k for k, n in Counter(c.chunk_id for c in chunks).items() if n > 1]
    if dupes:
        problems.append(f"chunk_id trùng: {dupes[:5]}")

    # Bất biến 2: mọi đoạn phải kèm tiêu đề tài liệu, để tự đủ nghĩa khi trích rời.
    orphan = [c.chunk_id for c in chunks if not c.text.startswith(c.title)]
    if orphan:
        problems.append(f"đoạn không kèm tiêu đề tài liệu: {orphan[:5]}")

    # Bất biến 3: đoạn quá ngắn thì vô dụng khi truy hồi — nó không mang đủ tín hiệu.
    #
    # Chỉ áp cho đoạn `synthesize`. Tài liệu `verbatim` không đi qua xếp hạng, và câu trả lời
    # nguyên văn thì NGẮN LÀ ĐÚNG — "Có wifi miễn phí. Tên mạng và mật khẩu ghi trên thẻ để ở
    # mỗi bàn." đúng 16 từ và đó là câu trả lời hoàn chỉnh.
    tiny = [c.chunk_id for c in chunks if c.answer_mode == SYNTHESIZE and c.word_count < 12]
    if tiny:
        problems.append(f"đoạn quá ngắn (<12 từ): {tiny[:5]}")

    problems.extend(kiem_so_tien(docs))

    return len(docs), len(chunks), sources, modes


# Ngưỡng ngân sách tròn — số dùng để NÓI VỀ mức chi, không phải giá của món nào.
#
# Danh sách này hẹp và viết tay có chủ ý: mỗi con số ở đây là một lần ai đó quyết định rằng nó
# KHÔNG cần bám giá món. Để trống danh sách thì tám câu tư vấn ngân sách hỏng; để nó rộng thì phép
# kiểm mất tác dụng. Thêm số vào đây phải là một hành động có ý thức.
NGUONG_NGAN_SACH = {90_000, 100_000, 200_000, 300_000, 500_000, 62_500}


def kiem_so_tien(docs) -> list[str]:
    """Mọi số tiền trong kho phải truy được về `menu-dataset.json`.

    Vì sao bất biến này tồn tại
    ---------------------------
    36 tài liệu `written` là văn xuôi VIẾT TAY, và nhiều đoạn trong đó nêu số tiền: "giá trung vị
    của thực đơn là 65.000đ", "lẩu đều từ 250.000đ trở lên". Những con số ấy đúng lúc viết, và
    **không có gì buộc chúng đúng sau khi thực đơn đổi giá**. Một tài liệu `derived` thì không trôi
    được vì nó sinh lại từ dữ liệu; một tài liệu `written` thì trôi được, và trôi im lặng.

    Đây là hố mà đường sinh KHÔNG che: `build_knowledge.py` chỉ sinh lại phần `derived`.

    Lỗ này lộ ra khi đổi mô hình nhúng sang `bge-m3`. Mô hình mới chọn một MỤC KHÁC của tài liệu
    `meal_sets` cho câu "Có set bữa trưa nào không?", và mục đó có hai con số. Thước đo 140 ca báo
    đỏ vì nó không có nguồn hợp lệ nào cho "số tiền suy từ tổng thể thực đơn".

    Kiểm lại thì **cả hai con số đều đúng** — trung vị đúng 65.000đ, lẩu rẻ nhất đúng 250.000đ. Nên
    việc phải làm không phải nới thước đo mà là **bảo đảm chúng luôn đúng**, rồi mới cho thước đo
    tin vào chữ trong kho.

    Đo trên kho hiện tại: **1.031 lần nêu tiền, 1.023 khớp giá món thật hoặc trung vị (99,22%)**,
    8 lần còn lại là ngưỡng ngân sách tròn trong `NGUONG_NGAN_SACH`.
    """
    import json
    import re
    import statistics

    duong = REPO_ROOT / "data" / "menu-dataset.json"
    items = json.loads(duong.read_text(encoding="utf-8-sig"))["items"]
    hop_le = {i["price"] for i in items}
    hop_le.add(int(statistics.median(i["price"] for i in items)))
    hop_le |= NGUONG_NGAN_SACH

    mau = re.compile(r"(\d{1,3}(?:\.\d{3})+)\s*đ")
    la: list[str] = []
    for d in docs:
        for m in mau.findall(d.title + " " + getattr(d, "body", "")):
            v = int(m.replace(".", ""))
            if v not in hop_le:
                la.append(f"{d.doc_id}: {m}đ không phải giá món, trung vị, hay ngưỡng đã khai")
    return sorted(set(la))[:8]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Kiểm, không ghi.")
    args = parser.parse_args(argv)

    menu = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))
    dictionary = json.loads(DICT_PATH.read_text(encoding="utf-8-sig"))
    wanted = generate(menu, dictionary)
    problems: list[str] = []

    if args.check:
        stale = [
            p for p, text in wanted.items()
            if not p.exists() or p.read_text(encoding="utf-8-sig") != text
        ]
        if stale:
            problems.append(
                f"{len(stale)} tài liệu derived khác kết quả sinh lại: "
                + ", ".join(p.name for p in stale[:4])
            )
        docs, chunks, sources, modes = inspect(problems)
    else:
        DERIVED_DIR.mkdir(parents=True, exist_ok=True)
        WRITTEN_DIR.mkdir(parents=True, exist_ok=True)
        POLICY_DIR.mkdir(parents=True, exist_ok=True)
        for path, text in wanted.items():
            path.write_text(text, encoding="utf-8")
        docs, chunks, sources, modes = inspect(problems)

    print(f"tài liệu       : {docs}")
    print(f"đoạn (chunk)   : {chunks}")
    if docs:
        print(f"đoạn / tài liệu: {chunks / docs:.1f}")
    print("theo nguồn     : " + ", ".join(f"{k}={v}" for k, v in sorted(sources.items())))
    print("theo chế độ    : " + ", ".join(f"{k}={v}" for k, v in sorted(modes.items())))

    if problems:
        print(f"\nVẤN ĐỀ ({len(problems)}):")
        for line in problems:
            print(f"  - {line}")
        if not args.check:
            print("Đã ghi tài liệu derived, nhưng kho vẫn có vấn đề ở trên.")
        return 1

    if args.check:
        print("\n--check: tài liệu derived khớp kết quả sinh lại, kho tri thức hợp lệ.")
    else:
        print(f"\nĐã ghi {len(wanted)} tài liệu vào {DERIVED_DIR.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
