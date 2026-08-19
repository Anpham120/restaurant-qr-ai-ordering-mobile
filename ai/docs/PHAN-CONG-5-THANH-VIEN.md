# Phân công 5 thành viên

## Cách chia: theo THỨ TỰ XÂY DỰNG, không theo module

Ràng buộc phụ thuộc của hệ thống rất chặt: không có nhãn thì không lọc được món, không có kho tri
thức thì không truy hồi được, và **không có tập đánh giá thì không ai biết mình đúng hay sai**.

Chia theo module thì năm người khởi động cùng lúc rồi ba người ngồi chờ. Chia theo **chặng xây
dựng** thì mỗi người bàn giao một thứ người sau **dùng được ngay**.

```
CHẶNG 1   TV1  DỮ LIỆU                          knowledge/* · menu-tags.json
          |    91 món · 85 nhãn / 16 họ · 60 tài liệu / 213 đoạn
          |
          +--> giao BỘ NHÃN và KHO cho TV5, rồi TV1 làm tiếp phần hiểu câu hỏi
          v
CHẶNG 2   TV5  ĐÁNH GIÁ                         ai/evaluation/* toàn bộ
          |    147 ca · 60 kịch bản / 163 lượt · 114 ca truy hồi · 120 ca chọn mục
          |    viết được NGAY vì khoá đáp án là ĐIỀU KIỆN trên dữ liệu, không phải
          |    danh sách kết quả — nên KHÔNG cần chờ TV2/TV3/TV4 viết dòng nào
          v
CHẶNG 1b  TV1  HIỂU CÂU HỎI                     understand.py · 629 cụm
          |    -> Request(require/avoid/prefer · budget · wants · ~20 cờ)
          v
CHẶNG 3   TV2  TRUY HỒI                         rag/bm25 · embedding · hybrid
          |    -> Evidence, tối đa 2 đoạn      đo ngay bằng 114 ca của TV5
          v
CHẶNG 4   TV3  CHỌN MÓN & GIỎ HÀNG              answer.py · cart.py · generate.py
          |    -> Reply + thẻ giỏ               đo ngay bằng 147 ca của TV5
          v
CHẶNG 5   TV4  PHIÊN & TÍCH HỢP                 service.py · session.py · Docker
          |    -> dịch vụ HTTP chạy thật        đo ngay bằng 163 lượt của TV5
          v
CHẶNG 6   TV5  ĐÓNG VÒNG                        golden_e2e · cổng CI
               103 lượt qua stack thật — phần DUY NHẤT của TV5 phải chờ tới cuối
```

### Điều làm chuỗi này tuần tự được: khoá đáp án là ĐIỀU KIỆN, không phải kết quả

Đây là tính chất quyết định, và nó kiểm được bằng cách mở bất kỳ tập nào:

```json
cases.json            "expect": {"kind": "fact", "facts": {"m_008": {"price": 75000}}}
retrieval_cases.json  "expected": [{"topic_keys_any": ["combo_pairing"]}]
session_scripts.json  "expect": {"forbid_tags_any": ["allergen:seafood"]}
```

Không khoá nào tham chiếu tới mã. Chúng chỉ tham chiếu **thực đơn**, **bộ nhãn** và **siêu dữ liệu
của kho** — tức đúng ba thứ TV1 giao ở chặng 1.

Hệ quả: **TV5 viết được toàn bộ tập đánh giá trước khi TV2, TV3, TV4 viết dòng mã đầu tiên.** Ba
người đó có số đo **ngay lúc code chạy được**, không phải chờ tới cuối.

### Vì sao TV5 đứng thứ HAI chứ không đứng cuối

Đây là điểm khác biệt lớn nhất so với cách chia theo pipeline.

Nếu đánh giá đứng cuối thì bốn chặng trước **xây mà không đo** — và đó đúng bệnh mà dự án này đã
mắc: mỗi đường xử lý đều "chạy đúng" theo người viết chúng, không ai đo cả hệ thống. Đặt TV5 ở chặng
2 thì mỗi chặng sau có thước đo **trước khi bắt đầu**, và điều kiện nghiệm thu là một con số chứ
không phải một lời.

**TV5 là người duy nhất xuất hiện hai lần**, và lý do có thật: `golden_e2e` cần stack chạy được nên
nó buộc phải nằm sau TV4. Mọi phần khác của khâu đánh giá thì không.

### Đường tới hạn, và chỗ chạy song song được miễn phí

```
tới hạn:     TV1 dữ liệu -> TV5 tập ca -> TV2 -> TV3 -> TV4 -> TV5 golden
song song:   TV1 làm HIỂU CÂU HỎI trong lúc TV5 viết tập ca
             TV2 và TV3 chồng lấn được: TV3 dựng select() bằng Request,
             chưa cần Evidence cho tới nhánh tri thức
```

Chỉ **TV1 và TV5** nằm trên đường tới hạn ở đoạn đầu. Ba người còn lại không ai phải chờ quá một
chặng.


### Vì sao tách ĐÁNH GIÁ khỏi DỮ LIỆU

Bản trước gộp hai việc này vào một người, với lý do: cả hai đều không phải chặng runtime, và cả
hai đều là thứ mọi khâu khác dựa vào. Lý do đó **vẫn đúng**. Cái đổi là **trọng số** so với hai lý
do ngược chiều, và cả hai đều nặng hơn:

**1. Người viết dữ liệu không nên là người viết ca chấm dữ liệu đó.** Đây là lý do phương pháp,
không phải lý do tổ chức. Dự án này đã ghi lại rằng **thước đo sai nhiều lần hơn hệ thống sai** —
riêng đợt gần nhất có ba lần một "kết quả" hoá ra là lỗi bộ đo. Khi cùng một người vừa soạn kho tri
thức vừa viết ca đo truy hồi trên kho đó, họ vô thức viết ca mà họ biết kho trả lời được. Tách ra
là cách rẻ nhất để có tính độc lập.

**2. TV1 cũ nằm trên đường tới hạn của hai người.** Chính tài liệu này đã ghi: TV3 không đo được
trước khi TV1 xong ca truy hồi, TV5 không đo được trước khi TV1 xong kịch bản đa lượt. Tách đôi thì
phần dữ liệu chạy song song với phần đánh giá.

