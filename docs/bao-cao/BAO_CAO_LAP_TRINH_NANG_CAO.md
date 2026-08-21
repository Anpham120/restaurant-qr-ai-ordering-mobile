<div align="center">
  <img src="../../frontend/src/mocks/images/logo.png" alt="Logo CMC Restaurant" width="150" />

# BÁO CÁO MÔN HỌC: LẬP TRÌNH NÂNG CAO
## Trường Đại học CMC — Khoa Công nghệ Thông tin và Truyền thông

</div>

**Đề tài:** Chuyển backend hệ thống gọi món qua mã QR từ ASP.NET Core sang Java Spring Boot —
quyết định kỹ thuật và bằng chứng

**Sinh viên:** Phạm Duy An — BIT240002

**Kho mã:** `Anpham120/restaurant-qr-ai-ordering-mobile` (fork cá nhân)

---

## 0. Báo cáo này trả lời gì, và KHÔNG trả lời gì

**Trả lời:** *đã chuyển như thế nào, quyết định gì, trả giá gì, và lấy gì làm bằng chứng.*

**KHÔNG trả lời:** *có nên chuyển sang Java hay không.*

Việc chuyển sang Java là **đề bài của môn học** (kế hoạch §5), không phải kết luận của một phép so
sánh. Viết báo cáo theo kiểu "Spring Boot tốt hơn nên chúng tôi chọn nó" sẽ là dựng một lý lẽ ngược
cho một quyết định đã có sẵn. Mục §7 vì thế so sánh hai bản một cách trung thực, kể cả những chỗ
bản Java **kém hơn**.

---

## 1. Số liệu hai bản

### 1.1 Bản Java (sinh từ mã)

<!-- SINH:so-lieu-java -->

| Chỉ số | Giá trị |
|---|---|
| Java | 21 |
| Spring Boot | 3.3.4 |
| Endpoint | 88 |
| Module | 13 — `auth`, `cart`, `chat`, `counter`, `loyalty`, `menu`, `orders`, `payments`, `promotions`, `realtime`, `reports`, `shared`, `tables` |
| Tệp nguồn `.java` | 186 |
| Dòng mã nguồn | 13.743 |
| Tệp test | 15 |
| Dòng mã test | 1.897 |
| Phương thức `@Test` | 119 |
| Quy tắc ArchUnit | 3 |
| Migration Flyway | 9 tệp, 1.557 dòng SQL |

> Bảng này SINH TỪ MÃ (`docs/build_bao_cao_lap_trinh_nang_cao.py`), có cổng `--check` ở CI.
> Quy tắc ArchUnit khai bằng trường `ArchRule` chứ không phải `@Test`, nên chúng KHÔNG nằm
> trong con số `@Test` ở trên — đếm gộp sẽ làm bảng nói sai theo cả hai chiều.

<!-- HET:so-lieu-java -->

### 1.2 Bản .NET (lịch sử đã niêm phong)

