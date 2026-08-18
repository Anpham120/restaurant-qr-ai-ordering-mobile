# Báo cáo so khớp hành vi song song: .NET vs Java

> Issue #15 (M5). Đo ngày 2026-08-18, trên cùng một máy, hai stack chạy **song song** trên cùng một
> mạng Docker, mỗi bên một PostgreSQL **riêng biệt**.

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

Java thua ở cả ba chỉ số, và đó là **đánh đổi đã biết trước khi chọn**, không phải kết quả bất ngờ:

- **RAM 4.8×**: JVM có heap và metaspace riêng, .NET runtime nhẹ hơn ở trạng thái rảnh. Với VPS
  chung của nhóm (RAM giới hạn) thì đây là lý do **thật** để giữ bản .NET ở production.
- **Cold start 2.8×**: JVM phải nạp và verify class. Ảnh hưởng tới thời gian rollback/redeploy, không
  ảnh hưởng tới độ trễ khi đã chạy.
- **Image +63%**: chủ yếu do base `eclipse-temurin:21-jre` (493 MB); lớp ứng dụng chỉ ~98 MB. Thu hẹp
  được bằng `jlink` — chưa làm.

**Kết luận không thiên vị:** bản Java **không** tốt hơn bản .NET ở vận hành. Giá trị của nó nằm ở
chỗ khác — ba tính năng nghiệp vụ mà bản .NET chưa có (hạn chế #3, #10, #11) và bài học chuyển đổi
ngôn ngữ. Nếu chỉ xét vận hành thuần tuý thì việc port này **không đáng**, và nói thẳng điều đó
đúng hơn là nặn ra một chỉ số nào đó để Java thắng.

## 7. Việc chưa làm

- Chưa so `POST /api/chat/...` giữa hai bên (cần dịch vụ AI chạy chung; đã kiểm chứng riêng ở issue
  #14 với dịch vụ AI thật).
- Chưa so realtime: SignalR và STOMP khác hẳn protocol nên không có "cùng một request" để so. Đã
  kiểm chứng riêng ở issue #13.
- Chưa đo throughput/độ trễ dưới tải. Kế hoạch (§6) đã loại hạn chế #1 (load test) khỏi phạm vi vì
  đo tải chỉ có nghĩa trên hệ thống chạy thật.
