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
| Triển khai phần mềm | Container hoá + CI/CD cho bản Java, so sánh với pipeline .NET hiện có | Làm sau — §8 |
| Lập trình ứng dụng di động | App di động cho nhân viên phục vụ (đã có sẵn trong roadmap gốc, mục 17) | Làm sau — §8 |

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

## 7. Việc để dành — Triển khai phần mềm & Lập trình di động

Không làm trong đợt này, ghi lại để không quên phạm vi:

- **Triển khai phần mềm:** dùng `deploy/docker-compose.yml` hiện có làm baseline, viết biến thể
  thay `api` service bằng image Java; so sánh kích thước image, thời gian cold start, chiến lược
  rollback giữa hai bản — đúng chất liệu môn học (không cần build hạ tầng mới từ đầu).
- **Lập trình ứng dụng di động:** roadmap gốc mục 17 đã đề xuất sẵn "ứng dụng di động cho nhân viên
  phục vụ" — dùng đúng ý tưởng này thay vì nghĩ tính năng mới, vì nó đã được nhóm cũ xác định là có
  giá trị vận hành thật (thay vì thêm ứng dụng khách hàng — QR ordering vốn đã cố tình không cần
  cài app, thêm app khách sẽ mâu thuẫn với giá trị cốt lõi đó).

---

## 8. Đã thực hiện

- [x] Tạo repo riêng `Anpham120/restaurant-qr-ai-ordering-nqh` (private), remote `personal` trỏ
      vào đó; remote `origin` giữ nguyên trỏ về repo nhóm, chỉ dùng để đồng bộ đọc.
- [x] Đối chiếu hiện trạng thật (module/endpoint/invariant/hạn chế) trước khi lập kế hoạch, không
      suy đoán từ README một cách chung chung.

## 9. Bước tiếp theo

- [ ] Commit và đẩy tài liệu này + toàn bộ mã nguồn lên `personal`.
- [ ] Tạo GitHub Project/milestone trên fork riêng theo mốc ở §4.3.
- [ ] Khởi tạo project Spring Boot (bước 2.1 trong WBS) khi sẵn sàng bắt đầu code.