### Vì sao GỘP dữ liệu với hiểu câu hỏi

Không phải để cho nhóm trưởng nhiều việc, mà vì **một bất biến chạy vắt qua đúng hai phần đó**:

    test_understand.KhoTriThucVaTuVungPhaiKhopNhau

Mọi `topic_keys` trong kho tri thức phải có cụm từ vựng nhận ra được, và ngược lại. Hai người sở
hữu hai đầu của một bất biến thì mỗi lần thêm tài liệu là một lần phải hẹn nhau. Một người sở hữu
cả hai thì không.

**Cái giá của việc gộp, nói trước:** một người nắm cả hai đầu bất biến có thể làm **sai cả hai đầu
theo cùng một hướng**, và test so hai đầu với nhau nên nó không thấy gì. Thứ bù lại là TV5 viết ca
đánh giá **độc lập với kho** — đó chính là lý do thứ nhất ở trên.

### Cái giá phải biết trước

**Tải việc không đều, và nhóm trưởng nhận phần nặng nhất.** TV1 giữ hai khâu; bốn người còn lại
giữ một khâu mỗi người. Đổi lại, TV1 là người duy nhất không phải hẹn ai để làm việc của mình.

**TV5 nằm trên đường tới hạn của ba người, và đó là lý do TV5 đứng ở chặng 2.** TV2 không đo được
phép so truy hồi trước khi có ca truy hồi; TV3 không đo được nhánh chọn món trước khi có tập ca;
TV4 không đo được bộ nhớ phiên trước khi có kịch bản đa lượt. Đặt TV5 sau cả ba là đảm bảo cả ba
xây trong bóng tối.

**Chặng 1 phải giao ĐÚNG THỨ TỰ.** TV1 giao **dữ liệu trước, hiểu câu hỏi sau** — vì TV5 chỉ cần dữ
liệu để viết tập ca, còn `understand.py` thì TV5 không cần. Giao ngược thứ tự thì TV5 chờ 2.417 dòng
mã mà họ không dùng tới.

**Một phụ thuộc mà bảng phân công KHÔNG lường được.** `analyze_failures.py` (TV5) chỉ ra rằng 9 lượt
tham chiếu ngược thuộc lớp `capability_missing` — một khả năng chưa dựng, nằm giữa TV1 (cụm chỉ vị
trí), TV4 (`SessionState.last_listed_ids`) và TV3 (nhánh trả lời). Tức **công cụ phân tích lỗi của
TV5 sinh ra việc cho ba người khác**. Bài học: phần phân tích lỗi phải xong **trước** khi chốt phân
công, không phải sau.


---

## Giao diện đã chốt — đọc trước khi viết dòng mã nào

Năm hợp đồng dưới đây **chốt ngay tuần 1** và không đổi mà không thông báo. Chúng là điều kiện để 4
khâu runtime làm song song: ai cũng biết mình nhận gì và phải trả gì, nên viết được ngay cả khi khâu
trước chưa xong (dùng dữ liệu giả theo đúng hình dạng).

```python
# TV4 -> TV1
ChatTurn(question: str, session_state: SessionState | None)

# TV1 -> TV2  (hình dạng HIỆN CÓ, không đổi)
Request(text, folded, require_tags, prefer_tags, avoid_tags, budget_max, budget_strict,
        categories, wants, named_items, policy_topic, asks_price, asks_allergy,
        asks_extreme, is_comparison, off_topic, unparsed_restriction, ...)

# TV2 -> TV3
Evidence(verbatim: str | None,            # tài liệu answer_mode=verbatim, trả NGUYÊN VĂN
         chunks: list[KnowledgeChunk])    # tài liệu answer_mode=synthesize, cho mô hình đọc

# TV3 -> TV4
Reply(text, items, kind, asks_back, branch, notes, cart: list[CartAction])
CartAction(menu_item_id, name, quantity, reason, evidence_ids,
           requires_customer_confirmation=True)   # LUÔN True, không nhánh nào đặt False

# TV5 cung cấp TIÊU CHÍ cho tất cả
KnowledgeChunk(chunk_id, doc_id, title, heading, topic_keys, source, answer_mode, text)
cases.json + answer_metric.score(case, answer, menu, named) -> Verdict
```

Ai cần đổi một trong các hợp đồng này thì **nhắn cả nhóm trước khi sửa**.

---

---

# TV1 — Dữ liệu + Hiểu câu hỏi  *(nhóm trưởng)*

### Câu hỏi khâu này trả lời
*AI được phép nói gì và dựa vào dữ liệu nào — và câu khách vừa gõ nêu ra những ràng buộc gì?*

### Vì sao hai việc này thuộc cùng một người
Một bất biến chạy vắt qua đúng hai phần: `KhoTriThucVaTuVungPhaiKhopNhau` đòi mọi `topic_keys`
trong kho có cụm từ vựng nhận ra được, và ngược lại. Hai chủ sở hữu thì mỗi lần thêm tài liệu là
một lần phải hẹn nhau; một chủ sở hữu thì không.

Chúng cũng đòi **cùng một loại kỷ luật**: *số phải tính được, không được viết tay*. Dự án đã mắc lỗi
đó nhiều lần ở đúng hai phần này — `"hơn 90 món"` khi thực đơn có đúng 91, và kiểm kê đụng chữ ghi
`32/90` khi thật là con số khác.

### Kiến thức phải nắm

**Phần dữ liệu**
- Ba loại câu hỏi **A tra cứu / B tri thức / C phán đoán**, và vì sao loại A **không** được để mô
  hình sinh trả lời.
- **Rút dấu tiếng Việt là phép mất thông tin.** Bảy lỗi bản cũ đều từ đây, và chúng là **một lớp
  lỗi** xuất hiện bảy lần. Cách chặn là đổi *hình dạng dữ liệu* (nhãn mang tiền tố nhóm), không
  phải sửa từng lỗi.
