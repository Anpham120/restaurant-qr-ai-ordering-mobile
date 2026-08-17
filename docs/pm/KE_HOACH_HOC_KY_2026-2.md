# Kế hoạch học kỳ 2026-2 — Fork cá nhân CMC Restaurant

**Chủ fork:** Phạm Duy An (BIT240002) · **Repo:** `Anpham120/restaurant-qr-ai-ordering-nqh` (private) · **Nguồn:** `Anpham120/restaurant-qr-ai-ordering` (INFO2005, đã v0.3.0)
**Ngày lập:** 2026-08-17

> Tài liệu này là kế hoạch làm việc cho một fork cá nhân, phục vụ 4 môn học kỳ này. Nó không thay
> thế báo cáo nhóm gốc — mọi số liệu về hạn chế/roadmap trích từ
> [`BAO_CAO_CONG_NGHE_PHAN_MEM.md §5.3–5.4`](../bao-cao/BAO_CAO_CONG_NGHE_PHAN_MEM.md#53-hạn-chế)
> của nhóm cũ, giữ nguyên để không tự ý diễn giải lại công sức của người khác.

---

## 1. Bối cảnh

Dự án gốc là đồ án nhóm 5 người, môn Công nghệ phần mềm (INFO2005), đã hoàn thành MVP và triển
khai production (`v0.3.0`, 84/84 test backend đạt). Vai trò của tôi trong nhóm: **nhóm trưởng —
thiết kế hệ thống, AI/RAG, DevOps** (16 issue · 270 PR · 392 commit trên repo gốc), nên tôi nắm
được kiến trúc và quyết định kỹ thuật của toàn bộ hệ thống, không chỉ một module.

Học kỳ này tôi có 4 môn, dùng **một fork duy nhất** làm nền cho cả 4:

| Môn | Cách fork phục vụ môn | Trạng thái |
|---|---|---|
| Lập trình nâng cao | Viết lại phần lõi backend từ ASP.NET Core sang Java Spring Boot | Bắt đầu ngay — §5 |
| Quản lý dự án CNTT | Chính fork này là đối tượng quản lý: WBS, mốc, rủi ro | Bắt đầu ngay — §4 |
| Triển khai phần mềm | Container hoá + CI/CD cho bản Java, so sánh với pipeline .NET hiện có | Kế hoạch đã phác — §7. Bắt đầu code sau khi §5 có gì để đóng gói |
| Lập trình ứng dụng di động | App Flutter cho nhân viên phục vụ (khoảng trống đã ghi nhận, khớp roadmap gốc mục 17) | Kế hoạch đã phác — §8. Bắt đầu code sau khi §5 port xong Orders |

---

## 2. Hiện trạng — đối chiếu với mã thật

Số liệu sinh từ mã trong [`docs/backend/ARCHITECTURE.md`](../backend/ARCHITECTURE.md) (kiểm lần
cuối 2026-07-16, mã sửa gần nhất 2026-08-02):

| Chỉ số | Giá trị |
|---|---|
| Module backend | 17 |
| Endpoint | 84 |
| Migration EF Core | 21 |
| Invariant đặc tả (`SPEC.md` §V) | 63 |
| Task đã đóng (§T) | 40/40 |
| Bug đã ghi nhận + sửa (§B) | 82 |

Đây **không phải một dự án sinh viên nhỏ** — nó có transaction/concurrency thật (`xmin`,
serializable execution strategy), state machine phiên bàn/đơn/thanh toán/hoá đơn nhiều lớp, và một
service AI/RAG riêng biệt. Hệ quả trực tiếp cho kế hoạch: **không đặt mục tiêu port 100% sang Java
trong một học kỳ** — mục 5.1 định phạm vi cụ thể.

### 2.1 Mười một hạn chế đã ghi nhận chính thức

Trích nguyên văn từ báo cáo nhóm (Bảng 43, §5.3), giữ số thứ tự gốc để dễ đối chiếu ngược:

| # | Hạn chế | Loại |
|---|---|---|
| 1 | Chưa kiểm thử tải (p50 8,6s / p95 13,5s đo trên 1 máy) | Vận hành |
| 2 | Chưa có human evaluation cho chất lượng câu trả lời AI | AI |
| 3 | VietQR chưa tự động đối soát — xác nhận thủ công | Nghiệp vụ |
| 4 | Chưa có coverage report, a11y test, performance budget frontend | Chất lượng |
| 5 | Độ trễ trợ lý AI cao (p95 13,5s) | AI |
| 6 | Ảnh Docker AI 2,74 GB | Vận hành |
| 7 | Nhãn dị nguyên mới phủ 44/91 món, chưa bếp xác nhận | Dữ liệu |
| 8 | Branch ruleset chỉ mới bật cuối kỳ | Quy trình |
| 9 | Human peer review mới thiết lập cuối kỳ | Quy trình |
| 10 | Chưa ước lượng thời gian lên món cho khách | **Nghiệp vụ — backend** |
| 11 | **Khách chưa tự huỷ được món của mình** (rule nghiệp vụ đã có, thiếu endpoint theo capability token) | **Nghiệp vụ — backend** |

Hạn chế #10 và #11 thuộc đúng mảng tôi phụ trách (Orders/Tables) và **không cần đổi schema** —
phù hợp nhất để mang sang bản Java làm minh chứng "tôi hiểu nghiệp vụ, không chỉ dịch code".

---

## 3. Nguyên tắc chung cho cả 4 môn

1. **Một nguồn sự thật nghiệp vụ.** Bản Java không được tự bịa hành vi khác bản .NET trừ khi ghi
   rõ lý do (ví dụ đổi thuật toán băm mật khẩu). Dùng lại `SPEC.md` (invariant V..) làm đặc tả gốc.
2. **Không port cái gì không port được trong thời gian có.** Descope phải viết ra, không âm thầm bỏ.
3. **Mỗi việc có tiêu chí hoàn thành đo được** — kế thừa đúng kỷ luật nhóm cũ đã dùng suốt 5 tuần.
4. **AI/RAG service (Python/FastAPI) giữ nguyên**, không nằm trong phạm vi môn Lập trình nâng cao —
   backend Java gọi sang nó qua đúng hợp đồng REST hiện có (`ai/contracts/ai-chat-v1.schema.json`).

---

## 4. Quản lý dự án CNTT — quản lý fork này

### 4.1 Tuyên bố phạm vi (project charter rút gọn)

- **Mục tiêu:** một bản backend Java Spring Boot phục vụ đúng luồng dine-in lõi (QR → menu → giỏ →
  đơn → bếp → thanh toán), cộng hai nghiệp vụ hoàn thiện (#10, #11), chạy được với frontend React
  hiện có mà không sửa API contract của các endpoint đã port.
- **Ngoài phạm vi học kỳ này:** Loyalty, Promotions, Counter shift, Reports, AI/Chat (giữ Python),
  multi-tenant, mobile app thật (đẩy sang môn Lập trình di động).
- **Ràng buộc:** 1 người, chạy song song 4 môn, không có ngân sách hạ tầng ngoài máy cá nhân + VPS
  demo hiện có (nếu dùng chung với repo gốc phải xin phép, xem §9).
- **Tiêu chí xong (Definition of Done) cấp dự án:** `dotnet test` cũ và bộ test Java mới cùng xanh
  trên cùng một tập kịch bản nghiệp vụ; Docker Compose khởi động được bản Java thay cho bản .NET
  trong `deploy/docker-compose.yml` (biến thể riêng, không sửa file gốc).

### 4.2 WBS (Work Breakdown Structure)

```
1. Khởi tạo fork và quản trị dự án
   1.1 Tạo fork riêng, cấu hình remote                          [XONG — §9]
   1.2 Tài liệu kế hoạch (tài liệu này)                          [XONG]
   1.3 Thiết lập issue/milestone cho học kỳ (GitHub Projects)
2. Java Spring Boot — nền tảng
   2.1 Khởi tạo project (Gradle/Maven, cấu trúc package-by-feature)
   2.2 Kết nối PostgreSQL (Flyway, tái dùng schema 21 migration hiện có)
   2.3 Auth + Users (JWT, phân quyền role)
3. Java Spring Boot — nghiệp vụ lõi
   3.1 Menu + Categories
   3.2 Tables + QR session (state machine resume state)
   3.3 Orders + OrderItems (state machine, order_status_history)
   3.4 Payments (COD bắt buộc; VietQR nếu còn thời gian)
   3.5 Realtime (WebSocket/STOMP thay SignalR, có polling fallback)
4. Hoàn thiện nghiệp vụ còn dang dở (song song bước 3)
   4.1 Hạn chế #11 — khách tự huỷ món qua capability token
   4.2 Hạn chế #10 — mốc thời gian theo món (đo trước, chưa hiển thị ước lượng)
5. Kiểm chứng
   5.1 Bộ test tích hợp Java đối chiếu invariant V1–V63 liên quan module đã port
   5.2 So khớp hành vi song song (chạy .NET và Java, cùng kịch bản, so response)
6. Đóng gói môn học
   6.1 Báo cáo Lập trình nâng cao (quyết định kỹ thuật, so sánh ASP.NET vs Spring Boot)
   6.2 Cập nhật tài liệu quản lý dự án (mục này) theo tiến độ thật
```

### 4.3 Mốc thời gian đề xuất (khung 14 tuần, điều chỉnh theo lịch môn thật)

| Tuần | Mốc | Đầu ra kiểm chứng được |
|---|---|---|
| 1–2 | Khởi tạo Spring Boot, kết nối DB, Auth | Login trả JWT giống contract cũ, test đăng nhập xanh |
| 3–4 | Menu + Categories + Tables/QR | `GET /api/menu`, `GET /api/tables/{code}` tương đương .NET |
| 5–7 | Orders + OrderItems + state machine | Toàn bộ luồng Placed→...→Completed có test |
| 8 | Hạn chế #11 (khách tự huỷ món) | Endpoint mới + test theo capability token |
| 9 | Hạn chế #10 (đo mốc thời gian món) | Cột/bảng ghi mốc thời gian, chưa hiển thị ước lượng |
| 10 | Payments (COD, VietQR nếu kịp) | Luồng thanh toán qua được test tích hợp |
| 11 | Realtime (WebSocket) | Bếp nhận `order.created` qua WebSocket + polling fallback |
| 12 | So khớp hành vi song song .NET/Java | Báo cáo đối chiếu, liệt kê sai khác đã biết |
| 13 | Đóng gói Docker + cập nhật docs | `docker-compose` biến thể chạy được bản Java |
| 14 | Báo cáo + chuẩn bị vấn đáp | Tài liệu môn Lập trình nâng cao hoàn chỉnh |

### 4.4 Sổ rủi ro (risk register)

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Một người làm việc của 5 người trong 1 kỳ — hết thời gian trước khi port xong | Cao | Cao | Giữ đúng scope §5.1 (7 module lõi, không phải 17); descope công khai từng tuần nếu trễ |
| SignalR → WebSocket lệch hành vi realtime, khó phát hiện | Trung bình | Trung bình | Giữ polling fallback y như bản .NET đã có sẵn (V53), không phụ thuộc 100% vào realtime |
| Concurrency (`xmin`, serializable retry) khó tái tạo đúng bằng JPA | Trung bình | Cao | Ưu tiên port đúng 1 luồng có tranh chấp thật (tạo Order Round) trước, dùng `@Version` + Spring Retry, viết test tái tạo race condition như bản .NET (B24, B35) |
| Trùng lịch 4 môn cùng lúc | Cao | Trung bình | Việc ở §4.2 bước 3–4 dùng chung cho cả môn PM lẫn Lập trình nâng cao — không làm hai lần |
| Sửa nhầm vào repo gốc của nhóm thay vì fork | Thấp (đã tách remote) | Cao nếu xảy ra | `origin` = repo nhóm (chỉ đọc/fetch), `personal` = fork riêng; không `git push origin` |

---

## 5. Kế hoạch chuyển đổi ASP.NET → Java Spring Boot

### 5.1 Định phạm vi — 7/17 module

Port theo thứ tự phụ thuộc, dừng lại nếu hết thời gian — mỗi module port xong là một hệ thống
chạy được, không phải "dở dang không demo được":

| Ưu tiên | Module | Vì sao |
|---|---|---|
| Bắt buộc | Auth + Users | Mọi thứ khác cần JWT |
| Bắt buộc | Menu + Categories | CRUD đơn giản, khởi động nhanh, có dữ liệu để demo |
| Bắt buộc | Tables | Nền cho QR session |
| Bắt buộc | Orders | Lõi nghiệp vụ, nhiều invariant nhất |
| Bắt buộc | Payments | Hoàn tất luồng dine-in |
| Nên có | Realtime | Giá trị demo cao (bếp cập nhật trực tiếp) |
| Nếu còn thời gian | Chat (chỉ proxy) | Gọi sang AI service Python có sẵn, không viết lại RAG |
| **Để lại bản .NET** | Loyalty, Promotions, Counter, Reports | Không ảnh hưởng luồng dine-in lõi; ghi rõ trong báo cáo là descope có chủ đích |

### 5.2 Ánh xạ công nghệ

| Lớp | ASP.NET Core (hiện có) | Java Spring Boot (đề xuất) |
|---|---|---|
| Web layer | Minimal API endpoints | `@RestController` + `@RequestMapping` |
| ORM | EF Core + Npgsql | Spring Data JPA + Hibernate + PostgreSQL driver |
| Migration | EF Core Migrations (21 bản) | Flyway, port lại từng migration theo đúng thứ tự |
| Auth | JWT tự ký, PBKDF2/HMAC password hash | Spring Security + JJWT; cân nhắc BCrypt/Argon2 (ghi rõ lý do đổi nếu chọn khác PBKDF2) |
| Optimistic concurrency | PostgreSQL `xmin` đọc thủ công → `409 CONFLICT_STALE` | JPA `@Version` (Hibernate optimistic locking) → bắt `OptimisticLockException` → map `409` |
| Retry giao dịch serializable | `Database.CreateExecutionStrategy()` (Npgsql) | Spring Retry (`@Retryable`) quanh `@Transactional(isolation = SERIALIZABLE)` |
| Realtime | SignalR hub | Spring WebSocket + STOMP, giữ nguyên polling fallback ở frontend |
| Cấu hình | `appsettings.json` + biến môi trường | `application.yml` + Spring profiles (`dev`/`staging`/`production`) |
| Test tích hợp | `WebApplicationFactory` + EF InMemory | `@SpringBootTest` + Testcontainers PostgreSQL (khuyến nghị hơn H2, vì hệ thống phụ thuộc hành vi PostgreSQL thật — `xmin`, unique index có điều kiện) |
| Đóng gói | Dockerfile .NET SDK | Dockerfile multi-stage Maven/Gradle + JRE 21 (image nhẹ như đã lưu ý ở hạn chế #6 cho AI image) |

### 5.3 Kiến trúc đề xuất cho bản Java

Bản .NET đã là modular monolith có port sẵn (`IUserStore`, `IChatStore`), nhưng ranh giới
domain/adapter không tách vật lý. Bản Java tận dụng đúng lúc chuyển ngôn ngữ để làm rõ hơn — đây
cũng là nội dung "tối ưu kiến trúc" cho môn Lập trình nâng cao:

```
com.cmc.restaurant
├── orders/                      (một package = một module nghiệp vụ, như ASP.NET hiện tại)
│   ├── domain/                  Order, OrderItem, trạng thái — POJO thuần, không phụ thuộc Spring
│   ├── application/             OrderService — use case, gọi qua port
│   ├── adapter/in/web/          OrderController
│   └── adapter/out/persistence/ OrderJpaRepository, OrderEntity (map domain ↔ JPA)
├── tables/  menu/  payments/  auth/   (cùng cấu trúc)
└── shared/                      lỗi chuẩn hoá, id generator, cấu hình chung
```

Lý do chọn hexagonal nhẹ (ports-and-adapters) thay vì giữ transaction-script như bản .NET: domain
Orders có nhiều invariant nhất (V7, V14–V19, V49) — tách domain khỏi Hibernate giúp test state
machine mà không cần khởi động DB thật cho phần lớn test, chỉ integration test mới cần Testcontainers.

### 5.4 Việc KHÔNG làm khi port

- Không đổi API contract của các endpoint đã port (frontend React không sửa được trong phạm vi
  môn này).
- Không viết lại AI/RAG bằng Java — giữ nguyên service Python, chỉ proxy.
- Không cố port `xmin`/execution-strategy y hệt byte-for-byte — mục tiêu là **giữ đúng bất biến**
  (ví dụ V16: order round creation và settlement không được cùng commit từ một session version),
  không phải giữ đúng cơ chế.

---

## 6. Nghiệp vụ ưu tiên hoàn thiện trong bản Java

Chọn từ 11 hạn chế đã biết (§2.1), tiêu chí chọn: **nằm trong luồng dine-in lõi đã đưa vào phạm vi
Java (§5.1) + không cần đổi schema lớn + có thể chứng minh bằng test**:

1. **#11 — Khách tự huỷ món.** Rule nghiệp vụ đã có sẵn trong domain cũ (chỉ huỷ được món
   `Pending`, khoá huỷ cả lượt khi một món vào bếp). Việc còn thiếu là mở endpoint cho vai trò
   Customer, xác thực bằng capability token của lượt gọi thay vì role nhân viên. Port module này
   thẳng vào bản Java kèm luôn tính năng mới — không port version thiếu rồi vá sau.
2. **#10 — Mốc thời gian theo món.** Chỉ làm phần "đo trước": thêm cột/bảng ghi mốc thời gian theo
   từng `OrderItem` (không phải theo lượt gọi như hiện tại). **Không** hiển thị ước lượng cho
   khách trong phạm vi học kỳ này — đúng như lý do nhóm cũ đã nêu (ước lượng sai hại hơn không có).

Hai mục còn lại phù hợp nhưng **không** đưa vào phạm vi Java (để bản .NET xử lý nếu cần, vì không
liên quan chuyển ngôn ngữ):
- #1 (load test), #4 (coverage/a11y) là việc đo lường, áp dụng cho hệ thống nào đang chạy thật —
  ưu tiên đo trên bản .NET đang production, không đo trên bản Java demo.
- #7 (audit nhãn dị nguyên) là việc dữ liệu/AI, không thuộc backend.

---

## 7. Kế hoạch triển khai phần mềm (môn Triển khai phần mềm)

### 7.1 Ranh giới an toàn

Pipeline hiện có (`.github/workflows/*`, VPS production) **thuộc về repo nhóm gốc**, đang phục vụ
điểm môn INFO2005 của 4 người khác — không sửa `deploy-staging.yml`/`deploy-production.yml` gốc,
không SSH hay deploy thật lên VPS đó. Toàn bộ việc dưới đây chỉ chạy trong fork cá nhân và **chỉ
local Docker Compose** — quyết định đã chốt, không có bước lên VPS thật trong phạm vi môn này.

### 7.2 Vì sao không chỉ viết báo cáo phân tích

Pipeline gốc đã rất đầy đủ (9 workflow, staging/production tách biệt, auto-rollback, CodeQL +
Trivy + gitleaks + dependency-review, 14 cổng generator-check). Phân tích lại nó không tạo ra chứng
cứ kỹ năng mới. Việc có giá trị hơn cho môn học: **tự tay dựng một đường triển khai song song cho
bản Java**, rồi so sánh có số liệu với bản .NET đang chạy thật — đó mới là "triển khai", không
phải "đọc triển khai người khác làm".

### 7.3 Việc cụ thể

| # | Việc | Đối chiếu với hạ tầng .NET hiện có |
|---|---|---|
| D1 | Dockerfile multi-stage cho Spring Boot (build: Maven/Gradle, runtime: JRE slim) | So kích thước image với `backend/Dockerfile` (.NET SDK/runtime) |
| D2 | `deploy/docker-compose.java.yml` — biến thể thay service `api` bằng image Java, giữ nguyên `postgres`, `ai-service`, `frontend` | Tái dùng đúng healthcheck pattern `/api/health`, `depends_on: service_healthy` |
| D3 | Service `migrate` one-shot chạy Flyway thay EF Core, theo đúng mẫu `migrate` hiện có (`--migrate-only`) | Giữ nguyên nguyên tắc V10: migration tách khỏi API boot |
| D4 | Workflow `ci-java.yml` mirror job `backend-test` của `ci.yml` (build/test Maven/Gradle + Testcontainers) | Không đụng `ci.yml` gốc — file mới, chạy độc lập trên fork |
| D5 | Báo cáo so sánh có số liệu: build time, image size, cold start, RAM idle | Đo trên cùng máy, cùng điều kiện với bản .NET để số liệu so được |
| D6 | *(nếu còn thời gian)* diễn tập rollback thủ công trên local: dừng service Java giả lập lỗi, phục hồi từ image trước | Không bắt buộc — chỉ VPS thật mới cần rollback tự động như `rollback.yml` gốc |

### 7.4 Ngoài phạm vi

Không CI/CD thật lên staging/production, không secrets thật, không sửa branch ruleset của repo
nhóm gốc. Đây là bài tập triển khai **có kiểm chứng bằng số liệu local**, không phải vận hành thật.

---

## 8. Kế hoạch ứng dụng di động (môn Lập trình ứng dụng di động)

### 8.1 Bài toán — không phải tính năng tự nghĩ ra

[`docs/frontend/OPS_APP.md`](../frontend/OPS_APP.md) ghi thẳng: *"No mobile floor-staff UI. Service
staff coordinate via radio; counter staff use the POS workspace only."* Nhân viên phục vụ hiện
**không có công cụ số nào** — biết bàn nào có món sẵn sàng hoàn toàn qua bộ đàm/đi hỏi bếp. Đây là
khoảng trống đã được chính hệ thống ghi nhận, và khớp thẳng roadmap gốc mục 17 ("ứng dụng di động
cho nhân viên phục vụ"). Không thêm app khách hàng — mô hình QR ordering cố tình không cần cài app,
thêm app khách sẽ mâu thuẫn với giá trị cốt lõi đó.

### 8.2 Stack: Flutter (Dart)

### 8.3 Phạm vi — hẹp có chủ đích

| Có | Không |
|---|---|
| Đăng nhập role Staff (`POST /api/auth/login`, JWT lưu secure storage) | Gọi món hộ khách, giỏ hàng |
| Danh sách đơn đang hoạt động theo trạng thái (`GET /api/orders?status=active`) | Toàn bộ nghiệp vụ Counter/Kitchen trên mobile |
| Thông báo realtime khi đơn chuyển `Ready` (nối vào order hub hiện có) | Thay thế `ops-web` |
| Nút "Đã phục vụ" → `PATCH /api/orders/{code}/status` = `Served` (role Staff đã được phép theo V54) | Đổi API contract để tiện cho mobile |
| Polling fallback khi mất realtime (đúng tinh thần V53 bản web) | Tính năng mới ngoài luồng phục vụ bàn |

### 8.4 Gọi vào backend nào

Gọi thẳng vào **bản .NET đang chạy** trước — nó đã ổn định, đủ endpoint cần, không phải chờ Java
port xong Orders. Khi bản Java hoàn tất module Orders + Realtime (WBS §4.2 mục 3.3, 3.5), đổi
`baseUrl` sang bản Java là đủ — vì nguyên tắc §3 mục 1 giữ API contract không đổi giữa hai bản, phía
Flutter không cần sửa model hay logic gọi API.

### 8.5 WBS rút gọn

1. Thiết kế 3 màn hình: đăng nhập, danh sách bàn cần phục vụ, chi tiết đơn.
2. Tích hợp API đăng nhập + danh sách đơn (gọi bản .NET hiện có).
3. Tích hợp realtime + polling fallback.
4. Nút "Đã phục vụ" + xử lý lỗi mạng/offline.
5. Kiểm thử trên thiết bị thật, chụp bằng chứng cho báo cáo môn học.

---

## 9. Đã thực hiện

- [x] Tạo repo riêng `Anpham120/restaurant-qr-ai-ordering-nqh` (private), remote `personal` trỏ
      vào đó; remote `origin` giữ nguyên trỏ về repo nhóm, chỉ dùng để đồng bộ đọc.
- [x] Đối chiếu hiện trạng thật (module/endpoint/invariant/hạn chế) trước khi lập kế hoạch, không
      suy đoán từ README một cách chung chung.

## 10. Bước tiếp theo

- [ ] Commit và đẩy tài liệu này + toàn bộ mã nguồn lên `personal`.
- [ ] Tạo GitHub Project/milestone trên fork riêng theo mốc ở §4.3.
- [ ] Khởi tạo project Spring Boot (bước 2.1 trong WBS) khi sẵn sàng bắt đầu code.
