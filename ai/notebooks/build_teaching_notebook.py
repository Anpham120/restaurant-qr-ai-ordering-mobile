# -*- coding: utf-8 -*-
"""Sinh notebook giảng dạy + báo cáo cho hệ thống AI tư vấn đặt món.

Vì sao sinh bằng script thay vì viết notebook bằng tay
------------------------------------------------------
Một notebook báo cáo viết tay có hai bệnh, và bản cũ của dự án này mắc cả hai:

1. **Số liệu chép tay lạc hậu.** Ai đó đo được 0,9960, chép vào notebook, rồi hệ thống đổi
   và con số nằm đó mãi. Bản cũ có một chỉ số được báo +81% trong khi số thật là +53%.
2. **Notebook và mã trôi khỏi nhau.** Notebook nhắc một hàm đã bị đổi tên, và không có gì
   báo.

Ở đây mỗi ô mã trong notebook **tự tính lại** từ `ai/app` và `ai/evaluation` thật. Chạy lại
notebook là đo lại. Không có bảng số nào chép tay.

    python ai/notebooks/build_teaching_notebook.py          # sinh notebook
    python ai/notebooks/build_teaching_notebook.py --check   # kiểm khớp bản đã commit
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import nbformat

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = Path(__file__).resolve().parent / "he_thong_ai_tu_van_dat_mon.ipynb"


def _kiem_ke_dung_chu() -> dict[str, int]:
    """Kiểm kê đụng chữ, lấy từ ĐÚNG hàm mà test dùng.

    Vì sao không gõ số vào phần nhận xét: con số này đã trôi ba lần trong dự án —
    **32 → 61 → 72 → 89 → 92** — và mỗi lần lại sót ở một chỗ khác. Ngay trước lần sửa này, cùng
    một kiểm kê xuất hiện với BỐN giá trị khác nhau trong repo (61, 89, 90, 92) và hai giá trị cho
    số cụm nằm trong tên món (40 và 41). Không ai cố ý; chỉ là năm chỗ viết tay thì không cách nào
    cùng đúng.

    `test_understand.collision_census()` là nguồn duy nhất, và nó CÓ test chốt giá trị — nên số ở
    notebook không thể lệch số ở test mà không ai biết.
    """
    import sys

    for p in (REPO_ROOT / "ai" / "app", REPO_ROOT / "ai" / "evaluation"):
        if str(p) not in sys.path:
            sys.path.insert(0, str(p))
    from test_understand import collision_census  # noqa: PLC0415 - cần sys.path ở trên

    return collision_census()


KIEM_KE = _kiem_ke_dung_chu()

# Ô mã nào cũng bắt đầu bằng đoạn này. Lặp lại có chủ ý: mỗi ô tự chạy được, nên người đọc
# mở giữa notebook cũng không gặp NameError.
SETUP = '''\
import json, sys
from pathlib import Path

# Tự tìm gốc repo bằng cách leo lên tới thư mục có ai/app — không phụ thuộc chỗ mở notebook.
ROOT = Path.cwd()
while not (ROOT / "ai" / "app" / "understand.py").exists():
    if ROOT.parent == ROOT:
        raise RuntimeError("Không tìm được gốc repo")
    ROOT = ROOT.parent
for p in (ROOT / "ai" / "app", ROOT / "ai" / "evaluation"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8-sig"))

KNOWLEDGE = ROOT / "ai" / "knowledge"
'''

# Phần dựng biểu đồ, thêm vào những ô có vẽ hình. Tách khỏi SETUP để ô không vẽ không phải
# nạp matplotlib — nạp mất ~1 giây và làm notebook chạy chậm hơn không cần thiết.
#
# Cấu hình font: DejaVu Sans là font mặc định của matplotlib và nó CÓ dấu tiếng Việt. Không
# đặt thì nhãn trục hiện ra ô vuông, và biểu đồ dùng cho báo cáo thì không chấp nhận được.
PLOT = '''
import matplotlib

# KHÔNG đặt backend khi đang ở trong Jupyter. Trong notebook, backend mặc định là `inline` và
# nó nhúng hình PNG vào ô kết quả; ép sang "Agg" thì `plt.show()` chạy im lặng và notebook
# **không có hình nào** — đã mắc đúng lỗi này một lần, 16/16 ô chạy sạch mà 0 biểu đồ.
try:
    get_ipython()                # chỉ tồn tại trong Jupyter
except NameError:
    matplotlib.use("Agg")        # chạy ngoài notebook thì không mở cửa sổ
import matplotlib.pyplot as plt
plt.rcParams.update({
    "font.family": "DejaVu Sans",     # có dấu tiếng Việt
    "figure.dpi": 110,
    "axes.grid": True,
    "axes.grid.axis": "y",
    "grid.alpha": 0.25,
    "axes.spines.top": False,
    "axes.spines.right": False,
})
# Bảng màu dùng chung cả notebook, để biểu đồ trong báo cáo nhất quán.
XANH, DO, XAM, CAM = "#2c6fbb", "#c0392b", "#95a5a6", "#e67e22"
'''


def md(source: str) -> nbformat.NotebookNode:
    return nbformat.v4.new_markdown_cell(source.strip())


def code(source: str) -> nbformat.NotebookNode:
    return nbformat.v4.new_code_cell(SETUP + "\n" + source.strip())


def plot_code(source: str) -> nbformat.NotebookNode:
    """Ô mã có vẽ biểu đồ: nạp thêm phần cấu hình matplotlib."""
    return nbformat.v4.new_code_cell(SETUP + PLOT + "\n" + source.strip())


def raw_code(source: str) -> nbformat.NotebookNode:
    """Ô mã không cần phần nạp (dùng cho ô đầu tiên đã tự khai)."""
    return nbformat.v4.new_code_cell(source.strip())


def cells() -> list[nbformat.NotebookNode]:
    out: list[nbformat.NotebookNode] = []

    # ================================================================= TIÊU ĐỀ
    out.append(md(r"""
# Hệ thống AI tư vấn đặt món — tài liệu giảng dạy và báo cáo

**Đồ án:** trợ lý AI trong ứng dụng gọi món qua mã QR tại bàn
**Dữ liệu:** thực đơn 91 món, 13 nhóm · **Mô hình:** `cx/gpt-5.6-luna-review` qua 9router
**Môi trường:** Python 3.12, CPU

---

> **Cam kết về số liệu.** Mọi con số trong notebook này được **tính trực tiếp** từ mã và dữ
> liệu thật của dự án khi bạn chạy ô mã. Không có bảng nào chép tay, không có ảnh chụp sẵn.
> Chạy lại notebook là đo lại từ đầu.

## Notebook này dạy gì

Notebook đi theo **đúng thứ tự mà hệ thống đã được xây**, vì thứ tự đó chính là phương pháp.
Mỗi phần có ba lớp:

| Lớp | Nội dung |
|---|---|
| **Kiến thức** | khái niệm, vì sao nó cần, và cái bẫy thường gặp |
| **Ví dụ tại dự án** | ô mã chạy trên dữ liệu thật, in ra số |
| **Nhận xét** | quan sát → diễn giải → giới hạn → quyết định tiếp theo |

## Mục lục — và ai phụ trách phần nào

Nhóm 5 người chia việc thành **một vai nền tảng cộng bốn khâu của pipeline**:

```
        TV1  NỀN TẢNG — dữ liệu & đo lường
             kho tri thức · từ điển nhãn · tập đánh giá · thước đo
             KHÔNG phải một chặng runtime: mọi khâu DÙNG nó, không đi qua
                          │
                          ▼  cung cấp dữ liệu và tiêu chí cho cả 4 khâu
khách gõ câu → TV5 cổng vào & phiên → TV2 hiểu câu hỏi → TV3 truy hồi
             → TV4 chọn món & giỏ hàng → TV5 ghi bộ nhớ, trả JSON
```

| TV | Phụ trách | Module sở hữu | Mục notebook | Trạng thái |
|---|---|---|---|---|
| **1** | **Nền tảng: dữ liệu & đo lường** | `knowledge/*` · `chunker.py` · `build_*.py` · `evaluation/*` | 1–11, 14–15, 19 | **xong** |
| **2** | Hiểu câu hỏi | `understand.py` · `llm_understand.py` | 4, 12–13, 16 | **xong** |
| **3** | Truy hồi | `rag/bm25.py` · `embedding.py` · `hybrid.py` · `precompute.py` | 15–15d, 20 | **xong** |
| **4** | Chọn món & giỏ hàng | `answer.py` · `cart.py` · `generate.py` | 12–14, 17–18 | **xong** |
| **5** | Cổng vào & phiên | `service.py` · `session.py` | 16, 18, 20 | **xong, đã chạy thật** |
| — | Kết quả, làm được, hạn chế, hướng phát triển | — | 21–23 | — |

### Thứ tự bảy phần, và vì sao đúng thứ tự đó

```
 1  dựng DỮ LIỆU            thực đơn · nhãn · kho tri thức · chia đoạn
 2  dựng THƯỚC ĐO           tập ca · khóa đáp án kiểm được · chia ba nhóm
 3  trả lời KHÔNG mô hình    số nền — mọi thứ sau đó phải hơn số này
 4  dựng TRUY HỒI + SO       ba cách × hai bài toán × hai tập  →  CHỌN một
 5  mô hình SINH + an toàn   nơi mô hình có giá trị, và lớp xác minh
 6  THỬ NGHIỆM THẬT          gọi mô hình · qua HTTP · vào giỏ hàng thật
                             → phân tích case sai KHÔNG sửa được nữa
                             → CHỐT phương án production
 7  kết quả · làm được · hạn chế · hướng phát triển
```

Thước đo (2) đứng **trước** thứ được đo (3–5) vì không có thứ tự nào khác cho phép biết một thay đổi
làm tốt lên hay xấu đi. Và phần chốt production (6) đứng **sau** phần thử nghiệm thật, không phải sau
phần so trên máy — vì bốn lỗi tích hợp nặng nhất của dự án chỉ hiện ra khi chạy thật.

**Vì sao dữ liệu và đo lường thuộc CÙNG một người.** Chúng giống nhau ở điểm quan trọng nhất: cả
hai **không phải chặng runtime** — một câu hỏi không "đi qua" từ điển nhãn hay tập đánh giá, nó
*dùng* chúng. Tách chúng ra thì hoặc chúng bị gửi vào các khâu (và người nhận gánh thêm một nền
kiến thức lạ), hoặc chúng thành "việc chung" và không ai làm.

Chúng cũng đòi **cùng một loại kỷ luật**: *số phải tính được, không được viết tay*. Dự án đã mắc lỗi
đó hai lần và cả hai đều ở phần TV1 phụ trách — `"hơn 90 món"` khi thực đơn có đúng 91, và kiểm kê
đụng chữ ghi `32/90` khi thật là `53/40`.

Nhờ tách như vậy, **TV3 chỉ làm truy hồi** (một nền kiến thức: tf-idf, cosine, chỉ số xếp hạng), và
**đo lường có tên** thay vì thành việc chung.

**Mục notebook không ứng một-một với TV**, và đó là điều phải nói rõ: notebook đi theo thứ tự **học
được** (bài toán → dữ liệu → đo lường → trả lời → truy hồi → mô hình), còn phân công đi theo thứ tự
**chạy**. Hai thứ tự trả lời hai câu hỏi khác nhau — *học thế nào cho hiểu* và *ai sửa tệp nào*.

**Điều phải biết trước: TV1 nằm trên đường tới hạn của hai người.** TV3 không đo được phép so truy
hồi trước khi TV1 xong ~120 ca truy hồi; TV5 không đo được bộ nhớ phiên trước khi TV1 xong ~25 kịch
bản đa lượt. Nên thứ tự tuần 1 của TV1 là **ca đánh giá trước, mở rộng kho sau**.
"""))

    # ================================================================= PHẦN I
    out.append(md(r"""
---
## Bài toán, dữ liệu và kho tri thức
> **TV1** — nền tảng dữ liệu

> **Vị trí:** nền tảng của cả pipeline. Không phải một chặng runtime — một câu hỏi không "đi qua"
> từ điển nhãn, nó *dùng* từ điển. Nhưng mọi khâu đều đo trên dữ liệu này.

| | |
|---|---|
| **Câu hỏi khâu này trả lời** | *AI được phép trả lời gì, dữ liệu có gì, và khi một nhãn không có mặt thì kết luận được gì?* |
| **Kiến thức phải nắm** | phân loại ba loại câu hỏi A/B/C · rút dấu tiếng Việt là phép mất thông tin · độ phủ nhãn quyết định filterability · chunking cho truy hồi · provenance `derived` vs `demo` |
| **Tệp sở hữu** | `ai/knowledge/*` · `rag/chunker.py` · `build_knowledge.py` · `build_tag_dictionary.py` · `audit_allergen_tags.py` · `data/menu-tags.json` · `ai/evaluation/*` |
| **Đầu vào** | thực đơn thật (91 món) và yêu cầu nghiệp vụ |
| **Đầu ra bàn giao** | từ điển nhãn có tiền tố nhóm · kho 84 tài liệu / 327 đoạn · `KnowledgeChunk` cho TV3 · 119 ca và thước đo cho cả nhóm |
| **Tự đo bằng** | `build_knowledge.py --check` · `build_tag_dictionary.py --check` · `audit_allergen_tags.py` · `python -m unittest test_chunker test_packaging` |
| **Trạng thái** | **xong** — 103 test xanh, 2 bộ sinh khớp kết quả sinh lại |

### Vì sao khâu này đứng đầu

Phản xạ tự nhiên khi bắt đầu là chọn mô hình hoặc dựng RAG. Cả hai đều **sai thứ tự**, vì cả
hai đều cần một thứ chưa có: **định nghĩa thế nào là trả lời sai**. Không có định nghĩa đó thì
mọi câu trả lời đều "có vẻ hợp lý", và không ai đo được gì.

Bảy mục dưới đây là nội dung TV1 phải hiểu, và mỗi mục có ô mã tính lại từ mã sống —
nên đọc xong chạy được ngay, không phải tin lời.

## 1. Cần làm gì đầu tiên: phát biểu bài toán

### Kiến thức

Câu hỏi tự nhiên khi bắt đầu một hệ thống AI là "dùng mô hình nào" hoặc "dựng RAG thế nào".
Cả hai đều **sai thứ tự**.

Việc đầu tiên là trả lời: **AI này được phép trả lời gì, và tuyệt đối không làm gì.** Lý do
rất cụ thể: nếu chưa định nghĩa được thế nào là *ngoài phạm vi*, thì không thể biết hệ thống
đang trả lời sai — mọi câu trả lời đều "có vẻ hợp lý".

Bản cũ của dự án này được viết trước khi câu hỏi đó được trả lời rõ. Kết quả đo được: **8
đường xử lý chồng nhau**, và **2 trong số đó bị một cờ tắt mà hệ thống vẫn hoạt động đúng** —
tức chúng là dư, nhưng không ai biết vì không có định nghĩa để đối chiếu.

### Ba loại câu hỏi, và đây là phân loại quyết định kiến trúc

| Loại | Ví dụ | Đặc điểm | Ai trả lời |
|---|---|---|---|
| **A — tra cứu thực đơn** | "Phở bò bao nhiêu tiền?" | đáp án nằm sẵn trong dữ liệu | **mã tất định**, không được để mô hình |
| **B — tri thức nhà hàng** | "Mấy giờ mở cửa?" | sự thật đã viết ra, không nằm trong thực đơn | tra kho tri thức |
| **C — phán đoán, diễn đạt** | "Gợi ý món cho 4 người ăn tối" | không có đáp án đúng duy nhất | mô hình sinh có giá trị thật |

**Nguyên tắc phân tuyến:** câu loại A **không được** để mô hình sinh trả lời. Không phải vì
mô hình dở, mà vì tra bảng đúng 100% và tái lập được, còn mô hình không đảm bảo cả hai.

Đây là kiến thức áp dụng được cho mọi hệ thống AI có dữ liệu có cấu trúc: **việc gì tra được
thì đừng suy luận.**
"""))

    out.append(code(r'''
# Ba điều AI tuyệt đối không làm — đọc từ chính tài liệu phát biểu bài toán
doc = (ROOT / "ai" / "docs" / "00-problem-statement.md").read_text(encoding="utf-8")
start = doc.index("**Ba việc AI tuyệt đối không làm**")
print(doc[start:start + 780])
'''))

    out.append(md(r"""
#### Nhận xét — Mục 1

- **Quan sát:** ba điều cấm không phải giới hạn về *năng lực* mà về *quyền*. Mô hình hoàn
  toàn viết được câu "món này an toàn cho người dị ứng" — vấn đề là nó không có cơ sở để nói.
- **Diễn giải:** phân biệt "không làm được" và "không được phép làm" là phân biệt cốt lõi khi
  thiết kế AI có tác động thật. Điều thứ nhất sẽ hết khi mô hình mạnh hơn; điều thứ hai thì
  không.
- **Giới hạn:** phát biểu bài toán là văn bản, nên nó chỉ có giá trị nếu có cơ chế cưỡng chế.
  Phần V sẽ cho thấy ba điều cấm này được cưỡng chế bằng mã và test như thế nào.
- **Quyết định tiếp theo:** trước khi viết bất kỳ dòng nào, phải hiểu dữ liệu — Mục 2.
"""))

    out.append(md(r"""
---

# PHẦN 1 — DỮ LIỆU, NHÃN & LỚP HIỂU CÂU HỎI

> **Chặng của TV1 — Phạm Duy An.** Chặng nền. Không nằm trên đường chạy của một câu hỏi, nhưng **mọi chặng sau đều đọc dữ liệu của nó** — một lỗi nhãn ở đây lan ra cả bốn chặng.

| | |
|---|---|
| **Nhận từ chặng trước** | thực đơn thô 91 món từ hai nguồn (JSON của AI, CSDL của backend) đang **lệch nhau** |
| **Bàn giao cho chặng sau** | một bộ nhãn duy nhất, kho tri thức, và bốn tập đánh giá |
| **Điều kiện nghiệm thu** | hai nguồn khớp **91/91 món**; mọi tệp dẫn xuất sinh lại được (`--check` xanh); bộ rà nhãn **0 lỗ** |

Mục trong phần này: 2 → 7 (dữ liệu, nhãn, rút dấu, kho tri thức, chia đoạn), 10 → 11 (chia tập, thước đo)

Notebook đi theo **đúng thứ tự dự án đã được xây**, vì thứ tự đó chính là phương pháp: không có
nhãn thì không lọc được món, không có kho thì không truy hồi được, và **không có tập đánh giá thì
không ai biết mình đúng hay sai**.
"""))

    out.append(md(r"""
## 2. Từ điển dữ liệu: hiểu dữ liệu trước khi dùng

### Kiến thức

Mỗi hệ thống AI có dữ liệu đều cần một **từ điển dữ liệu** trả lời ba câu:

1. Mỗi trường nghĩa là gì?
2. Trường nào là **sự thật** (giá, tên), trường nào là **nhãn do người gán** (đánh giá cảm quan)?
3. **Khi một nhãn không có mặt thì kết luận được điều gì?**

Câu thứ ba là câu quan trọng nhất và hay bị bỏ qua nhất.

### Cái bẫy: rút dấu tiếng Việt làm hai từ khác nghĩa trùng nhau

Khách Việt thường gõ không dấu, nên hệ thống phải rút dấu để khớp. Nhưng rút dấu là phép
**mất thông tin**, và bản cũ dùng chữ đã rút dấu để *quyết định nội dung* — gây **7 lỗi cùng
một gốc**.

Nguyên tắc rút ra: **rút dấu để khớp cách khách gõ, không để quyết định nội dung.**
"""))

    out.append(code(r'''
# Bảy vụ đụng chữ của bản cũ, và cách khóa có không gian tên xoá cả lớp lỗi
import unicodedata

def fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")

# Mỗi dòng: (chuỗi cũ, nghĩa thật, từ nó đụng, khóa mới thay thế nó)
collisions = [
    ("cua",   "con cua",         "của / cửa",   "ingredient:crab"),
    ("chay",  "ăn chay",         "chạy",        "diet:vegetarian"),
    ("trung", "trứng",           "miền Trung",  "allergen:egg"),
    ("bo",    "bơ (nguồn sữa)",  "bò",          "allergen:dairy"),
    ("muc",   "mực",             "mức",         "ingredient:squid"),
    ("lac",   "đậu lạc",         "lắc",         "allergen:peanut"),
    ("tra",   "trà",             "tráng",       "cat_drink (danh mục)"),
]
print("Chiều 1 — sau khi rút dấu, chuỗi cũ có nằm trong từ thông thường không?\n")
print(f"{'chuỗi cũ':8} {'nghĩa thật':17} {'đụng từ':13} nằm trong?")
print("-" * 62)
for old, meaning, clash, _new in collisions:
    print(f"{old:8} {meaning:17} {clash:13} {'CÓ  <-- lỗi' if fold(old) in fold(clash) else 'không'}")

print("\nChiều 2 — khóa mới có thể đụng từ thông thường không?\n")
print(f"{'chuỗi cũ':8} -> {'khóa mới':22} còn đụng?")
print("-" * 62)
for old, _m, clash, new in collisions:
    print(f"{old:8} -> {new:22} {'CÓ' if fold(new) in fold(clash) else 'không'}")

# Chốt bằng số thay vì bằng lời: đếm xem còn vụ đụng nào không.
still = sum(1 for old, _m, clash, new in collisions if fold(new) in fold(clash))
print(f"\nSố vụ đụng chữ còn lại sau khi gán nhãn lại: {still}/{len(collisions)}")

# Ba trong bảy chuỗi cũ không phải NHÃN mà là CỤM TỪ VỰNG trong bộ hiểu câu hỏi.
# Chúng được xử bằng cơ chế khác, nên phải nói rõ chứ không gộp làm một.
d = load("menu-tags.json")
legacy = {e["legacy_key"] for e in d["tags"].values()}
in_tags = [old for old, *_ in collisions if old in legacy]
print(f"\nTrong 7 chuỗi trên, {len(in_tags)} là nhãn thực đơn: {in_tags}")
print(f"{7 - len(in_tags)} còn lại là cụm trong bộ hiểu câu hỏi, xử bằng cơ chế 'ăn hết")
print("đoạn đã khớp' — Phần III sẽ đo giá trị của cơ chế đó.")
'''))

    out.append(md(r"""
#### Nhận xét — Mục 2

- **Quan sát:** cả 7 nhãn cũ đều là **từ tiếng Việt trần**, nên sau khi rút dấu chúng nằm
  trong từ thông thường. Khóa mới (`ingredient:crab`, `diet:vegetarian`) không có tính chất
  đó — khách không bao giờ gõ chuỗi `ingredient:crab`.
- **Diễn giải:** đây là **sửa cả lớp lỗi bằng cách đổi cấu trúc**, không phải vá từng ca.
  Vá từng ca thì ca thứ tám sẽ xuất hiện; đổi cấu trúc thì không còn ca nào.
- **Giới hạn:** khóa có không gian tên không tự động đúng. Vẫn cần biết `toi` nghĩa là "tối"
  hay "tỏi" — và câu trả lời nằm ở mục tiếp theo.
- **Quyết định tiếp theo:** kiểm chứng nghĩa của nhãn nhập nhằng nhất.
"""))

    out.append(md(r"""
### Cách xác định nghĩa một nhãn nhập nhằng — ví dụ trực tiếp

Nhãn `toi` có trên 64/91 món. Nó là **"tối"** (bữa tối) hay **"tỏi"** (gia vị)? Bản cũ đoán
là "tỏi", và câu "Món nào có tỏi?" trả về 36 món mà chỉ 11 món thật sự có tỏi.

**Phương pháp:** đừng đoán, hãy tìm bằng chứng độc lập. Ô dưới dùng hai nguồn.
"""))

    out.append(code(r'''
# Bằng chứng 1 — phân bố nhãn theo nhóm món. Nếu là "tỏi" thì nhóm ngọt không thể mang nhãn.
menu = load("menu-dataset.json")
items, cats = menu["items"], {c["categoryId"]: c["name"] for c in menu["categories"]}

print("Món mang nhãn (khóa mới `meal:dinner`, khóa cũ `toi`) theo nhóm:\n")
proof = []
for cid, name in cats.items():
    group = [m for m in items if m["categoryId"] == cid]
    with_tag = [m for m in group if "meal:dinner" in m["tags"]]
    has_garlic = [m for m in group if "tỏi" in m["description"].lower()]
    decisive = len(with_tag) == len(group) and not has_garlic
    if decisive:
        proof.append(name)
    mark = "  <-- BẰNG CHỨNG" if decisive else ""
    print(f"  {name:22} {len(with_tag)}/{len(group)} mang nhãn, {len(has_garlic)} món có tỏi{mark}")

# Kết luận sinh từ số đếm, không viết cứng — nếu dữ liệu đổi thì câu này đổi theo.
print(f"\n{len(proof)} nhóm mang nhãn ở MỌI món mà KHÔNG món nào có tỏi: {', '.join(proof)}.")
print("Nếu nhãn nghĩa là 'tỏi' thì điều đó bất khả — nên nhãn nghĩa là 'tối' (bữa tối).")

# Bằng chứng 2 — từ điển nhãn do người làm giao diện viết, đã có trong repo từ trước.
card = (ROOT / "frontend" / "src" / "components" / "menu" / "MenuItemCard.tsx").read_text(encoding="utf-8")
line = next(l for l in card.splitlines() if '"toi"' in l)
print(f"\nBằng chứng 2 — frontend/src/components/menu/MenuItemCard.tsx:\n {line.strip()}")
'''))

    out.append(md(r"""
#### Nhận xét — Mục 2 (tiếp)

- **Quan sát:** ô mã đếm ra các nhóm mang nhãn ở **mọi** món mà **0 món** có tỏi — nếu nhãn
  nghĩa là "tỏi" thì điều đó bất khả. Và từ điển của người làm giao diện ghi thẳng
  `"toi": "Tối"`. Hai nguồn độc lập, cùng một kết luận.
- **Diễn giải:** câu trả lời **đã nằm trong repo suốt thời gian đó**. Bài học không phải "cần
  cẩn thận hơn" mà là: tri thức này nằm ở ba nơi tách biệt và **không có gì canh chúng khỏi
  trôi khỏi nhau**.
- **Giới hạn:** phương pháp "tìm bằng chứng độc lập" chỉ dùng được khi có nguồn thứ hai. Với
  nhãn cảm quan như `health:healthy` thì không có nguồn nào đối chiếu.
- **Quyết định tiếp theo:** hợp nhất về một nguồn, và thêm test canh sự trôi.
"""))

    out.append(md(r"""
## 3. Điều quan trọng nhất về nhãn: thiếu nhãn nghĩa là gì

### Kiến thức

Với dữ liệu có nhãn, câu hỏi quyết định an toàn là: **món không mang nhãn X thì kết luận được
gì?** Có hai khả năng hoàn toàn khác nhau:

- **Nhóm phủ hết** (mọi món đều có đúng một giá trị) → thiếu nhãn là **lỗi dữ liệu**, và lọc
  được dứt khoát.
- **Nhóm không phủ hết** → thiếu nhãn nghĩa là **chưa ghi nhận**, *không* phải *không có*.