- **Độ phủ nhãn quyết định lọc được hay không.** Nhóm phủ 91/91 thì thiếu nhãn là *lỗi dữ liệu*;
  nhóm phủ một phần thì thiếu nhãn là *chưa ghi nhận*, **không** phải *không có*. Nhãn `allergen`
  chỉ phủ 44/91 món — nên danh sách lọc ra **không phải kết luận về an toàn**.
- **MỘT kho, HAI chế độ trả lời.** `verbatim` trả nguyên văn (mô hình không chạm vào chữ);
  `synthesize` là đầu vào cho mô hình viết. Số **kho** gộp được; số **chế độ trả lời** không, vì nó
  là chuyện an toàn.
- **Provenance `derived` vs `demo`**: `derived` sinh từ thực đơn nên không thể lệch; `demo` là nội
  dung người viết.
- **Chunking**: chia theo heading `##`, kèm tiêu đề tài liệu vào mỗi đoạn, `chunk_id` tất định. Cửa
  `audience: guest` **từ chối** tệp không phải nội dung cho khách — không phải lọc bỏ.

**Phần hiểu câu hỏi**
- **Khớp cụm dài trước, rồi ăn hết đoạn đã khớp.** Cơ chế này bảo vệ **106 cụm có nguy cơ** (86 bị
  chứa trong cụm khác, 47 nằm trong tên món, 27 thuộc cả hai). Số này do
  `test_understand.collision_census()` tính, và **có test chốt giá trị** — nên nó không lệch âm
  thầm được. Nhưng dòng bạn đang đọc thì **viết tay**: bản trước ghi 89/70/40/21 và tự nhận là
  "không viết tay", trong khi bốn số đó đã cũ. Khi test kiểm kê đỏ, hãy sửa cả dòng này.
- **Ràng buộc khác ngữ cảnh.** "Tôi ăn chay" là ràng buộc (lọc cứng); "tôi đi hẹn hò" là ngữ cảnh
  (chỉ sắp thứ tự). Lẫn hai thứ thì câu hẹn hò chỉ còn **1 món** trong 91.
- **Mô hình chỉ HIỂU, không CHỌN.** Nó trả về nhãn, và mọi nhãn đi qua **cổng kiểm**: nhãn không có
  thật hoặc sai vai thì **bị bỏ**, không phải được dùng rồi hy vọng đúng.
- **An toàn không được phụ thuộc mô hình sinh.** Proxy chết thì khách mất phần gợi ý tinh, **không
  mất bảo vệ dị ứng**.

### Đã xong
Kho tri thức **60 tài liệu / 213 đoạn** (24 `verbatim` + 36 `synthesize`; 8 `derived` + 52 `demo`),
**182 đoạn được xếp hạng** — 49 tài liệu sinh-theo-nhãn đã bị bỏ sau khi đo được chúng chiếm 51%
chỉ mục mà không phục vụ đường nào. Từ điển **85 nhãn / 16 nhóm**, hai nguồn thực đơn khớp 91/91. Tập đánh giá
**140 ca / 45 họ**, chia theo họ thành chốt / phát triển / niêm phong. Thước đo có bộ dò lỗ tìm
**0 lỗ**.

### Việc còn lại
1. Mở rộng kho **khi có nhu cầu thật**. Tiêu chí: *nhóm này có câu hỏi nào mà lớp tra khóa không
   trả lời được không?* Thêm tài liệu cho nhóm đã đúng 100% là tạo **đường thứ hai cho cùng một
   việc** — và khi câu trả lời sai thì không ai biết đường nào sai.
2. **Bảo trì hình dạng `Request`** khi thêm ràng buộc mới, và báo TV4 mỗi lần đổi. TV1 KHÔNG
   sở hữu `session.py` — xem ghi chú "Một tệp, hai chủ" ở cuối mục này.
3. Nối thêm tên món tới nhóm dị nguyên khi gặp cách nói chưa phủ — **luôn kèm ca nhóm CHỐT của
   TV5**, và đo bằng cách **chạy `understand()` thật**, không phân tích chuỗi con.

### Sở hữu tệp
`ai/knowledge/*` · `ai/app/rag/chunker.py` · `ai/app/test_chunker.py` ·
`ai/scripts/build_knowledge.py` · `build_tag_dictionary.py` · `audit_allergen_tags.py` ·
`data/menu-tags.json` ·
`ai/app/understand.py` · `llm_understand.py` · `test_understand.py` · `test_llm_understand.py` ·
`test_source_hygiene.py`

### Một tệp, hai chủ — chỗ ranh giới mỏng nhất của bảng phân công

`session.py` thuộc **TV4**. Nhưng hàm `merge_into_request()` bên trong nó **đọc và ghi vào
`Request`** — cấu trúc TV1 sở hữu. Một bản trước của tài liệu này bảo TV1 "chủ động nhận phần hợp
nhất", trong khi vẫn liệt kê `session.py` dưới tệp của TV4. Hai câu đó mâu thuẫn nhau.

Ranh giới đúng, và nó chạy **theo dữ liệu** chứ không theo tệp:

| Ai | Sở hữu cái gì | Cụ thể |
|---|---|---|
| **TV1** | **hình dạng** `Request` | có trường nào, mỗi trường nghĩa gì, nhóm nhãn nào ghi đè nhóm nào |
| **TV4** | **ba quy tắc hợp nhất** và toàn bộ `session.py` | dị nguyên cộng dồn · ràng buộc cứng ghi đè · ngữ cảnh giữ 5 |

Nói cách khác: TV1 quyết định **cái gì được nhớ**, TV4 quyết định **nhớ như thế nào qua các lượt**.

Hệ quả thực hành: TV1 thêm một trường ràng buộc mới thì phải nói cho TV4 biết nó thuộc nhóm nào
trong ba nhóm trên — thiếu bước đó thì trường mới **im lặng không được nhớ**, và không test nào đỏ
vì test của TV4 chỉ phủ các trường TV4 biết.

### Tự đo bằng
```bash
python ai/scripts/build_knowledge.py --check
python ai/scripts/build_tag_dictionary.py --check
python ai/scripts/audit_allergen_tags.py
python -m unittest test_understand test_llm_understand test_source_hygiene   # trong ai/app
python ai/evaluation/run_baseline.py --all
python ai/evaluation/run_ablation.py
```


