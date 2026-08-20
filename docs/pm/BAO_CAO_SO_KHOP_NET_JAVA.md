# Báo cáo so khớp hành vi song song: .NET vs Java

> Issue #15 (M5). Đo ngày 2026-08-18, trên cùng một máy, hai stack chạy **song song** trên cùng một
> mạng Docker, mỗi bên một PostgreSQL **riêng biệt**.

> ## ⚠ TÀI LIỆU LỊCH SỬ — KHÔNG TÁI LẬP ĐƯỢC (từ 2026-08-20, #59)
>
> Thư mục `backend/` (ASP.NET Core) **đã bị xoá khỏi kho**. Nghĩa là mọi phép đo trong tài liệu này
> **không chạy lại được** nữa: không còn một bản .NET để dựng lên mà so.
>
> Điều đó **không** làm số liệu ở đây kém giá trị hơn — chúng được đo thật, trên hai stack thật, và
> chính chúng là căn cứ để dám xoá bản .NET. Nhưng nó đổi *cách đọc* tài liệu: đây là **bằng chứng
> đã niêm phong**, không phải một bộ kiểm có thể chạy lại. Ai muốn tái lập phải checkout một commit
> trước `#59` — commit cuối còn `backend/` là `a44854e` (merge của #108).
>
> Việc xoá là có chủ đích và có thứ tự: 85 endpoint đã port và đối chiếu 1:1 (#88), CI đã chuyển
> sang stack Java và `golden-e2e` 103/103 trên đó (#58), rồi mới xoá. Không phải ngược lại.
>
> Những bất biến mà bản .NET từng canh **đã được chuyển đầu sang Java trước khi xoá**, không bỏ:
>
> | Bất biến | Trước ở | Nay ở |
> |---|---|---|
> | dịch vụ AI phải hết hạn trước backend | `DeploymentConfigurationTests.cs` | `DeploymentConfigurationTest.java` (#58) |
> | tên sự kiện realtime hoá đơn bàn | `OrderRealtimeContracts.cs` | `RealtimeDtos.java` |
> | nhãn thực đơn: CSDL vs tệp AI | `RestaurantMenuSeed.cs` | `V2__seed_official_menu_and_tables.sql` |
> | phủ i18n theo seed | `RestaurantMenuSeed.cs` | `V2__seed_official_menu_and_tables.sql` |

## 0. Báo cáo này trả lời câu hỏi gì — và không trả lời câu hỏi gì

**Bối cảnh:** việc chuyển backend sang Java Spring Boot là **yêu cầu của môn Lập trình nâng cao**
(§4.2, §5). Đó là đề bài cho trước.

**Báo cáo này trả lời:** *bản Java có hành xử đúng như bản .NET trên cùng một kịch bản không, và
lệch ở đâu?* — đúng DoD của issue #15: "báo cáo đối chiếu, liệt kê sai khác đã biết".

**Báo cáo này KHÔNG trả lời:** *có nên chuyển sang Java hay không.* Câu hỏi đó không được đặt ra
trong phạm vi môn học, và cũng không phải thứ mà một bảng vài chỉ số vận hành có thể phán quyết.
Số liệu ở §6 là để **biết bản Java cần gì khi chạy**, không phải để chấm điểm bên nào hơn.

## 1. Vì sao phải chạy song song thay vì đọc mã đối chiếu

Đọc mã chỉ trả lời được "tôi *nghĩ* hai bên giống nhau". Chạy song song trả lời được "hai bên *thật
sự* trả về gì trên cùng một kịch bản". Toàn bộ 14 issue trước đều port theo nguyên tắc **giữ đúng
bất biến, không giữ đúng cơ chế** (§5.4) — nghĩa là sai khác *được phép tồn tại*, nhưng phải **biết
nó ở đâu** thì mới bảo vệ được khi vấn đáp.

Báo cáo này liệt kê sai khác đã biết, kèm phân loại: cố ý, chấp nhận được, hay là lỗi.

## 2. Cách đo

- Hai stack chạy đồng thời trên mạng bridge `cmc-parity`, mỗi bên một Postgres riêng — CSDL dùng
  chung sẽ làm kết quả vô nghĩa.
- 19 kịch bản, mỗi kịch bản gọi **cùng một request** lên cả hai bên.
- So **HTTP status** + **hình dạng JSON** (tên trường và kiểu). **Không** so giá trị sinh ngẫu nhiên
  (id, token, thời điểm) — chúng khác nhau là đương nhiên, so vào chỉ tạo báo động giả.
- Với kịch bản lỗi, so **mã lỗi** (`error.code`) chứ không so câu chữ.

### Một lần chạy sai đã bị loại bỏ

Lần chạy đầu cho 6 sai khác. Hai trong số đó (`Đăng ký` trả 409, `Xem thanh toán` lệch số giao dịch)
là **rác từ lần chạy trước còn trong CSDL**, không phải sai khác thật. Đã xoá sạch hai CSDL, khởi
động lại cả hai stack và chạy lại — còn đúng 3 sai khác. Ghi lại chuyện này vì nó là lý do phải reset
state trước khi kết luận, và vì nếu không kiểm lại thì báo cáo đã có hai dòng sai.

## 3. Kết quả: 16/19 giống hệt

| Nhóm | Kịch bản | Kết quả |
|---|---|---|
| Health | `GET /api/health` | ⚠️ khác hình dạng |
| Auth | Đăng ký / trùng email / đăng nhập / sai mật khẩu | ✅ 4/4 giống (201, 409, 200, 401) |
| Menu | `GET /api/menu` | ✅ giống |
| Tables | Bàn theo mã / bàn không tồn tại | ✅ giống (200, 404) |
| Table session | Mở phiên / thiếu `qrToken` | ✅ giống (200, 400) |
| Orders | Tạo đơn | ⚠️ Java có thêm trường |
| Orders | Thiếu `Idempotency-Key` | ✅ giống (400) |
| Orders | Xem đơn token đúng | ⚠️ Java có thêm trường |
| Orders | Xem đơn token sai | ✅ giống (404) |
| Payments | Xem thanh toán | ✅ giống |
| Payments | Method không hợp lệ | ✅ giống (400) |
| Payments | Yêu cầu VietQR | ✅ giống (200) |
| Payments | **Nội dung chuyển khoản + quick link** | ✅ **giống hệt từng ký tự** |
| Auth | Danh sách đơn khi chưa đăng nhập | ✅ giống (401) |

Đáng chú ý nhất là dòng áp chót: `transferContent` và `quickLink` của VietQR **trùng khít** giữa hai
bản. Đây là chỗ dễ lệch nhất khi đổi ngôn ngữ (encode URL, làm tròn tiền) và cũng là chỗ lệch thì
khách chuyển khoản sai nội dung — xem §5 issue #11 về `%20` và `RoundingMode.DOWN`.

## 4. Ba sai khác đã biết

### 4.1 `GET /api/health` — hình dạng khác (cố ý, ảnh hưởng thấp)

| | .NET | Java |
|---|---|---|
| Trường | `status`, `service`, `environment`, `checkedAtUtc` | `status` |
| Giá trị `status` | `"Healthy"` | `"ok"` |

**Phân loại: sai khác cố ý, nhưng cần biết.** Healthcheck của Docker Compose chỉ kiểm HTTP 200 nên
cả hai đều hoạt động — đó là lý do nó không lộ ra suốt 14 issue. Nhưng một công cụ giám sát đọc
trường `status` sẽ thấy hai giá trị khác nhau.

**Việc cần làm nếu đưa vào dùng thật:** thống nhất giá trị `status`. Chưa sửa trong phạm vi môn học
vì không có công cụ giám sát nào đang đọc trường này.

### 4.2 `OrderItemResponse` có thêm `estimatedReadyMinutesLow` / `High` (cố ý)

Java trả thêm hai trường, .NET không có.

**Phân loại: cố ý, đúng thiết kế.** Đây chính là hạn chế #10 (issue #9) — tính năng mới, bản .NET
gốc cố tình không có. Thêm trường là **tương thích ngược**: client cũ bỏ qua trường lạ, client mới
đọc được. Nếu Java *thiếu* trường mà .NET có thì mới là lỗi.

### 4.3 `discountAmount` khi bằng 0: `0` vs `0.00` (chấp nhận được)

Ở response tạo đơn, .NET tuần tự hoá thành số nguyên `0`, Java thành `0.00` (JSON: `0` vs `0.00`).
Cùng giá trị, khác cách tuần tự hoá `BigDecimal`/`decimal`.

**Phân loại: chấp nhận được.** `JSON.parse` cả hai đều ra `0`. Chỉ ảnh hưởng nếu client so chuỗi
thay vì so số — không client nào trong dự án làm vậy.

## 5. Một sai khác KHÔNG nằm ở API: dữ liệu seed QR token

Phát hiện khi kịch bản "Mở phiên bàn" trả 404 trên .NET nhưng 200 trên Java.

| | .NET | Java |
|---|---|---|
| `qr_token` của T01 | `zG8-l8430SHjeD3NSIn0C0U9ses3TAkoOaenkRQITv4` | `cmc-table-t01-qr` |

**Nguyên nhân:** .NET **sinh QR token ngẫu nhiên lúc chạy**; Java dùng seed cố định trong migration
`V2` — vốn được dump từ một CSDL .NET tại **một thời điểm cụ thể**, nên giá trị ngẫu nhiên hôm đó bị
đóng băng thành hằng số.

**Hệ quả thật:** mã QR in ra cho bản này **không dùng được** trên bản kia. Với phạm vi môn học (hai
bản không bao giờ phục vụ cùng một nhà hàng cùng lúc) thì vô hại. Nhưng nếu định chuyển đổi thật từ
.NET sang Java thì đây là **việc phải xử lý trước khi chuyển**: hoặc export token thật sang, hoặc in
lại toàn bộ QR.

Đây cũng là lý do bộ so khớp phải đọc `qr_token` **từ chính CSDL của từng bên** thay vì hardcode một
giá trị — bản đầu hardcode nên báo nhầm 3 kịch bản là "khác".

## 6. Số liệu vận hành (bù cho phần để lại từ issue #16)

Cả hai chạy từ **image của chính nó**, cùng máy, cùng lúc.

| Chỉ số | .NET | Java | Chênh |
|---|---|---|---|
| Image size | 362 MB | 591 MB | +63% |
| Cold start (3 lần, stop → health 200) | 5.87 / 6.24 / 6.13 s | 17.11 / 16.89 / 16.78 s | ~2.8× |
| Spring tự báo thời gian khởi động | — | 14.27 s | |
| RAM idle | 74.7 MiB | 359 MiB | ~4.8× |

### Một phép đo sai đã bị loại

Lần đo đầu cho Java **40.6 s** — gấp 2.4× con số thật. Nguyên nhân: container Java lúc đó **mount
JAR từ ổ đĩa Windows qua bind mount**, trong khi .NET chạy từ image. Đọc JAR qua bind mount trên
Windows chậm hơn hẳn đọc từ layer image.

Đã đo lại với Java chạy **từ image** như .NET, mới ra 16.9 s. Ghi lại vì:
1. Nó giải thích chênh lệch với issue #16 (13.6–14.2 s ở đó, ít container cạnh tranh hơn).
2. Nó là bằng chứng cụ thể cho nguyên tắc đã nêu ở issue #16: **so số đo trong hai điều kiện khác
   nhau thì con số vô nghĩa**, kể cả khi nó có lợi cho phía mình.

### Đọc số liệu này thế nào cho đúng

**Trước hết, phải nói rõ số liệu này KHÔNG dùng để làm gì.** Việc chuyển sang Java là **yêu cầu của
môn Lập trình nâng cao** (§4.2, §5) — đề bài cho trước, không phải một lựa chọn kỹ thuật đang chờ
được biện minh bằng benchmark. Vì vậy bảng trên **không** phải căn cứ để kết luận "nên hay không nên
port": câu hỏi đó không được đặt ra, và một bảng ba chỉ số cũng không đủ để trả lời nó.

Số liệu ở đây phục vụ đúng hai việc:

1. **Biết bản Java cần gì để chạy**, phòng khi có ai đó thực sự dựng nó lên: cần bao nhiêu RAM, khởi
   động mất bao lâu, image nặng bao nhiêu.
2. **Giải thích được từng con số khi vấn đáp**, thay vì chỉ đọc lại.

Ba chỉ số, và lý do kỹ thuật đằng sau:

- **RAM 4.8×** — JVM có heap và metaspace riêng; .NET runtime nhẹ hơn ở trạng thái rảnh. Đây là lý
  do kỹ thuật thật khiến bản .NET vẫn là bản chạy trên VPS chung của nhóm (RAM giới hạn, và VPS đó
  đang phục vụ điểm môn INFO2005 của 4 người khác — §8.1).
- **Cold start 2.8×** — JVM phải nạp và verify class. Ảnh hưởng tới thời gian redeploy, **không**
  ảnh hưởng tới độ trễ khi đã chạy (khác biệt này quan trọng: nó nghĩa là khách dùng app không cảm
  nhận được).
- **Image +63%** — chủ yếu do base `eclipse-temurin:21-jre` (493 MB); lớp ứng dụng chỉ thêm ~98 MB.
  Thu hẹp được bằng `jlink`, chưa làm.

Cả ba đều là **đặc tính đã biết của JVM**, không phải hệ quả của cách port. Nếu bản Java tốn RAM gấp
5 lần vì code sai thì mới là vấn đề cần sửa; tốn gấp 5 lần vì nó chạy trên JVM thì là điều kiện đầu
vào của môn học.

## 7. Việc chưa làm

- Chưa so `POST /api/chat/...` giữa hai bên (cần dịch vụ AI chạy chung; đã kiểm chứng riêng ở issue
  #14 với dịch vụ AI thật).
- Chưa so realtime: SignalR và STOMP khác hẳn protocol nên không có "cùng một request" để so. Đã
  kiểm chứng riêng ở issue #13.
- Chưa đo throughput/độ trễ dưới tải. Kế hoạch (§6) đã loại hạn chế #1 (load test) khỏi phạm vi vì
  đo tải chỉ có nghĩa trên hệ thống chạy thật.
