# Bước 0 — Phát biểu bài toán

Tài liệu này trả lời một câu duy nhất: **AI này được sinh ra để làm gì, và tuyệt đối
không làm gì.** Chưa có dòng mã nào được viết, và đó là chủ ý — bản cũ được viết
trước khi câu hỏi này được trả lời rõ ràng, nên nó phình ra 8 cơ chế chồng nhau mà
không ai nói được cơ chế nào phụ trách việc gì.

## 1. Bối cảnh

Khách quét mã QR tại bàn, mở web app, và có một ô chat. Khách **đã ngồi trong nhà
hàng**. Điều này định hình mọi thứ:

- Khách không cần thuyết phục đến nhà hàng. Họ cần **chọn được món và đặt**.
- Câu trả lời phải dùng được ngay tại bàn: có tên món, có giá, và có cách thêm vào
  giỏ. Một đoạn văn hay mà không đặt được món là câu trả lời thất bại.
- Nhân viên đang ở gần. Chuyển cho người thật luôn là lựa chọn hợp lệ, không phải
  thất bại.

## 2. Dữ liệu đang có — và giới hạn của nó

> **Sửa sau khi làm bước 1.** Mục này ban đầu viết "chỉ có một nguồn". Sai. Có **hai**
> nguồn và chúng lệch nhau: `/api/menu` đọc cơ sở dữ liệu (1,7 nhãn/món), còn AI đọc
> `menu-dataset.json` (15 nhãn/món). Chi tiết và hệ quả: `01-data-dictionary.md` mục 1.

Nguồn AI dùng: `data/menu-dataset.json`.

| Thuộc tính | Giá trị |
|---|---|
| Số món | 91 |
| Danh mục | 13, mỗi danh mục **đúng 7 món** |
| Trường mỗi món | `id`, `name`, `description`, `price`, `categoryId`, `categoryName`, `imageUrl`, `isAvailable`, `tags` |
| Độ đầy đủ | 91/91 ở **mọi** trường |
| Giá | 12.000đ – 890.000đ, trung vị 65.000đ |
| Nhãn | 80 nhãn khác nhau, trung bình 15 nhãn/món |

**Ba giới hạn phải nói ra trước khi thiết kế:**

1. **Đây là dữ liệu mẫu, không phải thực đơn thật.** 13 × 7 = 91 chằn chặn. Thực đơn
   thật không đều như vậy. Mọi con số đo trên dữ liệu này là *chỉ dấu*, không phải
   bằng chứng về hành vi với khách thật.

2. **Cả 91 món đều còn hàng** (`isAvailable = True`). Nên **không thể kiểm chứng**
   hành vi khi món hết. Bản cũ có 13 ca đánh giá cho tình huống này — chúng đo một
   thứ dữ liệu không hề chứa. Bản mới sẽ không giả vờ đo được, cho tới khi có dữ liệu
   món hết hàng thật.

3. **80 nhãn, không từ điển.** Nhãn `toi` có trên 64/91 món. Nó là "tối" (bữa tối)
   hay "tỏi" (gia vị)? Bản cũ đoán là "tỏi", và câu "Món nào có tỏi?" trả về 36 món mà
   chỉ 11 món thật sự có tỏi. **Đã giải quyết ở bước 1**: `toi` = "Tối", và toàn bộ 80
   nhãn nay là khóa có không gian tên (`meal:dinner`) nên không thể trùng từ thường nữa.

Không có kho tri thức nào. Câu hỏi về giờ mở cửa, thanh toán, đỗ xe hiện **không có
nguồn dữ liệu** — sẽ được xử lý ở bước 5, và cho tới lúc đó AI phải nói thẳng là chưa
có dữ liệu.

## 3. Ba loại câu hỏi, ba cơ chế khác nhau

Đây là phân loại quan trọng nhất trong tài liệu này, vì nó quyết định kiến trúc.

### Loại A — Tra cứu trên thực đơn

Câu trả lời **nằm sẵn** trong dữ liệu. Không cần suy luận.

> "Phở bò bao nhiêu tiền?" · "Có món nào không cay?" · "Món hải sản gồm những gì?"
> · "Món nào dưới 50.000đ?"