---

# TV2 — Truy hồi

### Câu hỏi khâu này trả lời
*Câu này cần đoạn tri thức nào — và phương pháp lấy nào tốt hơn, đo được?*

### Kiến thức phải nắm
- **BM25** (`k1=1.5`, `b=0.75`, tách từ dùng `understand.fold`), **embedding**
  (`BAAI/bge-m3`, 1024 chiều, cosine), **hybrid RRF** (`k=60`).
- **Chỉ số**: Hit@1, Hit@5, MRR@5, nDCG@5, và **forbidden@5** — chỉ số cuối quan trọng nhất, vì nó
  đo việc trích đoạn **sai chủ đề**. Con số phải kèm `n`: 120 ca thì một ca lệch là 0,8%.
- **Giao thức đo độ trễ**: screening 1 lần và release 7 lần là hai giao thức khác nhau. Bản cũ trộn
  chúng rồi so 29ms với 81ms như cùng loại.
- **Đoạn `verbatim` bị loại khỏi chỉ mục xếp hạng** — chúng đã có đường tới khách riêng (tra khóa,
  trả nguyên văn). Để trong chỉ mục là hai đường tới cùng nội dung, và đường xếp hạng có thể trích
  một câu chính sách ra giữa câu tư vấn món.
- **Không phải chỗ nào cũng nên dùng RAG.** Nhóm nhãn `price` phủ 91/91 món nên lọc theo nhãn đúng
  **100%**, còn BM25 và embedding **không hiểu số**.

### Nhận từ TV1
Kho **425 đoạn `synthesize`** với 4 bất biến đã ép: mọi đoạn kèm tiêu đề tài liệu, `chunk_id` tất
định và không trùng, dãy mã liên tục từ 0, cửa `audience: guest`. Đây là **hiện vật đã hoàn thành** —
TV2 không phải soạn nội dung, chỉ làm cách lấy.

### Đã làm, và kết quả

**1. Ba bộ truy hồi, một giao diện** — `base.Retriever.search(query, k) -> list[Hit]`. Giao diện chỉ
xếp hạng: **không lọc, không ngưỡng**. Bản cũ trộn `RetrievalFilters` vào cùng lớp nên không ai nói
được một đoạn lên đầu vì *nó liên quan* hay vì *các đoạn khác bị lọc mất*.

**2. So trên hai bài toán** — và một nửa dự đoán SAI:

| Bài toán | Dự đoán | ĐO ĐƯỢC |
|---|---|---|
| truy hồi tri thức | "hybrid tốt nhất" | **SAI.** embedding 0,921 > hybrid 0,895 > bm25 0,711 (Hit@5, 40 ca niêm phong), và hybrid có `cấm@5` **cao nhất** |
| truy hồi tri thức | "BM25 thắng ở câu có tên riêng" | **đúng một phần.** BM25 hơn ở `kb-method` (+0,150), embedding hơn hẳn ở `kb-occasion` (+0,333) và `kb-region` (+0,150) |
| chọn món | "lọc theo nhãn thắng dứt khoát" | **đúng.** lọc nhãn 8/8 và **0 ca sai**; ba cách xếp hạng sai **6–7/8 ca** |

Lý do hybrid thua, đo được: RRF hợp nhất theo **HẠNG** nên bỏ hết thông tin khoảng cách điểm — khi
một bộ chắc chắn hơn bộ kia rất nhiều thì hợp nhất là **kéo bộ tốt xuống**.

**3. Ablation nói ra hai chỗ tôi viết SAI trong mã**: *chuẩn hóa L2* không mất gì (vector e5 đã gần
chuẩn đơn vị → cơ chế **DƯ với kho này**); *tiền tố E5* tắt đi làm Hit@5 **tăng** +0,023 — nhưng
`cấm@5` tăng từ 11 lên 13, nên cơ chế **vẫn được giữ** theo đúng chỉ số đã tuyên bố là quyết định.

Bảng ablation đầu của tôi cũng sai: nó in cả ba phương pháp cho mọi cơ chế, nên có dòng "tắt chuẩn
hóa vector · bm25 · cơ chế này DƯ" — BM25 **không có vector nào để chuẩn hóa**.

**4. `sentence-transformers` KHÔNG vào `ai/requirements.txt`.** Nó nằm riêng ở
`ai/requirements-rag.txt`. Ba lý do đo được: đường `synthesize` mà nó phục vụ **chưa có ai gọi**
(`answer.py` tra khóa 24 chủ đề, đúng 100%, 0 ms); chậm hơn **75 lần** để đổi lấy **0 ca đúng thêm**;
**+2–3GB** ảnh Docker. Điều kiện để nhập vào: **khi đường `synthesize` được dựng**.

### Sở hữu tệp
`ai/app/rag/base.py` · `bm25.py` · `embedding.py` · `hybrid.py` · `ai/app/test_rag.py` ·
`ai/evaluation/run_retrieval_comparison.py` · `ai/requirements-rag.txt`

### Tự đo bằng
```bash
python -m unittest test_rag                        # trong ai/app — công thức tính tay được
python ai/evaluation/run_retrieval_comparison.py   # BM25 nếu thiếu thư viện, CÓ IN RÕ đã bỏ qua
python -m pip install -r ai/requirements.txt   # nay đã gồm embedding — xem 07-error-analysis mục 15
python ai/evaluation/run_retrieval_comparison.py --ablation
```

### Điều phải nói ra trong báo cáo
**Chưa chạy phép so nào.** Viết con số về BM25/embedding trước khi chạy là **bịa**, và một báo cáo
có một số bịa thì mọi số còn lại mất giá trị. Tập niêm phong của phép so **chỉ được mở một lần**.

---

---

# TV3 — Chọn món & giỏ hàng

### Câu hỏi khâu này trả lời
*Với những ràng buộc đã hiểu, món nào thỏa — và thẻ giỏ gợi ý gồm gì?*

