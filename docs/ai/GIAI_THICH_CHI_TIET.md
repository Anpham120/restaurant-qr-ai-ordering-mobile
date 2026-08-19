# Giải thích chuyên sâu hệ thống

Tài liệu này đi từ **tổng quan** xuống **từng quyết định** của hệ thống đang có trong mã nguồn. Mọi
cấu trúc dữ liệu, hằng số và số dòng đều đọc trực tiếp từ mã, không mô tả lại từ trí nhớ.

Đọc kèm [BAO_CAO_HOC_MAY_KPDL.md](BAO_CAO_HOC_MAY_KPDL.md) — báo cáo nêu **kết quả đo**, tài liệu này
nêu **cơ chế**.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Tầng dữ liệu](#2-tầng-dữ-liệu)
3. [Kho tri thức](#3-kho-tri-thức)
4. [`understand.py` — hiểu câu hỏi](#4-understandpy--hiểu-câu-hỏi)
5. [`session.py` — bộ nhớ phiên](#5-sessionpy--bộ-nhớ-phiên)
6. [`answer.py` — định tuyến và chọn món](#6-answerpy--định-tuyến-và-chọn-món)
7. [`rag/` — ba bộ truy hồi](#7-rag--ba-bộ-truy-hồi)
8. [`generate.py` — đường sinh và mười phép xác minh](#8-generatepy--đường-sinh-và-mười-phép-xác-minh)
9. [`cart.py` — thẻ giỏ hàng](#9-cartpy--thẻ-giỏ-hàng)
10. [`service.py` — cổng HTTP](#10-servicepy--cổng-http)
11. [Kiến trúc đánh giá](#11-kiến-trúc-đánh-giá)
12. [Cổng CI và triển khai](#12-cổng-ci-và-triển-khai)

---

## 1. Tổng quan

### 1.1 Hệ thống làm gì

Thực khách quét mã QR tại bàn, mở giao diện chat, hỏi bằng tiếng Việt tự nhiên. Hệ thống trả lời và
**gợi ý** món vào giỏ hàng. Khách tự bấm thêm — AI không bao giờ tự đặt món.

### 1.2 Quy mô mã nguồn lúc chạy

| Mô-đun | Dòng | Việc |
|---|---:|---|
| `understand.py` | 2.417 | chuỗi tiếng Việt → `Request` 48 trường |
| `answer.py` | 1.754 | định tuyến 19 nhánh + `select()` lọc món |
| `session.py` | 707 | bộ nhớ phiên, ba quy tắc hợp nhất |
| `service.py` | 673 | 6 endpoint HTTP |
| `generate.py` | 599 | gọi mô hình + 10 phép xác minh |
| `llm_understand.py` | 453 | mô hình đọc câu hỏi → nhãn (không chọn món) |
| `cart.py` | 243 | thẻ giỏ hàng + 4 bất biến |
| `rag/chunker.py` | 449 | nạp kho, chia đoạn |
| `rag/embedding.py` | 301 | `bge-m3`, cosine, bộ đệm vector |
| `rag/bm25.py` | 115 | xếp hạng theo từ khoá |
| `rag/hybrid.py` | 67 | hợp nhất RRF |
| `rag/base.py` | 69 | giao diện chung `Retriever` |
| `rag/precompute.py` | 68 | tính sẵn vector lúc build ảnh |

**Năm trong bảy chặng runtime là mã tất định.** Chỉ `rag/embedding.py` và `generate.py` có mô hình,
và cả hai đều có đường lui về tất định.

### 1.3 Bốn hằng số gánh cả kiến trúc

```python
BRANCHES_ALLOWED  = frozenset({"compare", "filter"})   # generate.py
SO_DOAN_TRI_THUC  = 2                                   # answer.py
LIST_SIZE         = 6                                   # answer.py
MAX_CART_ACTIONS  = 6                                   # cart.py
```

`BRANCHES_ALLOWED` là hằng số quan trọng nhất: nó khiến *"mô hình không được nói về chính sách"*
thành một **tính chất của mã**, không phải một lời hứa trong lời nhắc. Mười bảy nhánh còn lại **không
có đường** để mô hình ghi chữ.

### 1.4 Một lượt hỏi đi qua đâu

```
khách gõ
   │
   ├─ 1  service.py            nhận HTTP · xác thực token · nạp session_state    TẤT ĐỊNH
   ├─ 2  understand()          629 cụm từ vựng → Request(48 trường)              TẤT ĐỊNH
   ├─ 3  merge_into_request()  hợp nhất bộ nhớ, ba quy tắc                       TẤT ĐỊNH
   ├─ 4  llm_understand()      CHỈ khi mã tất định không chắc                    mô hình
   ├─ 5  respond()             19 nhánh, thứ tự cố định                          TẤT ĐỊNH
   │        ├─ nhánh chọn món  → select() lọc 91 món
   │        └─ nhánh tri thức  → tra khoá / chọn mục / truy hồi
   ├─ 6  generate()            chỉ 2/19 nhánh, qua 10 phép kiểm                  mô hình
   ├─ 7  build_cart()          thẻ giỏ từ reply.items, 4 bất biến                TẤT ĐỊNH
   └─ 8  update_state()        ghi bộ nhớ, tóm tắt sinh tất định                 TẤT ĐỊNH
```

---

## 2. Tầng dữ liệu

### 2.1 Hai nguồn, một sự thật

Thực đơn tồn tại ở **hai nơi**: `data/menu-dataset.json` cho dịch vụ AI, và bảng trong
Postgres cho backend. Chúng phải khớp **91/91 món**, và cổng CI canh điều đó.

Nếu để hai nguồn tự do thì mọi con số của bốn chặng sau đều đo trên dữ liệu sai — nên đây là bất biến
đầu tiên phải dựng.

### 2.2 Hệ nhãn — 85 nhãn / 16 họ

```json
"spice:none": {
  "group": "spice", "value": "none",
  "label_vi": "Không cay", "label_en": "Not spicy",
  "exclusive": true
}
```

**Tiền tố nhóm là quyết định thiết kế quan trọng nhất của tầng này.** Với nhãn trần (`hot`, `nam`),
sau khi rút dấu tiếng Việt thì `hot` của `serving:hot` (nóng) và `hot` của `spice:hot` (cay đậm) là
**cùng một chuỗi**.

Quan trọng hơn: khoá có nhóm cho phép **ghi đè theo NHÓM** ở bộ nhớ phiên — `spice:none` phải *đẩy*
`spice:hot` ra, chứ không nằm cạnh nó. Không có nhóm thì không viết được luật đó.

### 2.3 Độ phủ quyết định nhãn dùng được vào việc gì

| Độ phủ | "Thiếu nhãn" nghĩa là | Nhãn dùng để |
|---|---|---|
| **91/91** | **lỗi dữ liệu** | **lọc** — loại món không thoả |
| một phần | **chưa ghi nhận**, không phải *không có* | **sắp thứ tự** — không loại món |

Năm họ phủ đủ: `party`, `meal`, `season`, `spice` *(độc quyền)*, `price` *(độc quyền)*.

Ba hệ quả cụ thể:

**`allergen` phủ 44/91.** 47 món **chưa được ghi nhận dị nguyên nào**, không phải *không có*. Danh
sách lọc ra **không phải kết luận về an toàn**, và câu trả lời nói rõ điều đó.

**`diet:vegetarian` và `diet:vegan` gắn trên ĐÚNG CÙNG 17 món.** Một trong hai không phân biệt gì
trong bộ dữ liệu này.

**`occasion:date` chỉ có 4 món.** Dùng để lọc thì *"đi hẹn hò"* còn đúng một món Tôm hùm 890.000đ.
Nên dịp ăn dùng để **sắp thứ tự**.

### 2.4 Ba bộ rà, và giới hạn của chúng

| Bộ rà | Cơ chế | Đã tìm ra |
|---|---|---|
| `audit_allergen_tags.py` | đối chiếu nhãn với **mô tả món** | **7 lỗ thật** |
| `audit_season_tags.py` | mô tả nói "giải nhiệt" mà thiếu `season:cooling` | lỗ dữ liệu |
| `audit_method_tags.py` | tên món tự nói cách chế biến | chạy `--check`, tức **chặn** |

**Giới hạn phải nói rõ:** mô tả món **không phải bảng thành phần**. Bộ rà tìm được chỗ mô tả *có
nhắc* mà nhãn *thiếu*; nó **không** tìm được món có dị nguyên mà mô tả cũng không nhắc.

Ví dụ sống: *Bún đậu mắm tôm* và *Bún bò Huế* mang `allergen:seafood` nhưng **không** mang
`ingredient:shrimp`, dù chứa tôm — vì mắm tôm và mắm ruốc là **gia vị**, không được ghi vào nhãn
nguyên liệu. Lọc theo `ingredient:shrimp` sẽ **mời đúng hai món đó** cho người dị ứng tôm. Nên hệ
thống chặn rộng ở mức **nhóm** và **nói ra lý do**.

---

## 3. Kho tri thức

**60 tài liệu / 213 đoạn / 174 tiêu đề mục phân biệt.** Markdown có frontmatter, chia theo `##`.

### 3.1 Một kho, hai chế độ trả lời

| Chế độ | Tài liệu | Vào chỉ mục | Mô hình chạm chữ? |
|---|---:|---|---|
| `verbatim` | 24 | **không** | **0%** — tra khoá, trả nguyên văn |
| `synthesize` | 36 | **182 đoạn** | không — chỉ trình bày lại |

Số đoạn xếp hạng là **182**, không phải 213: bỏ đoạn `verbatim` (đã có đường riêng) và bỏ **đoạn mở
đầu** — mục không có tiêu đề là phần dẫn nhập, nó mô tả *tài liệu* chứ không trả lời câu nào.

**Vì sao tách.** Câu *"mấy giờ đóng cửa?"* có một đáp án đúng duy nhất; đưa nó qua mô hình là tạo cơ
hội sai ở chỗ chỉ cần đọc ra một chuỗi. Nếu để `verbatim` trong chỉ mục thì có **hai đường tới cùng
nội dung**, và đường xếp hạng có thể trích một câu chính sách ra giữa câu tư vấn món. Có test chốt:
`test_chi_doan_synthesize_duoc_xep_hang`.

### 3.2 Frontmatter và bốn quy tắc chia đoạn

```yaml
---
id: kb.written.spice_ladder.v1
title: Bốn mức cay và cách chọn theo sức ăn cay
topic_keys: [spice_ladder]     # nối vào từ vựng — có bất biến canh
source: demo                    # demo = người viết · derived = máy sinh
audience: guest                 # BẮT BUỘC, chỉ nhận đúng giá trị này
answer_mode: synthesize         # synthesize = vào chỉ mục · verbatim = tra khoá
---
```

| # | Quy tắc | Lý do đo được |
|---|---|---|
| 1 | chia theo `##`, không theo số ký tự | cắt theo ký tự thì một đoạn **đứt giữa bảng giá** |
| 2 | kèm tiêu đề tài liệu vào mỗi đoạn | để đoạn tự đủ ngữ cảnh khi trích rời |
| 3 | đoạn quá 400 từ chia tiếp theo `###` | đặt tên `"<mục> — <mục con>"` |
| 4 | `chunk_id` tất định `{doc_id}#{index}` | để tập đánh giá trỏ vào được |

Quy tắc 2 **đúng cho xếp hạng** nhưng **sai cho việc đọc**: dán đoạn thô cho khách thì khách nhận về
một cái nhan đề. Có hàm riêng làm sạch trình bày trước khi trả.

**Cửa `audience: guest` là phép TỪ CHỐI, không phải phép lọc.** Bộ nạp **báo lỗi** với tệp không mang
giá trị đó. Lý do là sự cố thật: 5 tệp hướng dẫn nội bộ cho AI nằm cùng chỉ mục, và 47 đoạn của chúng
bị trích ra cho khách đọc. Lọc bỏ thì lần sau lại có tệp lọt; từ chối thì không.

### 3.3 Tám tài liệu chính sách do máy sinh

Trong 24 tài liệu `verbatim`, **tám tài liệu chứa con số** và được `build_knowledge.py` sinh lại từ
thực đơn: `menu_size`, `price_range`, `preorder`, `takeaway_items`, `children`, `vegetarian`,
`spice_levels`, `allergen_labelling`.

Lý do: **văn xuôi kể lại dữ liệu thì luôn trôi khỏi dữ liệu.** Một tài liệu viết tay ghi *"hơn 90
món"* trong khi thực đơn có đúng 91 — sai từ lúc viết, không ai canh. Tám tài liệu này sinh lại mỗi
lần, kèm cổng `--check`, nên chúng **không thể lệch**.

### 3.4 Ba đường tới kho

| Đường | Phạm vi | Xếp hạng? | Rủi ro chệch |
|---|---|---|---|
| tra khoá `load_facts()` | 24 tài liệu | **không** | **không có** |
| chọn mục `_chon_muc()` | 3–8 đoạn trong 1 tài liệu | có | thấp |
| truy hồi `chon_doan_tri_thuc()` | 182 đoạn | có | cao nhất |

Thiết kế đặt **đường càng hay dùng thì càng ít rủi ro**.

### 3.5 Khử trùng theo tài liệu

```python
da_co, giu = set(), []
for cid in thu_tu_xep_hang:
    if doc_cua[cid] in da_co:
        continue              # tài liệu này đã có đoạn rồi
    da_co.add(doc_cua[cid])
    giu.append(cid)
    if len(giu) >= SO_DOAN_TRI_THUC:
        break
```

Không khử trùng thì hai đoạn cùng một tài liệu chiếm cả hai suất, và khách nhận hai góc nhìn của cùng
một ý thay vì hai ý.

**Luật này ràng buộc cả thiết kế kho.** Khi thí nghiệm gộp nhiều tài liệu nhỏ thành ít tài liệu lớn,
mỗi tài liệu chỉ góp **một** đoạn vào top-2 — chọn nhầm mục là tiêu cả tài liệu. Đo được: 11,3% ca
hỏng đúng kiểu đó, và đó là lý do phép gộp không thắng.

---

## 4. `understand.py` — hiểu câu hỏi

2.417 dòng, **không dùng mô hình**, trả về `Request` **48 trường**.

### 4.1 Bốn bước

```
1  fold()            rút dấu, hạ chữ thường, bỏ dấu câu
2  khớp 629 cụm      DÀI trước NGẮN, rồi ĂN HẾT đoạn đã khớp
3  tách RÀNG BUỘC khỏi NGỮ CẢNH
4  nhận diện ý định  xã giao · xin thêm · xoá ràng buộc · tham chiếu ngược
```

### 4.2 Luật khớp — dài trước, rồi ăn hết đoạn

Đây là cơ chế chống đụng chữ sau khi rút dấu, và nó là **một luật**, không phải một chuỗi ngoại lệ.

Kiểm kê hiện tại: **629 cụm, 107 cụm có nguy cơ** — nằm trong cụm khác hoặc nằm trong tên món. Luật
này bảo vệ tất cả.

Ba va chạm thật đã đo:

| Cụm | Va với | Hậu quả | Cách sửa |
|---|---|---|---|
| `mi` (mì → gluten) | `mì chính` | *"dị ứng mì chính"* bật nhãn gluten | thêm cụm `mi chinh`, luật tự lo |
| `so` (sò → hải sản) | `số`, `sợ` | *"món số 2"* bật nhãn hải sản | **bỏ cụm** — đo 627 câu, 0 câu đổi |
| `ca` (cá → hải sản) | `cả` | *"có cả ông bà"* bật nhãn hải sản | **giữ** — bỏ thì mất hàng rào cho *"dị ứng cá"* |

Dòng cuối là hạn chế còn tồn: phân biệt `cả`/`cá` cần ngữ cảnh mà lớp khớp cụm không có.

**Bài học đo lường của khâu này:** phải **chạy `understand()` thật**, không phân tích chuỗi con. Một
lần phân tích chuỗi thay cho việc chạy hàm cho **17/19 dương tính giả**, vì nó không biết về luật
ăn-hết-đoạn.

### 4.3 Ràng buộc và ngữ cảnh — chỗ khó nhất

| Loại | Trường | Hệ quả |
|---|---|---|
| **Ràng buộc** | `require_tags`, `avoid_tags`, `budget_max` | món không thoả bị **LOẠI** |
| **Ngữ cảnh** | `prefer_tags` | món hợp chỉ **XẾP LÊN TRƯỚC** |

Nhầm hai thứ này gây một trong hai lỗi: lọc mất món đúng, hoặc để lọt món khách không ăn được. Chúng
phải là **hai trường riêng**, không gộp làm một danh sách.

### 4.4 Bốn mươi tám trường của `Request`

```
văn bản       text · folded · matched
món           named_items · scope_item_ids · exclude_item_ids · ho_mon · unknown_item
ràng buộc     require_tags · avoid_tags · categories · avoid_categories
              budget_max · budget_strict · wants · combo · hai_lua_chon
ngữ cảnh      prefer_tags · rang_buoc_ke_thua · da_bo_rang_buoc
câu hỏi VỀ    asks_price · asks_allergy · asks_serving · asks_extreme · asks_difference
              asks_comparison · asks_about_attribute · asks_about_named_dish
              asks_suggestion · hoi_ve_su_viec · is_comparison · asserted_price
ý định / cờ   y_dinh · y_dinh_bo · la_xin_mon · wants_similar · off_topic
              policy_topic · knowledge_topic · reference_index · scope_last_listed
              refers_to_focus · mo_ho_tieu_diem · so_mon_muon · loai_mon_la_chu_de
              declared_avoidance · unparsed_restriction · wants_from_model
```

Trường **`hoi_ve_su_viec`** là trường quyết định đường tri thức: nó phân biệt *"cùng là gà mà sao món
mềm món dai"* (hỏi VỀ một sự việc → truy hồi) với *"có món gà nào không"* (xin món → lọc).

Hàng rào nhận diện nó có **hai chiều**, và chiều thứ hai mới là chiều khó:

| Chiều | Dấu hiệu | Vai trò |
|---|---|---|
| hỏi về sự việc | *"thế nào"*, *"vì sao"*, *"mà sao"*, *"có … không"* | đưa câu xuống truy hồi |
| **xin món** | *"món nào"*, *"cho mình"*, *"gợi ý"*, *"ăn gì"* | **chặn** chiều trên |

Chỉ nhận diện chiều thứ nhất thì *"Có món chay nào không?"* — vốn là câu xin món — cũng khớp, và ta
phá một nhánh đang đúng để sửa một nhánh đang sai.

### 4.5 Lớp mô hình đọc câu hỏi — `llm_understand.py`

Mô hình **chỉ trả về nhãn**, không trả câu văn và không chọn món. Bốn cơ chế giữ nó trong tầm kiểm
soát:

1. **Cổng `already_understood`** — mã tất định hiểu đủ thì **không gọi**. Gọi mô hình vào chỗ không
   cần là mở đường cho nó phá một câu trả lời đang đúng.
2. **Một cửa kiểm duy nhất** — nhãn phải có trong từ điển; nhãn bịa bị bỏ và **ghi lại**, không bỏ im
   lặng.
3. **Chỉ THÊM, không xoá** — nó không bỏ được ràng buộc khách đã nêu.
4. **Không chọn món** — nó trả nhãn; việc chọn món là phép lọc.

---

## 5. `session.py` — bộ nhớ phiên

707 dòng. `SessionState` có **14 trường**:

```
ràng buộc     avoid_tags · hard_tags · context_tags · budget_max · budget_strict · wants
món           suggested_item_ids · rejected_item_ids · last_listed_ids
              last_focus_id · last_compared_ids · last_categories
trạng thái    cho_doi · turn_count
```

### 5.1 Ba quy tắc hợp nhất

| Loại | Quy tắc | Hỏng nếu dùng sai |
|---|---|---|
| **Dị nguyên** `avoid_tags` | **cộng dồn, không bao giờ bỏ** | ghi đè thì *"dị ứng hải sản"* lượt 1 bị *"không ăn được sữa"* lượt 3 **xoá mất** — lỗi an toàn |
| **Ràng buộc cứng** `hard_tags` | lượt mới **ghi đè theo NHÓM** | cộng dồn thì *"dưới 200k"* rồi *"rẻ hơn nữa"* giữ **cả hai**, phép giao cho rỗng |
| **Ngữ cảnh** `context_tags` | cộng vào, giữ **5 gần nhất** | ghi đè thì *"đi hẹn hò"* rồi *"trời nóng"* mất một trong hai |

Ghi đè theo **nhóm** chứ không theo nhãn — đây chính là lý do khoá nhãn phải có không gian tên
(mục 2.2).

### 5.2 Quy tắc 0 — đường duy nhất hạ được hàng rào

*"Không bao giờ bỏ"* khác *"không có đường bỏ"*, và dự án đã lẫn hai thứ đó. Đo được trên production:
khách khai dị ứng hải sản, rồi nói *"tôi không còn dị ứng nữa"* — mô hình **đọc đúng** mà câu trả lời
vẫn lọc, vì dòng ngay dưới lấy HỢP hai tập. Rồi *"vậy gợi ý món hải sản đi"* nhận `no_data`: khách
**kẹt trong một ràng buộc không có cách nào gỡ**.

Ba điều kiện giữ cho việc gỡ **không** làm yếu chốt an toàn:

1. chỉ bỏ khi khách nói **rõ ràng** — danh sách cụm, không suy diễn
2. chỉ bỏ thứ **đang có** — không bao giờ bỏ nhãn của chính lượt này
3. câu trả lời phải **nêu ra** — `da_bo_rang_buoc` → câu trả lời nói, khách sửa được

Điều 3 phân biệt việc này với *"im lặng bỏ ràng buộc"*.

### 5.3 Bộ nhớ là hàng rào chống trả lời lạc

Đo được: chạy 163 lượt kịch bản **không có** bộ nhớ thì **34 lượt (20,9%)** rơi xuống truy hồi và lấy
về đoạn hoàn toàn không liên quan — *"Món đầu tiên giá bao nhiêu?"* lấy về `first_visit`. Có bộ nhớ,
cả 34 lượt về nhánh đúng.

Nên bộ nhớ không phải lớp tiện nghi bên ngoài — nó là **một phần của cơ chế định tuyến**.

### 5.4 Tóm tắt sinh tất định

`rolling_summary()` liệt kê ràng buộc đang có bằng khuôn cố định, **không nhờ mô hình**. Nhờ mô hình
viết tóm tắt là mở đường cho nó bịa vào bộ nhớ, và **bộ nhớ sai thì sai suốt phiên**.

### 5.5 Xoá ở ba lối thoát

Backend xoá toàn bộ bộ nhớ phiên khi **đóng phiên**, **thanh toán**, và **hết hạn**. Không có đường
nào để dữ liệu bàn này rò sang bàn khác.

---

## 6. `answer.py` — định tuyến và chọn món

1.754 dòng. `respond()` có **19 nhánh**, thứ tự cố định, **cổng nào khớp trước thì thắng**.

### 6.1 Danh sách nhánh theo thứ tự

| # | Nhánh | Việc | Sinh chữ? |
|---:|---|---|---|
| 1 | `off_topic` | ngoài bài toán | không |
| 2 | `internal` | câu hỏi về chính hệ thống | không |
| 3 | `no_size` | không có khẩu phần | không |
| 4 | `serving_named_dish` | khẩu phần món đã nêu tên | không |
| 5 | `unknown_item` | món nhà hàng không bán | không |
| 6 | `price_lookup` | hỏi giá | không |
| 7 | `compare` | so sánh hai món | **ĐƯỢC** |
| 8 | `price_assertion` | khách khẳng định giá sai | không |
| 9–10 | `allergen_named_dish` | dị nguyên của món đã nêu | không |
| 11 | `item_detail` | chi tiết món | không |
| 12 | `da_bo_rang_buoc` | vừa gỡ ràng buộc | không |
| 13 | `clarify` | chưa đủ để lọc | không |
| 14 | `clarify_tham_chieu_mo_ho` | tham chiếu không rõ | không |
| 15 | `combo` | ghép suất | không |
| 16 | `exhausted_after_exclusions` | đã nêu hết món thoả | không |
| 17 | `empty_result_offer_drop` | rỗng, mời bỏ bớt điều kiện | không |
| 18 | `empty_result` | rỗng | không |
| 19 | `filter` | **lọc thực đơn** | **ĐƯỢC** |

Cộng ba nhánh tri thức: `facts:*` (tra khoá), `knowledge:*` (chọn mục), `knowledge_corpus:*` (truy
hồi) — cả ba **không sinh chữ**.

### 6.2 Vì sao thứ tự này

Mỗi vị trí đứng ở đó vì một ca hỏng đo được.

**Nhánh xã giao phải đứng trước mọi nhánh chọn món.** Thiếu nó thì *"xin chào"* rơi xuống truy hồi và
khách nhận về một danh sách rượu nếp cẩm — vì cổng `thuoc_mien()` là phép OR trên từng từ đơn của mọi
tên món sau khi rút dấu, nên `chao` khớp món **"Cháo lòng Sài Gòn"**.

**Truy hồi đứng gần cuối.** Đó là chủ ý: RAG là phương án cuối, không phải phương án mặc định.

**`clarify` là câu trả lời ĐÚNG**, không phải thất bại — và nó **không** được kèm danh sách món. Kèm
danh sách thì nó không còn là câu hỏi lại.

**`exhausted_after_exclusions` sinh ra từ một lỗi chạy thật:** khách xem ba lượt danh sách rồi nói
*"cho mình món khác đi"* và nhận *"mình chưa tìm được món nào"* — câu đó **nói sai sự thật**, vì có
món thoả, chỉ là chúng đã được nêu. Nhánh mới nói đã nêu hết rồi mới bỏ bớt một điều kiện, và **không
nêu lại danh sách**.

### 6.3 `select()` — bảy bước áp ràng buộc

```
1  Phạm vi / loại trừ                     từ bộ nhớ phiên
2  Loại đang hỏi THẮNG loại được nhắc     "ăn lẩu thì uống gì" → đồ uống
3  «A hay B» lấy HỢP, không lấy GIAO
4  Danh mục khách nói rõ KHÔNG muốn
5  Họ món gọi tên THẮNG danh mục          "có phở không" ≠ cả nhóm Phở & Bún
6  Ngân sách — phân biệt < với ≤
7  DỊ NGUYÊN — áp CUỐI, không bao giờ nới
```

Bước 7 là **fail-closed**. Ngay cả nhánh «A hay B» ở bước 3 cũng phải áp lại dị nguyên sau khi hợp —
nới một hàng rào an toàn vì câu có chữ "hay" là cách tệ nhất để cơ chế này hỏng.

### 6.4 Khoá xếp hạng — năm thành phần

```python
return (-matched, bac, ruou, item["price"], item["id"])
```

| Thành phần | Ý nghĩa |
|---|---|
| `-matched` | số `prefer_tags` khớp, nhiều hơn lên trước |
| `bac` | món mặn (0) → tráng miệng/trái cây (1) → đồ uống (2) |
| `ruou` | **rượu bia không tự đứng đầu khi khách không xin** |
| `price` | rẻ trước |
| `id` | kết quả **tất định tuyệt đối** |

Thành phần `ruou` đến từ một lỗi đo được: bốn món rẻ nhất thực đơn đều là bia (12.000–22.000đ), nên
xếp theo giá làm *"tư vấn đồ uống"* mở đầu bằng ba loại bia cho **mọi** khách — kể cả khách đi với
trẻ con hay còn lái xe. Đây là **xếp hạng, không phải lọc**: khách xin bia thì bia vẫn ra ngay đầu.

Thành phần `id` cuối cùng bảo đảm **tất định tuyệt đối** — cùng câu hỏi luôn cùng thứ tự.

### 6.5 Chỗ yếu đã biết: `select()` không bao giờ từ chối

Khi bước hiểu không đọc ra ràng buộc nào, `select()` trả về **cả thực đơn** rồi phần liệt kê lấy 6
món đầu. Hệ quả đo được: ba câu hỏi khác hẳn nhau nhận **cùng một danh sách**.

Điều đáng nói là **cả bốn lớp kiểm soát đều xanh** ở đó — món có thật, giá đúng, không nhãn cấm, đúng
nhánh. Chúng kiểm *"kết quả có thoả ràng buộc đã đọc không"*, mà ở đây chưa đọc ra ràng buộc nào, nên
không có gì để thoả.

---

## 7. `rag/` — ba bộ truy hồi

### 7.1 Giao diện chung

```python
class Retriever(Protocol):
    name: str
    def search(self, query: str, k: int) -> list[Hit]: ...
```

Ba cài đặt cùng giao diện, nên bộ so đổi được bằng một dòng và không bộ nào có đường tắt riêng.

### 7.2 BM25 — `bm25.py`, 115 dòng

```
score(D,Q) = Σ_{t∈Q} IDF(t) · f(t,D)·(k₁+1) / ( f(t,D) + k₁·(1 − b + b·|D|/avgdl) )
k₁ = 1,5   b = 0,75
IDF(t) = ln( 1 + (N − n(t) + 0,5)/(n(t) + 0,5) )      ← dạng KHÔNG ÂM
```

Dạng IDF gốc cho giá trị **âm** khi *n > N/2*, nghĩa là chứa từ đó làm đoạn **tụt** hạng. Với kho này
thì "món" và "nhà hàng" xuất hiện ở gần như mọi đoạn, nên đó không phải chuyện lý thuyết. Có test
chốt `IDF > 0`.

**Tính chất quyết định cho phép so:** BM25 **trả rỗng** khi truy vấn không chung từ nào với kho.
Embedding thì luôn cho điểm, nên nó **không bao giờ trượt — nó trả sai**. Đó là lý do `cấm@5` quan
trọng hơn `Hit@5`.

### 7.3 Embedding — `embedding.py`, 301 dòng

Mô hình `BAAI/bge-m3`, **1024 chiều**.

**Tiền tố đi theo họ mô hình.** Họ E5 đòi `query:` / `passage:`; họ BGE **không dùng tiền tố** — thêm
vào là nhét hai từ vô nghĩa vào mọi câu. Cả hai chiều đều hỏng **không có triệu chứng quan sát
được**: hệ thống không báo lỗi, chỉ cho điểm thấp hơn. Vì vậy tiền tố tra từ **một bảng theo tên mô
hình**, và có test chốt cả nội dung bảng lẫn tính nhất quán với mô hình đang dùng.

Vector chuẩn hoá **L2**, nên `cosine(a,b) = a·b`. Chuẩn hoá là điều **bắt buộc về đúng đắn**: không
chuẩn hoá mà lấy tích vô hướng thì đoạn **dài** được lợi thế chỉ vì vector nó dài hơn.

Một hệ quả được dùng làm tối ưu: điểm cosine của một đoạn **không phụ thuộc** số đoạn khác trong chỉ
mục. Nên xếp hạng trong một tài liệu chỉ là **giới hạn phép chấm điểm toàn kho vào tập con** — không
cần dựng chỉ mục mới.

### 7.4 Bộ đệm vector — `precompute.py`, 68 dòng

Vector của 182 đoạn **tính sẵn lúc build ảnh Docker**, ghi ra `AI_EMBEDDING_CACHE`.

Thiếu bước này thì mỗi lần khởi động mã hoá lại kho — **im lặng**: hệ thống vẫn đúng, chỉ chậm thêm.
`/ready` báo cờ `tu_dem` để nhìn thấy được.

Khoá của bộ đệm **chứa tên mô hình**, nên đổi mô hình làm đệm cũ tự động bị từ chối thay vì bị dùng
nhầm.

### 7.5 Hybrid RRF — `hybrid.py`, 67 dòng

```
RRF(d) = Σ_r 1 / (k + rank_r(d)),   k = 60
```

*k* làm **đồng thuận thắng nổi bật**: đoạn hạng 3 ở *cả hai* bảng được `2/(60+3) = 0,0317`, cao hơn
đoạn hạng 1 chỉ ở *một* bảng `1/(60+1) = 0,0164`. Có test chốt đúng hai con số đó.

Một chi tiết cài đặt quyết định phép so có ý nghĩa hay không: phải lấy **sâu hơn k** từ mỗi bảng. Chỉ
lấy đúng `k` thì đoạn đồng thuận ở hạng 6 không bao giờ vào kết quả, và hybrid gần như trùng BM25 —
tức phép so **không so gì cả**.

### 7.6 Hai cổng an toàn trên nhánh truy hồi

```python
if request.hoi_ve_su_viec and thuoc_mien(request.text, items):
    _tim = chon_doan_tri_thuc(request.text)
    if _tim is not None:
        ...trả lời...
    # không tìm được → RƠI TIẾP xuống nhánh dưới, không trả bừa
```

Nhánh truy hồi **không phải một cam kết cuối cùng** — nó có đường lui.

---

## 8. `generate.py` — đường sinh và mười phép xác minh

599 dòng.

### 8.1 Ba giới hạn cứng

1. Mô hình **không chọn món** — nó chỉ viết về những món `select()` đã chọn
2. Chỉ **2/19 nhánh** được sinh; nhánh mới mặc định **không**
3. Câu viết ra phải qua **mười phép kiểm**

### 8.2 Mười phép kiểm

```python
def verify(text, used, allowed, all_items, avoid_tags, budget_max=None) -> list[str]:
    """Mười phép kiểm. Trả về danh sách vi phạm — rỗng nghĩa là câu sinh dùng được.

    Áp cho MỌI câu sinh, không khai từng ca: một phép kiểm chỉ chạy ở vài chỗ
    là một phép kiểm không bảo đảm gì.
    """
```

| # | Kiểm | Thông báo vi phạm |
|---:|---|---|
| 1 | mã món khai đã dùng phải trong danh sách | `khai dùng món ngoài danh sách` |
| 2 | không nhắc món thật nào **ngoài** danh sách | `nhắc món ngoài danh sách đã lọc` |
| 3 | mọi số tiền phải là giá thật của một món | `số tiền …đ không phải giá của món nào` |
| 4 | không nêu **số lượng** món | |
| 5 | không in mã nhãn kỹ thuật | `in mã nhãn kỹ thuật vào câu khách đọc` |
| 6 | phải nhắc **đủ** món | `KHÔNG nhắc đủ món, thiếu: …` |
| 6b | không nhắc cùng món hai lần | `nhắc lặp cùng một món trong một câu` |
| 6c | danh sách ≥3 món phải gạch đầu dòng | |
| 7 | không nhắc món mang nhãn cần tránh | `AN TOÀN: nhắc món mang …` — **chốt** |
| 8 | phải **mở đường hỏi nhân viên** khi có ràng buộc | — **chốt** |

**Vi phạm thì BỎ cả câu**, dùng lại khuôn mẫu — không sửa, không thử lại. Sửa một câu sai thành câu
đúng đòi hỏi biết đúng là gì, mà nếu đã biết thì không cần mô hình.

### 8.3 Phép kiểm 4 và 8 sinh ra từ lỗi thật

**Phép kiểm 4** — mô hình viết *"Nhà hàng có **6 món lẩu**"* trong khi thực đơn có **7**. Ba phép kiểm
đầu không chạm tới lỗi này: nó không phải tên món, không phải giá, không phải nhãn.

**Phép kiểm 8** — bật đường sinh làm **15 ca tụt**, và **14 trong 15 là ca dị nguyên**. Lý do: câu
khuôn mẫu luôn thêm *"bạn nhắc nhân viên khi gọi món để bếp xác nhận"*, còn mô hình viết văn mượt hơn
và **bỏ câu đó đi**.

Câu đó là **nội dung, không phải văn vẻ**: nhãn dị nguyên phủ 44/91, nên *"thực đơn không ghi nhận
thành phần bạn cần tránh"* **không** đồng nghĩa *"những món này an toàn"*.

`PROMPT` cũng đã yêu cầu điều đó — nhưng **yêu cầu trong lời nhắc là ĐỀ NGHỊ, không phải BẢO ĐẢM**.

Một chi tiết đáng đọc trong số liệu: sau khi thêm phép kiểm 8, **tỷ lệ dùng câu sinh KHÔNG giảm** (68
ở cả hai lần). Tức quy tắc trong lời nhắc sửa được hành vi ở **cả 14 ca**, và phép kiểm đứng đó làm
**bảo đảm** chứ không làm bộ lọc. Đó là hình dạng đúng của cặp lời-nhắc + xác minh.

### 8.4 Điều lớp này KHÔNG bắt được

Một tên món **hoàn toàn bịa** — không có trong thực đơn dưới bất kỳ dạng nào — thì phép so chuỗi
không phát hiện. Giới hạn này được ghi thành **một test có tên nói rõ nó là giới hạn**, để không ai
tưởng lớp đó kín.

---

## 9. `cart.py` — thẻ giỏ hàng

243 dòng. Thẻ dựng từ **`reply.items`** — danh sách món mã tất định đã chọn — **không** từ chữ mô
hình viết.

### 9.1 Bốn bất biến

| # | Bất biến | Cơ chế |
|---|---|---|
| 1 | mọi món trong thẻ tồn tại trong thực đơn, giá lấy từ thực đơn | tra bảng |
| 2 | `requires_customer_confirmation` luôn `True` | **HẰNG SỐ**, không phải trường có thể đặt sai |
| 3 | chỉ **6 nhánh** được sinh thẻ | danh sách trắng; nhánh mới mặc định **không** |
| 4 | kiểm **lại** dị nguyên ở lớp cuối | phát hiện thì **`raise CartError`** |

### 9.2 Vì sao bất biến 4 phải `raise`

Khi lớp cuối phát hiện món cấm lọt qua, phản xạ tự nhiên là bỏ món đó đi cho an toàn. Nhưng làm vậy
nghĩa là **lớp lọc fail-closed đang hỏng mà không ai biết** — và nó sẽ hỏng tiếp.

Sửa lặng ở lớp cuối là cách để lớp đầu hỏng mà không ai thấy.

### 9.3 Nhánh nào KHÔNG có thẻ

`clarify`, `off_topic`, `empty_result` — gợi ý đặt món khi chưa hiểu câu hỏi là sai.

---

## 10. `service.py` — cổng HTTP

673 dòng, FastAPI, **6 endpoint**:

| Endpoint | Việc |
|---|---|
| `GET /health` | sống chưa |
| `GET /ready` | đã nạp xong chưa; báo số món, số nhãn, số chủ đề, mô hình, cờ `tu_dem` |
| `POST /v1/chat` | trả lời một lượt |
| `POST /v1/chat/stream` | như trên, dạng SSE |
| `POST /v1/cache/invalidate` | nạp lại thực đơn khi admin sửa món |
| `POST /v1/model-check` | kiểm cấu hình mô hình |

Xác thực bằng `AI_INTERNAL_TOKEN`. Compose **từ chối khởi động** nếu thiếu biến này.

### 10.1 Hợp đồng phản hồi

```json
{
  "ok": true, "provider_available": true,
  "content": "…",
  "suggested_cart_actions": [
    {"menu_item_id": "m_008", "name": "Phở bò tái nạm", "quantity": 1,
     "reason": "Không cay, trong ngân sách bạn nêu", "evidence_ids": ["menu:m_008"]}
  ],
  "guardrail_flags": ["allergen_filter_applied"],
  "session_updates": { "facts": [], "constraints": {}, "rolling_summary": "…" },
  "decision": {"intent": "…", "route": "filter", "abstain_reason": null}
}
```

Cố ý **không** trả `accepted_menu_item_ids` và `added_to_cart_menu_item_ids` — backend đã bỏ qua
chúng, và không gửi thì ranh giới quyền rõ hơn là gửi rồi bị bỏ.

### 10.2 Dịch vụ phải trả lời được khi mô hình hỏng

Mã tất định chạy trước; mô hình chỉ được gọi ở nhánh cần diễn đạt. Nhờ vậy khi khoá API hết hạn hoặc
nhà cung cấp lỗi, khách vẫn nhận câu trả lời **đúng** — chỉ kém tự nhiên hơn.

**Một trợ lý im lặng vì mô hình hỏng là một trợ lý hỏng.**

---

## 11. Kiến trúc đánh giá

### 11.1 Sáu tập, mỗi tập đo một chặng

| Tập | Quy mô | Chặng nó đo |
|---|---:|---|
| `cases.json` | 147 ca / 46 họ | `understand()` + `respond()` gọi trực tiếp |
| `session_scripts.json` | 63 kịch bản / 175 lượt | + bộ nhớ nhiều lượt |
| `retrieval_cases.json` | 114 ca | truy hồi toàn kho, gọi thẳng `search()` |
| `chunk_selection_cases.json` | 120 ca | chọn mục **trong một tài liệu** |
| `rag_cases.json` | 32 ca | nhánh truy hồi **qua `respond()`** |
| `golden_e2e.json` | 29 hội thoại / 103 lượt | **toàn chuỗi**, qua HTTP tới giỏ hàng thật |

Bốn tập đầu gọi thẳng hàm Python. Chỉ `golden_e2e` đi qua **stack thật**, nên nó là tập duy nhất bắt
được lỗi ở **lớp ghép hai hệ thống** — lệch tên trường, lệch header xác thực, lệch hình dạng
`session_state` làm bộ nhớ **mất im lặng** giữa các lượt.

### 11.2 Khoá đáp án là ĐIỀU KIỆN, không phải danh sách

```json
cases.json            "expect": {"kind": "fact", "facts": {"m_008": {"price": 75000}}}
retrieval_cases.json  "expected": [{"topic_keys_any": ["combo_pairing"]}]
session_scripts.json  "expect": {"forbid_tags_any": ["allergen:seafood"]}
```

**Không tập nào có khoá đáp án là một danh sách viết tay.** Hệ quả: thực đơn thêm một món thì khoá đáp
án **tự đúng theo**, không cần sửa tập.

Đây cũng là tính chất cho phép chia việc tuần tự: người làm đánh giá viết được toàn bộ tập ca **trước
khi** ba người sau viết dòng mã đầu tiên.

### 11.3 Ba nguyên tắc

**Ca an toàn là chốt, không phải số liệu.** Một ca chốt đỏ là **chặn**, kể cả khi tỷ lệ chung tăng.

**Bộ dò lỗ tìm lỗi chưa nghĩ tới.** `probe_metric_holes.py` kiểm xem một câu trả lời vô nghĩa có qua
được ca nào không. Khi bịt một lỗ, con số nền tụt từ **0,9960 xuống 0,7368** — tức 99,6% kia gần như
hoàn toàn ảo.

**Chia tập theo HỌ, không theo ca.** Hai ca cùng họ hỏi cùng chủ đề, chỉ khác cách diễn đạt — chia
theo ca thì tập niêm phong **không còn niêm phong**. Thứ tự chia do `sha256(tên họ)` quyết định,
**không** do `random.shuffle` có seed: shuffle phụ thuộc phiên bản Python, nên Python đổi thuật toán
thì phép chia đổi theo và tập niêm phong lặng lẽ trộn vào tập phát triển.

### 11.4 Khoá `expect` lạ là LỖI, không bị bỏ qua

```python
KHOA_HIEU = frozenset({...})   # 20 khoá
```

Một tiêu chí viết sai tên khoá sẽ **không bao giờ chạy**, và ca đó lặng lẽ luôn xanh. Bản trước của
tập truy hồi có **96 khoá đáp án trỏ sai chỗ suốt nhiều tháng** vì đúng cơ chế im lặng này.

### 11.5 Khoá `expect_branch_prefix` — và lỗ nó lấp

Tới trước khoá này, **không tiêu chí nào của tập phiên nói được "lượt này phải đi qua nhánh nào"**.
Hệ quả: nhánh truy hồi chạy **0/163 lượt** mà **không ca nào đỏ** — tập ca không hỏi tới nó, nên nó
vắng mặt một cách hợp lệ.

Nhóm kịch bản `rag_trong_phien` dùng khoá này để đặt câu tri thức **ở giữa phiên**, sau một lời khai
dị ứng:

```
lượt 1   "Mình dị ứng hải sản nhé"                      -> bộ nhớ ghi allergen:seafood
lượt 2   "Có món nào không cay dưới 100k không?"        -> nhánh filter, đã tránh
lượt 3   "Cùng là gà mà sao món thì mềm món thì dai?"   -> nhánh TRUY HỒI   ← then chốt
lượt 4   "Vậy gợi ý mình vài món đi"                    -> nhánh filter, VẪN tránh
```

Lượt 3 đo hai thứ mà bộ một lượt không đo được: truy hồi có chạy khi bộ nhớ đang giữ ràng buộc, và
ràng buộc có sống qua lượt tri thức. Lượt 4 là chỗ bộ nhớ dễ rơi nhất, vì lượt ngay trước nó đi một
nhánh hoàn toàn khác.

### 11.6 Điều kiện kiểm soát thực nghiệm

**Đường tất định phải TẤT ĐỊNH.** Mọi phép phá thế theo `chunk_id` tăng dần, ở **cả hai** đường xếp
hạng. Hai đường phá thế ngược nhau thì hệ thống không lặp lại được kết quả của chính nó.

**Hai giao thức đo độ trễ, không trộn:** sàng lọc chạy 1 lần (loại phương án chậm gấp bậc), chốt chạy
**7 lần lấy trung vị** (số đưa vào báo cáo).

**Cấu hình của mỗi lần đo ghi kèm con số.** Tệp trong `measurements/` mang nguyên phản hồi `/ready`
lúc đo. Đã trả giá một lần cho việc thiếu nó: một lần chạy được báo là *"qua mô hình thật"* trong khi
`LLM_API_KEY` rỗng nên **mọi lượt đi đường tất định**.

**Bộ chạy TỪ CHỐI ghi bằng chứng khi lần chạy hẹp hơn bản đã commit.** CI từng chạy bản chỉ có BM25
rồi ghi đè bằng chứng đã commit, làm nó nghèo đi mà không ai thấy — nên nay bộ so đòi đủ ba bộ truy
hồi và cờ `--sealed` mới ghi.

---

## 12. Cổng CI và triển khai

### 12.1 Mười bốn cổng `--check`

Mọi tệp sinh ra đều có cổng `--check` so tệp đã commit với kết quả sinh lại. Lệch là **CI đỏ**, không
phải một dòng sai lặng lẽ trong repo.

```bash
python ai/scripts/build_knowledge.py --check
python ai/scripts/build_tag_dictionary.py --check
python ai/scripts/build_retrieval_cases.py --check
python ai/scripts/build_chunk_selection_cases.py --check
python ai/scripts/build_session_scripts.py --check
python ai/evaluation/build_split.py --check
python ai/notebooks/build_teaching_notebook.py --check
python docs/build_docs_index.py --check
python docs/build_system_facts.py --check
```

### 12.2 Một chiều phụ thuộc được ép

`ai/evaluation` được import `ai/app`, nhưng **KHÔNG** chiều ngược lại. Mã lúc chạy không được phụ
thuộc bộ đo, vì bộ đo **không có mặt trong ảnh Docker**.

Chỗ hai bên cần cùng một danh sách — các cụm mở đường hỏi nhân viên — thì mỗi bên khai riêng và **một
test đối chiếu chúng**, thay vì import chéo.

### 12.3 Ảnh Docker

```dockerfile
RUN python -c "...SentenceTransformer('BAAI/bge-m3')"   # trọng số vào ảnh
RUN cd /app/ai/app && python -m rag.precompute          # vector 182 đoạn
ENV HF_HUB_OFFLINE=1  TRANSFORMERS_OFFLINE=1            # chạy KHÔNG cần mạng
USER app                                                 # uid 10001, không root
```

| Tham số | Giá trị | Căn cứ |
|---|---|---|
| RAM | `mem_limit: 3g` | `bge-m3` chiếm ~1,4GB khi nạp |
| CPU | `OMP_NUM_THREADS=4` | |
| Khởi động | `start_period: 90s` | nạp mô hình ~25s, cộng biên an toàn |
| Xác thực | `AI_INTERNAL_TOKEN` bắt buộc | compose từ chối khởi động nếu thiếu |

**Một quan hệ phải giữ:** `LLM_TIMEOUT_SECONDS` (30) **nhỏ hơn** `BACKEND_AI_TIMEOUT_SECONDS` (50) —
backend phải còn thời gian nhận câu thoái hoá thay vì tự hết hạn trước và trả lỗi cho khách.
`DeploymentConfigurationTests` canh đúng quan hệ đó.

### 12.4 Bảy biến môi trường

```
LLM_BASE_URL · LLM_API_KEY · LLM_MODEL · LLM_TIMEOUT_SECONDS
AI_INTERNAL_TOKEN · AI_EMBEDDING_CACHE · AI_ENABLE_GENERATION
```

Đặt ở `deploy/.env`. Mọi bộ đo cần mô hình thật đều đọc từ đó.

---

## Phụ lục — ba điều cấm, CI ép

1. **Không nới ràng buộc dị nguyên** — kể cả khi kết quả rỗng.
2. **Không để mô hình sinh chọn món** — nó chỉ trả nhãn, và nhãn bị cổng kiểm lại.
3. **Không viết số vào tài liệu** — số phải tính được, nếu không nó sẽ trôi.