Đặc điểm: có thể trả lời bằng mã tra bảng. Kết quả **giống nhau mọi lần chạy**, không
thể bịa ra món không tồn tại. Đây là loại phải chiếm phần lớn.

### Loại B — Tra cứu trên tri thức nhà hàng

Câu trả lời là **một sự thật đã được viết ra**, nhưng không nằm trong thực đơn.

> "Mấy giờ mở cửa?" · "Thanh toán thế nào?" · "Có chỗ đỗ xe không?"

Đặc điểm: cần một kho tri thức, và cần tìm đúng đoạn. Hiện **chưa có nguồn nào**.

### Loại C — Cần suy luận hoặc diễn đạt

Không có câu trả lời "đúng" duy nhất.

> "Gợi ý món cho 4 người ăn tối" · "Nên chọn phở bò hay phở gà?"
> · "Nhóm mình muốn gì đó dễ chia sẻ"

Đặc điểm: cần cân nhắc nhiều tiêu chí, hoặc cần diễn đạt tự nhiên. Đây là nơi mô hình
sinh có giá trị thật.

**Nguyên tắc phân tuyến:** một câu thuộc loại A thì **không được** để mô hình sinh
trả lời. Không phải vì mô hình dở, mà vì tra bảng đúng 100% và tái lập được, còn mô
hình thì không đảm bảo cả hai.

## 4. Phạm vi — AI trả lời gì

**Trong phạm vi** (dữ liệu hiện có hỗ trợ):

| Nhóm | Nguồn | Loại |
|---|---|---|
| Giá, tên, danh mục của món | trường `price`, `name`, `categoryName` | A |
| Duyệt món theo danh mục | `categoryId` | A |
| Lọc theo mức giá / ngân sách | `price` | A |
| Lọc theo thuộc tính có nhãn | `tags` — **sau khi** bước 1 làm rõ từng nhãn | A |
| So sánh hai món đã nêu tên | các trường của hai món | A |
| Gợi ý món theo nhiều tiêu chí | thực đơn + suy luận | C |

**Ngoài phạm vi** — và AI phải nói rõ *"chưa có dữ liệu về việc này"*, không được đoán:

| Nhóm | Vì sao |
|---|---|
| Số liệu dinh dưỡng định lượng (kcal, mg natri) | thực đơn chỉ có mô tả chữ |
| Thành phần đầy đủ, nguồn gốc nguyên liệu | `description` là câu giới thiệu, không phải danh sách thành phần |
| Nhân sự (bếp trưởng), nội bộ (doanh thu) | không có dữ liệu, và không nên có |
| Món còn/hết theo thời gian thực | mọi món đang là `True`, không kiểm chứng được |
| **Câu hỏi bằng tiếng nước ngoài** | toàn bộ dữ liệu và từ vựng là tiếng Việt — xem bên dưới |
| Giờ mở cửa, thanh toán, đỗ xe | chưa có kho tri thức — sẽ vào phạm vi ở bước 5 |
| Bất cứ gì ngoài ăn uống tại nhà hàng này | ngoài bài toán |

**Về giới hạn ngôn ngữ.** Hệ thống hiểu **tiếng Việt**, có dấu hoặc không dấu (phép rút dấu xử lý
cả hai). Với câu tiếng Anh, bước hiểu trả về **rỗng hoàn toàn** — đo trực tiếp qua `understand()`:

| câu vào | `require_tags` | `avoid_tags` | `wants` |
|---|---|---|---|
| `give me a vegetarian dish` | `[]` | `[]` | `any` |
| `I am allergic to seafood` | `[]` | **`[]`** | `any` |
| `show me cheap food` | `[]` | `[]` | `any` |
| `cho tôi món chay` | `[]` | `[]` | **`food`** |

Ô in đậm ở hàng thứ hai là ô đáng lo nhất tài liệu này: **lời khai dị ứng bằng tiếng Anh không
được nhận**, nên hàng rào dị nguyên không bật. Câu tiếng Việt tương đương thì bật.