### Kiến thức phải nắm
- **Sáu nhánh loại trừ**, không nhánh nào chồng nhánh nào, và thứ tự là thứ tự loại trừ. Bản cũ có
  **8 đường chồng nhau**, 2 trong số đó bị một cờ tắt mà hệ thống vẫn chạy đúng.
- **Fail-closed cho dị nguyên**: áp cuối cùng, **không bao giờ nới**, kể cả khi kết quả rỗng. Thà
  nói "không có món nào phù hợp" còn hơn mời khách món có thể gây dị ứng.
- **Nhóm nhãn không phủ hết 91 món chỉ được dùng theo chiều khẳng định** (đưa lên trước), không được
  dùng để loại.
- **Thẻ giỏ phải sinh từ ĐÚNG danh sách món mà `answer.py` đã chọn.** Không có đường sinh thẻ riêng
  — hai đường sẽ lệch nhau, và lệch ở đây nghĩa là thẻ giỏ chứa món khách dị ứng.

### Đã xong
`answer.py` — 6 nhánh, fail-closed, `prefer_tags` chỉ xếp thứ tự. 122/122 ca, 0 lỗi an toàn.

### Đã xong
`answer.py` 6 nhánh loại trừ, fail-closed. `cart.py` với **5 bất biến**, 20 test — cộng
`test_answer.py` 13 test cho phần trước đó chỉ được kiểm qua 119 ca.

**Một lỗi thật đã sửa ở khâu này:** câu "Món nào không cay?" trả **sáu loại bia**. Đo được
**13/119 ca** khách hỏi "món" mà nhận toàn đồ uống, và **cả 13 đều QUA** đánh giá vì khóa đáp án
không cấm đồ uống. Nguyên nhân là thứ tự sắp: 5 món rẻ nhất thực đơn đều là đồ uống
(12.000–30.000đ) còn món ăn rẻ nhất 35.000đ. Sửa bằng cách xếp món ăn trước — **ngữ cảnh, không
phải ràng buộc**, nên "món nào rẻ hơn 20 nghìn" vẫn đúng là trả đồ uống. 13 ca → 2 ca.

### Năm bất biến của `cart.py`

1. Mọi món trong thẻ phải tồn tại trong thực đơn, **giá lấy từ thực đơn**.
2. `requires_customer_confirmation` **luôn `true`**. Không có nhánh nào đặt `false`.
3. Món bị `avoid_tags` loại **không bao giờ** vào thẻ — kể cả khi mô hình đề xuất.
4. Chỉ sinh thẻ ở nhánh `filter`, `compare`, `item_detail`. Nhánh `clarify`, `no_data`, `refuse`
   **không có thẻ** — gợi ý đặt món khi chưa hiểu câu hỏi là sai.
5. `reason` nêu **ràng buộc đã thỏa**, không phải câu quảng cáo. Sinh từ `require_tags` và
   `avoid_tags` nên không thể bịa.

Cộng: bỏ món trong `suggested_menu_item_ids` khi khách nói "món khác đi" (backend đã có
`GetExcludedMenuItemIds`).

### Sở hữu tệp
`ai/app/answer.py` · `cart.py` · `test_cart.py`

### Tự đo bằng
```bash
python ai/evaluation/run_baseline.py --all     # trả mã khác 0 nếu có lỗi an toàn
python -m unittest test_cart                   # trong ai/app
```

---

---

# TV4 — Cổng vào & phiên

### Câu hỏi khâu này trả lời
*Backend gọi vào thế nào, và bộ nhớ trong một phiên QR sống chết ra sao?*

### Kiến thức phải nắm
- **FastAPI**: endpoint, dependency, xác thực bằng token nội bộ, SSE cho `/v1/chat/stream`.
- **Ba quy tắc hợp nhất bộ nhớ**, và quy tắc đầu là **chốt an toàn**:

  | Loại | Quy tắc | Nếu sai |
  |---|---|---|
  | dị nguyên (`avoid_tags`) | **cộng dồn, không bao giờ bỏ** | khai dị ứng lượt 1 → lượt 5 bị mời món hải sản |
  | ràng buộc cứng (`spice`, `price`, `diet`, `party`) | lượt mới **ghi đè** cùng nhóm | "rẻ hơn nữa" cộng thêm thay vì thay ngân sách cũ |
  | ngữ cảnh (`prefer_tags`) | cộng vào, giữ **5 gần nhất** | bộ nhớ phình vô hạn |

- **Rolling summary phải sinh TẤT ĐỊNH**, không nhờ mô hình. Câu trả lời sai thì sai một lượt; bộ
  nhớ sai thì **sai suốt phiên**.
- **Thoái hóa êm**: thiếu cấu hình hay proxy chết thì trả câu trả lời tất định, không sập. Dự án đã
  mắc lỗi này một lần — `urllib.request.Request(...)` nằm ngoài khối `try` nên thiếu cấu hình là
  **sập**, trong khi tài liệu khẳng định nó thoái hóa êm. CI tìm ra vì CI là môi trường duy nhất
  không có `ai/.env`.

  → **Khẳng định về hành vi khi lỗi thì phải có test cho đúng đường lỗi đó.**

### Đã có sẵn, đừng viết lại
Backend **đã xóa bộ nhớ đúng lúc**: `IChatStore.DeleteSessionsByTableSession` được gọi khi đóng
phiên (`TableEndpoints.cs:508`), khi hết hạn (`:708`/`:713`), và khi thanh toán
(`TableInvoiceEndpoints.cs:401`). `SuggestedCartActionResponse` và `ChatSessionStateSnapshot` cũng đã
có. Backend đọc JSON của AI **hoàn toàn bằng `TryGetProperty`** nên mọi trường đều optional — dịch
vụ mới chỉ cần trả tập trường nhỏ hơn với **đúng tên cũ**, nên **không phải phá hợp đồng**.

### Đã xong
1. `ai/app/service.py` — 5 endpoint, 24 test. Ca **thiếu token trả 401**; token trống trong môi
   trường thì **từ chối mọi yêu cầu** (503), không mở cửa.