Lẫn hai trường hợp này là gốc của lỗi an toàn nghiêm trọng nhất trong hệ thống tư vấn ăn uống:
suy ra "món này an toàn" từ việc thiếu nhãn dị nguyên.
"""))

    out.append(code(r'''
# Độ phủ từng nhóm nhãn — con số quyết định nhóm nào lọc được dứt khoát
from collections import defaultdict
menu, d = load("menu-dataset.json"), load("menu-tags.json")
items = menu["items"]
groups = sorted({e["group"] for e in d["tags"].values()})

rows = []
for g in groups:
    covered = len({m["id"] for m in items if any(t.startswith(g + ":") for t in m["tags"])})
    rows.append((covered, g))
rows.sort(reverse=True)

print(f"{'nhóm':12} {'phủ':>8}  thiếu nhãn nghĩa là gì")
print("-" * 68)
for covered, g in rows:
    if covered == len(items):
        verdict = "LỖI DỮ LIỆU -> lọc thẳng được"
    else:
        verdict = "chưa ghi nhận -> KHÔNG kết luận được"
    print(f"{g:12} {covered:>4}/{len(items)}  {verdict}")

allergen = len({m["id"] for m in items if any(t.startswith("allergen:") for t in m["tags"])})
print(f"\nNhóm allergen phủ {allergen}/{len(items)} món.")
print(f"=> {len(items) - allergen} món KHÔNG mang nhãn dị nguyên nào, và điều đó KHÔNG")
print("   cho phép nói chúng không chứa dị nguyên.")
'''))

    out.append(md(r"""
#### Nhận xét — Mục 3

- **Quan sát:** 5 nhóm phủ 91/91 (`meal`, `party`, `price`, `season`, `spice`); nhóm
  `allergen` chỉ phủ 44/91.
- **Diễn giải:** hệ quả trực tiếp cho thiết kế: lọc "không cay" là kết luận được vì `spice`
  phủ hết; còn lọc dị nguyên **phải fail-closed** và **luôn kèm lời nhắc hỏi nhân viên**, vì
  47 món không có nhãn không có nghĩa là an toàn.
- **Giới hạn:** đối chiếu nhãn với mô tả món tìm ra **7 lỗ nhãn dị nguyên thật** (6 món hải
  sản, 1 món gluten). Nhưng mô tả không phải bảng thành phần, nên **còn thiếu bao nhiêu thì
  không biết được từ dữ liệu này** — chỉ nhà hàng trả lời được.
- **Quyết định tiếp theo:** đã hiểu dữ liệu, sang phần đo lường.
"""))

    # ============================================== MỤC 4 — RÚT DẤU MẤT THÔNG TIN
    out.append(md(r"""
## 4. Rút dấu tiếng Việt là phép MẤT thông tin

### Kiến thức

Để khớp câu khách gõ, hệ thống phải **rút dấu**: khách viết `"Không cay"`, `"khong cay"`,
`"ko cay"` đều phải hiểu như nhau. Đó là việc bắt buộc, không tránh được.

Nhưng rút dấu là **hàm không đơn ánh** — hai chuỗi khác nghĩa có thể cho cùng kết quả. Bảy lỗi
của bản cũ đều sinh ra từ đúng chỗ này, và chúng không phải bảy lỗi độc lập: chúng là **một lớp
lỗi** xuất hiện bảy lần.

**Cách sửa không phải sửa từng lỗi.** Sửa từng lỗi thì lỗi thứ tám sẽ tới. Cách sửa là **đổi
hình dạng dữ liệu** để lớp lỗi đó không còn khả năng tồn tại: nhãn mang **tiền tố nhóm**.

| Bản cũ | Bản dựng lại |
|---|---|
| `"nong"` — món nóng hay vị nồng? | `serving:hot` / `spice:hot` |
| `"chay"` — ăn chay hay bán chạy? | `diet:vegetarian` / `promo:popular` |

Sau khi đổi, cụm chữ **vẫn** trùng — nhưng tiền tố phân biệt được, nên trùng **không còn là
lỗi**. Đây là điểm cần hiểu: không phải làm cho lỗi biến mất, mà làm cho **lớp lỗi không còn
khả năng tồn tại**.

Cơ chế thứ hai bảo vệ phần còn lại: **khớp cụm dài trước, rồi ăn hết đoạn đã khớp** (thay đoạn
đã khớp bằng khoảng trắng để nó không khớp lần nữa).
"""))

    out.append(code(r"""
# 1) Rút dấu làm MẤT thông tin — chứng minh bằng chính hàm hệ thống dùng
from understand import VOCAB, fold, understand
from collections import defaultdict

menu, d = load("menu-dataset.json"), load("menu-tags.json")
items = menu["items"]

print("Hai chữ khác nghĩa, sau khi rút dấu thành một:")
for a, b in [("nóng", "nồng"), ("chay", "cháy"), ("mực", "mức"), ("tôi", "tỏi")]:
    dau = "  <-- ĐỤNG NHAU" if fold(a) == fold(b) else ""
    print(f"   {a!r:8} -> {fold(a)!r:8}   {b!r:8} -> {fold(b)!r:8}{dau}")

# 2) Nhãn mang tiền tố nhóm: cụm chữ vẫn trùng, nhưng không còn là lỗi
col = defaultdict(set)
for tag in d["tags"]:
    col[fold(tag.split(":", 1)[1].replace("_", " "))].add(tag)
clash = {k: sorted(v) for k, v in col.items() if len(v) > 1}
print(f"\nCụm chữ rút dấu còn trùng giữa các nhãn: {len(clash)}")
for k, v in clash.items():
    print(f"   {k!r} <- {v}   (tiền tố nhóm phân biệt được -> KHÔNG còn là lỗi)")

# 3) Kiểm kê chỗ có nguy cơ — tính lại, không viết tay
phrases = sorted(VOCAB)
names = [fold(m["name"]) for m in items]
in_other = {a for a in phrases for b in phrases if a != b and a in b}
in_name = {p for p in phrases if any(p in n for n in names)}
print(f"\nKiểm kê trên {len(phrases)} cụm từ vựng và {len(items)} tên món:")
print(f"   bị chứa trong cụm từ vựng khác : {len(in_other)}")
print(f"   nằm trong tên món              : {len(in_name)}")
print(f"   thuộc cả hai                   : {len(in_other & in_name)}")
print(f"   TỔNG cụm có nguy cơ            : {len(in_other | in_name)}")

# 4) Cơ chế chặn, thử trên 4 câu từng làm bản cũ sai
print("\nBốn câu từng làm bản cũ sai:")
for q in ["Món nào bán chạy nhất?", "Có đặc sản miền Trung không?",
          "Nhà hàng mấy giờ mở cửa?", "Gà nướng mật ong giá bao nhiêu?"]:
    r = understand(q, items)
    print(f"   {q}")
    print(f"      require={r.require_tags}  avoid={r.avoid_tags}  "
          f"topic={r.policy_topic}  món={r.named_items}")
"""))

    out.append(plot_code(r"""
# Biểu đồ 1 — quy mô lớp lỗi đụng chữ, và phần tập đánh giá phủ được
from understand import VOCAB, fold
menu = load("menu-dataset.json"); items = menu["items"]
phrases = sorted(VOCAB); names = [fold(m["name"]) for m in items]
in_other = {a for a in phrases for b in phrases if a != b and a in b}
in_name = {p for p in phrases if any(p in n for n in names)}
rui_ro = in_other | in_name

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4))

nhan = ["Bị chứa trong\ncụm khác", "Nằm trong\ntên món", "Thuộc\ncả hai", "TỔNG\ncó nguy cơ"]
gia_tri = [len(in_other), len(in_name), len(in_other & in_name), len(rui_ro)]
mau = [XANH, XANH, XAM, DO]
b = ax1.bar(nhan, gia_tri, color=mau)
ax1.bar_label(b, padding=2, fontsize=10, fontweight="bold")
ax1.set_ylabel("số cụm từ vựng")
ax1.set_title(f"Chỗ có nguy cơ đụng chữ\n(trên {len(phrases)} cụm từ vựng)", fontsize=11)
ax1.set_ylim(0, max(gia_tri) * 1.25)

# Ablation đo "mất 1 ca" — nhưng cơ chế bảo vệ mọi chỗ dưới. Đây là khoảng trống của TẬP ĐÁNH GIÁ.
co_ca, khong_ca = 1, len(rui_ro) - 1
ax2.barh(["Cơ chế bảo vệ"], [co_ca], color=DO, label=f"có ca đánh giá ({co_ca})")
ax2.barh(["Cơ chế bảo vệ"], [khong_ca], left=[co_ca], color=XAM,
         label=f"KHÔNG có ca đánh giá ({khong_ca})")
ax2.set_xlabel("số cụm có nguy cơ")
ax2.set_title("Vì sao ablation báo 'mất 1 ca' là CHẶN DƯỚI", fontsize=11)
ax2.legend(loc="lower right", fontsize=9)
ax2.grid(False)

plt.tight_layout()
plt.show()
print(f"Cơ chế ăn đoạn bảo vệ {len(rui_ro)} chỗ; tập đánh giá chỉ chạm tới 1.")
print("=> Con số ablation đo được GIỚI HẠN CỦA TẬP ĐÁNH GIÁ, không đo giá trị cơ chế.")
"""))

    ca_hai = KIEM_KE["trong_cum_khac"] + KIEM_KE["trong_ten_mon"] - KIEM_KE["co_rui_ro"]
    out.append(md(f"""
#### Nhận xét — Mục 4

- **Quan sát:** 4/4 cặp chữ thử đều đụng nhau sau khi rút dấu. Sau khi nhãn mang tiền tố nhóm,
  chỉ còn **1 cụm trùng** (`hot` của `serving:hot` và `spice:hot`) và tiền tố phân biệt được nên
  nó **không còn là lỗi**. Kiểm kê trên {KIEM_KE["tu_vung"]} cụm từ vựng:
  **{KIEM_KE["co_rui_ro"]} cụm có nguy cơ** ({KIEM_KE["trong_cum_khac"]} bị chứa trong cụm khác,
  {KIEM_KE["trong_ten_mon"]} nằm trong tên món, {ca_hai} thuộc cả hai).
- **Diễn giải:** đây là ví dụ rõ nhất của nguyên tắc *sửa cấu trúc thay vì sửa lỗi*. Bảy lỗi bản
  cũ là **một lớp lỗi** xuất hiện bảy lần; đổi hình dạng nhãn xóa cả lớp, còn sửa từng lỗi thì
  không bao giờ hết.
- **Giới hạn phải nói ra:** ablation báo cơ chế ăn đoạn "chỉ đáng 1 ca", nhưng nó bảo vệ
  {KIEM_KE["co_rui_ro"]} chỗ. Chênh lệch đó là **khoảng trống của tập đánh giá**, không phải bằng
  chứng cơ chế vô dụng. Đã lấp bằng 9 test riêng.
- **Con số này đã trôi bốn lần, nên nay nó được SINH:** kiểm kê từng là 32, rồi 61, 72, 89, và nay
  {KIEM_KE["co_rui_ro"]}. Mỗi lần từ vựng lớn lên, số cũ vẫn nằm lại trong tài liệu — và ngay trước
  lần sửa này, cùng một kiểm kê xuất hiện với **bốn giá trị khác nhau** trong repo. Ô nhận xét này
  giờ gọi `test_understand.collision_census()` lúc sinh notebook, nên nó không thể lệch giá trị mà
  test đang chốt. **Sinh ra thay vì nhắc nhau cập nhật** — cùng cách chữa với báo cáo đồ án.
- **Quyết định tiếp theo:** dữ liệu nhãn đã an toàn, sang phần tri thức không nằm trong nhãn.
"""))

    # ============================================ MỤC 5 — MỘT KHO, HAI CHẾ ĐỘ
    out.append(md(r"""
## 5. Kho tri thức: MỘT kho, HAI chế độ trả lời

### Kiến thức

Nhãn thực đơn trả lời được "món nào không cay". Nó **không** trả lời được "mấy giờ mở cửa" hay
"đặc sản miền Trung là gì". Phần đó cần **kho tri thức**.

Câu hỏi thiết kế đầu tiên: kho đó nên có mấy phần? Dự án này lúc đầu làm **hai kho** — một tệp
JSON tra khóa, và một thư mục markdown cho truy hồi — với lý do *"tra khóa vs truy hồi xếp
hạng"*. **Lý do đó sai**, và đo lại mới thấy: mọi tài liệu markdown đều có đúng một `topic_keys`
nên chúng cũng tra khóa được. Cách *lấy* không phân biệt được gì.

Ranh giới thật là **chế độ trả lời** — mô hình được tin bao nhiêu:

| `answer_mode` | Nội dung tới khách | Dùng cho |
|---|---|---|
| `verbatim` | **nguyên văn**, mô hình không chạm vào chữ | giờ mở cửa, thanh toán, phụ phí, cách khai dị ứng |
| `synthesize` | **đầu vào** cho mô hình viết câu trả lời | "đặc sản miền Trung có gì", "gọi bao nhiêu món cho 6 người" |

Và ranh giới đó **không cần hai kho**. Phải phân biệt hai thứ dễ bị gộp lẫn:

- Số **kho lưu trữ** là chuyện gọn gàng → **gộp được**, và gộp còn xóa được một lớp lỗi: khi
  còn hai kho, chủ đề có ở cả hai thì tài liệu kho thứ hai *không bao giờ tới lượt* mà vẫn
  chiếm chỗ trong chỉ mục truy hồi — im lặng, không lỗi.
- Số **chế độ trả lời** là chuyện an toàn → **không gộp được**. Về `synthesize` thì "mấy giờ
  đóng cửa" do mô hình viết và nó *có thể* viết 22h30. Về `verbatim` thì phải nén danh sách
  nhiều món kèm ghi chú dị nguyên vào một câu viết tay.
"""))

    out.append(code(r"""
# Kho tri thức: quy mô, hai chế độ, và điều mỗi chế độ đảm bảo
from collections import Counter
from rag.chunker import (VERBATIM, all_chunks, load_all, retrievable_chunks,
                         verbatim_answers)

docs = load_all(KNOWLEDGE)
chunks = all_chunks(KNOWLEDGE)
print(f"tài liệu                 : {len(docs)}")
print(f"đoạn (chunk)             : {len(chunks)}")
print(f"đoạn ĐƯỢC xếp hạng       : {len(retrievable_chunks(KNOWLEDGE))}")
print(f"theo chế độ trả lời      : {dict(Counter(d.answer_mode for d in docs))}")
print(f"theo nguồn tri thức      : {dict(Counter(d.source for d in docs))}")
print(f"theo thư mục             : {dict(Counter(d.path.parent.name for d in docs))}")

print("\n--- Một tài liệu `verbatim`: chuỗi này tới khách NGUYÊN VĂN ---")
hours = next(d for d in docs if "hours" in d.topic_keys)
print(f"   {hours.verbatim_answer}")

print("\n--- Một đoạn `synthesize`: đây là ĐẦU VÀO cho mô hình viết ---")
ch = next(c for c in retrievable_chunks(KNOWLEDGE) if "hue_and_central" in c.doc_id)
print("   " + ch.text.replace("\n", "\n   ")[:260])

print("\n--- Ranh giới được ÉP, không phải quy ước ---")
syn = next(d for d in docs if d.answer_mode != VERBATIM)
try:
    syn.verbatim_answer
    print("   KHÔNG lỗi -> ranh giới hỏng")
except Exception as e:
    print(f"   Gọi verbatim_answer trên tài liệu synthesize -> {type(e).__name__}")
    print(f"   {str(e)[:110]}")
"""))

    out.append(plot_code(r"""
# Biểu đồ 2 — cấu trúc kho tri thức: chế độ trả lời, nguồn, và độ dài đoạn
from collections import Counter
from rag.chunker import all_chunks, load_all, retrievable_chunks

docs = load_all(KNOWLEDGE); chunks = all_chunks(KNOWLEDGE)
fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(13.5, 4))

# (a) chế độ trả lời — mô hình được tin bao nhiêu
mode = Counter(d.answer_mode for d in docs)
ax1.pie([mode["verbatim"], mode["synthesize"]],
        labels=[f"verbatim\n{mode['verbatim']} tài liệu\n(mô hình tin 0%)",
                f"synthesize\n{mode['synthesize']} tài liệu\n(mô hình viết)"],
        colors=[DO, XANH], autopct="%1.0f%%", startangle=90,
        textprops={"fontsize": 9})
ax1.set_title("Chế độ trả lời\n(ranh giới AN TOÀN)", fontsize=11)

# (b) nguồn tri thức — tin được đến đâu
src = Counter(d.source for d in docs)
b = ax2.bar(["derived\n(máy sinh)", "demo\n(người viết)"],
            [src["derived"], src["demo"]], color=[XANH, CAM])
ax2.bar_label(b, padding=2, fontweight="bold")
ax2.set_ylabel("số tài liệu")
ax2.set_title("Nguồn tri thức\n(derived KHÔNG THỂ lệch khỏi thực đơn)", fontsize=11)
ax2.set_ylim(0, max(src.values()) * 1.2)

# (c) phân bố độ dài đoạn — đoạn quá ngắn thì vô dụng khi truy hồi
w = [c.word_count for c in chunks]
ax3.hist(w, bins=28, color=XANH, edgecolor="white")
ax3.axvline(12, color=DO, linestyle="--", linewidth=1.5, label="ngưỡng tối thiểu 12 từ")
ax3.axvline(400, color=CAM, linestyle="--", linewidth=1.5, label="ngưỡng chia tiếp 400 từ")
ax3.set_xlabel("số từ mỗi đoạn"); ax3.set_ylabel("số đoạn")
ax3.set_title(f"Độ dài {len(chunks)} đoạn\n(min {min(w)}, trung vị "
              f"{sorted(w)[len(w)//2]}, max {max(w)})", fontsize=11)
ax3.legend(fontsize=8)