Thư mục `backend/` đã bị **xoá khỏi kho** (#59) sau khi bản Java đạt đủ. Những con số dưới đây vì
thế không đọc lại được bằng cách nhìn vào mã hiện tại — chúng lấy từ commit cuối còn `backend/`:
`a44854e`.

| Chỉ số | Giá trị |
|---|---|
| Tệp nguồn `.cs` | 118 |
| Dòng mã nguồn (tổng) | 50.023 |
| — trong đó migration EF Core (**máy sinh**) | 36.212 |
| — **mã người viết** | 13.811 |
| Tệp test | 25 |
| Dòng mã test | 3.823 |
| `[Fact]` / `[Theory]` | 72 |
| Migration EF Core | 38 tệp |

Lệnh tái lập (cần lịch sử git đầy đủ):

```bash
git ls-tree -r a44854e --name-only backend/src | grep -c '\.cs$'
for f in $(git ls-tree -r a44854e --name-only backend/src | grep '\.cs$'); do
  git cat-file blob a44854e:"$f"; done | wc -l
```

### 1.3 Một con số suýt nói dối

Đặt cạnh nhau, số thô gợi ý một kết luận sai:

| | .NET | Java |
|---|---|---|
| dòng mã nguồn (thô) | 50.023 | 13.271 |

Đọc như thế thì bản Java "gọn hơn 3,8 lần" cho **cùng 85 endpoint** — một khẳng định nghe rất kêu
trong báo cáo, và **sai**.

36.212 trong 50.023 dòng của bản .NET là **migration EF Core do máy sinh**. EF Core sinh lại toàn
bộ ảnh chụp mô hình (`RestaurantDbContextModelSnapshot.cs`) cho mỗi migration, nên 38 migration tạo
ra hàng chục nghìn dòng không ai gõ. Bản Java dùng Flyway với SQL viết tay, và SQL không tính vào
số dòng `.java`.

So đúng thứ so được — **mã người viết**:

| | .NET | Java |
|---|---|---|
| mã người viết | 13.811 | 13.271 |
| endpoint | 85 | 85 |

Chênh lệch **4%**. Nghĩa là: chuyển sang Spring Boot **không** làm hệ thống này gọn đi. Nó đổi chỗ
độ phức tạp, không xoá độ phức tạp. Đó là kết luận trung thực, và nó ít hấp dẫn hơn kết luận sai.

---

## 2. Ánh xạ công nghệ

| Lớp | ASP.NET Core | Java Spring Boot | Ghi chú quyết định |
|---|---|---|---|
| Web | Minimal API (`app.MapGet`) | Spring MVC (`@RestController`) | §2.1 |
| ORM | EF Core | Spring Data JPA + Hibernate | |
| Migration | EF Core migrations | **Flyway, SQL viết tay** | §2.2 |
| Realtime | SignalR | **STOMP over WebSocket** | §2.3 — chỗ trả giá đắt nhất |
| DI | built-in | Spring | |
| Test | xUnit | JUnit 5 + AssertJ + **ArchUnit** | §5 |
| Test tích hợp | Postgres thật qua `WebApplicationFactory` | **Testcontainers** | |
| Kiểm phong cách | (không có) | **Checkstyle** | |

### 2.1 Vì sao `@RestController` mà không phải WebFlux

Spring có hai mô hình web: MVC (servlet, chặn) và WebFlux (phản ứng, không chặn). WebFlux là thứ
"hiện đại" hơn và sẽ trông đẹp hơn trong một báo cáo.

Chọn MVC, vì ba lý do đọc được từ chính hệ thống này:

1. **Nghiệp vụ chặn ở tầng dữ liệu.** Mọi thao tác đều đi qua JDBC — một API chặn. WebFlux trên
   JDBC chỉ dời chỗ chặn sang một nhóm luồng khác, không loại bỏ nó. Muốn thật sự không chặn thì
   phải đổi sang R2DBC, tức viết lại cả tầng persistence và mất `@Transactional`.
2. **Bất biến của hệ thống này cần giao dịch.** Đơn hàng, hoá đơn bàn và ca quầy đều có bất biến
   nhiều bảng (§3). `@Transactional` của Spring gắn với luồng; trong WebFlux nó phải chuyển sang
   ngữ cảnh phản ứng và mọi chỗ viết sai đều im lặng.
3. **Tải thực tế không đòi hỏi.** Đây là hệ thống một nhà hàng. Số kết nối đồng thời tính bằng
   chục, không phải chục nghìn — vùng mà mô hình một-luồng-một-yêu-cầu hoàn toàn đủ.

### 2.2 Vì sao Flyway + SQL viết tay mà không phải Hibernate `ddl-auto`

`spring.jpa.hibernate.ddl-auto=update` sẽ tự tạo bảng và bỏ hẳn migration. Không dùng, vì cùng lý
do bản .NET tách migration thành một bước riêng: **schema là thứ phải đọc được và duyệt được trước
khi chạy**. `ddl-auto` biến schema thành hệ quả phụ của mã Java, và nó không bao giờ xoá cột — nên
một lần đổi tên trường sẽ để lại cột cũ mãi mãi mà không ai thấy.

Quyết định kèm theo: **API không tự migrate lúc khởi động** (`SPRING_FLYWAY_ENABLED=false` cho dịch
vụ `api`, migrate là một dịch vụ compose riêng). Nhiều instance API cùng migrate một cơ sở dữ liệu
là lỗi chỉ xảy ra khi triển khai thật, không xảy ra trên máy lập trình.

Giá phải trả, nói thẳng: **V1 là một tệp SQL 1.316 dòng** kết xuất từ schema .NET. Nó không đẹp,
nhưng nó đúng — và đúng quan trọng hơn đẹp ở chỗ này, vì mọi cơ sở dữ liệu đang có dữ liệu thật
phải khớp từng cột.

### 2.3 SignalR → STOMP: chỗ trả giá đắt nhất, và bài học lớn nhất

SignalR không có tương đương trong hệ sinh thái Java. Spring cung cấp STOMP over WebSocket, và hai
thứ này **khác nhau về mô hình**, không chỉ khác tên:

| | SignalR | STOMP |
|---|---|---|
| nhận sự kiện | server đẩy sự kiện **có tên**; client `on("order.created")` | client **SUBSCRIBE một đích**; tên sự kiện đi trong header |
| vào nhóm | RPC `invoke("WatchOrder", …)`, server tự thêm connection vào group | không có RPC — chính lượt SUBSCRIBE là việc đó |
| phân quyền | xét một lần theo danh tính kết nối | kiểm **từng khung SUBSCRIBE** |

Hệ quả kiến trúc: `OnConnectedAsync` của bản .NET tự thêm nhân viên vào nhóm `operations`. STOMP
không có khái niệm đó, nên hành vi ấy phải được **dựng lại ở phía client**.

**Và đây là chỗ hệ thống đã hỏng suốt một thời gian mà không ai biết.** Backend đã chuyển sang STOMP
(`/hub/orders`), frontend vẫn dùng client SignalR (`/hubs/orders`). Hai giao thức không nói chuyện
được với nhau — SignalR có bước `negotiate` và khung tin riêng, Spring chỉ hiểu khung STOMP.

Nghĩa là **mọi tính năng realtime im lặng chết**: bếp không thấy đơn mới, khách không thấy trạng
thái đổi, quầy không thấy xác nhận thanh toán, nút gọi nhân viên không tới đâu.

Không cổng nào đỏ. Lý do đáng ghi vào báo cáo hơn cả bản thân lỗi:

| Cổng | Vì sao không thấy |
|---|---|
| test backend | kiểm STOMP bằng một client STOMP |
| test frontend | unit test đọc mã nguồn |
| `golden-e2e` | chỉ đi qua HTTP |

Ba cổng, không cổng nào chạm vào chỗ hai bên **gặp nhau**. Cách sửa không phải thêm test cho từng
bên, mà là một phép kiểm nối hai đầu: mã client thật của frontend nói với backend thật đang chạy
(§5.3).

---

## 3. Quyết định kiến trúc

### 3.1 Kiến trúc lục giác — chỉ cho `orders`, và tiêu chí để nói "chỉ"

Kế hoạch §5.3 đề xuất kiến trúc lục giác (`domain/`, `application/`, `adapter/in/web/`,
`adapter/out/persistence/`). Áp cho **cả 13 module** sẽ nhất quán và dễ bảo vệ khi vấn đáp.

Không làm thế. Chỉ `orders` theo lục giác; 12 module còn lại theo lối phẳng.

Tiêu chí: **mật độ bất biến**. Kiến trúc lục giác trả giá bằng số lớp và số lần ánh xạ dữ liệu, và
nó đáng giá khi có một mô hình miền thật sự có quy tắc cần bảo vệ khỏi framework. Đo trên mã:

| Module | Bất biến trong miền | Kiến trúc |
|---|---|---|
| `orders` | 15 test miền: chuyển trạng thái, huỷ món, khoá lạc quan, lịch sử trạng thái | lục giác |
| `menu` | CRUD; quy tắc gần như chỉ là ràng buộc dữ liệu | phẳng |
| `promotions` | 8 test miền, nhưng là hàm thuần — không có vòng đời | phẳng |

Một module CRUD gói trong bốn tầng thì bốn tầng đó chỉ chuyển tiếp dữ liệu, và mỗi lần thêm trường
phải sửa bốn chỗ. Đó là chi phí không đổi lấy gì.

**Quyết định này được canh bằng máy**, không bằng thiện chí: `HexagonalArchitectureTest` khai ba
quy tắc ArchUnit —

- `..domain..` không phụ thuộc `..application..` hay `..adapter..`
- `..domain..` không chạm Spring / Jakarta / Hibernate
- module khác không được đọc `orders.adapter..`

Quy tắc thứ ba đã **bắt được vi phạm của chính tôi** trong PR #103: `TableController` dùng
`orders.adapter.in.web.OrderDtos`. Sửa bằng cách chuyển `OrderDtos` sang `orders/application` — nó
chỉ nhập kiểu JDK nên không kéo theo gì.

### 3.2 Đọc chéo module: cổng đọc, không phải repository

Module `tables` cần biết đơn của một phiên bàn. Cách nhanh nhất là tiêm
`OrderRepository` vào `TableInvoiceService`. Không làm, vì khi đó `tables` giữ **thực thể JPA** của
`orders` và mọi thay đổi trong mô hình đơn hàng sẽ lan ra ngoài module.

Thay bằng `OrderLookup` — một cổng đọc trả **bản ghi phẳng**, không trả thực thể. Chi tiết đáng
nói: nó **không** có phương thức trả về token của khách. Nó có
`matchesCustomerToken(orderCode, supplied)` — so sánh thời gian hằng ở bên trong module `orders`, và
chỉ trả về đúng/sai. Token không rời khỏi module sở hữu nó.

### 3.3 Đồng thời: khoá lạc quan + khoá idempotency

Hai khách cùng bấm thanh toán một hoá đơn bàn là chuyện thường. Hai cơ chế, hai mục đích khác nhau:

- **`@Version` (khoá lạc quan)** — chặn hai giao dịch cùng ghi đè lên một trạng thái đã cũ.
  `ObjectOptimisticLockingFailureException` được ánh xạ thành `409 CONFLICT_STALE`, tức client biết
  phải tải lại rồi thử lại, khác hẳn một lỗi 500.
- **`Idempotency-Key` + dấu vân tay yêu cầu** — chặn lần bấm thứ hai của **cùng một** thao tác tạo
  ra hai kết quả. Dấu vân tay quan trọng: cùng khoá nhưng thân yêu cầu khác nhau phải bị từ chối,
  chứ không được trả về kết quả cũ như thể đã làm.

### 3.4 Token năng lực cho khách không đăng nhập

Khách quét QR không có tài khoản. Ba loại token năng lực: `X-Table-Session-Token`,
`X-Order-Token`, `X-Chat-Session-Token`. Mỗi token gắn với đúng một tài nguyên, ký bằng khoá của
máy chủ, và **so sánh thời gian hằng** khi kiểm.

Ở tầng realtime, chính những token này đi trong khung SUBSCRIBE và được
`StompSubscriptionGuard` đối chiếu — nên một khách không thể nghe topic của bàn khác. Đích lạ bị
**từ chối** chứ không phải bỏ qua: một broker lặng lẽ nhận đích sai sẽ khiến lỗi gõ nhầm trông
giống một đăng ký hoạt động bình thường nhưng không bao giờ nhận được gì.

---

## 4. Sáu lỗi tích hợp — cái giá thật của việc port

Phần này là phần có ích nhất của báo cáo, vì nó không nói về những gì chạy được mà về **những gì
tưởng là chạy được**. Cả sáu đều có chung một hình dạng: **hai bên đều tự nhất quán với chính
mình**, và không phép kiểm nào nối chúng lại.

| # | Lỗi | Vì sao vô hình | Cách phát hiện |
|---|---|---|---|
| 1 | `.gitignore` có dòng `out/` không neo, nuốt luôn `orders/adapter/out/` | `git status` sạch, mã có trên đĩa | CI đỏ 22 lần liên tiếp vì thiếu tệp |
| 2 | `HttpClient` của JDK mặc định HTTP/2 nên gửi kèm `Upgrade: h2c`; uvicorn không giao thân yêu cầu cho FastAPI → **422** | đường không-stream vẫn 200, hệ thống "vẫn chạy" | dựng lại bằng socket thô: cùng body, chỉ thêm dòng `Upgrade` là 200 thành 422 |
| 3 | Trả `chatSessionToken` trong khi frontend đọc `accessToken` | mọi test backend đọc đúng cái tên backend tự đặt | đọc mã **bên gọi** |
| 4 | Đường SSE không lưu bộ nhớ hội thoại | từng lượt trả 200, từng câu trả lời đọc riêng đều hợp lý | bộ hỏi **theo hội thoại**, không theo lượt |
| 5 | `BACKEND_AI_TIMEOUT_SECONDS` (12) < `LLM_TIMEOUT_SECONDS` (30) — đảo ngược bất biến hết hạn | phép canh chỉ đọc tệp compose của bản .NET | port phép canh sang Java |
| 6 | Frontend SignalR vs backend STOMP (§2.3) | ba cổng, không cổng nào chạm chỗ hai bên gặp nhau | phép kiểm nối hai đầu bằng client thật |

**Kết luận rút ra, và nó là kết luận chính của cả báo cáo:**

> Hợp đồng do **bên gọi** định, không do bên nhận định. Một phép kiểm chỉ chứng minh hệ thống nhất
> quán với **giả định của chính người viết phép kiểm**, trừ khi nó chạy qua đúng con đường mà người
> dùng thật đi.

Lỗi #4 đáng nói thêm: nó bị bỏ lọt ở PR trước của **chính tôi**, vì mọi phép kiểm tôi viết khi đó
đều đọc đúng cái tên mà backend của tôi tự đặt.

---

## 5. Chiến lược kiểm chứng

### 5.1 Test miền không cần Spring

Khác biệt rõ nhất so với bản .NET nằm ở **hình dạng bộ test**, không ở số lượng:

| | .NET | Java |
|---|---|---|
| tổ chức theo | tính năng / vòng đời (`OrderLifecycleTests`, `PaymentLifecycleTests`) | **lớp miền** (`OrderTest`, `PaymentTest`) |
| cần hạ tầng | phần lớn cần Postgres + `WebApplicationFactory` | **83/85 test không cần gì**; chỉ 2 test cần Docker |

Đây là hệ quả trực tiếp của §3.1: khi quy tắc nằm trong `domain/` và `domain/` không chạm framework
thì kiểm nó chỉ cần `new Order(...)`. Bộ test miền chạy trong vài giây.

Đánh đổi phải nói rõ: bộ test miền **không** chứng minh phần đấu nối chạy. Phần đó do ba lớp khác
phủ — Testcontainers (Postgres thật), `golden-e2e`, và phép kiểm realtime §5.3.

### 5.2 Đối chiếu 1:1 với bản .NET trước khi xoá

Trước khi xoá `backend/`, hai bản được đối chiếu từng endpoint (phân giải cả tiền tố `MapGroup` của
.NET lẫn `@RequestMapping` của Java, chuẩn hoá tên biến trong `{}`):

```
.NET: 85 đăng ký route | Java: 85

CÓ Ở .NET, THIẾU Ở JAVA (2):
   GET  /api/auth/admin-check   ← cố ý bỏ, bằng chứng không nơi nào gọi
   POST /api/fail               ← không phải endpoint: nằm trong tệp test

CHỈ CÓ Ở JAVA (2):
   POST /api/orders/{}/items/{}/cancel   ← tính năng thêm (khách tự huỷ món)
   POST /api/payments/webhooks/casso     ← tính năng thêm (đối soát VietQR)
```

Thứ tự bắt buộc và đã giữ đúng: port đủ → CI chuyển sang stack Java → **mới** xoá. Ngược lại thì khi
có gì sai sẽ không còn bản .NET để so.

### 5.3 Phép kiểm nối hai đầu

Bài học §4 dẫn tới một loại phép kiểm mà cả hai bản đều không có trước đó: **mã client thật của
frontend nói với backend thật đang chạy**, trong chính job CI đã dựng sẵn stack.

Bốn ca, phủ cả bốn đích realtime:

```
✓ khách nhận assistance.requested trên /topic/table.<mã bàn>
✓ không có token phiên bàn thì bị TỪ CHỐI
✓ nhân viên nhận order.created mà không phải gọi watch gì thêm
✓ khách nhận order.statusChanged trên /topic/order.<mã đơn>
```

Ca thứ hai tồn tại để ca thứ nhất có nghĩa: nếu cổng mở toang thì ca thứ nhất vẫn xanh.

Một chi tiết về kỷ luật: phép kiểm này tự bỏ qua khi thiếu biến môi trường, nên nó **có thể** trở
thành một tệp không bao giờ chạy. Vì thế job CI phải cấp đủ biến — và điều đó được kiểm bằng cách
đọc log CI, không bằng cách tin.

### 5.4 Tài liệu sinh từ mã

Dự án đã bốn lần phát hiện tài liệu nói sai trạng thái mã. Nên bảng kiểm kê endpoint, danh sách
module và **khối số liệu §1.1 của chính báo cáo này** đều sinh từ mã, có cổng `--check` ở CI.

Bộ đếm endpoint từng bỏ sót đúng một endpoint (`@PostMapping(value = …, produces = …)` — endpoint
SSE, cái duy nhất phải khai `produces`). Một cổng dựng ra để phát hiện endpoint thiếu mà lại tự
giấu mất một endpoint thì tệ hơn không có cổng, vì nó tạo ra niềm tin sai.

---

## 6. Những gì KHÔNG port, và vì sao

| Thứ | Quyết định | Lý do |
|---|---|---|
| Dịch vụ AI/RAG (Python) | **giữ nguyên** | Java chỉ proxy. Viết lại RAG không thuộc phạm vi môn, và hợp đồng REST đã có sẵn |
| `GET /api/auth/admin-check` | **bỏ có chủ đích** | tìm khắp kho: không nơi nào gọi. Frontend quyết định quyền quản trị bằng prop `isAdmin`. Endpoint chỉ trả `{"status":"ok"}` |
| `POST /api/fail` | không phải endpoint | nằm trong tệp test middleware của .NET |
| Cookie `cmc_chat_session` | bỏ | frontend dùng header `X-Chat-Session-Token`; giữ cả hai là giữ hai đường xác thực cho cùng một thứ |

Nguyên tắc chung: **descope phải viết ra**. Một endpoint bị bỏ im lặng và một endpoint bị bỏ sót
trông giống hệt nhau trong bảng kiểm kê.

---

## 7. So sánh trung thực

### 7.1 Bản Java tốt hơn ở đâu

- **Ranh giới kiến trúc được canh bằng máy.** ArchUnit biến quy ước thành quy tắc. Bản .NET không có
  thứ tương đương, và ranh giới ở đó chỉ được giữ bằng thói quen.
- **Test miền chạy không cần hạ tầng.** 82 test miền + 1 test cấu hình triển khai chạy bằng JVM trần; chỉ 2 test tích hợp cần Docker.
- **Schema đọc được.** SQL viết tay của Flyway đọc được bằng mắt; 38 migration EF Core với 36.212
  dòng máy sinh thì không.
- **Phong cách được kiểm.** Checkstyle bắt lỗi mà con người bỏ qua khi review.

### 7.2 Bản .NET tốt hơn ở đâu

Phần này quan trọng hơn §7.1 vì nó dễ bị bỏ qua trong một báo cáo.

- **Migration an toàn hơn khi mô hình đổi.** EF Core sinh migration từ chênh lệch mô hình. Flyway
  không biết gì về mô hình Java — người viết phải tự nhớ viết SQL, và **quên là im lặng**. Hệ quả
  cụ thể: bộ sinh nhãn thực đơn của dự án từng ghi thẳng vào tệp seed; với Flyway thì không làm được
  nữa vì V2 là migration **đã chạy** (sửa nó làm hỏng checksum trên mọi CSDL đang chạy). Món nợ đó
  đang mở thành một issue riêng.
- **Realtime đơn giản hơn nhiều.** SignalR gói cả nhóm, xác thực và tên sự kiện vào một API.
  Với STOMP, ba thứ đó là ba việc phải tự dựng — và §2.3 cho thấy giá của việc dựng sai.
- **Khởi động nhanh hơn.** JVM boot chậm hơn .NET rõ rệt; healthcheck của dịch vụ `api` phải đặt
  `start_period: 60s`, gấp đôi bản .NET, nếu không container bị đánh dấu unhealthy trong lúc vẫn
  đang khởi động bình thường.
- **Ảnh Docker.** Ảnh runtime Java ~591 MB.

### 7.3 Không đổi

- **Số dòng mã người viết** — chênh 4% (§1.3).
- **Số endpoint** — 85, đối chiếu 1:1.
- **Hình dạng nghiệp vụ** — trạng thái đơn, vòng đời hoá đơn bàn, quy tắc ca quầy đều giữ nguyên.
  Bất biến là của bài toán, không của framework.

---

## 8. Kết luận

Việc port hoàn thành: 85 endpoint, CI chạy trên stack Java, `backend/` đã xoá, và toàn hệ thống chạy
được bằng một lệnh compose.

Nhưng kết quả kỹ thuật đáng nhớ nhất không phải bản Java. Đó là **sáu lỗi tích hợp ở §4**, vì cả sáu
đều đi qua mọi cổng chặn của một dự án vốn đã có nhiều cổng chặn. Chúng có chung một nguyên nhân, và
nguyên nhân đó không thuộc về ngôn ngữ nào:

> Mỗi bên đều đúng theo hợp đồng mà **chính nó** tưởng là hợp đồng.

Ba cổng chặn tốt vẫn để lọt một lỗi giết chết toàn bộ realtime, chỉ vì không cổng nào chạy qua đúng
con đường người dùng thật đi. Bài học đó áp dụng cho mọi lần tích hợp hai hệ thống, bất kể viết bằng
gì.

---

## Phụ lục A — tái lập số liệu

| Số liệu | Lệnh |
|---|---|
| khối §1.1 | `python docs/build_bao_cao_lap_trinh_nang_cao.py --check` |
| kiểm kê endpoint | `python docs/build_api_inventory.py --check` |
| test + Checkstyle + ArchUnit | `cd backend-java && ./gradlew build` |
| toàn hệ thống tại máy | `docker compose --env-file deploy/.env -f deploy/docker-compose.java.yml up -d --build` |
| số liệu .NET | xem §1.2 — cần lịch sử git tới `a44854e` |

## Phụ lục B — tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [`docs/pm/KE_HOACH_HOC_KY_2026-2.md`](../pm/KE_HOACH_HOC_KY_2026-2.md) | kế hoạch, §5 phạm vi port, §5.3 kiến trúc |
| [`docs/pm/BAO_CAO_SO_KHOP_NET_JAVA.md`](../pm/BAO_CAO_SO_KHOP_NET_JAVA.md) | so khớp hành vi hai bản (lịch sử, không tái lập được) |
| [`docs/backend/API_CONTRACT.md`](../backend/API_CONTRACT.md) | kiểm kê 85 endpoint, sinh từ mã |
| [`docs/backend/ARCHITECTURE.md`](../backend/ARCHITECTURE.md) | module và số endpoint mỗi module, sinh từ mã |