2. `ai/app/session.py` — ba quy tắc hợp nhất, 22 test, rolling summary tất định.
3. `ai/contracts/ai-chat-v1.schema.json` — viết xong, và `test_contract.py` đối chiếu nó với
   **phản hồi THẬT** trên 8 dạng câu hỏi. Phép kiểm phía backend đã tự bật lại.

### Việc còn lại — đã xong
1. ~~`deploy/docker-compose.yml` — bỏ `AI_PIPELINE_PROFILE`.~~ Đã bỏ. Chú thích cũ nói biến đó
   "chỉ để ghi log" — **sai**: `ReadPipelineProfile()` kiểm nó với một danh sách cho phép và ném
   lỗi, nên một giá trị lạ làm **500 mọi lượt chat**.
2. ~~**Chạy thật** `docker compose up`.~~ Đã chạy nhiều lần: 4/4 container healthy, đường khách
   trọn vẹn qua backend thật, 0 món dị nguyên qua nhiều lượt.
3. Còn lại: `last_listed_ids` đi vòng tròn qua `constraints` được rồi, nhưng backend **chưa có
   trường riêng** cho nó — nếu sau này ai đó thu gọn `constraints` thì tham chiếu ngược mất im
   lặng. Có 3 test chốt, gồm một chiều nghịch.

### Chặn bởi — đã hết
Từng cần kịch bản đa lượt của TV5 để đo bộ nhớ; nay có 60 kịch bản / 163 lượt và **không lượt nào đỏ**.

Chạy thật qua backend tìm ra **4 lỗi mà 229 test không thấy**, cả bốn là **lệch hợp đồng giữa hai
bên** — đúng loại lỗi test một phía không thể thấy. Nên điều kiện chấp nhận của khâu này vẫn là
**chạy thật**, và nó không thay được bằng test dù test có bao nhiêu.

### Sở hữu tệp
`ai/app/service.py` · `session.py` · `test_service.py` · `test_session.py` · `ai/contracts/*` ·
`ai/Dockerfile` · `deploy/docker-compose.yml`

### Tự đo bằng
```bash
python -m unittest test_service test_session test_packaging   # trong ai/app
dotnet test backend/RestaurantQrAiOrdering.sln
```

### Điều kiện chấp nhận — không thay được bằng test
`docker compose up` → quét QR → hỏi 5 câu gồm một câu khai dị ứng → thẻ giỏ hiện đúng và thêm được
vào giỏ → hỏi tiếp **không nhắc lại dị ứng**, xác nhận vẫn được bảo vệ → đóng phiên, mở lại, xác
nhận **bộ nhớ đã mất**.

---

---

# TV5 — Đánh giá

### Câu hỏi khâu này trả lời
*Làm sao biết câu trả lời đúng hay sai — và làm sao biết chính thước đo không sai?*

### Vì sao đây là một vai RIÊNG, không phải việc chung
Nếu mỗi người tự chấm phần mình thì đó đúng bệnh bản cũ: 8 đường xử lý đều "chạy đúng" theo người
viết chúng, không ai đo cả hệ thống, và **thước đo sai 3 lần trước khi hệ thống sai**.

Và TV5 **không xây gì trong pipeline**. Đó là chủ ý: người chấm không sở hữu thứ bị chấm. Riêng với
kho tri thức, tách khỏi TV1 còn quan trọng hơn — người soạn kho vô thức viết ca mà họ biết kho trả
lời được.

### Kiến thức phải nắm

**Phần đo lường**
- **Khóa đáp án là truy vấn, không phải danh sách.** Danh sách viết tay thì không có cách nào kiểm —
  bản cũ có 96 khóa trỏ sai chỗ suốt nhiều tháng.
- **Test hai chiều.** Thước đo chỉ có test "bắt được lỗi" thì qua được bằng cách chấm đỏ mọi thứ.
- **Ba nhóm, không phải hai.** Ca an toàn là **chốt**, không phải số liệu — một ca chốt đỏ là
  **chặn**, kể cả khi tỷ lệ chung tăng.
- **Bộ dò lỗ** tìm lỗi *chưa nghĩ tới*. Khi bịt một lỗ, con số nền tụt từ **0,9960 xuống 0,7368** —
  tức 99,6% kia gần như hoàn toàn ảo.
- **`criterion_too_strict` là lớp lỗi dễ bỏ qua nhất.** Dấu hiệu: **nhiều ca đỏ cùng MỘT thông báo**
  thì thường là tiêu chí sai, không phải hệ thống sai. Vừa xảy ra: 7 ca dị ứng mới đỏ đồng loạt vì
  khóa đáp án ghi `allowed: savoury` trong khi câu hỏi không nói "món ăn".

### Đã xong
Bốn tập đánh giá, chia theo **họ** nên câu diễn đạt lại không rơi hai bên. Thước đo có bộ dò lỗ tìm
**0 lỗ**. `analyze_failures.py` phân 7 lớp nguyên nhân — kế hoạch nêu sáu, lớp thứ bảy
(`capability_missing`) do **phép đo** chỉ ra.

### Việc còn lại
1. Giữ bốn tập **khớp kho khi TV1 đổi dữ liệu**. Bộ sinh ca có `--check` trong CI, nên lệch là đỏ
   chứ không im lặng — nhưng ai đó vẫn phải sinh lại và đọc phần đổi.
2. **Tập niêm phong đã mở hết.** Muốn có con số held-out lần nữa thì phải viết ca **mới**, chưa
   từng dùng. Đây là việc chỉ TV5 làm được, và nó là điều kiện để chương kết quả nói được gì.
3. Giữ `run_chung_cu_dinh_tuyen.py` khớp hành vi: bảng `PHAN_XU` là **phán xử của người**, nên nó
   phải được đọc lại mỗi khi định tuyến đổi. Bộ chạy tự báo `CHƯA PHÂN XỬ` khi có ca mới.

### Sở hữu tệp
`ai/evaluation/*` **toàn bộ** · `.github/workflows/ci.yml` (phần cổng đánh giá)

### Tự đo bằng
```bash
python ai/evaluation/validate_cases.py
python ai/evaluation/validate_retrieval_cases.py
python ai/evaluation/build_split.py --check
python ai/evaluation/probe_metric_holes.py
python ai/evaluation/analyze_failures.py
python -m unittest discover -s ai/evaluation -p "test_*.py"
```