Đây là giới hạn được **khai rõ** thay vì làm dở, và lý do là một quyết định chứ không phải sự bỏ
quên: mọi nhãn, mọi tên món, mọi tài liệu tri thức đều tiếng Việt. Nhận vài từ khóa tiếng Anh sẽ
tạo ra một hệ thống trả lời được câu dễ và **im lặng ở câu khó** — mà ở đây "câu khó" gồm cả lời
khai dị ứng, nên nửa vời còn nguy hiểm hơn không hỗ trợ. Với một nhà hàng có khách nước ngoài,
việc đúng là dịch **cả** ba tầng dữ liệu, và đó là một hạng mục riêng.

**Ba việc AI tuyệt đối không làm** (giới hạn về quyền, không phải về năng lực):

1. Không tự tạo đơn, không tự thêm món vào giỏ, không tự thanh toán. Mọi đề xuất món
   phải kèm cờ *cần khách xác nhận*.
2. Không khẳng định một món **an toàn** với người dị ứng. Chỉ được nói thực đơn *ghi
   nhận* hoặc *không ghi nhận* thành phần đó, và luôn mở đường hỏi nhân viên. Mô tả
   thực đơn không phải kết quả kiểm tra bếp.
3. Không bịa món, không bịa giá. Mọi món nêu ra phải tồn tại trong thực đơn với đúng
   giá đó.

## 5. Thế nào là trả lời tốt

Định nghĩa này sẽ trở thành thước đo ở bước 3, nên nó phải **đo được**, không phải
cảm nhận.

Một câu trả lời tốt là câu:

1. **Có nội dung** — nêu được món hoặc trả lời được câu hỏi. Câu "bạn muốn gì?" không
   tính là trả lời.
2. **Đúng dữ liệu** — mọi món tồn tại, mọi giá là giá thật.
3. **Tôn trọng điều khách đã nói** — khách nói ngân sách 200k thì không gợi ý món
   350k; nói không cay thì không gợi ý món cay; nói dị ứng hải sản thì không mời món
   có hải sản.
4. **Dùng được ngay** — món gợi ý có cách thêm vào giỏ.
5. **Không rò rỉ** — không chứa chỉ dẫn nội bộ, không chứa câu bị cấm.

Và một câu **hỏi lại** khi câu hỏi thật sự mơ hồ là **đúng**, không phải sai. Nó chỉ
sai khi hỏi lại trong lúc dữ liệu đã đủ để trả lời.

## 6. Điều bản cũ dạy được

Ghi lại để không lặp lại. Đo trên 338 câu hỏi trước khi xóa:

| Quan sát | Hệ quả cho bản mới |
|---|---|
| 33% câu trả lời do mã tất định, 67% phụ thuộc mô hình | Loại A phải được tra bảng, không để mô hình |
| 8 đường tất định chồng nhau, 2 bị tắt mà vẫn hoạt động đúng | Mỗi cơ chế một việc; hai cơ chế cùng trả lời một loại câu thì một cái là dư |
| 7 lỗi cùng gốc: rút dấu làm hai từ trùng nhau | Rút dấu để khớp cách khách gõ, **không** để quyết định nội dung |
| Thước đo sai 3 lần trước khi hệ thống sai | Thước đo phải có test hai chiều: bắt lỗi thật, không bịa lỗi |
| Không có từ điển dữ liệu | Bước 1 làm việc này trước tiên |

## 7. Câu chưa trả lời được — cần chủ nhà hàng quyết

Những điều dưới đây dữ liệu không nói, và tôi không nên đoán:

1. ~~**Nhãn `toi` nghĩa là gì?**~~ Đã trả lời ở bước 1: "Tối". Thay vào đó là hai câu
   mới mà bước 1 phát hiện: **hợp nhất hai nguồn thực đơn theo hướng nào**, và **nhãn dị
   nguyên còn thiếu bao nhiêu** (bảy lỗ đã tìm được bằng cách đọc mô tả; phần còn lại chỉ
   nhà hàng biết).
2. **Phạm vi tư vấn mong muốn** — chỉ tư vấn món, hay cả chính sách nhà hàng (giờ,
   thanh toán, đỗ xe)? Nếu có thì bước 5 cần nội dung do nhà hàng cung cấp.
3. **Giọng điệu** — gọi khách là "bạn" hay "anh/chị"? Tự gọi mình là "mình" hay "em"?
4. **Mức chuyển nhân viên** — khi nào AI nên nhường cho người thật thay vì cố trả lời?