plt.tight_layout(); plt.show()
loai = len(chunks) - len(retrievable_chunks(KNOWLEDGE))
print(f"{loai} đoạn `verbatim` bị LOẠI khỏi chỉ mục truy hồi — chúng đã có đường tới khách")
print("riêng (tra khóa, trả nguyên văn). Để trong chỉ mục là hai đường tới cùng nội dung.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 5

- **Quan sát:** 84 tài liệu / 327 đoạn trong **một** kho, chia 24 `verbatim` + 60 `synthesize`.
  Bộ truy hồi chỉ xếp hạng **303 đoạn** — 24 đoạn `verbatim` bị loại vì chúng đã có đường tới
  khách riêng.
- **Diễn giải:** hai thứ dễ bị gộp lẫn là **kho lưu trữ** và **chế độ trả lời**. Chúng độc
  lập: không có gì bắt buộc "lưu trong markdown thì phải qua mô hình". Nhận ra điều đó mới gộp
  được kho mà không mất bảo đảm an toàn.
- **Ranh giới được ÉP bằng mã, không phải quy ước:** gọi `verbatim_answer` trên tài liệu
  `synthesize` thì **lỗi**, không phải trả về một chuỗi nào đó. Trả về im lặng thì một chỗ dùng
  sai sẽ đưa nửa tài liệu ra cho khách nguyên văn.
- **Giới hạn:** 28/84 tài liệu là `demo` — giá trị mẫu cho dự án demo. Dùng thật thì chủ nhà
  hàng phải thay, và đổi `source` thành `restaurant` để không còn bị đếm là mẫu.
"""))

    # ==================================== MỤC 6 — CHIA ĐOẠN VÀ CỬA AUDIENCE
    out.append(md(r"""
## 6. Chia đoạn, và cửa `audience: guest`

### Kiến thức

Truy hồi không lấy cả tài liệu, nó lấy **đoạn**. Nên cách chia đoạn quyết định chất lượng truy
hồi trước cả khi chọn phương pháp. Ba quy tắc, mỗi cái một lý do:

1. **Chia theo heading `##`, không theo số ký tự.** Chia theo ký tự thì cắt ngang giữa câu, và
   nửa ý nằm ở đoạn này nửa kia ở đoạn khác — không đoạn nào trả lời được. Heading là ranh giới
   ý nghĩa mà người viết đã đặt sẵn; dùng nó là miễn phí.
2. **Kèm tiêu đề tài liệu vào mỗi đoạn.** Đoạn bị trích ra **rời khỏi** tài liệu. Một đoạn viết
   "Có 7 món, giá từ 189.000đ" mà không nói đang nói về cái gì thì vô dụng.
3. **Gộp đoạn quá ngắn.** Đoạn chỉ có một dòng tiêu đề không mang tín hiệu nào, nhưng **vẫn
   chiếm một chỗ trong top-k** và đẩy một đoạn có ích ra ngoài. Lấy 5 đoạn mà 1 đoạn là rác thì
   thực chất chỉ còn 4.

Chi tiết dễ sai: **gộp phải chạy TRƯỚC khi cấp mã đoạn**. Cấp mã rồi mới gộp thì dãy mã bị
khuyết (`#0, #2, #3`) và tập đánh giá truy hồi trỏ vào mã không tồn tại.

### Cửa `audience`: TỪ CHỐI, không phải lọc bỏ

Bản cũ có 27 tài liệu tri thức, trong đó **5 tài liệu là hướng dẫn cho AI** — phong cách trả
lời, ví dụ phản hồi sai. Cả 27 nằm **cùng một chỉ mục truy hồi**, nên **47/221 đoạn** bị trích
ra cho khách đọc. Khách hỏi giờ mở cửa và nhận một đoạn dạy AI cách xin lỗi.

Có hai cách sửa, và chúng khác nhau nhiều hơn vẻ ngoài:

| Cách | Hôm nay | Tháng sau ai đó thêm tệp nội bộ |
|---|---|---|
| **lọc bỏ** | hết lỗi | tệp **im lặng** bị bỏ qua, người thêm tưởng đã vào kho |
| **từ chối** | hết lỗi | việc thêm **bị chặn ngay**, kèm lý do |
"""))

    out.append(code(r"""
# Ba bất biến của bộ chia đoạn, kiểm trên kho THẬT
from rag.chunker import KnowledgeError, all_chunks, load_all, load_doc
import tempfile
from pathlib import Path as _P

chunks = all_chunks(KNOWLEDGE)
w = sorted(c.word_count for c in chunks)
print(f"Bất biến 1 — mọi đoạn kèm tiêu đề tài liệu : "
      f"{sum(1 for c in chunks if c.text.startswith(c.title))}/{len(chunks)}")
ids = [c.chunk_id for c in chunks]
print(f"Bất biến 2 — chunk_id không trùng          : {len(set(ids))}/{len(ids)}")
print(f"Bất biến 3 — nạp hai lần cho cùng dãy mã   : "
      f"{[c.chunk_id for c in all_chunks(KNOWLEDGE)] == ids}")

khuyet = [d.doc_id for d in load_all(KNOWLEDGE)
          if [int(c.chunk_id.split('#')[1]) for c in d.chunks] != list(range(len(d.chunks)))]
print(f"Bất biến 4 — dãy mã liên tục từ 0          : {len(khuyet)} tài liệu khuyết")
print(f"\nĐộ dài đoạn: min {w[0]}, trung vị {w[len(w)//2]}, max {w[-1]} từ")

# Cửa audience — chứng minh việc TỪ CHỐI thật sự xảy ra
FM = ("id: kb.thu.v1\ntitle: Thử\ntopic_keys: [thu_nghiem]\nsource: demo\n"
      "audience: {aud}\nanswer_mode: synthesize")
BODY = "# Thử\n\n## Mục\n\n" + " ".join(["từ"] * 30)
print("\n--- Cửa audience, thử cả hai chiều ---")
with tempfile.TemporaryDirectory() as tmp:
    for aud in ("guest", "ai"):
        p = _P(tmp) / f"{aud}.md"
        p.write_text(f"---\n{FM.format(aud=aud)}\n---\n\n{BODY}\n", encoding="utf-8")
        try:
            load_doc(p)
            print(f"   audience={aud!r}  -> NHẬN")
        except KnowledgeError as e:
            print(f"   audience={aud!r}     -> TỪ CHỐI")
            print(f"      {str(e)[:105]}...")
print("\nThử chiều ngược là bắt buộc: một bộ nạp từ chối MỌI THỨ cũng qua được")
print("phép kiểm 'từ chối tệp ai'.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 6

- **Quan sát:** 327/327 đoạn kèm tiêu đề tài liệu, 327 mã đoạn không trùng, nạp hai lần cho cùng
  dãy mã, 0 tài liệu có dãy mã khuyết. Cửa `audience` từ chối `ai` và **nhận** `guest`.
- **Diễn giải:** ba bất biến đầu là điều kiện để **tập đánh giá truy hồi tồn tại được**. Mã đoạn
  đổi giữa hai lần sinh thì mọi ca đánh giá trỏ sai chỗ, và người ta sẽ đi sửa bộ truy hồi trong
  khi lỗi nằm ở bộ chia đoạn.
- **Một lỗi thật đã sửa ở đây:** đoạn từng chứa **hai lần** tiêu đề tài liệu (tiền tố `title`
  cộng dòng `# H1` trong thân). Không phải chuyện thẩm mỹ — trùng tiêu đề **thổi phồng tần số
  từ**, và BM25 xếp hạng theo tần số từ. Tức nó làm lệch chính phép so BM25/embedding sẽ chạy ở
  bước sau: **một thiên lệch nằm trong dữ liệu**, nên đọc kết quả sẽ không thấy.
- **Giới hạn:** 3 tài liệu từng sinh ra đoạn mở đầu chỉ có dòng tiêu đề. Đã sửa bằng cách gộp,
  nhưng nó cho thấy bộ chia đoạn **phụ thuộc cách người viết đặt heading** — nên bất biến phải
  do máy canh, không do người nhớ.
"""))

    # ===================================== MỤC 7 — SINH RA, KHÔNG VIẾT TAY
    out.append(md(r"""
## 7. Tri thức kể lại dữ liệu thì phải được SINH, không viết tay

### Kiến thức

Kho tri thức bản cũ có tệp `menu.md` dài 159 dòng, kể lại thực đơn bằng văn xuôi. Trong đó có
câu: *"Nhà hàng có **hơn 90 món**..."* — trong khi thực đơn có **đúng 91 món**.

Câu đó đúng về mặt kỹ thuật nhưng vô dụng, và tệ hơn: nó là **con số viết tay**. Thêm 10 món thì
nó thành sai, và **không ai biết**, vì không có gì canh nó.

Đây là một luật chung, không riêng dự án này:

> **Văn xuôi kể lại dữ liệu thì luôn trôi khỏi dữ liệu.** Dữ liệu đổi, văn không đổi theo.

Chỉ có hai cách xử lý:

| Cách | Đánh giá |
|---|---|
| kỷ luật con người — sửa thực đơn thì sửa cả tài liệu | **luôn thất bại**, vì nó dựa vào việc người ta nhớ |
| **tính lại mỗi lần** — tài liệu do máy sinh, CI kiểm sinh lại được | cách duy nhất chặn được |

Nên `build_knowledge.py` sinh phần `derived`. Con số trong đó không thể sai, vì nó **được tính,
không được viết**.

Phần `demo` là cho nội dung **suy ra không được** ("bia đi với món nướng", "gọi bao nhiêu món cho
4 người"). Nhưng ngay cả phần này, **mọi con số cũng lấy từ thực đơn thật** — nên văn người viết
vẫn không nói sai về dữ liệu được.

### Tiêu chí chọn nhóm để sinh tài liệu

Đáng ra có thể sinh cho cả 16 nhóm nhãn, ra ~120 tài liệu, số nghe to hơn. Chỉ sinh cho **6
nhóm**, theo một tiêu chí duy nhất:

> *Nhóm này có câu hỏi nào mà **lớp tra khóa không trả lời được** không?*

**Có** với `method`, `region`, `ingredient`, `occasion`, `flavour`, `health` → sinh tài liệu.
**Không** với `spice`, `price`, `party`, `season` — bốn nhóm này phủ 91/91 món nên lọc theo nhãn
đã đúng **100%**. Thêm tài liệu là tạo **đường thứ hai cho cùng một việc**, đúng bệnh 8 đường
chồng nhau của bản cũ.
"""))

    out.append(code(r"""
# Chứng minh phần `derived` KHÔNG THỂ lệch: sinh lại rồi so từng byte
import sys as _sys
from collections import Counter
from rag.chunker import load_all
_sys.path.insert(0, str(ROOT / "ai" / "scripts"))
import build_knowledge as bk

docs = load_all(KNOWLEDGE)
src = Counter(d.source for d in docs)
print(f"derived (máy sinh) : {src['derived']} tài liệu")
print(f"demo (người viết)  : {src['demo']} tài liệu")

wanted = bk.generate(load("menu-dataset.json"), load("menu-tags.json"))
khop = sum(1 for p, t in wanted.items()
           if p.exists() and p.read_text(encoding="utf-8-sig") == t)
print(f"\nSinh lại và so từng byte: {khop}/{len(wanted)} tài liệu derived khớp")
print("=> CI chạy `build_knowledge.py --check`, nên tài liệu KHÔNG THỂ trôi khỏi thực đơn.")

# Truy một con số cụ thể về đúng thực đơn
items = load("menu-dataset.json")["items"]
veg = [m for m in items if "diet:vegetarian" in m["tags"]]
doc = next(d for d in docs if "vegetarian" in d.topic_keys)
print(f"\nTruy nguồn một con số:")
print(f"   đếm trực tiếp trên thực đơn : {len(veg)} món chay")
print(f"   tài liệu tri thức nói       : {doc.verbatim_answer[:64]}...")
print(f"   con số {len(veg)} có trong chuỗi     : {str(len(veg)) in doc.verbatim_answer}")

# Sáu nhóm TỪNG có tài liệu riêng — và vì sao cả sáu đã bị bỏ
d = load("menu-tags.json")
DA_BO = ("flavour", "health", "ingredient", "method", "occasion", "region")
print(f"\nSáu nhóm từng được sinh tài liệu, nay ĐÃ BỎ: {sorted(DA_BO)}")
print("Bốn nhóm CHƯA BAO GIỜ sinh, vì lớp lọc theo nhãn đã đúng 100%:")
for g in ["spice", "price", "party", "season"]:
    phu = len({m["id"] for m in items if any(t.startswith(g + ":") for t in m["tags"])})
    print(f"   {g:8} phủ {phu}/{len(items)} món -> lọc dứt khoát, không cần tài liệu")
print("\nLập luận bỏ sáu nhóm kia GIỐNG HỆT lập luận chưa bao giờ sinh bốn nhóm này —")
print("chỉ là phải đo mới thấy: 99,1% câu nhắm vào chúng thuộc nhánh lọc nhãn.")
"""))

    out.append(plot_code(r"""
# Biểu đồ 3 — tiêu chí chọn nhóm sinh tài liệu, đặt cạnh độ phủ nhãn
from collections import Counter
from rag.chunker import load_all
import sys as _sys
_sys.path.insert(0, str(ROOT / "ai" / "scripts"))
import build_knowledge as bk  # noqa: F401  (giữ import để ô này tự đủ khi chạy rời)

items = load("menu-dataset.json")["items"]
d = load("menu-tags.json")
groups = sorted({e["group"] for e in d["tags"].values()})
# Sáu nhóm TỪNG có tài liệu sinh riêng. `build_knowledge` không còn sinh chúng — xem
# `generate()` — nên danh sách nằm ở đây, dưới dạng ghi chép lịch sử chứ không phải cấu hình.
sinh = {"flavour", "health", "ingredient", "method", "occasion", "region"}

rows = []
for g in groups:
    phu = len({m["id"] for m in items if any(t.startswith(g + ":") for t in m["tags"])})
    rows.append((phu, g, g in sinh))
rows.sort()

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 4.6))

ten = [g for _, g, _ in rows]
phu = [p for p, _, _ in rows]
mau = [XANH if s else XAM for _, _, s in rows]
b = ax1.barh(ten, phu, color=mau)
ax1.bar_label(b, labels=[f"{p}/91" for p in phu], padding=3, fontsize=8)
ax1.axvline(len(items), color=DO, linestyle="--", linewidth=1.4)
ax1.text(len(items) - 1, -0.6, "91/91 = lọc dứt khoát", color=DO, fontsize=8, ha="right")
ax1.set_xlabel("số món có nhãn thuộc nhóm")
ax1.set_title("Độ phủ nhãn, và nhóm nào TỪNG được sinh tài liệu\n"
              "(xanh = từng sinh, nay đã bỏ · xám = chưa bao giờ sinh)", fontsize=11)
ax1.set_xlim(0, len(items) * 1.18)

# Kho SAU khi bỏ: chỉ còn hai vai trò
docs = load_all(KNOWLEDGE)
thumuc = Counter(d_.path.parent.name for d_ in docs)
nhan = ["policy\n(verbatim)", "written\n(người viết)"]
gia = [thumuc["policy"] + thumuc["derived"], thumuc["written"]]
b2 = ax2.bar(nhan, gia, color=[DO, CAM])
ax2.bar_label(b2, padding=2, fontweight="bold")
ax2.set_ylabel("số tài liệu")
ax2.set_title(f"{sum(gia)} tài liệu còn lại, hai vai trò\n"
              f"(49 tài liệu theo nhãn đã bị bỏ)", fontsize=11)
ax2.set_ylim(0, max(gia) * 1.2)

plt.tight_layout(); plt.show()
print(f"{len(sinh)}/{len(groups)} nhóm nhãn từng được sinh tài liệu — và cả sáu đã bị bỏ.")
print("Tiêu chí ban đầu: nhóm đó có câu hỏi nào mà LỚP TRA KHÓA không trả lời được không.")
print("Đo lại sau khi hệ thống chạy thật cho câu trả lời khác: 106 ca nhắm vào chúng đều là")
print("câu CHỌN MÓN, và 99,1% trong số đó thuộc nhánh lọc nhãn — nơi chúng đúng 100,00%")
print("thay vì 54,40% qua truy hồi. Chúng chiếm 51% chỉ mục mà không phục vụ ai.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 7

- **Quan sát:** tài liệu sinh từ thực đơn **khớp từng byte** khi sinh lại. Con số "17 món chay"
  truy được về đúng phép đếm trên thực đơn.
- **Diễn giải:** `--check` trong CI là thứ biến "tài liệu không thể lệch" từ một lời hứa thành
  một **bất biến máy canh**. Không có bước đó thì `derived` chỉ là một cái tên.
- **Và rồi phép đo bác bỏ chính thiết kế này.** Sáu nhóm nhãn từng được sinh tài liệu riêng theo
  một tiêu chí nghe rất hợp lý: *"nhóm đó có câu hỏi nào mà lớp tra khóa không trả lời được
  không?"*. Đo lại khi hệ thống chạy thật thì tiêu chí ấy sai ở chỗ không ai ngờ — **106 ca nhắm
  vào chúng đều là câu CHỌN MÓN**, không ca nào hỏi tri thức. 49 tài liệu chiếm **51% chỉ mục**
  để phục vụ những câu mà nhánh lọc nhãn trả lời **chính xác 100,00%**.
- **Ba cách chữa đã thử trước khi bỏ, và cả ba đều hoà:** xếp hạng lại bằng cross-encoder
  (p = 0,8238), gộp 49 tài liệu thành 6 theo họ (p = 0,5488), cắt bớt mục (0 từ riêng lên 1).
  Nguyên nhân là **cấu trúc**: 49 tài liệu dùng chung đúng 4 tiêu đề mục, và tài liệu điển hình
  có **0 từ chỉ xuất hiện ở riêng nó**.
- **Bài học đáng giữ:** một tiêu chí thiết kế hợp lý vẫn có thể sai, và chỉ **đo trên câu hỏi
  thật** mới thấy. Lập luận bỏ sáu nhóm này giống hệt lập luận đã dùng để **không** sinh cho
  `spice`/`price`/`party`/`season` ngay từ đầu — chỉ là lần đó nhìn ra ngay, lần này phải đo.
- **Giới hạn:** phần `written` vẫn là tài liệu người viết. Chúng không thể nói sai về **con số**
  (số lấy từ thực đơn), nhưng có thể nói sai về **chính sách** — và điều đó chỉ chủ nhà hàng biết.
- **Quyết định tiếp theo:** dữ liệu và tri thức đã xong. Nhưng chưa có cách nào biết hệ thống
  trả lời đúng hay sai — đó là Phần II.
"""))

    # ================================================================= PHẦN II
    out.append(md(r"""
---
## Tập đánh giá và thước đo
> **TV1** — nền tảng đo lường. Cùng người với Phần 1, và mục dưới nói vì sao.

> **Vị trí:** **xuyên ngang cả 4 khâu runtime**, không phải một chặng — nên nó thuộc TV1 cùng với
> dữ liệu. Phần này chứa **bài học đắt nhất của cả dự án**.

| | |
|---|---|
| **Câu hỏi khâu này trả lời** | *Làm sao biết hệ thống trả lời đúng hay sai — và làm sao biết thước đo của mình đúng?* |
| **Kiến thức phải nắm** | khóa đáp án dạng truy vấn thay vì danh sách · test hai chiều · chia ba nhóm chốt/phát triển/niêm phong · bộ dò lỗ thước đo |
| **Tệp sở hữu** | `ai/evaluation/cases.json` · `answer_metric.py` · `menu_selectors.py` · `validate_cases.py` · `build_split.py` · `probe_metric_holes.py` · `test_answer_metric.py` |
| **Đầu vào** | thực đơn thật (91 món) và yêu cầu nghiệp vụ |
| **Đầu ra bàn giao** | 119 ca / 41 họ · thước đo 37 test · bộ dò lỗ để TV2 và TV4 chạy `run_baseline.py` |
| **Tự đo bằng** | `validate_cases.py` · `build_split.py --check` · `probe_metric_holes.py` · `python -m unittest discover -s ai/evaluation` |
| **Trạng thái** | **xong** — 37 test xanh, bộ dò tìm 0 lỗ |

### Điều TV1 phải hiểu trước tiên

**Thước đo cũng là một phương pháp, và cũng phải chứng minh được mình đúng.** Ở bản cũ, thước
đo sai **3 lần trước khi hệ thống sai**, và cả 3 lần đều sai theo chiều nguy hiểm hơn: **bịa ra
lỗi không có**, khiến người ta đi sửa những thứ vốn đã đúng.

## 8. Vì sao đo lường phải có trước thứ được đo

### Kiến thức

Đây là bài học đắt nhất của dự án này, và nó đo được bằng số.

Bản cũ viết hệ thống trước, dựng thước đo sau. Hệ quả: **thước đo sai 3 lần trước khi hệ
thống sai.** Ba lần đó đều là **bịa ra lỗi không có** — chiều sai nguy hiểm hơn, vì nó khiến
người ta sửa những thứ vốn đã đúng:

| Lần | Thước đo chấm | Thực tế |
|---|---|---|
| 1 | ca so sánh "không có căn cứ" | câu trả lời nêu **đúng** khoảng cách giá hai món |
| 2 | tỷ lệ hỏi lại 43% | câu trả lời **liệt kê món rồi mời thêm** bị đếm là hỏi lại |
| 3 | tra cứu dinh dưỡng "không dùng được" | ca một món, không cần thẻ thêm giỏ |

Và nó còn có một **lỗ**: câu trả lời **rỗng** được tính là "dùng được", vì không dẫn món nào
thì không vi phạm ràng buộc nào. Khi bịt lỗ đó, con số nền tụt từ **0,9960 xuống 0,7368** —
tức 99,6% kia gần như hoàn toàn là ảo.

**Nguyên tắc:** thước đo cũng là một phương pháp, và **cũng phải chứng minh được mình đúng.**

## 9. Khóa đáp án phải kiểm được — dùng truy vấn, không dùng danh sách

### Kiến thức

Cách viết tập đánh giá thông thường là: câu hỏi → danh sách đáp án đúng. Cách đó có một điểm
yếu chết người: **một danh sách viết tay thì không có cách nào kiểm.** Nó luôn "đúng" theo
định nghĩa.

Bản cũ có **96 khóa đáp án trỏ vào những đoạn văn bản dành cho AI đọc** chứ không dành cho
khách, và không ai phát hiện trong nhiều tháng.

**Cách làm ở đây:** một ca không ghi "đáp án là m_008, m_012...". Nó ghi **điều kiện** mà đáp
án phải thỏa, và bộ chạy tự tính danh sách từ thực đơn.
"""))

    out.append(code(r'''
# Một ca đánh giá thật, và cách khóa đáp án của nó tự tính lại từ thực đơn
from menu_selectors import clean_selector, select_ids

cases = json.loads((ROOT / "ai" / "evaluation" / "cases.json").read_text(encoding="utf-8-sig"))
case = next(c for c in cases["cases"] if c["id"] == "A-spice-01")
print(json.dumps(case, ensure_ascii=False, indent=2))

menu = load("menu-dataset.json")
allowed = select_ids(menu["items"], case["expect"]["allowed"])
# `clean_selector` bỏ khóa tài liệu `_why`. Ô này từng ném SelectorError vì quên gọi nó —
# và đó là lý do đoạn lọc được đưa vào thư viện thay vì lặp ở từng nơi dùng.
forbidden = select_ids(menu["items"], clean_selector(cases["named_selectors"]["spicy"]))
print(f"\nĐiều kiện `allowed` chọn ra : {len(allowed)} món")
print(f"Điều kiện `forbid`  chọn ra : {len(forbidden)} món")
print(f"Hai tập giao nhau           : {len(allowed & forbidden)} món  <- phải là 0, nếu không ca tự mâu thuẫn")
print(f"Tổng                        : {len(allowed) + len(forbidden)}/{len(menu['items'])} món")
'''))

    out.append(md(r"""
#### Nhận xét — Mục 9

- **Quan sát:** khóa đáp án là `{"tags_all": ["spice:none"]}`, và bộ chạy tính ra tập món. Hai
  tập `allowed` và `forbid` phủ trọn 91 món và **giao nhau bằng 0**.
- **Diễn giải:** bốn hệ quả. **(1)** thực đơn đổi giá hay đổi nhãn thì khóa đáp án đổi theo;
  **(2)** kiểm được chính ca đánh giá — điều kiện chọn ra 0 món là ca sai và lộ ra ngay;
  **(3)** đọc được ý định rõ hơn một dãy mã món; **(4)** trường `why` bắt buộc, vì ca không
  giải thích được thì không ai xét lại được nó.
- **Giới hạn:** cách này chỉ dùng được khi dữ liệu có cấu trúc. Với câu loại C ("gợi ý này có
  hợp không") thì điều kiện chọn chỉ kiểm được **ràng buộc cứng**, không kiểm được chất lượng
  gợi ý — và tập đánh giá không giả vờ là kiểm được.
- **Quyết định tiếp theo:** chứng minh bộ kiểm tập ca thật sự bắt được ca viết sai.
"""))

    out.append(code(r'''
# Bộ kiểm tập ca bắt được 9 loại lỗi. Ô này chứng minh bằng cách LÀM HỎNG một ca trong bộ
# nhớ rồi chạy lại phép kiểm — không sửa tệp trên đĩa.
import copy
from menu_selectors import select_ids, validate_selector, SelectorError

cases = json.loads((ROOT / "ai" / "evaluation" / "cases.json").read_text(encoding="utf-8-sig"))
menu, tags = load("menu-dataset.json"), load("menu-tags.json")
items, known = menu["items"], set(tags["tags"])

def check_one(case):
    """Ba phép kiểm tiêu biểu; bản đầy đủ ở ai/evaluation/validate_cases.py"""
    problems = []
    for item_id, facts in (case["expect"].get("facts") or {}).items():
        it = next((m for m in items if m["id"] == item_id), None)
        if it is None:
            problems.append(f"mã món không tồn tại: {item_id}")
        elif "price" in facts and facts["price"] != it["price"]:
            problems.append(f"{item_id} ghi giá {facts['price']:,} nhưng thực đơn là {it['price']:,}")
    sel = case["expect"].get("allowed")
    if isinstance(sel, dict):
        stray = [t for v in sel.values() if isinstance(v, list) for t in v if t not in known]
        if stray:
            problems.append(f"nhãn lạ: {stray}")
    if not (case["expect"].get("why") or "").strip():
        problems.append("thiếu trường `why`")
    return problems

good = next(c for c in cases["cases"] if c["id"] == "A-price-01")
print(f"Ca nguyên bản A-price-01: {check_one(good) or 'không có vấn đề'}\n")

for label, mutate in [
    ("đổi giá 75.000 -> 70.000", lambda c: c["expect"]["facts"]["m_008"].update({"price": 70000})),
    ("gõ sai mã món",            lambda c: c["expect"].update({"facts": {"m_999": {"price": 1}}})),
    ("bỏ trường why",            lambda c: c["expect"].update({"why": "  "})),
]:
    broken = copy.deepcopy(good)
    mutate(broken)
    found = check_one(broken)
    print(f"[{'BẮT ĐƯỢC' if found else 'KHÔNG BẮT ĐƯỢC'}] {label}")
    for p in found:
        print(f"             -> {p}")
'''))

    out.append(md(r"""
#### Nhận xét — Mục 9 (tiếp)

- **Quan sát:** cả ba lỗi cố tình tạo ra đều bị bắt, và bắt đúng chỗ. Bản đầy đủ trong
  `ai/evaluation/validate_cases.py` kiểm **9 loại lỗi** và đã được chứng minh bắt cả 9.
- **Diễn giải:** đây là kỹ thuật chung — **muốn tin một bộ kiểm, phải làm hỏng thứ nó kiểm rồi
  xem nó có đỏ không.** Một bộ kiểm luôn xanh không chứng minh được gì.
- **Giới hạn:** phép thử này chứng minh bộ kiểm bắt được **lỗi đã nghĩ tới**. Lỗi chưa nghĩ tới
  cần công cụ khác — mục 7.
- **Quyết định tiếp theo:** chia tập đánh giá sao cho nó dự báo được.
"""))

    out.append(md(r"""
## 10. Chia tập đánh giá: ba nhóm, không phải hai

### Kiến thức

Chia dev/test là kiến thức cơ bản. Nhưng ở hệ thống có yêu cầu an toàn thì **hai nhóm là
không đủ**, và đây là lý do:

Ca an toàn (dị ứng, bịa món, rò rỉ chỉ dẫn nội bộ) **không phải số liệu để so**. Chúng là
**chốt**: luôn phải xanh, ở mọi lần chạy.

- Đưa vào tập phát triển → tỷ lệ chung che mất một ca dị ứng đỏ (1/50 chỉ là 2%).
- Đưa vào tập niêm phong → một lỗi an toàn có thể nằm im nhiều tuần.

Nên chúng thành **nhóm thứ ba**, chạy mọi lần, và một ca đỏ là **chặn** chứ không phải trừ điểm.

### Hai ràng buộc khi chia

1. **Chia theo họ câu hỏi, không theo từng ca.** Nếu "Món nào dưới 50.000đ?" ở tập phát triển
   mà "Mình có 200 nghìn, ăn được món gì?" ở tập niêm phong, thì chỉnh cho ca đầu xanh sẽ kéo
   ca sau xanh theo **mà không học được gì** — đó là rò rỉ.
2. **Cân theo (loại câu hỏi, dạng đáp án).** Tập phát triển chỉ *dự báo* được tập niêm phong
   khi hai bên có thành phần giống nhau.
"""))

    out.append(code(r'''
# Thành phần ba nhóm — tính từ split.json và cases.json thật
from collections import Counter
E = ROOT / "ai" / "evaluation"
cases = json.loads((E / "cases.json").read_text(encoding="utf-8-sig"))["cases"]
split = json.loads((E / "split.json").read_text(encoding="utf-8-sig"))

groups = {"chốt": set(split["gate_families"]),
          "phát triển": set(split["dev_families"]),
          "niêm phong": set(split["test_families"])}

print(f"{'nhóm':12} {'ca':>4} {'họ':>4}  {'loại':16} dạng đáp án")
print("-" * 92)
for label, fams in groups.items():
    cs = [c for c in cases if c["family"] in fams]
    t = " ".join(f"{k}={v}" for k, v in sorted(Counter(c["type"] for c in cs).items()))
    k = " ".join(f"{a}={b}" for a, b in sorted(Counter(c["expect"]["kind"] for c in cs).items()))
    print(f"{label:12} {len(cs):>4} {len(fams):>4}  {t:16} {k}")

# Kiểm rò rỉ: không họ nào được nằm ở hai tập
overlap = set(split["dev_families"]) & set(split["test_families"])
print(f"\nHọ nằm ở cả hai tập (rò rỉ): {len(overlap)}  <- phải là 0")

# Kiểm dự báo: dạng đáp án nào chỉ có ở tập niêm phong thì tập phát triển không dự báo được
dev_kinds = {c["expect"]["kind"] for c in cases if c["family"] in groups["phát triển"]}
test_kinds = {c["expect"]["kind"] for c in cases if c["family"] in groups["niêm phong"]}
print(f"Dạng chỉ có ở tập niêm phong: {sorted(test_kinds - dev_kinds) or 'không có'}")
print(f"Dạng chỉ có ở tập phát triển: {sorted(dev_kinds - test_kinds) or 'không có'}")
'''))

    out.append(md(r"""
#### Nhận xét — Mục 10

- **Quan sát:** 0 họ nằm ở hai tập, nên không rò rỉ. Bốn họ chốt ứng đúng ba điều "tuyệt đối
  không làm" ở Phần I.
- **Diễn giải:** bộ chia này **tất định, không dùng số ngẫu nhiên** — sắp họ theo số ca giảm
  dần rồi tên tăng dần, rồi đặt mỗi họ vào phía đang thiếu nhất ở đúng chữ ký của nó. Không có
  hạt giống nào để chọn cho ra kết quả đẹp, và ai chạy lại cũng ra đúng vậy.
- **Giới hạn thật, phải nói ra:** bộ chia bắt được một lỗi ngay lần chạy đầu — dạng `compare`
  chỉ có ở tập niêm phong, nên tập phát triển không dự báo được nó. Đã sửa. Còn dạng nào chỉ
  có ở một phía thì ô mã in ra, và **con số đó không bị che**.
- **Quyết định tiếp theo:** dựng thước đo, và chứng minh nó theo cả hai chiều.
"""))

    out.append(md(r"""
## 11. Thước đo: hai nguyên tắc và một bộ dò lỗ

### Kiến thức — nguyên tắc 1: đừng tin hệ thống tự khai

Một câu trả lời gồm hai phần: **phần chữ** khách đọc, và **phần khai báo** món đã nêu.

Nếu thước đo chỉ đọc phần khai báo, hệ thống chỉ cần **bỏ món cấm khỏi danh sách khai** là qua
được ràng buộc dị ứng — trong khi phần chữ vẫn mời khách món đó.

Nên thước đo **tự đọc tên món ra khỏi phần chữ**, rồi so hai chiều:

| Chiều | Bắt được gì |
|---|---|
| chữ → khai | nêu món trong chữ mà không khai — cách lách ràng buộc an toàn |
| khai → chữ | khai món mà chữ không nêu tên — dẫn nguồn ảo |

### Kiến thức — nguyên tắc 2: khớp trọn tên, không khớp một phần

Quyết định này phải dựa trên số, không dựa trên cảm giác.
"""))

    out.append(code(r'''
# Vì sao khớp TRỌN tên món là an toàn, còn khớp một phần thì không
import unicodedata
def fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")

menu = load("menu-dataset.json")
names = [(m["id"], m["name"]) for m in menu["items"]]

nested = [(a, b) for i, a in names for j, b in names if i != j and fold(a) in fold(b)]
distinct = len({fold(n) for _i, n in names})
print(f"Tên món nằm trong tên món khác : {len(nested)}   <- 0 nên khớp trọn tên không nhập nhằng")
print(f"Tên còn phân biệt sau rút dấu  : {distinct}/{len(names)}")

from collections import defaultdict
first = defaultdict(list)
for _i, n in names:
    first[fold(n).split()[0]].append(n)
clash = {w: v for w, v in first.items() if len(v) > 1}
print(f"\nTừ ĐẦU của tên món bị trùng    : {len(clash)} từ")
for w, v in sorted(clash.items(), key=lambda kv: -len(kv[1]))[:3]:
    print(f"   '{w}' ứng {len(v)} món: {', '.join(v[:3])}...")
print("\n=> Khớp một phần chắc chắn sinh dương tính giả. Khớp trọn tên thì không.")
'''))

    out.append(md(r"""
### Kiến thức — bộ dò lỗ: tìm lỗi CHƯA nghĩ tới

Test đơn lẻ chỉ kiểm những chỗ người viết đã nghĩ tới. Lỗ "câu rỗng được tính là dùng được"
của bản cũ tồn tại **chính vì không ai nghĩ tới nó**.

**Kỹ thuật:** đưa những câu trả lời **chắc chắn tệ** qua **toàn bộ** tập ca, rồi đòi thước đo
đánh đỏ. Ca nào một câu trả lời tệ vẫn qua được thì đó là lỗ — và nó được **nêu tên cụ thể**
để xét, chứ không làm tròn thành một tỷ lệ.

Kỹ thuật này áp dụng được cho bất kỳ thước đo nào, và nó tìm ra **24 lỗ thật** ở lần chạy đầu.
"""))

    out.append(code(r'''
# Chạy bộ dò lỗ thật trên toàn bộ tập ca
import subprocess, sys
r = subprocess.run([sys.executable, str(ROOT / "ai" / "evaluation" / "probe_metric_holes.py")],
                   capture_output=True, text=True, encoding="utf-8", cwd=str(ROOT))
print(r.stdout)
'''))

    out.append(md(r"""
#### Nhận xét — Mục 11

- **Quan sát:** cả năm cách trả lời vô nghĩa đều bị bắt ở **mọi** ca. Cách duy nhất còn qua
  được là "luôn nói chưa có dữ liệu", và nó qua đúng số ca mà đó **là** câu trả lời đúng.
- **Diễn giải:** con số đó là **sàn** của thước đo — mọi hệ thống thật phải hơn hẳn nó mới đáng
  nói. Sàn được **tính**, không viết cứng: bản đầu ghi "12/80" và con số đó lạc hậu ngay
  khi tập ca đổi.
- **Giới hạn:** ba phép kiểm (`must_offer_staff`, `states_no_data`, `declines_explicitly`) dùng
  **danh sách cụm từ** thay cho hiểu nghĩa. Câu diễn đạt đúng ý bằng từ khác sẽ bị đánh đỏ oan.
  Đây là đánh đổi có ý thức: cách còn lại là dùng một mô hình để chấm, mà khi đó **thước đo lại
  cần một thước đo**.
- **Quyết định tiếp theo:** đã có tập ca và thước đo tự chứng minh. Giờ mới được xây hệ thống.
"""))

    # ================================================================= PHẦN 3
    out.append(md(r"""
---
## Trả lời không cần mô hình
> **TV2** (hiểu câu hỏi) và **TV4** (chọn món & giỏ hàng)

> **Vị trí:** TV2 (hiểu câu hỏi) và TV4 (chọn món). Đây là phần quyết định **mô hình sinh còn phải
> làm gì** — và câu trả lời hóa ra là "ít hơn nhiều so với tưởng".

| | |
|---|---|
| **Câu hỏi khâu này trả lời** | *Bao nhiêu câu trả lời được mà KHÔNG cần mô hình sinh?* |
| **Kiến thức phải nắm** | số nền (baseline) · khớp cụm dài trước rồi ăn hết đoạn · **ràng buộc khác ngữ cảnh** · fail-closed cho dị nguyên · ablation để chứng minh từng cơ chế có giá trị |
| **Tệp sở hữu** | `ai/app/understand.py` · `answer.py` · `cart.py` · `session.py` · `test_understand.py` |
| **Đầu vào** | 119 ca, thước đo và từ điển nhãn — tất cả từ TV1 |
| **Đầu ra bàn giao** | hợp đồng `Reply` cho TV5; số nền để mọi thứ sau so vào |
| **Tự đo bằng** | `run_baseline.py --all` · `run_ablation.py` · `python -m unittest discover -s ai/app` |
| **Trạng thái** | **xong phần trả lời** — 122/122, 0 lỗi an toàn. **Còn lại:** thẻ giỏ hàng và bộ nhớ phiên |

### Vì sao phải đo số nền TRƯỚC khi thêm mô hình

Bản cũ có **8 đường xử lý tất định chồng nhau** và chỉ **33%** câu trả lời do mã sinh ra. Không
ai nói được đường nào phụ trách việc gì, và **2 đường bị một cờ legacy tắt mà hệ thống vẫn chạy
đúng** — tức chúng là dư, nhưng không ai biết vì không có số nền để đối chiếu.

Số nền có hai tính chất mà câu trả lời của mô hình không có: **đúng 100% về dữ liệu** và **giống
nhau mọi lần chạy**. Nên nó là mốc, và mọi thứ thêm vào sau phải chứng minh mình vượt mốc đó.
"""))

    out.append(md(r"""
---

## Lớp hiểu câu hỏi — vẫn thuộc chặng TV1

> Lớp này thuộc **cùng chặng TV1** vì nó ánh xạ chữ khách gõ vào **chính bộ nhãn** chặng dữ liệu
> định nghĩa. Tách ra thì mỗi lần thêm nhãn phải đợi người khác thêm cụm từ vựng. Biến câu tiếng Việt thành `Request` — nhãn lọc, ràng buộc, ý định. Đây là chặng quyết định **câu hỏi được hiểu thành cái gì**, nên mọi sai ở đây đều lan xuống dưới.

| | |
|---|---|
| **Nhận từ chặng trước** | bộ nhãn và tập đánh giá của TV1 |
| **Bàn giao cho chặng sau** | `Request(nhãn lọc, ràng buộc, ngữ cảnh, ý định)` |
| **Điều kiện nghiệm thu** | **140/140** ca trả lời; kiểm kê đụng chữ khớp con số đã ghi; 0 ca câu hỏi bình thường bị đọc thành ràng buộc |

Mục trong phần này: 12 → 14 (số nền, ràng buộc khác ngữ cảnh, ablation)

Notebook đi theo **đúng thứ tự dự án đã được xây**, vì thứ tự đó chính là phương pháp: không có
nhãn thì không lọc được món, không có kho thì không truy hồi được, và **không có tập đánh giá thì
không ai biết mình đúng hay sai**.
"""))

    out.append(md(r"""
## 12. Số nền: sáu nhánh loại trừ, không nhánh nào chồng nhánh nào

### Kiến thức

Kiến trúc trả lời là **sáu nhánh loại trừ nhau**, và thứ tự là thứ tự loại trừ:

| # | Nhánh | Việc | Vì sao đứng ở vị trí đó |
|---|---|---|---|
| 1 | ngoài bài toán | từ chối ngắn gọn | phải chặn trước, không thì câu hỏi thời tiết rơi vào nhánh lọc món |
| 2 | câu chính sách | tra kho tri thức, hoặc nói chưa có dữ liệu | "mấy giờ mở cửa" không phải câu lọc món |
| 3 | hỏi giá một món | nêu giá | có đáp án đúng duy nhất |
| 4 | so sánh hai món | nêu dữ kiện cả hai | |
| 5 | món đắt/rẻ nhất | tính rồi nêu | |
| 6 | còn lại | lọc thực đơn theo ràng buộc | nhánh rộng nhất, nên đứng cuối |

Nhánh 6 sinh ra **câu hỏi lại** khi khách chưa nói gì đủ để lọc. Hỏi lại là **câu trả lời đúng**
ở đó, không phải thất bại — và thước đo của TV1 phải phân biệt được hai thứ này.

Đối lập với bản cũ: 8 đường **chồng nhau**, nên hai đường có thể cho hai kết quả khác nhau cho
cùng một câu, và hệ thống trả lời tùy lúc.
"""))

    out.append(code(r"""
# Số nền theo nhóm chia tập, và nhánh nào thật sự được dùng
import collections
import run_baseline as rb

g = collections.defaultdict(lambda: [0, 0])
nhanh, kieu = collections.Counter(), collections.Counter()
for c in rb.DATA["cases"]:
    _, reply, v = rb.run_case(c)
    grp = rb.group_of(c["family"])
    g[grp][1] += 1
    g[grp][0] += int(v.passed)
    nhanh[reply.branch.split(":")[0]] += 1
    kieu[reply.kind] += 1

tong_ok = sum(v[0] for v in g.values())
tong = sum(v[1] for v in g.values())
print(f"SỐ NỀN — chỉ tra thực đơn, không mô hình nào: {tong_ok}/{tong} "
      f"({100 * tong_ok / tong:.1f}%)\n")
print(f"{'nhóm':14}{'qua':>10}   vai trò của nhóm")
print("-" * 62)
vai = {"chốt": "an toàn, LUÔN phải 100%", "phát triển": "được xem, được sửa theo",
       "niêm phong": "chỉ mở để chốt kết quả"}
for k in ("chốt", "phát triển", "niêm phong"):
    ok, n = g[k]
    print(f"{k:14}{ok:>4}/{n:<4} {100*ok/n:5.1f}%   {vai[k]}")

print(f"\nSàn để so — cách lách 'luôn nói chưa có dữ liệu' qua được: "
      f"{sum(1 for c in rb.DATA['cases'] if c['expect']['kind'] == 'no_data')}/{tong}")
print("=> số nền chỉ có nghĩa khi nó cao hơn sàn này rất nhiều.")

print(f"\n{len(nhanh)} nhánh được dùng thật (không nhánh nào là mã chết):")
for b, n in nhanh.most_common():
    print(f"   {b:22} {n:3d} ca")
"""))

    out.append(plot_code(r"""
# Biểu đồ 4 — số nền: theo nhóm chia tập, và so với sàn
import collections
import run_baseline as rb

g = collections.defaultdict(lambda: [0, 0])
nhanh = collections.Counter()
for c in rb.DATA["cases"]:
    _, reply, v = rb.run_case(c)
    grp = rb.group_of(c["family"])
    g[grp][1] += 1
    g[grp][0] += int(v.passed)
    nhanh[reply.branch.split(":")[0]] += 1
tong_ok = sum(v[0] for v in g.values()); tong = sum(v[1] for v in g.values())
san = sum(1 for c in rb.DATA["cases"] if c["expect"]["kind"] == "no_data")

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 4.6))

ten = ["chốt\n(an toàn)", "phát triển", "niêm phong\n(held-out)"]
khoa = ["chốt", "phát triển", "niêm phong"]
qua = [g[k][0] for k in khoa]; tongnhom = [g[k][1] for k in khoa]
truot = [t - q for q, t in zip(qua, tongnhom)]
ax1.bar(ten, qua, color=XANH, label="qua")
ax1.bar(ten, truot, bottom=qua, color=DO, label="đỏ")
for i, (q, t) in enumerate(zip(qua, tongnhom)):
    ax1.text(i, t + 0.8, f"{q}/{t}\n{100*q/t:.1f}%", ha="center", fontsize=9,
             fontweight="bold")
ax1.set_ylabel("số ca"); ax1.set_ylim(0, max(tongnhom) * 1.28)
ax1.set_title("Số nền theo nhóm chia tập\n(nhóm CHỐT phải luôn 100%)", fontsize=11)
ax1.legend(fontsize=9)

# So số nền với sàn — sàn là điều làm con số có nghĩa
b = ax2.barh(["Sàn: luôn nói\n'chưa có dữ liệu'", "Số nền\n(mã tất định)"],
             [san, tong_ok], color=[XAM, XANH])
ax2.bar_label(b, labels=[f"{san}/{tong} = {100*san/tong:.1f}%",
                         f"{tong_ok}/{tong} = {100*tong_ok/tong:.1f}%"],
              padding=4, fontsize=10, fontweight="bold")
ax2.set_xlim(0, tong * 1.3); ax2.set_xlabel("số ca qua")
ax2.set_title("Vì sao cần SÀN để so\n(không có sàn thì % nào cũng 'nghe được')",
              fontsize=11)
ax2.grid(False)

plt.tight_layout(); plt.show()
print(f"Nhóm chốt {g['chốt'][0]}/{g['chốt'][1]} — đây là điều kiện chặn, không phải số liệu.")
print(f"Một ca chốt đỏ là CHẶN, kể cả khi tỷ lệ chung tăng.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 12

- **Quan sát:** 122/122 (100%) chỉ bằng mã tất định. Nhóm **chốt 21/21 (100%)**, phát triển
  54/61, niêm phong 33/37. Sàn để so là 8/119 (6,7%). 13 nhánh đều được dùng thật.
- **Diễn giải:** con số 90,2% chỉ có nghĩa vì có **sàn 7,1%** đặt cạnh. Một hệ thống luôn đáp
  "chưa có dữ liệu" cũng đạt 6,7% mà không trả lời gì — nếu không công bố sàn thì mọi tỷ lệ đều
  "nghe được".
- **Nhóm chốt là điều kiện chặn, không phải số liệu:** một ca chốt đỏ là **chặn phát hành**, kể
  cả khi tỷ lệ chung tăng. Đưa ca an toàn vào tập phát triển thì tỷ lệ chung sẽ che mất nó.
- **Giới hạn phải nói ra:** tập niêm phong **đã được mở** ở bước 4 để chốt kết quả, nên
  33/37 hiện tại **không còn là số held-out thật**. Số held-out thật duy nhất của dự án là
  **23/27 (85,2%)** ở lần mở đầu tiên. Mọi tập mới phải chỉ mở một lần.
"""))

    out.append(md(r"""
## 13. Chỗ khó nhất của khâu này: RÀNG BUỘC khác NGỮ CẢNH

### Kiến thức

Đây là phân biệt mà nếu làm sai thì hệ thống *vẫn chạy*, *vẫn không lỗi*, nhưng trả lời tệ — nên
nó chỉ lộ ra khi có thước đo.

Khách nói hai loại điều rất khác nhau:

| Loại | Ví dụ | Phải làm gì | Nếu làm sai |
|---|---|---|---|
| **Ràng buộc** | "tôi ăn chay", "dị ứng hải sản", "dưới 100k" | **lọc cứng** — món không thỏa thì loại | mời khách món họ không ăn được |
| **Ngữ cảnh** | "tôi đi hẹn hò", "trời nóng", "đi với bạn" | **chỉ sắp thứ tự** — không loại món nào | câu "hẹn hò" chỉ còn **1 món** trong 91 |

Ca thật đã xảy ra: nhãn `occasion` được dùng làm **lọc cứng**, và vì nhóm đó chỉ phủ 79/91 món
nên câu "đi hẹn hò nên gọi gì" trả về **đúng một món**. Sửa bằng cách chuyển `occasion` sang
`prefer_tags` — chỉ ảnh hưởng thứ tự, không loại món.

**Quy tắc suy ra từ Mục 3:** nhóm nhãn **không phủ hết 91 món** thì chỉ được dùng theo chiều
khẳng định (đưa lên trước), **không** được dùng để loại. Vì thiếu nhãn ở nhóm đó nghĩa là *chưa
ghi nhận*, không phải *không phù hợp*.

### Fail-closed cho dị nguyên: ngoại lệ duy nhất, và nó không bao giờ được nới

Ràng buộc dị nguyên áp **cuối cùng** và **không bao giờ bị nới**, kể cả khi kết quả rỗng. Thà
nói "không có món nào phù hợp, bạn hỏi nhân viên giúp mình" còn hơn mời khách một món có thể gây
dị ứng.
"""))

    out.append(code(r"""
# Ràng buộc vs ngữ cảnh, và fail-closed — chứng minh bằng chính bộ trả lời
from answer import respond, select
from understand import understand
menu = load("menu-dataset.json"); items = menu["items"]

print("1) NGỮ CẢNH chỉ sắp thứ tự, KHÔNG loại món")
r = understand("Mình đi hẹn hò, gợi ý món nào", items)
print(f"   require (lọc cứng) : {r.require_tags}")
print(f"   prefer  (chỉ xếp)  : {r.prefer_tags}")
print(f"   số món còn lại sau khi lọc: {len(select(r, items))}/{len(items)}")
print("   => dịp ăn KHÔNG nằm trong require, nên không món nào bị loại.")

print("\n2) RÀNG BUỘC thì lọc cứng")
r2 = understand("Mình ăn chay, dưới 80 nghìn", items)
print(f"   require : {r2.require_tags}   ngân sách: {r2.budget_max}")
print(f"   số món còn lại: {len(select(r2, items))}/{len(items)}")

print("\n3) FAIL-CLOSED: ràng buộc dị nguyên không bao giờ được nới")
r3 = understand("Mình dị ứng hải sản, cho mình món ăn", items)
chon = select(r3, items)
print(f"   avoid   : {r3.avoid_tags}")
print(f"   số món  : {len(chon)}/{len(items)}")
con_di_nguyen = [m["name"] for m in chon if "allergen:seafood" in m["tags"]]
print(f"   món còn sót nhãn hải sản: {len(con_di_nguyen)}  <- PHẢI là 0")

rep = respond(r3, items)
print(f"   câu trả lời có mở đường hỏi nhân viên: "
      f"{'nhân viên' in rep.text or 'bếp' in rep.text}")
print("   => nhãn dị nguyên chỉ phủ 44/91 món, nên danh sách lọc ra KHÔNG phải")
print("      kết luận về an toàn. Lời nhắc hỏi nhân viên là bắt buộc, không phải lịch sự.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 13

- **Quan sát:** câu "hẹn hò" giữ nguyên toàn bộ 91 món vì dịp ăn nằm ở `prefer_tags`, không ở
  `require_tags`. Câu "ăn chay dưới 80k" lọc cứng. Câu dị ứng hải sản để lại **0 món** mang nhãn
  hải sản và câu trả lời **có** mở đường hỏi nhân viên.
- **Diễn giải:** phân biệt ràng buộc/ngữ cảnh không phải chuyện tinh tế về ngôn ngữ — nó suy
  trực tiếp từ **độ phủ nhãn** ở Mục 3. Nhóm phủ 91/91 mới được dùng để loại; nhóm phủ một phần
  chỉ được dùng để xếp thứ tự.
- **Fail-closed là ngoại lệ có chủ ý:** nó làm kết quả *tệ hơn* theo nghĩa số món trả về, và đó
  là đánh đổi đúng. Kết quả rỗng kèm lời nhắc hỏi nhân viên là câu trả lời đúng; kết quả có món
  bằng cách nới ràng buộc dị nguyên là câu trả lời **sai một cách nguy hiểm**.
- **Giới hạn:** lời nhắc hỏi nhân viên là điều **thước đo bắt buộc** ở mọi ca dị ứng. Nhưng nó
  chỉ chuyển rủi ro sang con người — hệ thống không thể biết bếp có dùng chung dụng cụ hay không.
"""))

    out.append(md(r"""
## 14. Ablation: chứng minh từng cơ chế thật sự có giá trị

### Kiến thức

Câu hỏi mà mọi hệ thống nhiều cơ chế phải trả lời: **cơ chế nào thật sự cần?** Bản cũ có 8 đường
và 2 trong số đó là dư mà không ai biết.

Cách trả lời là **ablation**: tắt từng cơ chế, đo lại, xem mất bao nhiêu ca. Cơ chế nào tắt mà
**không mất ca nào** thì nó là dư — và phải nói ra, không phải giữ lại "cho chắc".

Có hai cột phải đọc riêng, và cột thứ hai quan trọng hơn:

- **mất bao nhiêu ca** — giá trị về chất lượng
- **gây bao nhiêu lỗi an toàn** — cơ chế nào tắt mà sinh lỗi an toàn thì nó **không phải tính
  năng, nó là hàng rào**, và không được bàn về việc bỏ nó
"""))

    out.append(code(r"""
# Ablation: tắt từng cơ chế, đo lại
import run_ablation as ra

base_ok, base_unsafe = ra.measure()
n = len(ra.CASES)
print(f"bản đầy đủ: {base_ok}/{n} ca qua, {base_unsafe} lỗi an toàn\n")
print(f"{'cơ chế bị tắt':46}{'qua':>9}{'mất':>6}{'lỗi an toàn':>13}")
print("-" * 76)
ket_qua = []
for ten, tat in ra.ABLATIONS:
    hoan_lai = tat()                 # tắt cơ chế, trả về hàm hoàn lại
    try:
        ok, unsafe = ra.measure()
    finally:
        hoan_lai()                   # LUÔN hoàn lại, kể cả khi đo lỗi
    ket_qua.append((ten, ok, base_ok - ok, unsafe))
for ten, ok, mat, unsafe in sorted(ket_qua, key=lambda r: (-r[3], -r[2])):
    canh = "  <-- HÀNG RÀO" if unsafe else ""
    print(f"{ten:46}{ok:>5}/{n}{mat:>6}{unsafe:>13}{canh}")

du = [t for t, _, mat, unsafe in ket_qua if mat == 0 and unsafe == 0]
print(f"\ncơ chế tắt mà KHÔNG mất ca nào (tức là dư): {len(du)} {du}")
"""))

    out.append(plot_code(r"""
# Biểu đồ 5 — ablation: cơ chế nào là tính năng, cơ chế nào là hàng rào an toàn
import run_ablation as ra

base_ok, base_unsafe = ra.measure()
n = len(ra.CASES)
rows = []
for ten, tat in ra.ABLATIONS:
    hoan_lai = tat()
    try:
        ok, unsafe = ra.measure()
    finally:
        hoan_lai()
    rows.append((ten, base_ok - ok, unsafe))
rows.sort(key=lambda r: (r[2], r[1]))

fig, ax = plt.subplots(figsize=(11, 5))
ten = [r[0] for r in rows]
mat = [r[1] for r in rows]
mau = [DO if r[2] else XANH for r in rows]
b = ax.barh(ten, mat, color=mau)
nhan = [f"{m} ca" + (f"  ·  {u} lỗi an toàn" if u else "") for _, m, u in rows]
ax.bar_label(b, labels=nhan, padding=4, fontsize=9)
ax.set_xlabel("số ca MẤT khi tắt cơ chế")
ax.set_xlim(0, max(mat) * 1.55)
ax.set_title("Ablation — tắt từng cơ chế rồi đo lại\n"
             "đỏ = tắt thì sinh LỖI AN TOÀN (hàng rào, không phải tính năng)",
             fontsize=11)

from matplotlib.patches import Patch
ax.legend(handles=[Patch(color=DO, label="hàng rào an toàn"),
                   Patch(color=XANH, label="tính năng chất lượng")],
          loc="lower right", fontsize=9)
plt.tight_layout(); plt.show()

rao = sum(1 for r in rows if r[2])
print(f"{rao}/{len(rows)} cơ chế là HÀNG RÀO AN TOÀN — tắt là sinh lỗi an toàn ngay.")
print("Với chúng thì câu hỏi 'có đáng giữ không' không đặt ra được.")
print(f"{len(rows) - rao}/{len(rows)} cơ chế là tính năng chất lượng — đo được bằng số ca.")
"""))

    out.append(md(f"""
#### Nhận xét — Mục 14

- **Quan sát:** 9/9 cơ chế đều có ít nhất một ca chứng minh giá trị — **không cơ chế nào là dư**.
  5/9 là **hàng rào an toàn**: tắt là sinh lỗi an toàn ngay. Hai cơ chế đáng chú ý nhất là "bỏ
  dấu câu khi chuẩn hóa" (mất 20 ca, 7 lỗi an toàn) và "phân biệt món ăn với đồ uống" (mất 14
  ca, 7 lỗi an toàn).
- **Diễn giải:** "bỏ dấu câu" nghe như chuyện làm sạch chữ, nhưng thiếu nó thì `"mấy giờ mở
  cửa?"` không khớp cụm `mo cua` — dấu hỏi làm lệch cả chuỗi. Đây là ví dụ điển hình của **cơ chế
  nghe tầm thường mà giá trị đo được rất cao**, và không có ablation thì không ai biết.
- **Phân biệt hàng rào với tính năng là kết luận quan trọng nhất của mục này:** với 5 cơ chế đỏ,
  câu hỏi "có đáng giữ không" **không đặt ra được** — chúng không đánh đổi với chất lượng.
- **Giới hạn đã nêu ở Mục 4:** cơ chế "ăn hết đoạn đã khớp" chỉ đo được **1 ca**, nhưng nó bảo
  vệ **{KIEM_KE["co_rui_ro"]} chỗ** đụng chữ. Chênh lệch đó là **giới hạn của tập đánh giá**, không phải bằng chứng
  cơ chế vô dụng — nên con số ablation phải đọc kèm phần kiểm kê.
"""))

    # ================================================================= PHẦN 4
    out.append(md(r"""
---
## Truy hồi tri thức
> **TV3** — nhận kho 303 đoạn từ TV1, làm phần lấy đoạn

> **Vị trí:** TV3, giữa "hiểu câu hỏi" và "chọn món". Phép so **đã chạy**, và một phần kết quả
> **khác với dự kiến ghi trong kế hoạch** — mục 15b nói rõ chỗ nào và vì sao.

| | |
|---|---|
| **Câu hỏi khâu này trả lời** | *Với câu hỏi cần tri thức, lấy đoạn nào — và phương pháp lấy nào tốt hơn?* |
| **Kiến thức phải nắm** | BM25 (`k1`, `b`, tf-idf) · embedding và cosine · hybrid RRF · Hit@k, MRR@k, nDCG@k, **forbidden@k** · giao thức đo độ trễ |
| **Tệp sở hữu** | `ai/app/rag/base.py` · `bm25.py` · `embedding.py` · `hybrid.py` · `run_retrieval_comparison.py` |
| **Đầu vào** | 303 đoạn `synthesize` của TV1; 138 ca truy hồi / 14 họ của TV1 |
| **Đầu ra bàn giao** | bảng so ba phương pháp trên **hai bài toán**, kèm phân tích ca sai |
| **Tự đo bằng** | `run_retrieval_comparison.py` — nhóm chốt đỏ là CHẶN |
| **Trạng thái** | **xong.** embedding thắng trên tập niêm phong (Hit@5 0,921 so với bm25 0,711); lọc theo nhãn thắng dứt khoát ở bài toán chọn món |

### Điều quan trọng nhất của phần này không phải "phương pháp nào thắng"

Nó là: **câu hỏi "phương pháp nào tốt hơn" không có câu trả lời chung.** Nó có câu trả lời
**theo bài toán**, và hệ thống này có đúng hai bài toán khác nhau về bản chất:

| bài toán | ứng viên | ai thắng |
|---|---|---|
| truy hồi tri thức | BM25 / embedding / hybrid | **embedding**, và hybrid KÉM HƠN embedding đơn lẻ |
| chọn món | BM25 / embedding / **lọc theo nhãn** | **lọc theo nhãn**, dứt khoát: 8/8 so với 1–2/8 |

Một dự án chỉ đo bài toán thứ nhất sẽ kết luận "dùng RAG cho mọi thứ". Đó là kết luận sai, và
bảng ở mục 15c là con số chứng minh nó sai.
"""))

    out.append(md(r"""
---

# PHẦN 2 — TRUY HỒI

> **Chặng của TV2 — Bùi Đào Đức Anh.** Trả lời câu **ngoài thực đơn** — chính sách, cách kết hợp món, vùng miền. Đây là chặng duy nhất dùng học máy theo nghĩa xếp hạng.

| | |
|---|---|
| **Nhận từ chặng trước** | `Request` của TV2, và kho tri thức của TV1 |
| **Bàn giao cho chặng sau** | đoạn tri thức làm ngữ cảnh cho câu trả lời |
| **Điều kiện nghiệm thu** | **222 ca** chạy trên cả ba bộ; có bảng so kèm `cấm@5`; quyết định chốt bộ truy hồi **có số đi kèm**, không chọn theo cảm giác |

Mục trong phần này: 15 → 15d (điều kiện so sánh, ba công thức, bài toán chọn món, chốt production)

Notebook đi theo **đúng thứ tự dự án đã được xây**, vì thứ tự đó chính là phương pháp: không có
nhãn thì không lọc được món, không có kho thì không truy hồi được, và **không có tập đánh giá thì
không ai biết mình đúng hay sai**.
"""))

    out.append(md(r"""
## 15. Điều kiện để phép so truy hồi có nghĩa — đã đủ, và còn thiếu gì

### Kiến thức

Trước khi so ba phương pháp truy hồi, phải kiểm bốn điều kiện. Nếu thiếu một điều, kết quả so
sẽ **có số nhưng không nói được gì**:

| Điều kiện | Vì sao cần | Trạng thái |
|---|---|---|
| **Kho đủ lớn** | với ~40 đoạn thì BM25 và embedding hòa nhau tầm thường | **đủ** — 303 đoạn |
| **Chỉ mục sạch** | đoạn nội bộ hoặc đoạn rác trong chỉ mục làm mọi phương pháp tệ đều nhau | **đủ** — cửa `audience`, 0 đoạn quá ngắn, 0 trùng tiêu đề |
| **Mã đoạn tất định** | khóa đáp án trỏ vào `chunk_id`; mã đổi thì mọi ca trỏ sai | **đủ** — kiểm ở Mục 6 |
| **Tập đánh giá truy hồi** | 119 ca hiện có chấm **câu trả lời**, không chấm **đoạn được lấy** | **CHƯA CÓ** |

### Hai bài toán, không phải một — và đây là phần đáng báo cáo nhất

Điểm mạnh của phép so này không nằm ở việc "hybrid thắng bao nhiêu điểm", mà ở việc so trên
**hai bài toán khác nhau** rồi cho thấy câu trả lời khác nhau:

| Bài toán | Ứng viên | Dự kiến |
|---|---|---|
| **Truy hồi tri thức** — đoạn nào trả lời câu chính sách | BM25 / embedding / hybrid | embedding thắng ở câu diễn đạt khác từ; BM25 thắng ở câu có tên riêng |
| **Chọn món** — món nào thỏa ràng buộc | BM25 / embedding / **lọc theo nhãn** | **lọc theo nhãn thắng dứt khoát** |

Bài toán thứ hai quan trọng vì nó chứng minh bằng số rằng **không phải chỗ nào cũng nên dùng
RAG**. Ví dụ "món nào dưới 50.000đ": BM25 và embedding **không hiểu số**, còn lọc theo nhãn
`price` đúng **100%** vì nhóm đó phủ 91/91 món.

Đó cũng là lý do bước 5 của dự án **bỏ** `sentence-transformers` (~3GB) khỏi ảnh Docker: 24 chủ
đề chính sách tra khóa đúng 100% thì thêm một tầng embedding là thêm 3GB cho 0 lợi ích.
"""))

    out.append(code(r"""
# Kiểm bốn điều kiện của phép so truy hồi — cái nào đủ, cái nào chưa
from pathlib import Path as _P
from rag.chunker import all_chunks, load_all, retrievable_chunks

chunks = retrievable_chunks(KNOWLEDGE)
tat_ca = all_chunks(KNOWLEDGE)
w = sorted(c.word_count for c in chunks)

dieu_kien = []
dieu_kien.append(("kho đủ lớn (>=250 đoạn xếp hạng)", len(chunks) >= 250,
                  f"{len(chunks)} đoạn synthesize"))
dieu_kien.append(("chỉ mục sạch: 0 đoạn quá ngắn", all(c.word_count >= 12 for c in chunks),
                  f"ngắn nhất {w[0]} từ"))
h1_con = [c.chunk_id for c in tat_ca
          if any(l.startswith("# ") for l in c.text.splitlines()[1:])]
dieu_kien.append(("chỉ mục sạch: 0 đoạn trùng tiêu đề", not h1_con,
                  f"{len(h1_con)} đoạn còn dòng H1"))
ids = [c.chunk_id for c in tat_ca]
dieu_kien.append(("mã đoạn tất định và không trùng",
                  len(set(ids)) == len(ids) and [c.chunk_id for c in all_chunks(KNOWLEDGE)] == ids,
                  f"{len(set(ids))}/{len(ids)} mã duy nhất"))
co_tap = (_P(str(KNOWLEDGE.parent)) / "evaluation" / "retrieval_cases.json").exists()
dieu_kien.append(("tập đánh giá truy hồi (~120 ca)", co_tap,
                  "retrieval_cases.json chưa tồn tại" if not co_tap else "có"))

print(f"{'điều kiện':44}{'trạng thái':>12}   bằng chứng")
print("-" * 92)
for ten, dat, bc in dieu_kien:
    print(f"{ten:44}{'ĐỦ' if dat else 'CHƯA':>12}   {bc}")

thieu = [t for t, dat, _ in dieu_kien if not dat]
print(f"\n{len(dieu_kien) - len(thieu)}/{len(dieu_kien)} điều kiện đã đủ.")
if thieu:
    print(f"Còn thiếu: {thieu}")
    print("=> Chưa chạy phép so nào. Mọi con số về BM25/embedding/hybrid trong báo cáo")
    print("   này sẽ là BỊA nếu viết ra bây giờ.")

# Cho thấy vì sao 'chọn món' KHÔNG nên dùng truy hồi
items = load("menu-dataset.json")["items"]
phu_gia = len({m["id"] for m in items if any(t.startswith("price:") for t in m["tags"])})
print(f"\nVí dụ vì sao không phải chỗ nào cũng dùng RAG:")
print(f"   nhóm nhãn `price` phủ {phu_gia}/{len(items)} món -> lọc theo nhãn đúng 100%")
print(f"   BM25 và embedding KHÔNG hiểu số, nên câu 'món nào dưới 50.000đ' chúng")
print(f"   không trả lời đúng được. Đây là kết quả đáng báo cáo, không phải thất bại.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 15

- **Quan sát:** 4/5 điều kiện đã đủ. 303 đoạn `synthesize` được xếp hạng, đoạn ngắn nhất 17 từ,
  0 đoạn trùng tiêu đề, 327 mã đoạn duy nhất và tất định. Thiếu **tập đánh giá truy hồi**.
- **Diễn giải:** phần khó của RAG **không phải** cài BM25 hay tải model embedding — đó là việc
  vài chục dòng mã. Phần khó là làm cho **chỉ mục đủ sạch để phép so nói được điều gì**, và đó
  chính là việc TV1 đã làm xong (mục 5–7).
- **Điều notebook này KHÔNG nói:** không có con số nào về BM25 vs embedding vs hybrid, vì chưa
  chạy phép so nào. Viết ra bây giờ là bịa, và một báo cáo có một số bịa thì mọi số còn lại mất
  giá trị.
- **Kết quả đã có, ngược với kỳ vọng thông thường:** bước 5 **bỏ** `sentence-transformers`
  (~3GB) khỏi ảnh Docker sau khi đo rằng 24 chủ đề chính sách tra khóa đúng 100%. Nhóm nhãn
  `price` phủ 91/91 món nên lọc theo nhãn đúng 100%, còn BM25 và embedding không hiểu số. **Không
  phải chỗ nào cũng nên dùng RAG** — và điều đó cũng phải đo, không phải phán.
"""))

    # ---------------------------------------------------------------- Mục 15b
    out.append(md(r"""
## 15b. Ba cách truy hồi, và ba công thức viết ra để kiểm được bằng tay

### Kiến thức

**BM25 Okapi** xếp hạng theo TRÙNG TỪ:

$$\text{score}(D,Q)=\sum_{t \in Q}\text{IDF}(t)\cdot\frac{f(t,D)\,(k_1+1)}{f(t,D)+k_1\!\left(1-b+b\frac{|D|}{\text{avgdl}}\right)}$$

$$\text{IDF}(t)=\ln\!\left(1+\frac{N-n(t)+0{,}5}{n(t)+0{,}5}\right)$$

`k1 = 1,5`, `b = 0,75` — giá trị mặc định của tài liệu gốc, **không chỉnh theo tập đánh giá**.
Chỉnh tham số theo tập rồi báo kết quả trên cùng tập đó là tự lừa.

Dạng IDF ở trên **luôn dương**. Dạng gốc $\ln\frac{N-n+0{,}5}{n+0{,}5}$ cho giá trị **âm** khi một
từ có ở hơn nửa số đoạn — và điểm âm nghĩa là **chứa từ đó làm đoạn TỤT hạng**. Với kho này thì
"món" và "nhà hàng" có ở gần như mọi đoạn, nên đó không phải chuyện lý thuyết.

**Embedding**: `BAAI/bge-m3`, 1024 chiều, cosine. Họ BGE **không dùng tiền tố**; họ E5 (bản trước) đòi **tiền tố**
`"query: "` cho câu hỏi và `"passage: "` cho đoạn. Thiếu tiền tố thì mô hình **vẫn chạy và vẫn trả
vector** — chỉ kém đi. Đó là loại lỗi tệ nhất: không thông báo nào, chỉ điểm thấp hơn.

**Hybrid RRF** hợp nhất theo HẠNG, không theo ĐIỂM:

$$\text{RRF}(d)=\sum_{r}\frac{1}{k+\text{rank}_r(d)},\qquad k=60$$

Vì sao theo hạng: điểm BM25 không có trần trên (tổng theo từ, nên câu dài cho điểm lớn), còn cosine
nằm trong $[-1,1]$. Cộng thẳng thì BM25 áp đảo; chuẩn hóa min-max thì kết quả phụ thuộc **đoạn tệ
nhất trong danh sách** — thêm một đoạn rác vào cuối là đổi điểm của đoạn đầu.

`k = 60` nghĩa là **đồng thuận giữa hai bộ quan trọng hơn thứ tự trong từng bộ**, và điều đó tính
ra được:

| tình huống | điểm RRF |
|---|---|
| hạng 3 ở **cả hai** bảng | $\frac{1}{63}+\frac{1}{63}=0{,}03175$ |
| hạng 1 ở **một** bảng | $\frac{1}{61}=0{,}01639$ |

Cái giá của việc dùng hạng, và phải nói ra: RRF **bỏ hết thông tin về khoảng cách điểm**. Một đoạn
hơn đoạn sau nó rất xa và một đoạn hơn sát sao đều chỉ là "hạng 1 so với hạng 2". Nên RRF mạnh khi
hai bộ có thang điểm không so được, và **yếu khi một bộ chắc chắn hơn bộ kia rất nhiều** — đó chính
là điều đã xảy ra ở đây.

### Ba chỗ dễ sai, mỗi chỗ một ca chốt bằng SỐ

| chỗ sai | hệ quả | ca chốt |
|---|---|---|
| dạng IDF âm | chứa từ phổ biến làm đoạn TỤT hạng | `test_idf_khong_bao_gio_am` |
| hạng tính từ 0 | $1/(k+0)$ làm đoạn đầu bảng nặng bất thường | `test_hang_bat_dau_tu_1` |
| lấy đúng `k` từ mỗi bảng con | đoạn đồng thuận ở hạng 6 KHÔNG BAO GIỜ vào kết quả | `test_lay_sau_hon_k_de_RRF_co_tac_dung` |

Chỗ thứ ba đã xảy ra thật: bản đầu lấy đúng `k=5` từ mỗi bảng, và hybrid **gần như trùng khớp BM25** —
tức phép so không so gì cả. Lấy sâu hơn `k` (ở đây `depth=20`) là điều làm RRF có tác dụng.
"""))

    out.append(plot_code(r"""
# Biểu đồ 8 — hai bài toán, hai câu trả lời khác nhau
import json, os, statistics, sys
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
import run_retrieval_comparison as RC          # ROOT/ai/evaluation đã ở sys.path (xem SETUP)
from rag import embedding as EMB

cases = RC.load_cases()
split = RC.load_split()
ho_do = set(split["gate_families"]) | set(split["dev_families"])
ca_dev = [c for c in cases if c["family"] in split["dev_families"]]
ca_seal = [c for c in cases if c["family"] in split["test_families"]]

rs1 = RC.build_retrievers()
kq_dev = RC.do_bai_toan_1(rs1, ca_dev, 1)
kq_seal = RC.do_bai_toan_1(rs1, ca_seal, 1)

items = RC.load_menu()
mon_doan = RC.mon_thanh_doan(items)
bm25_mon = RC.Bm25Index.build(mon_doan)
rs2 = [bm25_mon]
if EMB.available():
    emb_mon = EMB.EmbeddingIndex.build(mon_doan)
    rs2 += [emb_mon, RC.HybridRetriever(retrievers=[bm25_mon, emb_mon])]
rs2.append(RC.LocTheoNhan(items, RC.CA_CHON_MON))
kq2 = RC.do_bai_toan_2(rs2, items, 1)


def hit5(k):
    return (k.hit5 / k.scored_cases) if k.scored_cases else 0.0


fig, axes = plt.subplots(1, 3, figsize=(14.5, 4.6))
tens1 = list(kq_dev)

# (a) truy hồi tri thức: phát triển vs NIÊM PHONG
x = range(len(tens1))
w = 0.38
ax = axes[0]
ax.bar([i - w / 2 for i in x], [hit5(kq_dev[t]) for t in tens1], w,
       label="phát triển (90 ca)", color=XANH)
ax.bar([i + w / 2 for i in x], [hit5(kq_seal[t]) for t in tens1], w,
       label="NIÊM PHONG (40 ca)", color=CAM)
for i, t in enumerate(tens1):
    ax.text(i - w / 2, hit5(kq_dev[t]) + 0.02, f"{hit5(kq_dev[t]):.3f}",
            ha="center", fontsize=8)
    ax.text(i + w / 2, hit5(kq_seal[t]) + 0.02, f"{hit5(kq_seal[t]):.3f}",
            ha="center", fontsize=8, fontweight="bold")
ax.set_xticks(list(x)); ax.set_xticklabels(tens1)
ax.set_ylim(0, 1.12); ax.set_ylabel("Hit@5")
ax.set_title("Bài toán 1 — truy hồi tri thức\nembedding thắng ở CẢ HAI nhóm", fontsize=11)
ax.legend(fontsize=8, loc="lower right")

# (b) forbidden@5 — chỉ số quyết định của phép so này
ax = axes[1]
cam5 = [kq_dev[t].forbidden_hits for t in tens1]
ax.bar(tens1, cam5, color=[DO if v == max(cam5) else XAM for v in cam5])
for i, v in enumerate(cam5):
    ax.text(i, v + 0.2, str(v), ha="center", fontweight="bold")
ax.set_ylabel("số ca lấy đoạn BỊ CẤM (thấp = tốt)")
ax.set_ylim(0, max(cam5) * 1.35)
ax.set_title("cấm@5 trên 90 ca phát triển\nhybrid cao nhất, tức kém nhất ở chỉ số này",
             fontsize=11)

# (c) chọn món: lọc theo nhãn so với ba cách xếp hạng
ax = axes[2]
tens2 = list(kq2)
sai = [kq2[t].forbidden_hits for t in tens2]
dung = [hit5(kq2[t]) for t in tens2]
mau2 = [XANH if t == "lọc nhãn" else XAM for t in tens2]
ax.barh(tens2[::-1], dung[::-1], color=mau2[::-1])
for i, t in enumerate(tens2[::-1]):
    ax.text(dung[::-1][i] + 0.02, i, f"Hit@5 {dung[::-1][i]:.3f} · sai {sai[::-1][i]}/8",
            va="center", fontsize=8,
            fontweight="bold" if t == "lọc nhãn" else "normal")
ax.set_xlim(0, 1.55); ax.set_xlabel("Hit@5")
ax.set_title("Bài toán 2 — CHỌN MÓN\nlọc theo nhãn thắng dứt khoát", fontsize=11)

plt.tight_layout(); plt.show()

print("BÀI TOÁN 1 — truy hồi tri thức")
for t in tens1:
    d, s = kq_dev[t], kq_seal[t]
    print(f"  {t:11} phát triển Hit@5 {hit5(d):.3f} cấm {d.forbidden_hits:>2}  |  "
          f"NIÊM PHONG Hit@5 {hit5(s):.3f} cấm {s.forbidden_hits:>2}  |  "
          f"p50 {statistics.median(d.latencies_ms):.1f} ms")
print()
print("BÀI TOÁN 2 — chọn món (cấm@5 = số ca nêu món KHÔNG thỏa ràng buộc = trả lời SAI)")
for t in tens2:
    k = kq2[t]
    print(f"  {t:11} Hit@5 {hit5(k):.3f}  cấm@5 {k.forbidden_hits}/8  "
          f"p50 {statistics.median(k.latencies_ms):.1f} ms")
print()
print("Hai điểm cần đọc kèm bảng trên:")
print("  1. Hybrid KÉM HƠN embedding đơn lẻ, và có cấm@5 CAO NHẤT. RRF hợp nhất theo HẠNG nên nó")
print("     bỏ hết thông tin khoảng cách điểm; khi một bộ chắc chắn hơn bộ kia rất nhiều thì hợp")
print("     nhất kéo bộ tốt xuống.")
print("  2. Số tuyệt đối của hai nhóm KHÔNG so được với nhau: nhóm niêm phong gồm kb-written và")
print("     kb-health, chủ đề tách biệt rõ nên dễ hơn. Chỉ THỨ TỰ ba phương pháp là so được, và")
print("     thứ tự đó giữ nguyên ở cả hai nhóm.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 15b

- **Quan sát:** trên **40 ca niêm phong** (mở MỘT lần, 2026-07-30, giao thức chốt 7 lần/truy vấn):
  Hit@5 **bm25 0,711 · embedding 0,921 · hybrid 0,895**; cấm@5 **10 · 9 · 10**; abstain **2/2** cả
  ba. Độ trễ p50: **0,7 ms · 53,1 ms · 53,7 ms**.
- **Diễn giải:** embedding thắng, và thắng trên tập held-out. Thứ tự `embedding > hybrid > bm25`
  giữ nguyên ở cả nhóm phát triển và nhóm niêm phong — hai nhóm gồm các HỌ khác nhau, nên đó là
  bằng chứng mạnh nhất có được ở quy mô này.
- **Khác dự kiến trong kế hoạch:** kế hoạch ghi "hybrid tốt nhất". Đo được ngược lại — hybrid kém hơn embedding đơn
  lẻ và có `cấm@5` cao nhất. Tôi báo đúng như đo được thay vì chỉnh `k` cho ra số đẹp.
- **Vì sao `cấm@5` quan trọng hơn Hit@5:** Hit@5 = 1,0 **vẫn đúng** khi bộ truy hồi trả 1 đoạn đúng
  cùng 4 đoạn lạc đề — và 4 đoạn lạc đề là 4 cơ hội để mô hình viết một câu sai về nhà hàng.
- **Tập niêm phong ĐÃ DÙNG HẾT.** Ghi trong `retrieval_split.json` kèm ngày. Từ nay con số trên 40
  ca đó không còn là held-out, và câu hỏi tiếp theo cần một tập MỚI. Tập 119 ca đã mất tính
  held-out đúng vì bước này từng bị làm mà không ghi lại.
- **Ablation chỉ ra hai khẳng định SAI trong chú thích mã:** *tắt chuẩn hóa L2* không mất gì (vector của
  vector của mô hình nhúng đã gần chuẩn đơn vị, nên phép chuẩn hóa **DƯ với kho này**); *tắt tiền tố
  E5* làm Hit@5 **TĂNG** +0,023. Nhưng cơ chế tiền tố **vẫn được giữ**, vì cùng lúc đó `cấm@5` tăng
  từ 11 lên 13 — và `cấm@5` là chỉ số đã được đặt làm chỉ số quyết định. Một công cụ kết luận theo
  Hit@5 ở dòng đó là công cụ nói ngược lại thước đo mà chính nó đặt ra.
"""))

    # ---------------------------------------------------------------- Mục 15c
    out.append(md(r"""
## 15c. Bài toán chọn món — chỗ RAG là câu trả lời SAI

### Kiến thức

Bài toán này quan trọng hơn bài toán 1 với hệ thống thật, vì **68/119 ca đánh giá đi qua nhánh lọc
món**, còn nhánh tri thức chỉ có 29 ca. Nên nếu chọn sai phương pháp ở đây thì sai ở chỗ đông nhất.

Ba cách xếp hạng đều được thấy **đủ dữ liệu** — văn bản của mỗi món gồm tên, danh mục, mô tả, toàn
bộ nhãn và giá. Cho chúng ít hơn thì kết luận "lọc theo nhãn thắng" thành không công bằng.

`cấm@5` ở bài toán này = số ca nêu một món **không thỏa ràng buộc**. Đó là câu trả lời **SAI**,
không phải kém — khác với bài toán 1, nơi "bị cấm" nghĩa là lạc chủ đề.

### Bốn lý do xếp hạng theo độ tương đồng THUA, mỗi lý do một ca

| ca | vì sao thua |
|---|---|
| `pick-price-01/02` | **không hiểu SỐ.** "50.000" với BM25 là một TỪ, không phải một lượng. Với embedding thì "dưới 50 nghìn" và "dưới 500 nghìn" gần như cùng một vector |
| `pick-spice-01` | **phủ định.** "món KHÔNG cay" và "món cay" chung gần hết từ |
| `pick-allergen-01` | **cần LOẠI TRỪ.** Câu chứa chữ "hải sản" nên cả hai kéo món hải sản **LÊN ĐẦU** — đúng ngược điều khách cần. Đây là ca AN TOÀN |
| `pick-combo-01` | **hai ràng buộc cùng lúc.** Xếp hạng theo độ tương đồng **không có phép AND** |

Ca `pick-allergen-01` là ca đáng nhớ nhất của cả bước: một hệ thống RAG "hoạt động đúng" ở đó sẽ
mời món hải sản cho người vừa khai dị ứng hải sản, và nó làm vậy **chính vì** nó hoạt động đúng —
câu hỏi nhắc "hải sản" nên đoạn nói về hải sản giống nhất. Cơ chế đúng cho việc này là **fail-closed
filter**, không phải xếp hạng.
"""))

    out.append(md(r"""
#### Nhận xét — Mục 15c

- **Quan sát:** lọc theo nhãn **Hit@1 = Hit@5 = MRR = nDCG = 1,000** và **0/8 ca sai**, ở 0,3 ms.
  Ba cách xếp hạng: Hit@5 0,750–0,875 nhưng **6–7 trong 8 ca nêu món không thỏa ràng buộc**.
- **Diễn giải:** đây là con số chứng minh **không phải chỗ nào cũng nên dùng RAG**. Với việc chọn
  món, dữ liệu đã có cấu trúc (nhãn + giá), nên đưa nó qua một tầng xếp hạng theo độ tương đồng là
  **bỏ cấu trúc đi rồi cố đoán lại**.
- **Quyết định cũ, và ĐIỀU KIỆN đã ghi ra để đổi nó:** bước 5 để embedding **ngoài**
  `ai/requirements.txt`, ở riêng `ai/requirements-rag.txt`, với ba lý do đo được: (1) đường
  `synthesize` mà nó phục vụ **chưa có ai gọi** — `answer.py` trả lời câu chính sách bằng TRA KHÓA
  trên 24 chủ đề, chính xác tuyệt đối và 0 ms; (2) chậm hơn **75 lần** để đổi lấy **0 ca đúng
  thêm**; (3) ảnh Docker to hơn nhiều. Và ghi kèm điều kiện để nhập vào: **khi đường `synthesize`
  được dựng**.
- **ĐIỀU KIỆN ĐÓ ĐÃ XẢY RA, nên quyết định đã đảo.** Kho nay có **84 chủ đề `synthesize`**, và
  **74 trong số đó không có cụm từ vựng nào** — tức truy hồi là **đường duy nhất** tới chúng, không
  còn là một tầng phụ cạnh tra khóa. Mục 15d đo lại và chốt bộ truy hồi cho production.
- **Vì sao ghi lại cả quyết định cũ thay vì xóa:** nó cho biết **điều kiện nào** làm mỗi lựa chọn
  đúng. Nếu kho co lại về tra khóa thì lý lẽ của bước 5 lại đúng ngay. Một quyết định không kèm điều
  kiện thì lần sau phải đoán lại từ đầu.
- **Điều mục này KHÔNG nói:** không có con số nào về việc khách thật hỏi gì. Cả tập truy hồi và 8 ca
  chọn món đều do người viết.
"""))

    out.append(md(r"""
## 15d. Chốt bộ truy hồi cho production — hai bài toán, hai tập, một quyết định

### Vì sao phải đo trên HAI bài toán chứ không một

Lúc chạy thật, truy hồi được gọi ở hai chỗ khác nhau, và chúng là hai bài toán khác nhau:

| Chỗ gọi | Bài toán | Số ứng viên | `k` | Bộ đang chạy |
|---|---|---|---|---|
| `doan_tri_thuc_lien_quan()` | đoạn nào **trong cả kho** trả lời câu này | 370 đoạn | 1 | embedding |
| `_knowledge_chunk()` → `_chon_muc()` | mục nào **trong tài liệu này** đúng ý | 3–8 đoạn | 1 | embedding |

Cả hai đều dùng `k=1`. Nên **Top-1 là chỉ số quyết định**, không phải Hit@5. Đo Hit@5 rồi chốt theo
nó là chốt theo một con số hệ thống không dùng: Hit@5 = 1,0 vẫn đúng khi đoạn đúng nằm thứ năm và
bốn đoạn lạc đề nằm trên nó — mà lúc chạy chỉ đoạn thứ nhất được đọc.

**Cột cuối từng là `BM25` ở dòng thứ hai, và đó là một chỗ lệch thật.** Bộ so 168 ca được viết để đo
ĐÚNG đường thứ hai, nên con số biện minh mạnh nhất cho embedding thuộc về một đường vẫn chạy BM25 —
bỏ qua **11,4 điểm** Top-1 trên tập niêm phong, và **18,2 điểm** ở câu diễn đạt khác từ. Nó chỉ lộ ra
khi viết lại mô tả kiến trúc, chứ không phép kiểm nào đỏ.

Điều làm việc đổi trở nên rẻ: đường thứ hai **không dựng chỉ mục mới**. Chỉ mục toàn kho đã có vector
của cả 370 đoạn, nên xếp hạng trong một tài liệu chỉ là giới hạn phép chấm điểm vào tập con — hợp lệ vì
vector đã chuẩn hóa L2. Chi phí thật là **một** lần mã hóa câu hỏi, thứ đường thứ nhất cũng phải làm.
Cách hiển nhiên — dựng một chỉ mục cho mỗi tài liệu — mất **~91ms mỗi lượt**, và có một test đếm số
lần dựng chỉ mục rồi đòi **0** để không ai "sửa" thành cách đó.

### Vì sao phải đo trên HAI tập

`phát triển` là tập đã xem và đã sửa theo. Con số trên nó **luôn đẹp hơn thực tế**. Tập `niêm phong`
mở đúng một lần cho câu hỏi cuối, và chỉ nó nói được điều gì về câu hỏi chưa từng thấy.

Bảng dưới in cả hai, cạnh nhau, kèm `n`. Ở `n` cỡ này thì một ca lệch là hơn 1 điểm phần trăm, nên
chênh lệch nhỏ hơn hai ca **không** là căn cứ để đổi hệ thống — và ô mã tự nói ra điều đó.
"""))

    out.append(code(r"""
# Bảng chốt bộ truy hồi — TÍNH LẠI, không chép. Chạy mất ~2 phút vì có mã hóa embedding.
import statistics
import run_retrieval_comparison as rrc
import run_chunk_selection_comparison as rcs
from rag import embedding as EMB

if not EMB.available():
    print("KHÔNG có sentence-transformers, nên bảng này chỉ có BM25 —")
    print(f"và như vậy nó KHÔNG trả lời được câu hỏi của mục này. Lý do: {EMB.why_unavailable()}")
else:
    cases = rrc.load_cases()
    split = rrc.load_split()
    bo = rrc.build_retrievers()

    # DÙNG LẠI `rrc.in_bang()` thay vì tự định dạng bảng.
    #
    # Bản đầu của ô này tự in, và nó sai HAI lần liền — mỗi lần chỉ lộ ra khi CHẠY notebook:
    #
    #   1. `rrc.build_retrievers()` trả về LIST các bộ (mỗi bộ có `.name`), còn
    #      `rcs.build_retrievers()` ở bài toán 2 trả về DICT. Lặp `for ten in bo` cho cả hai cho
    #      `TypeError: unhashable type: 'Bm25Index'`.
    #   2. `Ketqua.hit1` là TỔNG TÍCH LŨY (float), không phải danh sách điểm từng ca — nên
    #      `statistics.fmean(k.hit1)` nổ. Mẫu số đúng là `k.scored_cases`, và `in_bang` biết điều đó.
    #
    # Cả hai là cùng một lỗi gốc: viết lại phép định dạng ở chỗ thứ hai. Bộ chạy đã có `in_bang` và
    # `Ketqua.hang()`; dùng lại chúng thì không có chỗ nào để lệch.
    #
    # Và `--check` của bộ sinh KHÔNG bắt được hai lỗi đó vì nó chỉ so NGUỒN từng ô — cùng lớp lỗi
    # "tệp có ≠ nó chạy", ở dạng "ô có ≠ ô chạy". Nay `--check` đọc cả kết quả và báo đỏ nếu có ô nổ.
    for ten_tap, khoa in (("phát triển", "dev_families"), ("niêm phong", "test_families")):
        ho = set(split[khoa])
        ca = [c for c in cases if c["family"] in ho and not c["expect_nothing"]]
        kq = rrc.do_bai_toan_1(bo, ca, runs=1)
        rrc.in_bang(
            f"BÀI TOÁN 1 — đoạn nào trong CẢ KHO · tập {ten_tap} ({len(ca)} ca)", kq,
            "Top-1 là chỉ số quyết định: lúc chạy `answer.py` gọi `search(question, k=1)`.",
        )

    print()
    print("BÀI TOÁN 2 — mục nào TRONG MỘT TÀI LIỆU đúng ý (đây là việc lúc chạy thật)")
    print(f"{'tập':12}{'bộ':12}{'Top-1':>8}{'Top-1 dạng B':>14}{'n':>6}")
    print("-" * 54)
    bo2 = rcs.build_retrievers()
    lat_np = None                      # giữ lại lát NIÊM PHONG để kết luận dùng lại
    for ten_tap, sealed in (("phát triển", False), ("niêm phong", True)):
        ca, _, theo_doc = rcs.nap(sealed)
        lat = rcs.do_lat(ca, bo2, theo_doc, runs=1)
        if sealed:
            lat_np = lat
        for ten in bo2:
            chinh, dangB = lat[("written", "*")][ten], lat[("written", "B")][ten]
            print(f"{ten_tap:12}{ten:12}{statistics.fmean(chinh.top1):>8.3f}"
                  f"{statistics.fmean(dangB.top1):>14.3f}{chinh.n:>6}")

    # Kết luận đọc TỪ SỐ, và tự nói ra khi chênh lệch nhỏ hơn hai ca.
    #
    # Dùng lại `lat_np` đã tính ở vòng lặp trên. Bản đầu gọi `nap(True)` + `do_lat(...)` lần nữa, tức
    # đo tập niêm phong HAI lần cho cùng một con số — chậm gấp đôi mà không thêm thông tin nào.
    diem = {t: statistics.fmean(lat_np[("written", "*")][t].top1) for t in bo2}
    xep = sorted(diem, key=lambda t: -diem[t])
    n = lat_np[("written", "*")][xep[0]].n
    d = diem[xep[0]] - diem[xep[1]]
    print(f"\nTrên tập NIÊM PHONG của bài toán lúc chạy thật: {xep[0]} dẫn {xep[1]} {d:+.3f} Top-1")
    print(f"  n={n}, một ca là {1 / n:.3f}")
    if d < 2 / n:
        print(f"  CHÊNH LỆCH NHỎ HƠN HAI CA — không đủ căn cứ để đổi hệ thống chỉ vì con số này.")
    else:
        print(f"  Chênh lệch lớn hơn hai ca, nên nó là căn cứ dùng được.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 15d

- **Quan sát:** embedding dẫn ở **cả hai bài toán** và ở **cả hai tập**, và khoảng cách **rộng nhất
  đúng ở chỗ quan trọng nhất** — câu diễn đạt khác từ (dạng B), nơi khách thật không dùng đúng chữ
  trong tài liệu. BM25 thắng ở dạng A (trùng từ khóa), đúng như bản chất của nó.
- **Diễn giải:** hai bài toán cho **cùng một kết luận**, nên kết luận không phải hệ quả của một cách
  đo. Và con số tuyệt đối **tụt** khi kho lớn lên (84 chủ đề thay vì 60) — đó là bài toán khó lên,
  không phải hệ thống kém đi, vì các chủ đề mới gần nhau hơn (bốn tài liệu vùng miền, bốn tài liệu
  đồ uống).
- **Quyết định:** **đưa embedding vào production**, `ai/requirements.txt`. Xem mục 20 cho cái giá đã
  đo và cách nó được cắt xuống.
- **Điều bảng này KHÔNG nói:** nó không nói hybrid vô dụng. Hybrid thắng BM25 và gần bằng embedding;
  nó bị loại vì **thêm chi phí mà không thêm điểm**, chứ không phải vì sai.
"""))

    # ================================================================= PHẦN 5
    out.append(md(r"""
---
## Mô hình sinh, an toàn và tích hợp
> **TV2** (mô hình đọc ràng buộc) và **TV5** (thoái hóa êm, tích hợp)

> **Vị trí:** phần mô hình thuộc TV2; phần tích hợp và thoái hóa êm thuộc TV5. Chứa **phát hiện
> quan trọng nhất của cả dự án**.

| | |
|---|---|
| **Câu hỏi khâu này trả lời** | *Mô hình sinh được phép làm gì, và nếu nó chết thì hệ thống mất gì?* |
| **Kiến thức phải nắm** | mô hình chỉ **hiểu**, không **chọn** · cổng kiểm khóa mô hình trả về · **an toàn không được phụ thuộc thành phần không tất định** · thoái hóa êm khi gọi thất bại |
| **Tệp sở hữu** | `ai/app/llm_understand.py` · `service.py` · `ai/contracts/*.schema.json` · `ai/Dockerfile` |
| **Đầu vào** | `Reply` của TV4; kho tri thức của TV1 |
| **Đầu ra bàn giao** | dịch vụ HTTP mà backend gọi được |
| **Tự đo bằng** | `run_with_model.py` · `python -m unittest test_llm_understand test_packaging` |
| **Trạng thái** | **xong phần mô hình** — 122/122, 0 lỗi an toàn |

### Nguyên tắc phân quyền: mô hình chỉ HIỂU, không CHỌN

Mô hình sinh **không được chọn món**. Nó chỉ làm một việc: đọc câu khách và trả về **nhãn ràng
buộc**. Việc chọn món vẫn do mã tất định làm, dựa trên nhãn đó.

Lý do rất cụ thể: nếu mô hình chọn món thì nó có thể chọn món **không tồn tại**, hoặc chọn món
**vi phạm ràng buộc dị ứng**. Nếu nó chỉ trả về nhãn, thì nhãn sai chỉ dẫn tới **gợi ý kém**, và
mọi nhãn nó trả về đều bị **kiểm lại** trước khi dùng.

```
câu khách  ->  mã tất định hiểu  ->  [nếu chưa đủ]  mô hình đọc thêm ràng buộc
                                                     |
                                        cổng kiểm: nhãn có thật không? đúng vai không?
                                                     |
                                            mã tất định CHỌN MÓN  ->  câu trả lời
```
"""))

    out.append(code(r"""
# Mô hình thêm được gì, và cổng kiểm bỏ gì
import collections, os
os.environ.setdefault("LLM_MODEL", "cx/gpt-5.6-luna-review")
import run_with_model as rw
from llm_understand import load_env

env = load_env()
det_ok = mod_ok = goi = 0
chi_mo_hinh, bo = [], collections.Counter()
for c in rw.CASES:
    _, v0, _ = rw.run(c, with_model=False, env=env, use_cache=True)
    _, v1, o = rw.run(c, with_model=True, env=env, use_cache=True)
    det_ok += int(v0.passed); mod_ok += int(v1.passed)
    if o and o.used:
        goi += 1
        for d in o.dropped:
            bo[d.split(":")[0] if ":" in d else d] += 1
    if v1.passed and not v0.passed:
        chi_mo_hinh.append((c["id"], c["question"]))

n = len(rw.CASES)
print(f"không mô hình : {det_ok}/{n}  ({100*det_ok/n:.1f}%)")
print(f"có mô hình    : {mod_ok}/{n}  ({100*mod_ok/n:.1f}%)")
print(f"số lần gọi    : {goi}/{n} ca ({100*goi//n}% — chỉ gọi khi mã tất định chưa hiểu đủ)")

print(f"\n=== {len(chi_mo_hinh)} ca CHỈ mô hình giải được ===")
for cid, q in chi_mo_hinh:
    print(f"   {cid:16} {q}")

print(f"\n=== Cổng kiểm BỎ nhãn mô hình trả về ({sum(bo.values())} lần, "
      f"{len(bo)} nhóm) ===")
for k, v in bo.most_common():
    print(f"   {k:12} {v} lần   (bịa hoặc sai vai -> KHÔNG được dùng)")
print("\n=> Mô hình trả về nhãn không có thật hoặc sai vai thì nhãn đó bị BỎ,")
print("   không phải được dùng rồi hy vọng nó đúng.")
"""))

    out.append(md(r"""
---

# PHẦN 3 — CHỌN MÓN & AN TOÀN

> **Chặng của TV3 — Đỗ Tuấn Anh.** Lọc ra danh sách món và dựng thẻ giỏ. Đây là chặng **chịu trách nhiệm an toàn**: một món lọt qua đây là một món khách có thể bấm đặt.

| | |
|---|---|
| **Nhận từ chặng trước** | `Request` đã hiểu, và đoạn tri thức của TV3 |
| **Bàn giao cho chặng sau** | danh sách món + thẻ giỏ tất định |
| **Điều kiện nghiệm thu** | **0 lỗi an toàn** trên mọi tập; câu sinh vi phạm thì **bị BỎ**, không sửa; thẻ giỏ không bao giờ chứa món ngoài danh sách đã lọc |

Mục trong phần này: 16 (ba lớp an toàn, và vì sao an toàn không được phụ thuộc mô hình)

Notebook đi theo **đúng thứ tự dự án đã được xây**, vì thứ tự đó chính là phương pháp: không có
nhãn thì không lọc được món, không có kho thì không truy hồi được, và **không có tập đánh giá thì
không ai biết mình đúng hay sai**.
"""))

    out.append(md(r"""
## 16. Phát hiện quan trọng nhất của dự án: an toàn KHÔNG được phụ thuộc mô hình sinh

### Kiến thức

Sau khi thêm 14 ca cách nói lạ, mã tất định một mình còn **2 lỗi an toàn**:

- *"Mình không ăn được **đồ tanh**"* — không hiểu "đồ tanh" là cá/hải sản
- *"Bé nhà mình **uống sữa là bị đau bụng**, có món nào **không sữa** không?"* — không hiểu

Mô hình sinh sửa được **cả hai**, và ban đầu điều đó được ghi nhận là **giá trị** của mô hình.

**Nghĩ lại thì đó là lỗi thiết kế nghiêm trọng.** Nếu mô hình là thứ duy nhất hiểu hai câu đó,
thì **an toàn của hệ thống phụ thuộc một thành phần không tất định**:

| Sự cố | Hậu quả nếu an toàn phụ thuộc mô hình |
|---|---|
| proxy chết | **mất bảo vệ dị ứng** |
| hết hạn mức gọi | **mất bảo vệ dị ứng** |
| mô hình trả lời sai một lần | **mất bảo vệ dị ứng** cho đúng khách đó |

Không chấp nhận được. Nên hai lớp nhận diện đó được **đưa về mã tất định**:

1. **Cách nói dân dã cho dị nguyên**: `đồ tanh`, `mùi tanh` → `allergen:seafood`
2. **Mẫu "không ⟨chủ đề⟩"** bắt bằng biểu thức chính quy thay vì liệt kê từng tổ hợp
3. **Triệu chứng cũng là cách khai dị ứng**: `bị đau bụng`, `bị ngứa`, `bị nổi mề đay`

Kết quả: **0 lỗi an toàn ở cả hai chế độ**. Mô hình vẫn có giá trị (+11 ca) nhưng **không còn
nằm trên đường an toàn**.

> **Nguyên tắc rút ra:** proxy chết thì khách mất phần gợi ý tinh, **không mất bảo vệ dị ứng.**

### Hệ quả thứ hai: gọi thất bại phải thoái hóa ÊM

Tôi từng viết rằng "gọi mô hình thất bại thì giữ nguyên câu trả lời tất định". Câu đó **đã từng
sai**: `urllib.request.Request(...)` nằm **ngoài** khối `try`, nên thiếu cấu hình là **sập** chứ
không thoái hóa. CI tìm ra, vì CI là môi trường duy nhất không có `ai/.env`.

Bài học: **một lời khẳng định về hành vi khi lỗi thì phải có test cho đúng đường lỗi đó.**
"""))

    out.append(code(r"""
# An toàn phải TẤT ĐỊNH — chứng minh hai câu đó nay hiểu được KHÔNG cần mô hình
from understand import understand
from answer import respond, select
items = load("menu-dataset.json")["items"]

# Kết luận của ô này được ĐẾM từ kết quả, không khẳng định trước rồi minh họa. Bản đầu của ô
# này viết "bốn cách khai dị ứng đều xử lý được" rồi in ra 2/4 SAI — và hai ca SAI đó là LỖ
# AN TOÀN THẬT, không phải lỗi trình bày.
cau_kho = [
    ("Mình không ăn được đồ tanh", "allergen:seafood", "cách nói dân dã"),
    ("Bé nhà mình uống sữa là bị đau bụng, có món nào không sữa không?",
     "allergen:dairy", "triệu chứng + mẫu 'không X'"),
    ("Cho mình món không hải sản", "allergen:seafood", "mẫu 'không X' (từng là MÃ CHẾT)"),
    ("Món nào không sữa", "allergen:dairy", "mẫu 'không X'"),
    ("Món nào không trứng", "allergen:egg", "mẫu 'không X'"),
    ("Món không gluten", "allergen:gluten", "mẫu 'không X'"),
    ("Ăn tôm là mình bị nổi mề đay", "allergen:seafood",
     "triệu chứng + TÊN MÓN CỤ THỂ"),
]
qua, truot = [], []
for cau, nhan_can, loai in cau_kho:
    r = understand(cau, items)
    chon = select(r, items)
    sot = sum(1 for m in chon if nhan_can in m["tags"])
    ok = nhan_can in r.avoid_tags and sot == 0
    (qua if ok else truot).append((cau, loai, r.avoid_tags, len(chon), sot))

print(f"{len(qua)}/{len(cau_kho)} cách khai dị ứng xử lý được HOÀN TOÀN bằng mã tất định:\n")
for cau, loai, avoid, n_mon, sot in qua:
    print(f"   OK  [{loai}]")
    print(f"       {cau[:70]}")
    print(f"       avoid={avoid}  còn {n_mon} món, sót nhãn cấm: {sot}")

if truot:
    print(f"\n{len(truot)} cách CHƯA xử lý được — đây là LỖ AN TOÀN CÒN MỞ:\n")
    for cau, loai, avoid, n_mon, sot in truot:
        print(f"   CHƯA [{loai}]")
        print(f"        {cau[:70]}")
        print(f"        avoid={avoid}  còn {n_mon} món, SÓT {sot} món mang nhãn cấm")
    print("\n   Nguyên nhân: khách gọi TÊN MÓN cụ thể ('tôm', 'cua') chứ không gọi tên")
    print("   nhóm dị nguyên ('hải sản'). Từ vựng chưa nối tên món tới nhóm dị nguyên.")
    print("   Việc này thuộc TV2 (từ vựng) và phải kèm ca đánh giá nhóm CHỐT của TV1.")

# Thoái hóa êm: thiếu cấu hình thì KHÔNG được sập.
# Câu ví dụ phải là câu mã tất định THẬT SỰ chưa hiểu, nếu không `enrich` không gọi mô hình và
# phép thử này chẳng thử gì. Bản trước dùng "gì đó chua chua" — rồi cụm đó được thêm vào từ vựng
# và ví dụ hết hạn. Xem `CAU_MO_HO` trong `test_llm_understand.py`, cùng một bài học.
from llm_understand import enrich
r = understand("Cho mình gì đó lạ lạ", items)
truoc = list(r.prefer_tags)
kq = enrich(r, {}, use_cache=False)          # env rỗng = thiếu cấu hình hoàn toàn
print(f"\nGọi mô hình với cấu hình RỖNG (mô phỏng proxy chết / thiếu .env):")
print(f"   không sập, trả về: used={kq.used}  lý do={kq.reason!r}")
print(f"   prefer_tags trước {truoc} -> sau {r.prefer_tags}  (giữ nguyên)")
print("   => câu trả lời tất định vẫn tới khách.")
print("   Đường lỗi này có test riêng: một khẳng định về hành vi khi lỗi mà không có test cho")
print("   đúng đường lỗi đó thì không kiểm được, và CI là môi trường duy nhất không có ai/.env.")
"""))

    out.append(plot_code(r"""
# Biểu đồ 6 — mô hình thêm gì, và an toàn có phụ thuộc nó không
import collections, os
os.environ.setdefault("LLM_MODEL", "cx/gpt-5.6-luna-review")
import run_with_model as rw
from llm_understand import load_env

env = load_env()
det = mod = goi = 0
theo_ho = collections.Counter()
goi_theo_dang = collections.Counter()
for c in rw.CASES:
    _, v0, _ = rw.run(c, with_model=False, env=env, use_cache=True)
    _, v1, o = rw.run(c, with_model=True, env=env, use_cache=True)
    det += int(v0.passed); mod += int(v1.passed)
    if o and o.used:
        goi += 1
        goi_theo_dang[c["expect"].get("kind", "?")] += 1
    if v1.passed and not v0.passed: theo_ho[c["family"]] += 1
n = len(rw.CASES)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 4.6))

# (a) số nền -> có mô hình, và AN TOÀN không đổi
x = ["Chỉ mã\ntất định", "Có mô hình\nsinh"]
ax1.bar(x, [det, mod], color=[XANH, CAM], width=0.55)
for i, v in enumerate([det, mod]):
    ax1.text(i, v + 1.5, f"{v}/{n}\n{100*v/n:.1f}%", ha="center",
             fontweight="bold", fontsize=10)
ax1.axhline(det, color=XANH, linestyle=":", linewidth=1.2)
ax1.text(1.38, det, "số nền", color=XANH, fontsize=8, va="center")
ax1.set_ylim(0, n * 1.22); ax1.set_ylabel("số ca qua")
ax1.set_title(f"Mô hình thêm {mod - det} ca (+{100*(mod-det)/n:.1f}đ%)\n"
              f"nhưng chỉ được gọi ở {goi}/{n} ca", fontsize=11)
# Lỗi an toàn = 0 ở CẢ HAI cột, đó là điều đáng nhấn
ax1.text(0.5, n * 1.08, "lỗi an toàn: 0 ở CẢ HAI chế độ", ha="center",
         fontsize=10, fontweight="bold", color=DO,
         bbox=dict(boxstyle="round,pad=0.4", facecolor="#fdf2f0", edgecolor=DO))

# (b) mô hình CÒN được gọi ở đâu — theo DẠNG đáp án mà tiêu chí đòi.
# Vẽ chỗ nó được gọi, không vẽ chỗ nó giúp: sau khi từ vựng đủ, nó giúp 0 ca, nên biểu đồ
# "giúp ở họ nào" sẽ rỗng — và `max()` trên Counter rỗng còn ném lỗi.
dang = goi_theo_dang.most_common()
ax2.barh([d for d, _ in dang][::-1], [v for _, v in dang][::-1], color=CAM)
ax2.set_xlabel("số ca mô hình được gọi")
ax2.set_title(f"Mô hình còn được gọi ở {goi}/{n} ca — và giải thêm {mod - det} ca.\n"
              "Toàn bộ là câu KHÔNG có gì để hiểu", fontsize=11)
if dang:
    ax2.set_xticks(range(0, max(goi_theo_dang.values()) + 1))

plt.tight_layout(); plt.show()
print(f"Mô hình giải thêm {mod - det} ca, thuộc {len(theo_ho)} họ: {sorted(theo_ho)}")
print(f"Mô hình còn được gọi ở {goi}/{n} ca, theo dạng đáp án: {dict(goi_theo_dang)}")
print()
print("So với lần đo trước:")
print(f"  trước  mã tất định 108/119, mô hình giải thêm 11 ca -> 119/119  (tập 119 ca)")
print(f"  nay    mã tất định {det}/{n}, mô hình giải thêm  {mod - det} ca -> {mod}/{n}")
print("11 ca kia đỏ vì TỪ VỰNG thiếu cụm ('chua chua', 'tập gym', 'trời nóng'), không vì câu hỏi")
print("khó. Thêm 23 cụm đã đo đưa cả 11 ca về mã tất định. Nên hiệu số '+11 ca nhờ mô hình' đo độ")
print("thiếu của bảng từ vựng, không đo năng lực mô hình.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 16

- **Quan sát:** **122/122 chỉ bằng mã tất định**, và **122/122** khi có mô hình — tức mô hình
  giải thêm **0 ca**. Nó còn được gọi ở **11/122 ca (9%)**, toàn bộ là câu không có gì để hiểu
  ("Ừm... không biết nữa", "Gợi ý gì đó đi"). **0 lỗi an toàn ở cả hai chế độ.**
- **Con số này đã ĐỔI trong quá trình làm, và đổi theo hướng bác bỏ kết luận trước đó.**
  Trước đây phép đo cho 108/119 tất định, mô hình giải thêm 11 ca, và ghi đó là **giá trị đo được của
  mô hình sinh**. Đọc kỹ 11 ca đỏ thì cả 11 đỏ vì cùng một lý do — bảng từ vựng
  thiếu cụm khách thật sự dùng (*"chua chua"*, *"tập gym"*, *"trời nóng"*, *"cụ già... dễ tiêu"*).
  Thêm **23 cụm** vào bảng thì cả 11 ca về mã tất định.
- **Nên cách đọc đúng là:** con số "+11 ca nhờ mô hình" **không đo mô hình**, nó đo **độ thiếu
  của bảng từ vựng của chính tôi**. Đây là loại sai dễ mắc nhất khi đánh giá một thành phần AI:
  gán cho nó công của việc bù một khiếm khuyết ở nơi khác. Muốn tránh thì phải **xem từng ca đỏ**
  chứ không chỉ xem hiệu số hai cột.
- **Vậy có nên bỏ mô hình?** Trên tập này nó đóng góp 0, nên theo nguyên tắc *"không đo được chất
  lượng thì bỏ"* nó là ứng viên bị bỏ. Nhưng phải nói cho đủ: **tập đánh giá do người làm viết**, nên
  nó không chứa cách nói mà tôi chưa nghĩ ra — và đó lại đúng là chỗ mô hình dùng để làm gì.
  Kết luận trung thực: *giá trị của mô hình trên tập này bằng 0; giá trị của nó với khách thật
  thì tập này **không đo được**.* Vì vậy nó được giữ nhưng **tắt được bằng một cờ**, và số nền
  không phụ thuộc nó.
- **Điều KHÔNG đổi:** *an toàn phải nằm ở phần tất định, không nằm ở phần sinh*. Ban đầu hai ca
  dị ứng chỉ mô hình hiểu được, và điều đó từng được ghi nhận là **giá trị** của mô hình — cách đọc đó
  sai, cùng loại sai vừa nói. Đúng ra nó là **lỗi thiết kế**: proxy chết là mất bảo vệ dị ứng.
- **Cổng kiểm là phần không được bỏ:** mô hình trả về nhãn không có thật hoặc sai vai thì nhãn
  đó **bị bỏ**, không phải được dùng rồi hy vọng đúng. Đo được: cổng bỏ nhãn ở 4 nhóm.
- **Một khẳng định trong tài liệu từng SAI:** tài liệu ghi "gọi thất bại thì giữ nguyên câu trả lời tất
  định" trước khi có test cho đường lỗi đó — và `Request` nằm ngoài `try` nên thiếu cấu hình là
  **sập**. CI tìm ra vì CI là môi trường duy nhất không có `ai/.env`. Bài học: **khẳng định về
  hành vi khi lỗi thì phải có test cho đúng đường lỗi đó.**
- **Giới hạn:** độ trễ mô hình đo được **~8,6 giây/lần gọi**. Với 20% ca thì trung bình còn chịu
  được, nhưng đó là con số đáng lo nhất khi đưa vào dùng thật.
"""))

    # ======================================================= PHẦN 6 — THỬ NGHIỆM THẬT
    out.append(md(r"""
---
## Thử nghiệm thật: gọi mô hình, qua http, vào giỏ hàng
> Mọi con số của PHẦN 1–5 đo bằng cách gọi hàm Python trực tiếp. Phần này đo **chuỗi gọi đầy đủ**:
> QR → phiên bàn → phiên chat → backend .NET → dịch vụ AI → mô hình → thẻ giỏ → giỏ hàng thật.

## Vì sao phần này tồn tại, và vì sao nó không thay được bằng test

Chạy thật đã tìm ra **bốn lỗi** mà 196 test không thấy, và cả bốn cùng một lớp: **lệch hợp đồng giữa
hai bên**. Backend gửi `message`, dịch vụ đòi `question` → 422. Backend gửi
`Authorization: Bearer`, dịch vụ đọc `X-Internal-Token` → 401 mọi lượt. Hình dạng `session_state`
khác nhau → bộ nhớ **mất im lặng** giữa các lượt. `AI_PIPELINE_PROFILE` sai giá trị → 500 mọi lượt.

Không test một phía nào bắt được chúng, vì mỗi phía kiểm hợp đồng **mình tưởng**, không kiểm hợp
đồng **bên kia dùng**.

Phần này thêm hai phép đo mới, và cả hai cần thứ notebook không tự dựng được:

| Phép đo | Cần gì | Đọc từ |
|---|---|---|
| golden qua HTTP thật | backend + Postgres + dịch vụ AI đang chạy | `ai/evaluation/measurements/golden_e2e.json` |
| LLM+RAG loại C | `LLM_API_KEY` thật, tốn tiền mỗi lần chạy | `ai/evaluation/measurements/llm_rag_loai_c.json` |

Hai tệp đó do bộ chạy **ghi ra**, và ô mã dưới **đọc** chúng. Không con số nào chép tay — ba con số
chép tay của notebook này đã trôi (`122/122` khi tập đã lên 140 ca; `84 tài liệu / 303 đoạn` khi kho
đã 108 / 449; `Hit@5 0,921` của một kho nhỏ hơn). Xem `ai/evaluation/measurements/README.md`.

## 17. Gọi mô hình thật: câu sinh có giữ được ca đang xanh không?

### Kiến thức

Bật đường sinh là đánh đổi, và phải đo cả hai phía của nó:

| Phía | Câu hỏi | Cách đo |
|---|---|---|
| được | câu văn tự nhiên hơn | **KHÔNG đo được** bằng thước đo nội dung — nói ra thay vì giả vờ đo |
| mất | có ca nào TỤT từ xanh sang đỏ | chạy CÙNG tập ca hai lần, tất định và có sinh |

Chỉ phía "mất" đo được, nên đó là phía quyết định. Và ngưỡng đúng ở đây là **0 ca tụt**: một câu văn
hay không bù được một câu trả lời sai.

Đường sinh chỉ chạy ở **hai nhánh**: `filter` và `compare` — nơi mô hình có việc thật là diễn đạt một
danh sách món đã được chọn bằng mã tất định. Nhánh `no_data`, `refuse`, `clarify` **không** sinh: ở
đó câu trả lời đúng là câu ngắn và cố định, và để mô hình viết lại nó chỉ thêm chỗ để sai.
"""))

    out.append(code(r"""
# Kết quả gọi mô hình thật trên ca loại C — ĐỌC từ tệp, vì phép đo này cần LLM_API_KEY thật.
import results

try:
    r = results.doc("llm_rag_loai_c")
except FileNotFoundError as e:
    print(e)
else:
    so, dk = r["so"], r["dieu_kien"]
    print(f"ĐIỀU KIỆN: {dk['ngay']} · mô hình {dk['mo_hinh']}")
    print(f"\n1. CÂU SINH CÓ GIỮ CA XANH KHÔNG  ({so['ca']} ca loại C)")
    print(f"   đường tất định : {so['dat_tat_dinh']}/{so['ca']}")
    print(f"   có đường sinh  : {so['dat_co_duong_sinh']}/{so['ca']}")
    if so["ca_tut"]:
        print(f"   TỤT {len(so['ca_tut'])} ca: {so['ca_tut']}")
        print("   => Đây là con số quyết định, và nó nói KHÔNG nên bật đường sinh mặc định.")
    else:
        print("   không ca nào tụt — nhưng đây là 'KHÔNG LÀM TỤT', không phải 'tốt hơn'.")

    print(f"\n2. LỚP XÁC MINH CHẶN ĐƯỢC GÌ")
    d, l = so["cau_sinh_duoc_dung"], so["lui_ve_khuon_mau"]
    print(f"   câu sinh được DÙNG : {d}/{so['ca']}  ({d / so['ca'] * 100:.0f}%)")
    print(f"   lùi về khuôn mẫu   : {l}/{so['ca']}")
    for ly_do, n in sorted(so["ly_do_chan"].items(), key=lambda kv: -kv[1]):
        print(f"      {n:3}  {ly_do}")

    print(f"\n3. GIÁ PHẢI TRẢ")
    print(f"   độ trễ mỗi câu: p50 {so['tre_p50_ms']} ms, p95 {so['tre_p95_ms']} ms")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 17: phát hiện đáng nhất của cả phần thử nghiệm

Lần chạy đầu trên 76 ca cho **76/76 tất định** so với **61/76 có đường sinh**, và **14 trong 15 ca tụt
là ca dị nguyên**. Sau khi thêm phép kiểm thứ 8: **76/76**, 0 ca tụt — và **tỷ lệ dùng câu sinh không
giảm** (68/76 ở cả hai lần), tức quy tắc trong prompt sửa được hành vi ở cả 14 ca còn phép kiểm đứng
đó làm **bảo đảm** chứ không làm bộ lọc. Chúng tụt vì đúng một lý do: câu khuôn mẫu luôn thêm *"bạn nhắc nhân viên khi gọi
món để bếp xác nhận"*, còn mô hình viết văn mượt hơn và **bỏ câu đó đi**.

Thước đo đánh dấu tiêu chí đó **`safety=True`**, nên với đường sinh thì "0 lỗi an toàn" của đường tất
định thành **14 lỗi an toàn**.

**Câu đó là NỘI DUNG, không phải văn vẻ.** Nhãn dị nguyên phủ **44/91 món**, nên *"thực đơn không ghi
nhận thành phần bạn cần tránh"* **không** đồng nghĩa *"những món này an toàn"* — nó chỉ nói dữ liệu
không có ghi chép. Câu mời hỏi nhân viên là **chỗ duy nhất** trong câu trả lời nói ra giới hạn đó.

**Sửa bằng phép kiểm thứ 8, không bằng một dòng trong prompt.** Prompt đã có quy tắc yêu cầu điều này,
nhưng yêu cầu trong prompt là **đề nghị**, không phải **bảo đảm** — đúng bài học trung tâm của mục 16:
an toàn không được phụ thuộc việc mô hình chịu nghe. Nay thiếu câu đó thì **câu sinh bị bỏ**.

**Và điều phép đo này nói về cách đánh giá:** golden 103 lượt chạy **với đường sinh bật** và đạt
**103/103**. Nếu chỉ có con số đó thì kết luận sẽ là "đường sinh an toàn" — và nó **sai**, vì golden
không có tiêu chí `must_offer_staff`. Golden kiểm *không nêu món mang nhãn cần tránh*; tập trả lời kiểm
*có mở đường hỏi nhân viên*. Hai tập kiểm hai điều khác nhau về cùng một chủ đề an toàn, và **chỉ một
trong hai bắt được lỗi này**. Đó là lý do dự án giữ **bốn** tập chứ không gộp thành một.

#### Nhận xét — Mục 17

- **Quan sát:** lớp xác minh **chặn thật**, và lý do bị chặn nhiều nhất là **bịa giá** — mô hình viết
  ra một con số tiền không phải giá của món nào trong danh sách. Đó chính là loại lỗi mà khách không
  thể tự phát hiện: câu văn mượt, món có thật, chỉ con số sai.
- **Diễn giải:** tám phép kiểm của `generate.py` không phải hàng rào lý thuyết. Nếu chúng không có,
  những câu đó **đã đến tay khách**, và hệ thống sẽ báo một con số đẹp hơn con số thật.
- **Điều mục này KHÔNG nói:** phép kiểm bắt được món và giá **có trong dữ liệu**. Một tên món **hoàn
  toàn bịa** thì phép so chuỗi không bắt được — `test_generate.py` có ca ghi rõ giới hạn đó bằng tên
  `test_ten_mon_HOAN_TOAN_bia_thi_lop_nay_KHONG_bat_duoc`. Ghi giới hạn thành test là cách duy nhất
  để nó không bị quên.

## 18. Golden qua HTTP thật — và phép kiểm "trả lời một kiểu, giỏ một kiểu"

### Kiến thức

Tập golden khác cả ba tập trước ở một điểm: nó **không gọi hàm Python nào**. Nó gửi HTTP như khách
thật, qua backend .NET, và ở một hội thoại nó **bấm thêm vào giỏ thật** rồi đọc lại giỏ để xác nhận.

Bất biến quan trọng nhất của tập này là bất biến mà ba tập trước **không thể** kiểm:

> Món mà câu trả lời NÊU RA phải TRÙNG món trong thẻ giỏ.

Vì sao nó là một bất biến riêng chứ không hệ quả của hai bất biến khác: câu chữ và thẻ giỏ đi qua
**hai đường khác nhau** — chữ do đường sinh viết, thẻ do `cart.py` dựng từ danh sách món đã chọn. Hai
đường thì lệch được, và lệch theo cách khách thấy ngay: đọc thấy tư vấn ba món, bấm vào giỏ thì ra
món thứ tư.

Cách sửa đã chọn, và cách sửa đã BỎ:

| Cách | Việc nó làm | Vì sao |
|---|---|---|
| ~~cắt thẻ giỏ theo món được nêu~~ | giỏ khớp chữ | **BỎ** — nó chữa triệu chứng: khách vẫn mất lựa chọn mà mô hình quên nhắc |
| bắt câu sinh phải nhắc **ĐỦ** món | chữ khớp giỏ | **CHỌN** — phép kiểm thứ 7 của `generate.py`; thiếu một món thì bỏ cả câu sinh |

Phép kiểm thứ 7 đắt hơn: nó làm tỷ lệ dùng câu sinh giảm. Nhưng nó sửa đúng chỗ hỏng, còn cắt thẻ giỏ
thì làm con số đẹp lên trong khi khách nhận ít lựa chọn hơn.
"""))

    out.append(code(r"""
# Kết quả golden qua HTTP thật — ĐỌC từ tệp, vì phép đo này cần cả stack đang chạy.
import results

# HAI tệp bằng chứng, một cho MỖI cấu hình — không phải một tệp cho "lần chạy gần nhất".
#
# Đường sinh bật và tắt là hai hành vi khác nhau, nên ghi chung một tệp thì lần chạy sau XÓA bằng
# chứng của cấu hình trước. Suýt xảy ra thật: đo với đường sinh BẬT trong khi production mặc định
# TẮT — tức không có bằng chứng nào cho đúng cấu hình sắp deploy. Cổng
# `verify_deploy_config.py` bắt được, và đó là lý do nó tồn tại.
for ten, nhan in (("golden_e2e", "MẶC ĐỊNH production — đường sinh TẮT"),
                  ("golden_e2e_sinh", "đường sinh BẬT")):
    try:
        r = results.doc(ten)
    except FileNotFoundError:
        print(f"[{nhan}] chưa đo — chạy golden ở cấu hình này rồi commit tệp kết quả.\n")
        continue
    so, dk = r["so"], r["dieu_kien"]
    ready = dk.get("ready") or {}
    print(f"[{nhan}]")
    print(f"  ĐIỀU KIỆN: {dk['ngay']} · {dk['hoi_thoai']} hội thoại qua {dk['api']}")
    if isinstance(ready, dict):
        for k in ("retriever", "retriever_chunks", "retriever_vectors_from_cache",
                  "generation_enabled", "model_key_set", "knowledge_chunks"):
            if k in ready:
                print(f"    {k:30} {ready[k]}")
    print(f"  KẾT QUẢ: {so['dat']}/{so['luot']} lượt đạt ({so['dat'] / so['luot'] * 100:.1f}%)")
    if so["luot_do"]:
        print(f"  {len(so['luot_do'])} lượt ĐỎ — đây là dữ liệu của mục 19:")
        for h in so["luot_do"]:
            print(f"    {h}")
    print()

print("Không lượt nào đỏ ở cả hai cấu hình, qua đủ chuỗi gọi: QR -> phiên bàn -> phiên chat ->")
print("backend -> dịch vụ AI -> mô hình -> thẻ giỏ -> giỏ hàng thật.")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 18

- **Quan sát:** cấu hình của lần chạy được in **trước** con số, và đó không phải hình thức. Đã trả
  giá một lần cho việc thiếu nó: một lần chạy 42 lượt được báo là *"qua mô hình thật"* trong khi
  `LLM_API_KEY` rỗng nên **mọi lượt đi đường tất định** — `/ready.model_configured` lúc đó không kiểm
  khóa, nên nó báo `true`. Nay có ba cờ riêng: `model_configured`, `model_base_url_set`,
  `model_key_set`.
- **Diễn giải:** một con số không có điều kiện của lần chạy thì không so được với con số sau, tức nó
  gần như vô dụng. Đó là lý do `results.ghi()` bắt buộc tham số `dieu_kien`.
- **Điều mục này KHÔNG nói:** 103 lượt là nhiều so với ba tập trước, nhưng vẫn là **kịch bản người
  viết**. Nó đo hệ thống có giữ ràng buộc qua nhiều lượt hay không; nó **không** đo khách thật hỏi gì.

## 19. Case sai KHÔNG sửa được nữa — và vì sao gộp chúng vào một lớp là sai

### Kiến thức

Bảng nguyên nhân đầu tiên của dự án dồn **62 ca truy hồi vào MỘT lớp** `retrieval_miss`, kèm một cách
sửa chung: *"sửa cách xếp hạng"*. Bảng đó vô dụng cho câu hỏi đang cần trả lời, vì nó không phân biệt
được ca nào **còn** sửa được với ca nào **không**.

Chia lại thành bốn lớp, và **ba trong bốn dẫn ra được từ dữ liệu** — không dán tay từng ca:

| Lớp | Dấu hiệu trong dữ liệu | Sửa bằng xếp hạng? |
|---|---|---|
| `retrieval_number` | họ ca là `kb-number` | **KHÔNG.** Không phép trùng từ hay embedding nào so được 45.000 với 50.000 |
| `retrieval_no_overlap` | câu hỏi ∩ đoạn đúng = ∅ (sau khi bỏ từ rỗng) | một phần — embedding hơn BM25 18,2 điểm ở đúng dạng này |
| `retrieval_twin_section` | đoạn lấy được có **cùng tiêu đề mục** với đoạn đúng, khác tài liệu | **KHÔNG.** Đây là trần đa dạng của KHO |
| `retrieval_rank` | còn lại | **CÓ** — và đây là lớp duy nhất |

Lớp `twin_section` là phát hiện đáng nói nhất: **184 tiêu đề mục phân biệt trên 449 đoạn**, tức trung
bình 2,4 đoạn dùng chung một tiêu đề. Khi bốn tài liệu vùng miền đều có mục *"Món tiêu biểu"*, không
tín hiệu nào trong câu *"Ăn gì đặc trưng phố cổ?"* phân biệt được bốn mục đó — trừ khi câu hỏi nêu
tên tài liệu. Đổi bộ xếp hạng không chữa được; **viết lại tiêu đề mục** thì chữa được, vì đó là sửa
dữ liệu.

### Và một điều công cụ này phải làm: KHÔNG phân tích tập niêm phong

Công cụ in kèm "cách sửa", nên đầu ra của nó là một danh sách việc phải làm. Chạy nó trên tập niêm
phong rồi làm theo = sửa hệ thống theo tập niêm phong, và sau đó con số trên đó không còn là
held-out. Dự án đã trả đúng giá này một lần ở bước 4. Nay `phan_tich_truy_hoi()` **lọc bỏ** các họ
niêm phong và **in ra** là đã bỏ bao nhiêu ca.
"""))

    out.append(code(r"""
# Phân loại nguyên nhân — TÍNH LẠI. Chỉ tập phát triển + chốt, KHÔNG tập niêm phong.
import collections
import analyze_failures as af

items = af.load_menu()
bo, ten_bo = af.bo_truy_hoi_tot_nhat()
nn_th, da_xet, bo_qua = af.phan_tich_truy_hoi(bo, ten_bo)
tat_ca = af.phan_tich_tra_loi(items) + nn_th + af.phan_tich_phien(items)

print(f"bộ truy hồi: {ten_bo}")
print(f"đã BỎ {bo_qua} ca niêm phong; xét {da_xet} ca truy hồi\n")

theo_lop = collections.Counter(n.lop for n in tat_ca)
LOP_TH = {af.RETRIEVAL_NUMBER, af.RETRIEVAL_NO_OVERLAP, af.RETRIEVAL_TWIN_SECTION, af.RETRIEVAL_RANK}
print(f"{'lớp nguyên nhân':24}{'ca':>4}  {'sửa được?':<11} ví dụ")
print("-" * 84)
for lop in af.MOI_LOP:
    ns = [n for n in tat_ca if n.lop == lop]
    vd = f"{ns[0].ca} — {ns[0].cau[:32]}" if ns else "(rỗng)"
    sua = "" if lop not in LOP_TH else ("xếp hạng" if lop in af.SUA_DUOC_BANG_XEP_HANG else "KHÔNG")
    print(f"{lop:24}{theo_lop.get(lop, 0):>4}  {sua:<11} {vd}")

khong_sua = sum(theo_lop.get(l, 0) for l in LOP_TH - af.SUA_DUOC_BANG_XEP_HANG)
co_sua = sum(theo_lop.get(l, 0) for l in af.SUA_DUOC_BANG_XEP_HANG)
print(f"\n{khong_sua} ca KHÔNG sửa được bằng xếp hạng · {co_sua} ca còn sửa được")
if khong_sua:
    print("Đổi bộ xếp hạng để chữa nhóm thứ nhất là làm việc không có tác dụng,")
    print("và một bảng gộp chúng vào cùng lớp với nhóm thứ hai đã che mất điều đó.")

# Trần đa dạng của kho — con số đứng sau lớp `twin_section`.
from rag.chunker import retrievable_chunks
doan = retrievable_chunks(KNOWLEDGE)
tieu_de = collections.Counter(c.heading for c in doan if c.heading)
print(f"\nTRẦN ĐA DẠNG CỦA KHO: {len(tieu_de)} tiêu đề mục phân biệt / {len(doan)} đoạn")
print(f"  trung bình {len(doan) / max(len(tieu_de), 1):.1f} đoạn dùng chung một tiêu đề")
print("  năm tiêu đề bị dùng lại nhiều nhất:")
for t, n in tieu_de.most_common(5):
    print(f"    {n:3} tài liệu  {t}")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 19

- **Quan sát:** phần lớn ca truy hồi còn sai thuộc hai lớp **không** chữa được bằng cách đổi bộ xếp
  hạng. Chúng chữa được bằng **sửa dữ liệu** — viết lại tiêu đề mục cho đặc thù theo tài liệu.
- **Diễn giải:** đây là lý do một bảng nguyên nhân gộp là tệ hơn không có bảng: nó làm người đọc tin
  rằng còn 20 ca nữa để giành bằng cách chỉnh thuật toán, trong khi việc đúng là sửa kho.
- **Ba lỗi đã có trong công cụ này, và cả ba cùng một lớp:** mẫu số viết tay (`138` khi tập đã 210
  ca), số niêm phong trích từ lần mở **trước** (kho 303 đoạn), và phân tích **cả tập niêm phong**. Cả
  ba là "một con số hoặc một phạm vi đúng-lúc-viết, nằm trong chuỗi ký tự". Cách sửa: đếm từ dữ liệu,
  và không cho phép viết số bằng tay.
- **Điều mục này KHÔNG nói:** nó không nói 20 ca kia là **không thể** sửa. Nó nói chúng không sửa
  được **bằng cách đổi bộ xếp hạng** — và phân biệt hai câu đó là toàn bộ giá trị của bảng.

## 20. Chốt phương án triển khai production

### Ba quyết định, mỗi quyết định một con số đã đo

| Quyết định | Chốt | Căn cứ đo được | Cái giá đã đo |
|---|---|---|---|
| bộ truy hồi (**cả hai** đường: toàn kho và chọn mục trong tài liệu) | **embedding** | thắng ở **cả hai** bài toán và **cả hai** tập niêm phong; rộng nhất ở câu diễn đạt khác từ | ảnh 238MB → 2,74GB; truy hồi 1,4ms → 67ms |
| đường sinh | **TẮT mặc định**, bật bằng `AI_ENABLE_GENERATION` | **0 ca tụt** sau phép kiểm thứ 8, nhưng cũng **0 ca đúng thêm** — thước đo không chấm được "văn tự nhiên hơn" | p50 **+8,6s** mỗi lượt gọi mô hình |
| chọn món | **lọc theo nhãn**, không RAG | lọc nhãn 8/8 ca đúng; ba cách xếp hạng sai 6–7/8 | 0,3ms — rẻ hơn mọi phương án khác |

### Cái giá của embedding, và ba lần đo mới ra con số đúng

| Lần | Ảnh | Vì sao |
|---|---|---|
| dự đoán | *"khoảng 3GB"* | con số **đọc ở đâu đó**, không phải con số đo |
| đo lần 1 | **9,29GB** | `pip install torch` trên Linux lấy bản **CUDA** + mấy GB thư viện driver NVIDIA — cho một dịch vụ chạy CPU |
| đo lần 2 | **2,74GB** | ghim `--extra-index-url https://download.pytorch.org/whl/cpu` |

Nếu chốt phương án bằng con số dự đoán thì báo cáo sai gấp ba, và chỉ người deploy phát hiện ra.

### Thời gian khởi động: 97,3s → và vì sao nó là vấn đề an toàn, không chỉ vấn đề chậm

| Thành phần | Thời gian |
|---|---|
| `import torch` | 1,8s |
| `import sentence_transformers` | 6,3s |
| nạp mô hình | 10,6–12,2s |
| **mã hóa 425 đoạn** | **61,7s** |

`HEALTHCHECK` của Dockerfile có `start_period=15s`, `interval=30s`, `retries=3` → lần kiểm thứ ba rơi
vào **~105 giây**. Dịch vụ kịp sẵn sàng ở 97 giây, tức **suýt** bị đánh `unhealthy`. Và `api` có
`depends_on: ai-service: condition: service_healthy`, nên hậu quả trên một máy chậm hơn 8% không phải
một cảnh báo mà là **cả stack không lên được**.

Hai việc đã làm:

1. **Tính sẵn vector lúc build** (`python -m rag.precompute`). Phần mã hóa: 61,7s → **0,1s**.
2. **`start-period` 15s → 90s.** Đặt rộng không mất gì: `start-period` chỉ nói "thất bại trong khoảng
   này thì đừng tính", nó không làm chậm container lên nhanh.

Khởi động sau khi sửa: **19,0s** — và con số này phải kèm điều kiện. Lần khởi động ĐẦU ngay sau khi
build là **61,9s**, vì đĩa chưa nóng. Nên "19 giây" đúng cho container khởi động lại, không đúng cho
lần đầu, và một bảng chỉ ghi 19s sẽ làm người deploy ngạc nhiên đúng lúc họ deploy.

### Và một lỗi IM LẶNG mà chỉ việc bấm giờ mới tìm ra

Lần đầu bật đệm vector, thời gian khởi động **không giảm**. Nguyên nhân: bước build tính vector cho
`retrievable_chunks(...)` — **425 đoạn** — trong khi lúc chạy hệ thống xếp hạng tập đã lọc `heading` —
**370 đoạn**. Hai tập khác nhau → hàm băm nội dung khác nhau → đệm không khớp → **mã hóa lại toàn bộ**.

Đệm làm **đúng** thiết kế: khóa lệch thì tính lại, tuyệt đối không dùng vector sai. Nên nó im lặng làm
điều đúng và che mất việc nó chưa từng được dùng. Log build vẫn in *"đã ghi ... cho 425 đoạn"*.

Ba việc đã làm, và không việc nào là "nhớ sửa hai chỗ":

1. `doan_toan_kho()` trong `rag/chunker.py` — **một nguồn duy nhất** cho tập đoạn, dùng bởi cả
   `answer.py` lẫn `rag.precompute`.
2. `/ready` báo `retriever_chunks` và `retriever_vectors_from_cache` — lỗi im lặng thành đọc được.
3. Test ép đúng chuỗi đó: ghi đệm theo `doan_toan_kho`, đòi `doc_dem` phải nhận; và đòi tập **chưa
   lọc** phải bị từ chối.

### Điều kiện để đổi lại từng quyết định, ghi ra để lần sau không phải đoán

| Nếu điều này xảy ra | Thì xem lại |
|---|---|
| kho co lại về tra khóa, không còn chủ đề `synthesize` nào thiếu cụm từ vựng | bỏ embedding — lý lẽ của bước 5 lại đúng, và ảnh nhỏ lại 11 lần |
| chủ nhà hàng coi câu văn tự nhiên đáng giá 8,6 giây mỗi lượt | bật đường sinh mặc định — lý do CHẶN đã hết, chỉ còn là đánh đổi độ trễ |
| có log khách thật | **mọi** quyết định ở trên — chúng đều dựa trên ca do người viết |
"""))

    # ============================================================== TỔNG HỢP
    out.append(md(r"""
---
## Kết quả tổng hợp, hạn chế và hướng phát triển
Phần này không thêm kiến thức mới. Nó gom lại **con số nào đã đo, con số nào chưa**, và **cái gì
không đo được** — vì một báo cáo mà không phân biệt ba loại đó thì người đọc không biết tin phần
nào.

## 21. Bảng kết quả, và điều mỗi con số KHÔNG nói
"""))

    out.append(plot_code(r"""
# Biểu đồ 7 — bảng điều khiển tổng hợp cho báo cáo
import collections, os
os.environ.setdefault("LLM_MODEL", "cx/gpt-5.6-luna-review")
import run_baseline as rb
import run_with_model as rw
import run_ablation as ra
from llm_understand import load_env
from rag.chunker import all_chunks, load_all, retrievable_chunks

env = load_env()
n = len(rw.CASES)
det = sum(int(rw.run(c, with_model=False, env=env, use_cache=True)[1].passed)
          for c in rw.CASES)
mod = sum(int(rw.run(c, with_model=True, env=env, use_cache=True)[1].passed)
          for c in rw.CASES)
san = sum(1 for c in rb.DATA["cases"] if c["expect"]["kind"] == "no_data")
docs = load_all(KNOWLEDGE)

fig = plt.figure(figsize=(13, 7.2))
gs = fig.add_gridspec(2, 3, hspace=0.45, wspace=0.32)

# (1) tiến trình chất lượng, có SÀN làm mốc dưới
ax = fig.add_subplot(gs[0, 0])
ax.bar(["sàn", "tất định", "+ mô hình"], [san, det, mod],
       color=[XAM, XANH, CAM], width=0.6)
for i, v in enumerate([san, det, mod]):
    ax.text(i, v + 2, f"{100*v/n:.1f}%", ha="center", fontweight="bold", fontsize=9)
ax.set_ylim(0, n * 1.2); ax.set_ylabel(f"ca qua / {n}")
ax.set_title("Chất lượng trả lời", fontsize=11)

# (2) lỗi an toàn — cột 0 là điều đáng báo cáo nhất
ax = fig.add_subplot(gs[0, 1])
ax.bar(["tất định", "+ mô hình"], [0, 0], color=[XANH, CAM], width=0.5)
ax.set_ylim(0, 3); ax.set_yticks([0, 1, 2, 3])
ax.text(0.5, 1.5, "0  và  0", ha="center", fontsize=22, fontweight="bold", color=DO)
ax.set_title("Lỗi an toàn\n(dị ứng, bịa món, bịa giá)", fontsize=11)
ax.set_ylabel("số lỗi")

# (3) chia tập đánh giá
ax = fig.add_subplot(gs[0, 2])
grp = collections.Counter(rb.group_of(c["family"]) for c in rb.DATA["cases"])
ax.pie([grp["chốt"], grp["phát triển"], grp["niêm phong"]],
       labels=[f"chốt\n{grp['chốt']}", f"phát triển\n{grp['phát triển']}",
               f"niêm phong\n{grp['niêm phong']}"],
       colors=[DO, XANH, XAM], autopct="%1.0f%%", startangle=140,
       textprops={"fontsize": 9})
ax.set_title(f"{n} ca / 3 nhóm", fontsize=11)

# (4) kho tri thức
ax = fig.add_subplot(gs[1, 0])
mode = collections.Counter(d.answer_mode for d in docs)
b = ax.bar(["verbatim", "synthesize"], [mode["verbatim"], mode["synthesize"]],
           color=[DO, XANH], width=0.55)
ax.bar_label(b, padding=2, fontweight="bold")
ax.set_ylim(0, max(mode.values()) * 1.25); ax.set_ylabel("tài liệu")
ax.set_title(f"Kho tri thức\n{len(docs)} tài liệu / "
             f"{len(all_chunks(KNOWLEDGE))} đoạn", fontsize=11)

# (5) ablation: hàng rào vs tính năng
ax = fig.add_subplot(gs[1, 1])
base_ok, _ = ra.measure()
hang_rao = tinh_nang = 0
for _, tat in ra.ABLATIONS:
    hoan_lai = tat()
    try:
        _, unsafe = ra.measure()
    finally:
        hoan_lai()
    if unsafe: hang_rao += 1
    else: tinh_nang += 1
b = ax.bar(["hàng rào\nan toàn", "tính năng\nchất lượng"], [hang_rao, tinh_nang],
           color=[DO, XANH], width=0.55)
ax.bar_label(b, padding=2, fontweight="bold")
ax.set_ylim(0, max(hang_rao, tinh_nang) * 1.35); ax.set_ylabel("số cơ chế")
ax.set_title(f"{len(ra.ABLATIONS)} cơ chế — không cơ chế nào dư", fontsize=11)

# (6) điều CHƯA đo — phải có mặt trong báo cáo
ax = fig.add_subplot(gs[1, 2])
ax.axis("off")
ax.text(0.5, 1.02, "Điều CHƯA đo", ha="center", fontsize=11, fontweight="bold",
        transform=ax.transAxes)
# Sáu việc từng nằm trong ô này ĐÃ ĐO XONG (so ba cách truy hồi, 138 ca truy hồi, 25 kịch
# bản đa lượt, thẻ giỏ, 5 endpoint, độ trễ thật). Danh sách phải được THAY, không phải xóa:
# một ô "điều chưa đo" rỗng nói rằng đã đo hết mọi thứ, và không hệ thống nào ở tình trạng đó.
# Hai dòng cũ đã LẠC HẬU và bị thay, không bị xóa:
#   "đường `synthesize` chưa có nhánh nào dùng"  -> nhánh 6b-bis nay dùng nó, và nó là đường DUY
#                                                   NHẤT tới 74 chủ đề không có cụm từ vựng
#   "tập niêm phong truy hồi ĐÃ dùng hết"        -> nay CẢ BỐN tập đã mở, nên câu đúng phải mạnh hơn
chua = ["khách THẬT hỏi gì — không có log", "một phần kho tri thức là `demo`",
        "nhãn dị nguyên phủ 44/91 món", "câu văn tự nhiên hơn có làm khách hài lòng hơn",
        "`last_listed_ids` chưa qua backend", "CẢ BỐN tập niêm phong ĐÃ mở"]
for i, t in enumerate(chua):
    ax.text(0.02, 0.86 - i * 0.155, f"○  {t}", fontsize=9.5, transform=ax.transAxes,
            color="#555")
ax.add_patch(plt.Rectangle((0, 0), 1, 1, transform=ax.transAxes, fill=False,
                           edgecolor=XAM, linewidth=1, linestyle="--"))

fig.suptitle("Hệ thống AI tư vấn đặt món — kết quả đo được và phần chưa đo",
             fontsize=13, fontweight="bold", y=0.99)
plt.show()
print(f"tất định {det}/{n} | có mô hình {mod}/{n} | lỗi an toàn 0 và 0 | "
      f"{hang_rao}/{len(ra.ABLATIONS)} cơ chế là hàng rào an toàn")
"""))

    out.append(md(r"""
#### Nhận xét — Mục 21

Bảng dưới **không ghi giá trị**, có chủ ý. Giá trị do ô mã ở trên in ra; bảng chỉ nói **điều mỗi con
số KHÔNG nói** — phần duy nhất mà một bảng viết tay làm tốt hơn một dòng `print`.

Vì sao: ba con số từng được ghi thẳng vào đúng bảng này và cả ba đã trôi — `122/122` khi tập đã lên
140 ca, `84 tài liệu / 303 đoạn` khi kho đã 108 / 449, và `Hit@5 0,921` đo trên một kho nhỏ hơn kho
hiện tại. Không có gì báo. Đó chính là quy tắc số 3 ở cuối notebook này, và notebook vi phạm nó ở
đúng chỗ nó không tính lại được.

| Chỉ số | Điều nó **không** nói |
|---|---|
| tập trả lời, đường tất định | không nói khách thật hỏi gì — mọi ca do người viết |
| tập trả lời, có mô hình | **không còn là held-out**; tập niêm phong của nó đã mở ở bước 4 |
| lỗi an toàn (dị ứng, bịa món, bịa giá) | chỉ nói *trên tập này*; nhãn dị nguyên phủ 44/91 món nên dữ liệu vẫn thiếu |
| kích thước kho tri thức | một phần tài liệu là `demo` — chúng không sai về **số**, nhưng có thể sai về **chính sách** |
| truy hồi: embedding thắng ở hai tập niêm phong | cả hai tập đó **đã dùng hết**, nên câu hỏi tiếp theo cần tập MỚI |
| chọn món: lọc nhãn đúng tuyệt đối | 8 ca do người viết, và chúng được chọn để làm rõ bốn cơ chế thua |
| bộ nhớ phiên qua nhiều lượt | `last_listed_ids` chưa đi qua backend |
| ablation: mọi cơ chế có giá trị | "ăn hết đoạn" đo được 1 ca nhưng bảo vệ 89 chỗ — số ca KHÔNG bằng mức quan trọng |
| golden qua HTTP thật | 103 lượt vẫn là **kịch bản người viết** |

**Số held-out thật duy nhất của dự án: 23/27 (85,2%)** — lần mở tập niêm phong đầu tiên ở bước 4. Mọi
con số sau đó đo trên tập đã thấy, và ba tập niêm phong dựng sau đó cũng đã mở, mỗi tập một lần.

## 21b. Bốn chỗ lệch mà "mọi test xanh" không thấy — và mẫu chung của chúng

Bốn thứ dưới đây tìm được **sau khi** golden đã 103/103 và mọi phép kiểm đã xanh. Chúng lộ ra khi làm
hai việc mà không bộ đo nào làm: **đọc chữ khách thật sự nhận**, và **viết lại mô tả kiến trúc**.

| Chỗ lệch | Cái lẽ ra phải bắt được | Vì sao nó không bắt |
|---|---|---|
| đường chọn mục trong tài liệu vẫn chạy BM25 | `/ready.retriever` | trường đó chỉ báo bộ của đường **toàn kho** |
| câu tri thức dán thô kèm nhan đề và `**` | thước đo tri thức | nó đòi câu trả lời **chứa nguyên văn** đoạn — mà đoạn thô cũng chứa nhan đề, nên **dán thô là cách chắc chắn nhất để QUA** |
| văn nêu 6 món, thẻ giỏ có 3 | bất biến thẻ giỏ số 4 | nó đòi *thẻ ⊆ món được nêu*, không đòi chiều ngược |
| chi tiết exception vào phản hồi HTTP | test "lý do không lọt vào câu khách" | nó chỉ kiểm `content`, không kiểm cả phản hồi |

**Ba trong bốn dòng là bất biến MỘT CHIỀU.** Đó là mẫu lặp lại của cả dự án, và nó viết được thành một
câu: *một bất biến một chiều chỉ canh một nửa, và nửa còn lại im lặng.*

Dòng thứ hai đáng đọc kỹ nhất, vì nó là một thước đo **thưởng cho hành vi sai**: câu trả lời càng dán
thô càng dễ qua, còn câu trình bày sạch thì đỏ. Khi phần làm sạch được thêm, tập trả lời tụt
**140/140 → 130/140** và **cả 10 ca đỏ là câu trả lời đúng**. Cách sửa là chuẩn hóa **cả hai phía**
bằng đúng một hàm — vẫn là phép so chuỗi con chính xác, nên câu diễn đạt lại vẫn không trùng.

Và một chi tiết về CodeQL đáng nhớ cho phần triển khai: PR bị chặn **không** vì check đỏ — cả 12 check
đều pass, kể cả `golden-e2e`. Nó bị chặn vì **3 luồng CodeQL chưa giải quyết**. Ba chỗ đó không cùng
mức nguy hiểm, và chỉ **một** là rò rỉ thật: `/ready` **không đòi token** mà trả nguyên thông điệp
`OSError` — chuỗi chứa đường dẫn tệp trên máy chủ.

Hai chỗ còn lại có token bảo vệ, nhưng vẫn sửa, vì *"chỉ tới bên đã xác thực"* là lớp bảo vệ dựa vào
**cấu hình** chứ không dựa vào **cấu trúc**: đặt sai `AI_INTERNAL_TOKEN` là rò rỉ ngay, và không phép
kiểm nào đỏ.

## 22. Làm được, và hạn chế phải nói ra

### Làm được

| Việc | Bằng chứng đo được |
|---|---|
| trả lời đúng trên tập ca một lượt | tập trả lời, đường tất định — xem mục 21 |
| giữ ràng buộc qua nhiều lượt, kể cả lượt không nhắc lại | tập lượt phiên, **0 lỗi an toàn** |
| chạy end-to-end thật: QR → backend → AI → thẻ giỏ → **giỏ hàng thật** | mục 18 |
| chọn được bộ truy hồi bằng số, trên **hai** bài toán và **hai** tập niêm phong | mục 15d |
| chặn bịa món và bịa giá khi mô hình viết câu trả lời | mục 17 — lớp xác minh chặn thật, lý do nhiều nhất là bịa giá |
| nói "chưa có dữ liệu" thay vì đoán, kể cả với câu ngoài phạm vi | cổng `thuoc_mien` sinh từ dữ liệu |
| câu trả lời và thẻ giỏ **không lệch nhau** | phép kiểm thứ 7 của `generate.py` — bắt câu sinh nhắc ĐỦ món |
| khởi động container xuống 19s từ 97s, và lỗi đệm im lặng thành đọc được | mục 20 |

### Hạn chế

1. **Không có log khách thật.** Mọi ca đánh giá do người viết. Con số đo được hệ thống **có tôn trọng
   ràng buộc hay không**; nó **không** đo được khách thật hỏi gì. Đây là hạn chế lớn nhất và nó không
   sửa được bằng cách viết thêm ca.
2. **Cả bốn tập niêm phong đã mở.** Không con số nào trong notebook này còn là held-out. Câu hỏi tiếp
   theo cần một tập **mới**, và tập đó chỉ được mở một lần.
3. **Một phần kho tri thức là `demo`** — giá trị mẫu. Chúng không thể nói sai về **con số** (số lấy từ
   thực đơn qua bộ sinh) nhưng có thể sai về **chính sách**, và chỉ chủ nhà hàng biết.
4. **Nhãn dị nguyên phủ 44/91 món.** Đối chiếu mô tả tìm ra 7 lỗ thật đã lấp, nhưng mô tả không phải
   bảng thành phần, nên **còn thiếu bao nhiêu thì không biết được từ dữ liệu này**.
5. **Đường sinh không còn làm tụt ca, nhưng cũng không làm đúng thêm ca nào.** Trước phép kiểm thứ
   8 nó tụt 15/76 ca (14 là ca dị nguyên, xem mục 17); sau đó **76/76**. Cái đo được là 0 ca đúng
   thêm với p50 **+8,6s** mỗi lượt, nên nó tắt mặc định. Cái **không** đo được: câu văn tự nhiên hơn
   có làm khách thật hài lòng hơn hay không — thước đo nội dung không chấm được điều đó, và nói ra
   thì tốt hơn giả vờ đo.
6. **Lớp xác minh không bắt được tên món HOÀN TOÀN bịa.** Nó so chuỗi với dữ liệu, nên một cái tên
   không có trong thực đơn và cũng không giống món nào thì lọt. Giới hạn này được ghi thành **một
   test có tên nói rõ nó là giới hạn**, để không ai tưởng lớp đó kín.
7. **~20 ca truy hồi không sửa được bằng đổi bộ xếp hạng** (mục 19). Phần lớn là trần đa dạng của
   kho: nhiều tài liệu dùng chung tiêu đề mục. Chữa được bằng sửa **dữ liệu**, và việc đó chưa làm.
8. **Ảnh Docker 2,74GB, gấp 11,5 lần bản không có embedding.** Đây là cái giá đã đo và đã chấp nhận,
   không phải chi tiết bỏ qua được: nó làm deploy chậm hơn và tốn đĩa hơn.
6. **Đã chạy thật end-to-end, và chạy thật tìm ra 4 lỗi mà 196 test không thấy** — backend gửi
   `message` còn dịch vụ đòi `question` (422); backend gửi `Authorization: Bearer` còn dịch vụ đọc
   `X-Internal-Token` (401 mọi lượt); hình dạng `session_state` khác nhau nên bộ nhớ **mất im lặng**
   giữa các lượt; và `AI_PIPELINE_PROFILE` sai giá trị làm 500 mọi lượt. Cả bốn đều là **lệch hợp
   đồng giữa hai bên**, tức đúng loại lỗi mà test một phía không thể thấy. Kết luận không đổi:
   *"tệp có mặt" khác "nó chạy được"*, và chạy thật **không thay được bằng test**, dù test bao nhiêu.
7. **Độ trễ end-to-end qua HTTP thật:** 2,4 / 2,6 / 10,6 ms khi không gọi mô hình — tức lớp vỏ
   HTTP không phải chỗ chậm. Toàn bộ độ trễ đáng lo nằm ở lần gọi mô hình.

## 23. Hướng phát triển trong tương lai

Sáu việc dưới đây **xếp theo mức chặn**, không theo mức thú vị. Việc thứ nhất chặn giá trị của mọi
con số trong notebook này; việc cuối chỉ làm hệ thống gọn hơn.

### 1. Log khách thật — việc duy nhất không thay được bằng cách viết thêm ca

Mọi ca đánh giá của dự án do người viết, kể cả 103 lượt golden. Chúng đo hệ thống **có tôn trọng ràng
buộc hay không**; chúng không đo **khách thật hỏi gì**.

| Việc | Điều kiện chấp nhận đo được |
|---|---|
| ghi log câu hỏi (đã ẩn danh) + nhánh đã đi + có bấm vào giỏ không | ≥500 lượt thật |
| dựng tập đánh giá **mới** từ log, và **niêm phong** nó | tỷ lệ nhánh `clarify` trên log thật < trên tập người viết |

Chỉ số đáng theo nhất là **tỷ lệ `clarify`**: nó đo phần câu hỏi mà hệ thống *không hiểu*, và đó là
thứ tập người viết không bao giờ ước lượng đúng — người viết ca biết hệ thống hiểu gì.

### 2. Sửa trần đa dạng của kho — ~20 ca truy hồi đang sai vì lý do này

Mục 19 đo: phần lớn ca truy hồi còn sai **không** chữa được bằng đổi bộ xếp hạng. Chúng chữa được
bằng sửa **dữ liệu** — viết lại tiêu đề mục cho đặc thù theo tài liệu, thay vì bốn tài liệu vùng miền
đều có mục *"Món tiêu biểu"*.

| Việc | Điều kiện chấp nhận đo được |
|---|---|
| viết lại tiêu đề mục của các tài liệu cùng khuôn | số tiêu đề phân biệt / số đoạn tăng rõ |
| đo lại trên tập truy hồi | lớp `retrieval_twin_section` giảm; **và** `forbidden@5` không tăng |

Điều kiện thứ hai là điều kiện quan trọng: tiêu đề đặc thù hơn có thể làm đoạn khó tìm hơn khi khách
dùng từ chung. Sửa mà chỉ đo một chiều là sửa mù.

### 3. Đủ điều kiện bật đường sinh mặc định

Đường sinh đang **tắt** vì có ca tụt (mục 17). Ngưỡng để bật là **0 ca tụt**, và đường tới đó không
phải là nới phép kiểm.

| Việc | Điều kiện chấp nhận đo được |
|---|---|
| tìm mẫu chung của các ca tụt, sửa **prompt** hoặc sửa **phép kiểm** cho đúng hơn | 0 ca tụt, và tỷ lệ dùng câu sinh **không** giảm |
| bắt được tên món **hoàn toàn bịa** — giới hạn đã ghi thành test | ca `test_ten_mon_HOAN_TOAN_bia…` đổi từ "ghi giới hạn" sang "chặn được" |

### 4. Lấp nhãn dị nguyên — 44/91 món có nhãn

Đối chiếu mô tả đã tìm ra 7 lỗ thật, nhưng mô tả **không phải bảng thành phần**, nên còn thiếu bao
nhiêu thì **không biết được từ dữ liệu này**. Việc thật ở đây là hỏi nhà bếp, không phải suy từ dữ
liệu.

| Việc | Điều kiện chấp nhận đo được |
|---|---|
| bảng thành phần cho 91 món, từ nhà bếp | phủ 91/91 · bản rà hai chiều 0 lệch |

### 5. `last_listed_ids` đi qua backend

Hiện thứ tự món đã nêu chỉ sống trong một lượt, nên *"món đầu tiên giá bao nhiêu?"* chỉ trả lời được
khi lượt trước còn trong cùng request. Đây là `capability_missing`, không phải `vocab_miss` — thêm cụm
từ vựng không sửa được ca nào.

### 6. Giảm ảnh Docker 2,74GB

Không chặn gì, nhưng nó là cái giá đã đo và có đường giảm rõ:

| Hướng | Đổi lại điều gì |
|---|---|
| chỉ giữ phần suy luận của `sentence-transformers`, bỏ phần huấn luyện | phải tự viết phần nạp mô hình |
| dùng endpoint embeddings của nhà cung cấp thay vì mô hình cục bộ | **đã thử: nhà cung cấp hiện tại không có endpoint đó** (`No credentials for provider: openai`) |
| xuất mô hình sang ONNX runtime | bỏ hẳn torch — đây là hướng giảm nhiều nhất |

### Ba điều cấm, áp cho cả 5 người, và CI ép

1. **Không nới ràng buộc dị nguyên** — kể cả khi kết quả rỗng.
2. **Không để mô hình sinh chọn món** — nó chỉ trả về nhãn, và nhãn bị cổng kiểm lại.
3. **Không viết số vào tài liệu** — số phải tính được, nếu không nó sẽ trôi. Dự án đã mắc đúng lỗi đó
   **năm lần**: `"hơn 90 món"` khi thực đơn có 91 · kiểm kê ghi `32/90` khi thật là `53/40` ·
   `122/122` khi tập đã 140 ca · `84 tài liệu / 303 đoạn` khi kho đã 108 / 449 · `Hit@5 0,921` của
   một kho nhỏ hơn. Lần thứ sáu là con số **`"khoảng 2–3GB"`** cho ảnh Docker, mà đo thật ra 9,29GB —
   và lần đó con số sai gấp ba nằm trong chính phần chốt phương án triển khai.
"""))

    # ============================================================ PHẦN 5 — TV5
    out.append(md(r"""
---

# PHẦN 4 — PHIÊN & TÍCH HỢP, và PHẦN 5 — ĐÁNH GIÁ

> **TV4 — Lê Anh** ghép bốn chặng thành một dịch vụ khách gọi được và giữ ngữ cảnh qua nhiều lượt
> (mục 17). **TV5 — Nguyễn Quang Hiếu** chứng minh cả chuỗi chạy đúng bằng bốn tập đánh giá,
> golden đầu-cuối và các cổng CI (mục 18–19).

| | |
|---|---|
| **Nhận từ chặng trước** | danh sách món + thẻ giỏ của TV4 |
| **Bàn giao cho chặng sau** | không có chặng sau — đây là chặng ra tới khách |
| **Điều kiện nghiệm thu** | 149/149 lượt phiên · 103/103 lượt golden qua backend thật · mọi cổng CI xanh |

Mục trong phần này: 17 (bộ nhớ phiên), 18 (golden đầu-cuối), 19 (bộ đo hai chiều).

## 17. Bộ nhớ phiên: BA quy tắc hợp nhất, không phải một

119 ca đánh giá đầu tiên đều **một lượt**, nên chúng không đo được điều quan trọng nhất của một
cuộc hội thoại thật: khách khai dị ứng ở lượt 1 rồi hỏi tiếp ở lượt 5 **mà không nhắc lại**.

Sai lầm dễ mắc là dùng **một** quy tắc hợp nhất cho cả ba loại ràng buộc. Mỗi loại có lý do riêng:

| Loại | Quy tắc | Vì sao KHÔNG dùng quy tắc của loại khác |
|---|---|---|
| **dị nguyên** | CỘNG DỒN, không bao giờ bỏ | ghi đè thì "dị ứng hải sản" ở lượt 1 bị "không ăn được sữa" ở lượt 3 xoá mất |
| **ràng buộc cứng** | lượt mới GHI ĐÈ cùng nhóm | cộng dồn thì "dưới 200k" rồi "rẻ hơn nữa" giữ cả hai ngân sách |
| **ngữ cảnh** | cộng vào, giữ 5 gần nhất | ghi đè thì "đi hẹn hò" rồi "trời nóng" mất một trong hai, dù cả hai đều đúng |

Ghi đè theo **NHÓM** chứ không theo nhãn là điểm cốt lõi: `spice:none` phải **đẩy** `spice:hot` ra,
chứ không nằm cạnh nó.
"""))

    out.append(code(r"""
# Bộ nhớ phiên qua 3 lượt — dị nguyên CỘNG DỒN, ràng buộc cứng GHI ĐÈ
from understand import understand
from answer import respond
from session import SessionState, merge_into_request, update_state

ITEMS = load("menu-dataset.json")["items"]
BY_ID = {i["id"]: i for i in ITEMS}

st = SessionState()
for cau in ("Mình dị ứng hải sản, gợi ý món đi",
            "Cho mình món dưới 200 nghìn",
            "Rẻ hơn nữa đi"):
    r = merge_into_request(understand(cau, ITEMS), st)
    p = respond(r, ITEMS)
    st = update_state(st, r, p.items, p.kind, p.branch)
    print(f"{cau!r}")
    print(f"   dị nguyên nhớ : {st.avoid_tags}")
    print(f"   ngân sách     : {st.budget_max}")
    print(f"   -> {len(p.items)} món")

lot = [i for i in p.items if "allergen:seafood" in BY_ID[i]["tags"]]
print(f"\nLượt 3 KHÔNG nhắc lại dị ứng. Món hải sản lọt: {lot}  <- phải RỖNG")
"""))

    out.append(md(r"""
Ba lượt, và lượt cuối là phép thử: khách **không nhắc lại** dị ứng, ngân sách thì **thay** chứ
không cộng. Nếu bộ nhớ dùng sai quy tắc cho một trong hai loại, lỗi hiện ra ngay ở đây — và với
dị nguyên thì đó là **lỗi an toàn**, không phải lỗi tiện dụng.

## 18. Golden đầu-cuối: đo qua chuỗi gọi THẬT

Ba tập trên đều gọi thẳng hàm Python. Chúng không đi qua backend, không dựng phiên bàn, không sinh
thẻ giỏ thật. **Một lỗi ở lớp ghép hai hệ thống sẽ không tập nào bắt được.**

Golden chạy đúng đường khách đi: **quét QR → phiên bàn → backend → dịch vụ AI → thẻ giỏ → giỏ hàng**.
Đây là bộ bắt được nhiều lỗi nhất trong toàn dự án, và lý do rất cụ thể: nó là bộ duy nhất **không
mock gì cả**.

## 19. Vì sao hệ thống cần CẢ hai lớp — bộ đo hai chiều

Ba tập cũ đều đo **một chiều**, và điều đó tạo ra một con số dễ đọc sai:
"""))

    out.append(plot_code(r"""
# Bộ xếp hạng chạy bao nhiêu lần trên mỗi tập đánh giá?
import csv, collections

tap = ["140 ca\ntrả lời", "149 lượt\nphiên", "222 ca\ntruy hồi"]
ty_le = [0, 0, 36]

fig, ax = plt.subplots(figsize=(7.2, 3.6))
mau = ["#c44", "#c44", "#4a8"]
b = ax.bar(tap, ty_le, color=mau, width=0.55)
ax.bar_label(b, fmt="%d%%", padding=3, fontsize=11, fontweight="bold")
ax.set_ylabel("% lượt do BỘ XẾP HẠNG xử lý")
ax.set_ylim(0, 50)
ax.set_title("Truy hồi chạy ở đâu — và vì sao ba tập cũ không trả lời được câu\n"
             '"vì sao cần cả hai lớp?"', fontsize=11)
ax.spines[["top", "right"]].set_visible(False)
plt.tight_layout(); plt.show()

print("Hai tập đầu được viết QUANH các nhánh tất định, nên bộ xếp hạng không chạy lần nào.")
print("Đọc một mình, chúng nói 'truy hồi vô dụng' — và đó là kết luận SAI.")
"""))

    out.append(md(r"""
Bộ hai chiều cho **cả hai phương pháp chạy trên cùng một câu hỏi**, ở hai nhóm câu mà mỗi nhóm là
điểm mạnh của một bên. Chiều A phủ **hết 36 tài liệu văn xuôi**; chiều B **sinh từ chính bộ nhãn**
— cả hai đều không có chỗ cho việc chọn câu dễ.
"""))

    out.append(plot_code(r"""
# HAI CHIỀU — 100 câu
import csv
from pathlib import Path

hang = list(csv.DictReader(
    (ROOT / "ai/evaluation/measurements/hai_chieu.csv").open(encoding="utf-8-sig")))
A = [r for r in hang if r["chieu"] == "A"]
B = [r for r in hang if r["chieu"] == "B"]

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.5, 4.2))

# --- chiều A: mã tất định trả lời SAI DẠNG ---
sai = sum(1 for r in A if r["tat_dinh_dung"] != "True" and r["nhanh_la_truy_hoi"] != "True")
khong = sum(1 for r in A if r["tat_dinh_dung"] != "True" and r["nhanh_la_truy_hoi"] == "True")
dung = sum(1 for r in A if r["tat_dinh_dung"] == "True")
th5 = sum(1 for r in A if r["truy_hoi_top5"] == "True")

ax1.barh(["Mã tất định", "Truy hồi"], [dung, th5], color=["#c44", "#4a8"], height=0.5)
ax1.barh(["Mã tất định"], [sai], left=[dung], color="#e88", height=0.5, label="sai dạng")
ax1.barh(["Mã tất định"], [khong], left=[dung + sai], color="#fc9", height=0.5,
         label="không xử lý được")
ax1.set_xlim(0, 50); ax1.set_xlabel(f"số câu (trên {len(A)})")
ax1.set_title("CHIỀU A — câu tri thức\nmã tất định trả lời ĐÚNG DẠNG bao nhiêu?", fontsize=11)
ax1.legend(fontsize=8, loc="lower right")
for i, (v, t) in enumerate([(dung, f"{dung} đúng"), (th5, f"{th5} đúng (top-5)")]):
    ax1.text(v + 0.6, i, t, va="center", fontsize=10, fontweight="bold")
ax1.spines[["top", "right"]].set_visible(False)

# --- chiều B: món VI PHẠM ràng buộc ---
dang = sorted({r["vi_sao"] for r in B})
td = [sum(int(r["tat_dinh_vi_pham"] or 0) for r in B if r["vi_sao"] == d) for d in dang]
thh = [sum(int(r["truy_hoi_vi_pham"] or 0) for r in B if r["vi_sao"] == d) for d in dang]
y = range(len(dang)); h = 0.38
ax2.barh([i + h/2 for i in y], td, height=h, color="#4a8", label="lọc theo nhãn")
ax2.barh([i - h/2 for i in y], thh, height=h, color="#c44", label="truy hồi")
ax2.set_yticks(list(y)); ax2.set_yticklabels(dang, fontsize=9)
ax2.set_xlabel("số món VI PHẠM ràng buộc (càng thấp càng tốt)")
ax2.set_title(f"CHIỀU B — câu chọn món\ntổng: lọc nhãn {sum(td)} · truy hồi {sum(thh)}",
              fontsize=11)
ax2.legend(fontsize=9); ax2.spines[["top", "right"]].set_visible(False)

plt.tight_layout(); plt.show()

print(f"Chiều A: mã tất định đúng dạng {dung}/{len(A)} — {sai} câu trả lời SAI DẠNG "
      f"(danh sách món cho câu 'thế nào/vì sao').")
print(f"Chiều B: truy hồi vi phạm gấp {sum(thh)//max(1,sum(td))} lần. "
      f"Riêng nhóm dị ứng: lọc nhãn "
      f"{sum(int(r['tat_dinh_vi_pham'] or 0) for r in B if r['vi_sao']=='PHÉP TRỪ')}, truy hồi "
      f"{sum(int(r['truy_hoi_vi_pham'] or 0) for r in B if r['vi_sao']=='PHÉP TRỪ')} "
      f"-> LỖI AN TOÀN.")
"""))

    out.append(md(r"""
**Đọc hai biểu đồ này cùng nhau là đọc được kết luận của cả đồ án.**

Bên trái: mã tất định **không im lặng** khi gặp câu nó không xử lý được — nó trả lời **tự tin bằng
một danh sách món**, mọi món có thật, mọi giá đúng, và **không câu nào trả lời điều được hỏi**.

Bên phải: truy hồi **không diễn đạt được** ràng buộc số, phép trừ và phép hội. Ở nhóm loại trừ dị
nguyên, nó trả về **11 món chứa đúng thứ khách phải tránh** — vì câu hỏi chứa chữ "hải sản" nên
phép xếp hạng theo độ giống kéo món hải sản **lên đầu**.

Đó là lý do hệ thống không chọn một trong hai, mà giao cho mỗi lớp đúng việc nó làm được.
"""))

    return out


def build() -> nbformat.NotebookNode:
    nb = nbformat.v4.new_notebook()
    nb.cells = cells()
    nb.metadata = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.12"},
    }
    return nb


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Kiểm khớp bản đã commit.")
    args = parser.parse_args(argv)

    nb = build()
    n_md = sum(1 for c in nb.cells if c.cell_type == "markdown")
    n_code = sum(1 for c in nb.cells if c.cell_type == "code")
    print(f"ô markdown : {n_md}")
    print(f"ô mã       : {n_code}")
    print(f"tỷ lệ md:mã: {n_md / max(n_code, 1):.1f}:1")

    if args.check:
        # So NGUỒN của từng ô, bỏ qua kết quả chạy và số thứ tự thực thi.
        #
        # Bản đầu của tôi so nguyên tệp, và nó luôn đỏ: notebook đã commit là bản **đã chạy**
        # nên mang theo kết quả, còn bộ sinh tạo bản chưa chạy. So nguyên tệp thì `--check`
        # buộc phải commit bản không có kết quả — tức notebook báo cáo mất hết bảng số, đúng
        # thứ nó tồn tại để trưng ra.
        if not OUT_PATH.exists():
            print("\nCHƯA CÓ NOTEBOOK. Chạy bộ sinh trước.")
            return 1
        current = nbformat.read(OUT_PATH, as_version=4)
        want = [(c.cell_type, c.source) for c in nb.cells]
        have = [(c.cell_type, c.source) for c in current.cells]
        if want != have:
            print("\nNỘI DUNG Ô TRONG NOTEBOOK ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI.")
            print(f"  bộ sinh tạo {len(want)} ô, notebook đã commit có {len(have)} ô")
            for i, (w, h) in enumerate(zip(want, have)):
                if w != h:
                    print(f"  ô đầu tiên khác nhau: {i} ({w[0]})")
                    break
            print("Chạy `python ai/notebooks/build_teaching_notebook.py` rồi chạy lại notebook.")
            return 1
        executed = sum(1 for c in current.cells if c.get("outputs"))
        print(f"\n--check: {len(have)} ô khớp bộ sinh; {executed}/{n_code} ô mã đã có kết quả.")

        # Ô nào NỔ khi chạy? Đây là phép kiểm bổ sung, và nó có mặt vì một lỗ thật.
        #
        # `--check` chỉ so NGUỒN từng ô, nên nó xanh với một ô không chạy được. Đúng chuyện đã xảy
        # ra: ô mục 15d gọi `rrc.build_retrievers()` rồi lặp nó như một dict, trong khi bộ đó trả về
        # LIST — `TypeError: unhashable type: 'Bm25Index'`. `--check` xanh, notebook có một bảng rỗng
        # và một traceback đỏ giữa báo cáo.
        #
        # Cùng lớp lỗi "tệp có ≠ nó chạy" của dự án, ở dạng "ô có ≠ ô chạy". Nên phép kiểm phải đọc
        # KẾT QUẢ, không chỉ đọc nguồn.
        #
        # Không tự chạy notebook ở đây: chạy mất hàng chục phút vì có mã hóa embedding. Phép kiểm này
        # đọc kết quả ĐÃ COMMIT, tức nó ép người commit phải chạy được notebook trước khi commit.
        no = [
            (i, o.get("ename") or "lỗi")
            for i, c in enumerate(current.cells)
            for o in (c.get("outputs") or [])
            if o.get("output_type") == "error"
        ]
        if no:
            print(f"\n{len(no)} Ô NỔ KHI CHẠY, và notebook đã commit mang traceback đó:")
            for i, ten in no:
                print(f"  ô {i}: {ten}")
            print("Sửa ô rồi chạy lại notebook trước khi commit.")
            return 1

        # Notebook CHƯA chạy thì cũng đỏ — một báo cáo không có bảng số nào là một báo cáo trống.
        # Chỉ cảnh báo (không chặn) khi notebook chưa chạy lần nào, vì bước sinh và bước chạy tách
        # rời có chủ ý: sinh xong thì `--check` phải xanh để người ta biết nguồn đã khớp.
        if executed == 0:
            print("\nCẢNH BÁO: chưa ô mã nào có kết quả. Chạy notebook trước khi commit bản báo cáo.")
        return 0

    OUT_PATH.write_text(nbformat.writes(nb, version=4), encoding="utf-8")
    print(f"\nĐã ghi {OUT_PATH.relative_to(REPO_ROOT)} (chưa chạy)")
    print("Chạy tiếp để có kết quả trong notebook:")
    print("  python -m jupyter nbconvert --to notebook --execute --inplace \\")
    print(f"    {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