---

## Trạng thái — cả năm khâu ĐÃ XONG, kèm số và kèm chỗ CHƯA đóng được

Bảng này từng **trôi số**: nó ghi "119 ca / 25 kịch bản / 65 lượt" trong khi thật là 132 / 30 / 82,
và cột "Còn lại" của hai khâu nêu việc đã làm xong. Đó đúng **điều cấm số 3** của chính tài
liệu này — *"viết số vào tài liệu thay vì tính nó"* — và là lần thứ ba dự án mắc nó.

Số dưới đây lấy ngày **2026-07-30**, và mọi con số đều **kiểm lại được bằng một lệnh** ghi ở cột
cuối. Cột đó là thứ giữ bảng khỏi trôi tiếp: đọc bảng mà nghi thì chạy lệnh.

| TV | Đã làm | Số đo | Kiểm lại bằng |
|---|---|---|---|
| **1** | **140 ca trả lời** / 45 họ · **138 ca truy hồi** / 14 họ · **33 kịch bản** / 87 lượt / 7 nhóm · thước đo · `analyze_failures.py` (7 lớp nguyên nhân) | bộ dò lỗ **0 lỗ**; 9 loại ca viết sai bị chặn; bộ chạy phiên chặn **2 kiểu ca LUÔN XANH**; `validate_cases.py` chặn khóa `expect` VÀ khóa `facts` mà thước đo không thực thi | `validate_cases.py` · `probe_metric_holes.py` |
| **2** | từ vựng: 20 cụm tên món dị nguyên · 23 cụm cách khách mô tả · cụm chỉ vị trí · **33 cụm chủ đề tri thức** · **mẫu số học** (không phải cụm từ khóa) | **140/140** chỉ bằng mã tất định, mô hình đổi **0 ca**, 0 lỗi an toàn | `run_baseline.py --all` · `run_with_model.py` |
| **3** | `base.py` · `bm25.py` · `embedding.py` · `hybrid.py` · `run_retrieval_comparison.py` · **`_knowledge_chunk` (đường synthesize)** | niêm phong: embedding Hit@5 **0,921** · bm25 0,711 · hybrid 0,895. Chọn món: **lọc nhãn 8/8, 0 sai** | `run_retrieval_comparison.py` |
| **4** | `cart.py` + 5 bất biến · **6 phép kiểm giỏ trong thước đo, áp cho MỌI ca** | 20 test đơn vị + **229 thẻ giỏ chấm trên 140 ca** (84/140 ca có thẻ); 0 món dị nguyên vào thẻ ở cả hai chế độ | `run_baseline.py --all` · `run_with_model.py` |
| **5** | 5 endpoint · `session.py` 4 quy tắc hợp nhất · schema · **`last_listed_ids` đi vòng tròn qua backend** · **golden đầu-cuối: 13 hội thoại / 42 lượt qua ĐỦ 6 chặng, gồm đường SSE và bước bấm thêm vào giỏ thật** | **87/87 lượt phiên** và **42/42 lượt golden** (đo ở CẢ HAI cấu hình mô hình), 0 lỗi an toàn; 7 bất biến thẻ giỏ áp cho mọi lượt, trong đó **thẻ phải là món vừa tư vấn**; 4/4 container healthy; **CI 5/5 job xanh** (job `golden-e2e` dựng stack thật) | `run_session_eval.py` · `run_golden_e2e.py` · `gh run list` |

### Chỗ CHƯA đóng được, và ai đóng được

Ba điều đầu **không ai trong nhóm đóng được** — chúng cần dữ liệu thật hoặc chủ nhà hàng:

| Chỗ chưa đóng | Vì sao không tự đóng được | Ai đóng |
|---|---|---|
| CI không kiểm được LỚP MÔ HÌNH | Job `golden-e2e` dựng stack thật nhưng `LLM_BASE_URL` trỏ vào cổng chết, nên 42 lượt chạy trên đường tất định. Hai cấu hình cho cùng câu trả lời ở cả 42 lượt, và mô hình đổi 0/140 ca — nhưng "đổi 0 ca trên tập này" không phải "mô hình không thể làm sai" | cần một khóa mô hình trong secrets — quyết định của chủ dự án |
| Không có log khách thật | 140 ca và 87 lượt đều do người viết. Số đo được hệ thống *có tôn trọng ràng buộc hay không*; nó **không** đo được khách thật hỏi gì | chỉ có sau khi chạy thật với khách |
| 52/108 tài liệu tri thức là `demo` | không thể sai về **con số** (số lấy từ thực đơn) nhưng có thể sai về **chính sách** | chủ nhà hàng |
| Tập niêm phong đã dùng hết ở **cả hai** tập | mọi con số hiện tại không còn là held-out | cần tập MỚI, và chỉ mở một lần |
| Kịch bản đa lượt chưa chấm thẻ giỏ | lỗ đo, nhỏ | TV5 + TV3 |

### Một điều phải nói vì nó là bằng chứng

Ngày 2026-07-30 nhóm soát lại hệ thống **năm lần từ năm góc khác nhau**, và **lần nào cũng tìm ra
lỗi thật mới** dù lần trước đã 100%:

| Góc soát | Tìm ra |
|---|---|
| chạy thật qua backend | **4 lỗi** sau khi 229 test đã xanh |
| lấp lỗ nhãn mùa | **2 lỗi của hạ tầng gắn nhãn** — `--check` luôn trả 0, và sửa nhãn không tới cơ sở dữ liệu |
| chấm thẻ giỏ | **2 lỗi sâu hơn** — thước đo không so `kind`, mô hình đoán `wants` làm câu mơ hồ thành 6 món |
| đẩy CI | **CI chưa từng chạy** vì một byte `0x08` trong `ci.yml` |
| soát tương thích | **8 ca mang tiêu chí không bao giờ chạy**, che 3 điểm yếu khách đọc thấy |

Nên câu đúng là **"không còn vấn đề nào nhóm BIẾT"**, không phải "không còn vấn đề". Tỷ lệ 100% đo
trên tập ca do chính nhóm viết, và mỗi góc nhìn mới lại thấy chỗ tập ca không phủ. Đó không phải lý
do để không tin con số — nó là lý do để **thêm góc soát**, và mỗi lỗi tìm được đã thành một ca.

Điều làm việc này chạy được: **tiêu chí kiểm chứng viết được trước khi mã tồn tại**, vì tiêu chí đến
từ định nghĩa khâu chứ không từ mã người khác.

---

## Ba điều cấm chung — ai vi phạm cũng làm CI đỏ

| Cấm | Vì sao | Cưỡng chế bởi |
|---|---|---|
| Nới lỏng lọc dị nguyên, kể cả khi kết quả rỗng | thà nói "không có món phù hợp" còn hơn mời món gây dị ứng | `run_baseline.py` trả mã khác 0 |
| Để mô hình sinh **chọn** món hoặc **nêu** giá | mô hình không tất định; chọn món và giá phải tra bảng | `test_llm_understand.py` |
| **Viết số vào tài liệu** thay vì tính nó | số viết tay luôn trôi khỏi dữ liệu. Dự án đã mắc hai lần: "hơn 90 món" khi có đúng 91, và kiểm kê đụng chữ "32/90" khi thật là 53/40 | `--check` trong CI, `collision_census()` |

## Quy tắc sở hữu tệp

Chỉ người sở hữu được sửa tệp trong cột "Sở hữu tệp". Cần đổi tệp của người khác thì **nhắn họ**,
không tự sửa. Đây là quy tắc chống xung đột git, và cũng chống việc hai người sửa cùng một chỗ theo
hai hướng ngược nhau.

Các hợp đồng ở mục "Giao diện đã chốt" là ngoại lệ: **đổi chúng phải nhắn cả nhóm.**

## Mỗi tuần báo đúng ba dòng

```
TV3 — tuần 2
  số đo: run_baseline.py --all -> 111/119 (tuần trước 108/119), 0 lỗi an toàn
  làm được: thẻ giỏ + 5 test bất biến
  đang vướng: chưa rõ "món khác đi" nên bỏ bao nhiêu món đã gợi ý — cần TV5 viết ca
```

Dòng **số đo** bắt buộc và phải là con số chạy được. Bài học đắt nhất của dự án là *thước đo sai 3
lần trước khi hệ thống sai*, nên "cảm giác đã tốt hơn" không tính là tiến độ.

## Ba tài liệu ai cũng phải đọc trước khi bắt đầu

1. **`ai/README.md`** — 5 nguyên tắc của bản dựng lại.
2. **`ai/notebooks/he_thong_ai_tu_van_dat_mon.ipynb`** — 92 ô, mỗi ô mã tính lại từ mã sống. Chạy nó
   là hiểu toàn hệ thống bằng **số**, không bằng lời.
3. **`ai/docs/00-problem-statement.md`** — AI được phép trả lời gì, và tuyệt đối không làm gì.

## Trạng thái hiện tại

| TV | Vai | Bằng chứng |
|---|---|---|
| **1** | **Dữ liệu + Hiểu câu hỏi** *(nhóm trưởng)* | kho **60 tài liệu / 213 đoạn** (182 xếp hạng) · 85 nhãn / 16 nhóm · 91/91 món khớp hai nguồn · **629 cụm** từ vựng · 107 cụm nguy cơ đụng chữ đều bị cơ chế khớp-dài-trước chặn |
| **2** | Truy hồi | **114 ca** · chốt embedding `bge-m3`, `written` Hit@2 **0,879** · hybrid p=1,0000 và reranker p=0,8238 đều **không thắng** |
| **3** | Chọn món & giỏ hàng | lọc nhãn **100,00%** · 4 bất biến giỏ hàng · **0 lỗi an toàn** trên mọi tập |
| **4** | Cổng vào & phiên | 5 endpoint · 3 quy tắc hợp nhất bộ nhớ · hợp đồng schema · **đã chạy thật qua `docker compose`** |
| **5** | **Đánh giá** | 147 ca trả lời · 60 kịch bản / 163 lượt · 114 ca truy hồi · 120 ca chọn mục · bộ dò lỗ **0 lỗ** · **14 cổng `--check`** |

> **Bảng này đã hai lần gán sai vai.** Lần một: nó lệch một bậc so với chính phần định nghĩa ở đầu
> tài liệu, vì còn sót từ cách chia cũ. Lần hai: nó vẫn giữ cách chia cũ sau khi nhóm trưởng đổi
> phân công. Cả hai lần, **số liệu được cập nhật còn nhãn TV thì không ai soát**.
>
> Ghi ra vì đây đúng lớp lỗi cả dự án này canh: **một bảng sai âm thầm nguy hiểm hơn một bảng
> thiếu.** Người đọc tin bảng, và ở đây người đọc là giảng viên chấm.

**Số đo hiện tại:**

| Phép đo | Quy mô | Kết quả |
|---|---:|---|
| Tập ca trả lời | 147 ca | **147/147** (niêm phong 48/48) |
| Bộ nhớ phiên | 60 kịch bản / 163 lượt | **không lượt nào đỏ**, 0 lỗi an toàn |
| Golden đầu-cuối | 103 lượt | **103/103** ở cả hai cấu hình |
| Truy hồi | 114 ca | `written` Hit@2 **0,879** · `cấm@5` giảm 9 → 6 sau khi bỏ tài liệu sinh-theo-nhãn |
| Chọn món | 50 câu | lọc nhãn **100,00%**, 0 món vi phạm |
| Định tuyến câu tri thức | 50 câu | 64,00% theo khoá nghiêm ngặt · **90,00%** chấm theo câu trả lời dùng được |
| Bộ kiểm | — | **429 test `ai/app`** + **143 test `ai/evaluation`** · 14 cổng `--check` |

**Đã chạy thật qua `docker compose up`** — quét QR, hỏi, nhận thẻ giỏ, thêm vào giỏ hàng. Phép
kiểm này **không thay được bằng test** vì nó kiểm
đúng thứ test không chạm tới — container, mạng, và việc backend gọi được dịch vụ.
