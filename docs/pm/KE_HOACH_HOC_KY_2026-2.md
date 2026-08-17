# Kế hoạch học kỳ 2026-2 — Fork cá nhân CMC Restaurant

**Chủ fork:** Phạm Duy An (BIT240002) · **Repo:** `Anpham120/restaurant-qr-ai-ordering-nqh` (private) · **Nguồn:** `Anpham120/restaurant-qr-ai-ordering` (INFO2005, đã v0.3.0)
**Ngày lập:** 2026-08-17

> Tài liệu này là kế hoạch làm việc cho một fork cá nhân, phục vụ 4 môn học kỳ này. Nó không thay
> thế báo cáo nhóm gốc — mọi số liệu về hạn chế/roadmap trích từ
> [`BAO_CAO_CONG_NGHE_PHAN_MEM.md §5.3–5.4`](../bao-cao/BAO_CAO_CONG_NGHE_PHAN_MEM.md#53-hạn-chế)
> của nhóm cũ, giữ nguyên để không tự ý diễn giải lại công sức của người khác.

### Lịch sử thay đổi phạm vi

Bản đầu chỉ có Java migration lõi (§5) + 2 hạn chế (§6). Ba lần mở rộng sau, mỗi lần có lý do cụ
thể, ghi lại để không trông giống scope creep âm thầm:

| Lần | Thêm gì | Vì sao |
|---|---|---|
| 1 | App mobile: từ "công cụ nhân viên" → "khách hàng thân thiết" full-parity 2 lớp 3 pha | Người chủ dự án muốn tập trung vào khách quay lại, không phải nhân viên |
| 2 | Hạn chế #10 thêm phần hiển thị (không chỉ đo); hạn chế #3 (thanh toán tự động qua Casso) | Người chủ dự án chủ động yêu cầu, chấp nhận rủi ro đã nêu ở hạn chế #10 |
| 3 | §7 — cải tiến UX ba luồng `ops-web`, gộp vào môn Lập trình nâng cao | Người chủ dự án nêu giao diện/thao tác chưa tốt; xác nhận rõ đây là vấn đề UX, không phải thiết kế lại giao diện |

---

## 1. Bối cảnh

Dự án gốc là đồ án nhóm 5 người, môn Công nghệ phần mềm (INFO2005), đã hoàn thành MVP và triển
khai production (`v0.3.0`, 84/84 test backend đạt). Vai trò của tôi trong nhóm: **nhóm trưởng —
thiết kế hệ thống, AI/RAG, DevOps** (16 issue · 270 PR · 392 commit trên repo gốc), nên tôi nắm
được kiến trúc và quyết định kỹ thuật của toàn bộ hệ thống, không chỉ một module.

Học kỳ này tôi có 4 môn, dùng **một fork duy nhất** làm nền cho cả 4:

| Môn | Cách fork phục vụ môn | Trạng thái |
|---|---|---|
| Lập trình nâng cao | Backend ASP.NET → Java Spring Boot, thanh toán tự động, ước lượng thời gian món + huỷ món, cải tiến UX 3 luồng vận hành | Kế hoạch đầy đủ — §5, §6, §7 |
| Quản lý dự án CNTT | Chính fork này là đối tượng quản lý: WBS, mốc, rủi ro, log thay đổi phạm vi | §4 |
| Triển khai phần mềm | Container hoá + CI song song cho bản Java, chỉ local, so sánh với pipeline .NET | §8 |
| Lập trình ứng dụng di động | App Flutter cho khách hàng thân thiết — full parity với web + lớp độc quyền (thẻ thành viên, hồ sơ AI bền vững) | §9 |

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

| # | Hạn chế | Loại | Xử lý trong kế hoạch này |
|---|---|---|---|
| 1 | Chưa kiểm thử tải (p50 8,6s / p95 13,5s đo trên 1 máy) | Vận hành | Ngoài phạm vi — đo trên .NET production, không đo trên Java demo |
| 2 | Chưa có human evaluation cho chất lượng câu trả lời AI | AI | Ngoài phạm vi — không thuộc backend |
| 3 | VietQR chưa tự động đối soát — xác nhận thủ công | Nghiệp vụ | **Nhận — §6, webhook Casso** |
| 4 | Chưa có coverage report, a11y test, performance budget frontend | Chất lượng | Ngoài phạm vi — đo trên .NET production |
| 5 | Độ trễ trợ lý AI cao (p95 13,5s) | AI | Ngoài phạm vi |
| 6 | Ảnh Docker AI 2,74 GB | Vận hành | Ngoài phạm vi (tham chiếu khi so sánh image Java ở §8) |
| 7 | Nhãn dị nguyên mới phủ 44/91 món, chưa bếp xác nhận | Dữ liệu | Ngoài phạm vi — việc dữ liệu/AI |
| 8 | Branch ruleset chỉ mới bật cuối kỳ | Quy trình | Đã áp dụng ngay từ đầu cho fork này — §4 |
| 9 | Human peer review mới thiết lập cuối kỳ | Quy trình | Không áp dụng — làm một mình |
| 10 | Chưa ước lượng thời gian lên món cho khách | **Nghiệp vụ — backend** | **Nhận — §6, có kiểm soát rủi ro ước lượng sai** |
| 11 | Khách chưa tự huỷ được món của mình | **Nghiệp vụ — backend** | **Nhận — §6** |

---

## 3. Nguyên tắc chung cho cả 4 môn

1. **Một nguồn sự thật nghiệp vụ.** Bản Java không được tự bịa hành vi khác bản .NET trừ khi ghi
   rõ lý do (ví dụ đổi thuật toán băm mật khẩu). Dùng lại `SPEC.md` (invariant V..) làm đặc tả gốc.
2. **Không port cái gì không port được trong thời gian có.** Descope phải viết ra, không âm thầm bỏ.
3. **Mỗi việc có tiêu chí hoàn thành đo được** — kế thừa đúng kỷ luật nhóm cũ đã dùng suốt 5 tuần.
4. **AI/RAG service (Python/FastAPI) giữ nguyên**, không nằm trong phạm vi môn Lập trình nâng cao —
   backend Java gọi sang nó qua đúng hợp đồng REST hiện có (`ai/contracts/ai-chat-v1.schema.json`).
5. **Không đụng code lõi đang chạy thật của nhóm gốc nếu không bắt buộc** — mọi cải tiến (UX,
   tính năng mới) ưu tiên làm ở bản Java đang xây mới, hoặc ở fork riêng, tránh sửa trực tiếp vào
   những đường đã test kỹ và nhạy cảm với race condition trên bản .NET production thật.

---

## 4. Quản lý dự án CNTT — quản lý fork này

### 4.1 Tuyên bố phạm vi (project charter rút gọn)

- **Mục tiêu:** một bản backend Java Spring Boot phục vụ luồng dine-in lõi, cộng ba nghiệp vụ hoàn
  thiện (#3, #10, #11) và một đợt cải tiến UX có mục tiêu cho 3 luồng vận hành, chạy được với
  frontend React hiện có mà không sửa API contract của các endpoint đã port.
- **Ngoài phạm vi học kỳ này:** Loyalty/Promotions ở backend Java (ở lại .NET), Counter shift,
  Reports, AI/Chat (giữ Python), multi-tenant, thiết kế lại giao diện trực quan (đã xác nhận UI
  hiện tại ổn, chỉ tối ưu UX).
- **Ràng buộc:** 1 người, chạy song song 4 môn, không có ngân sách hạ tầng ngoài máy cá nhân +
  1 tài khoản ngân hàng cá nhân (cho webhook Casso). Không dùng VPS production của nhóm gốc.
- **Tiêu chí xong (Definition of Done) cấp dự án:** `dotnet test` cũ và bộ test Java mới cùng xanh
  trên cùng một tập kịch bản nghiệp vụ; Docker Compose khởi động được bản Java thay cho bản .NET
  trong biến thể riêng; app Flutter chạy được tầng Lõi (M1) tối thiểu.

### 4.2 WBS (Work Breakdown Structure)

```
1. Khởi tạo fork và quản trị dự án
   1.1 Tạo fork riêng, cấu hình remote                          [XONG]
   1.2 Tài liệu kế hoạch (tài liệu này)                          [XONG]
   1.3 Thiết lập issue/milestone cho học kỳ (GitHub Projects)
2. Java Spring Boot — nền tảng
   2.1 Khởi tạo project (Gradle/Maven, cấu trúc package-by-feature)
   2.2 Kết nối PostgreSQL (Flyway, tái dùng schema 21 migration hiện có)
   2.3 Auth + Users (JWT, phân quyền role, trường MemberId tuỳ chọn khi mở phiên)
3. Java Spring Boot — nghiệp vụ lõi
   3.1 Menu + Categories
   3.2 Tables + QR session (state machine resume state)
   3.3 Orders + OrderItems (state machine, order_status_history)
   3.4 Payments (COD, VietQR, webhook Casso tự động đối soát)
   3.5 Realtime (WebSocket/STOMP thay SignalR, có polling fallback)
4. Hoàn thiện nghiệp vụ còn dang dở (song song bước 3)
   4.1 Hạn chế #11 — khách tự huỷ món qua capability token
   4.2 Hạn chế #10 — đo + hiển thị ước lượng có kiểm soát rủi ro
   4.3 Hạn chế #3 — webhook Casso đối soát VietQR tự động
5. Cải tiến UX ba luồng vận hành (độc lập tiến độ Java, chạy trên React hiện có)
   5.1 Counter — optimistic UI, xác nhận đóng ca, xác nhận hàng loạt COD
   5.2 Kitchen — optimistic UI, chuyển trạng thái hàng loạt song song, tìm kiếm món 86
   5.3 Admin — optimistic UI cho CRUD bàn/người dùng, chuẩn hoá hộp xác nhận
   5.4 Dọn code debug sót (fetch 127.0.0.1:7639 trong 3 file Kitchen)
6. Kiểm chứng
   6.1 Bộ test tích hợp Java đối chiếu invariant liên quan module đã port
   6.2 So khớp hành vi song song (chạy .NET và Java, cùng kịch bản, so response)
7. Đóng gói môn học
   7.1 Báo cáo Lập trình nâng cao (quyết định kỹ thuật, so sánh ASP.NET vs Spring Boot)
   7.2 Cập nhật tài liệu quản lý dự án (mục này) theo tiến độ thật
```

Track riêng, không tính vào 14 tuần dưới đây vì thuộc môn khác: **App Flutter (§9)** — WBS và mốc
thời gian nằm trong §9.10, chạy song song theo lịch môn Lập trình di động.

### 4.3 Mốc thời gian đề xuất (khung 14 tuần, điều chỉnh theo lịch môn thật)

| Tuần | Mốc | Đầu ra kiểm chứng được |
|---|---|---|
| 1–2 | Khởi tạo Spring Boot, kết nối DB, Auth (+ trường MemberId tuỳ chọn) | Login trả JWT giống contract cũ, test đăng nhập xanh |
| 3–4 | Menu + Categories + Tables/QR | `GET /api/menu`, `GET /api/tables/{code}` tương đương .NET |
| 5–7 | Orders + OrderItems + state machine + hạn chế #11 | Toàn bộ luồng Placed→...→Completed có test; khách huỷ được món `Pending` |
| 8 | Hạn chế #10 — đo + hiển thị ước lượng có ngưỡng mẫu | Ước lượng chỉ hiện khi ≥20 mẫu, dạng khoảng, tính hàng đợi bếp |
| 9–10 | Payments (COD, VietQR) + webhook Casso (hạn chế #3) | Thanh toán tự động xác nhận qua webhook, có test idempotent + race với xác nhận tay |
| 11 | Realtime (WebSocket) | Bếp nhận `order.created` qua WebSocket + polling fallback |
| 12 | Cải tiến UX Counter/Kitchen/Admin (§7) + dọn code debug | Optimistic UI, xác nhận đóng ca, bulk actions — có trước/sau đối chiếu |
| 13 | So khớp hành vi song song .NET/Java | Báo cáo đối chiếu, liệt kê sai khác đã biết |
| 14 | Đóng gói Docker (§8) + báo cáo + chuẩn bị vấn đáp | `docker-compose` biến thể chạy được bản Java, tài liệu hoàn chỉnh |

### 4.4 Sổ rủi ro (risk register)

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Một người làm việc của 5 người trong 1 kỳ — hết thời gian trước khi xong | Cao | Cao | Giữ đúng scope §5.1 (7 module lõi); mọi hạng mục mới đều gắn "Lõi/Stretch/Để dành", ưu tiên demo-được-từng-phần |
| Phạm vi đã mở rộng 3 lần kể từ bản đầu (xem log đầu tài liệu) | Đã xảy ra | Trung bình | Không mở rộng thêm nữa nếu không có lý do tương đương; mỗi lần mở rộng đều đối chiếu mã thật trước khi nhận |
| SignalR → WebSocket lệch hành vi realtime, khó phát hiện | Trung bình | Trung bình | Giữ polling fallback y như bản .NET đã có sẵn (V53) |
| Concurrency (`xmin`, serializable retry) khó tái tạo đúng bằng JPA | Trung bình | Cao | Ưu tiên port đúng 1 luồng có tranh chấp thật trước, dùng `@Version` + Spring Retry, viết test tái tạo race condition (B24, B35) |
| Webhook Casso phụ thuộc dịch vụ ngoài + tài khoản ngân hàng cá nhân — giới hạn gói miễn phí, đổi API ngoài tầm kiểm soát | Trung bình | Trung bình | Giữ nguyên nút xác nhận thủ công của quầy làm phương án dự phòng vĩnh viễn, không xoá |
| Ước lượng thời gian món sai làm hỏng lòng tin khách (rủi ro team gốc đã né) | Trung bình nếu bỏ qua kiểm soát | Cao | Bắt buộc 3 điều kiện ở §6 mục #10 (ngưỡng mẫu, hiện khoảng, tính hàng đợi) trước khi hiển thị bất kỳ số nào |
| Sửa nhầm vào repo gốc của nhóm thay vì fork | Thấp (đã tách remote) | Cao nếu xảy ra | `origin` = repo nhóm (chỉ đọc/fetch), `personal` = fork riêng; không `git push origin` |

---

## 5. Kế hoạch chuyển đổi ASP.NET → Java Spring Boot

### 5.1 Định phạm vi — 7/17 module

Port theo thứ tự phụ thuộc, dừng lại nếu hết thời gian — mỗi module port xong là một hệ thống
chạy được, không phải "dở dang không demo được":

| Ưu tiên | Module | Vì sao |
|---|---|---|
| Bắt buộc | Auth + Users | Mọi thứ khác cần JWT; nhận thêm trường `MemberId` tuỳ chọn khi mở phiên bàn (§9.5) |
| Bắt buộc | Menu + Categories | CRUD đơn giản, khởi động nhanh, có dữ liệu để demo |
| Bắt buộc | Tables | Nền cho QR session |
| Bắt buộc | Orders | Lõi nghiệp vụ, nhiều invariant nhất; nơi làm hạn chế #10, #11 |
| Bắt buộc | Payments | Hoàn tất luồng dine-in; nơi làm hạn chế #3 (webhook Casso) |
| Nên có | Realtime | Giá trị demo cao (bếp cập nhật trực tiếp) |
| Nếu còn thời gian | Chat (chỉ proxy) | Gọi sang AI service Python có sẵn, không viết lại RAG |
| **Để lại bản .NET** | Loyalty, Promotions, Counter, Reports | Không ảnh hưởng luồng dine-in lõi; app mobile (§9) là lý do nghiệp vụ thật để giữ Loyalty/Promotions sống trên .NET |

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
| Thanh toán VietQR | Ảnh QR tĩnh (`img.vietqr.io`), xác nhận tay | Giữ vẽ QR tương tự + thêm `POST /api/payments/webhooks/casso` xác minh chữ ký, đối soát tự động |
| Cấu hình | `appsettings.json` + biến môi trường | `application.yml` + Spring profiles (`dev`/`staging`/`production`) |
| Test tích hợp | `WebApplicationFactory` + EF InMemory | `@SpringBootTest` + Testcontainers PostgreSQL (khuyến nghị hơn H2, vì hệ thống phụ thuộc hành vi PostgreSQL thật — `xmin`, unique index có điều kiện) |
| Đóng gói | Dockerfile .NET SDK | Dockerfile multi-stage Maven/Gradle + JRE 21 (image nhẹ như đã lưu ý ở hạn chế #6 cho AI image) |

### 5.3 Kiến trúc đề xuất cho bản Java

Bản .NET đã là modular monolith có port sẵn (`IUserStore`, `IChatStore`), nhưng ranh giới
domain/adapter không tách vật lý. Bản Java tận dụng đúng lúc chuyển ngôn ngữ để làm rõ hơn:

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
- Không cố port `xmin`/execution-strategy y hệt byte-for-byte — mục tiêu là **giữ đúng bất biến**,
  không phải giữ đúng cơ chế.

---

## 6. Nghiệp vụ ưu tiên hoàn thiện trong bản Java

Ba hạn chế nhận vào phạm vi — tiêu chí chọn: nằm trong luồng dine-in lõi đã port (§5.1), có thể
chứng minh bằng test, và (với #10) có kiểm soát rủi ro rõ ràng thay vì lặp lại đúng thứ team gốc
đã né.

### #11 — Khách tự huỷ món

Rule nghiệp vụ đã có sẵn trong domain cũ (chỉ huỷ được món `Pending`, khoá huỷ cả lượt khi một món
vào bếp). Việc còn thiếu là mở endpoint cho vai trò Customer, xác thực bằng capability token của
lượt gọi thay vì role nhân viên. Port module này thẳng vào bản Java kèm luôn tính năng mới.

### #10 — Mốc thời gian theo món, có hiển thị được kiểm soát

Đo mốc thời gian theo từng `OrderItem` (không theo lượt gọi như hiện tại). Team gốc từng cố tình
**không** hiển thị ước lượng, lý do ghi thẳng trong báo cáo: *"một ước lượng sai làm hỏng lòng tin
nhiều hơn là không có ước lượng nào"*. Quyết định lần này là **có hiển thị**, nhưng bắt buộc ba
điều kiện để không lặp lại đúng rủi ro đó:

1. Chỉ hiện khi món đã có **đủ mẫu lịch sử** (≥20 lần nấu) — món mới/hiếm gọi hiện "Đang chuẩn bị",
   không đoán liều.
2. Hiện **khoảng** ("10–15 phút"), không hiện số chính xác giả tạo độ tin cậy không có thật.
3. Tính cả **độ sâu hàng đợi bếp hiện tại**, không chỉ thời gian nấu trung bình riêng món đó.

Nút "Huỷ món" (#11) đặt cạnh ước lượng trong cùng màn hình theo dõi đơn — khách thấy ước lượng dài
có thể huỷ ngay nếu món chưa vào bếp. Hai tính năng dùng chung một màn hình, một mạch UX.

### #3 — VietQR tự động đối soát

Đọc mã xác nhận: `VietQrProvider.cs` hiện chỉ vẽ ảnh QR tĩnh qua `img.vietqr.io` (bank + số tài
khoản + số tiền + nội dung), không có bước xác minh giao dịch nào — quầy phải tự nhìn sao kê rồi
bấm xác nhận tay.

Thiết kế tích hợp qua **Casso** (dịch vụ đối soát ngân hàng, liên kết tài khoản cá nhân):

- `POST /api/payments/webhooks/casso` — **xác minh chữ ký/token trong header trước mọi xử lý khác**
  (bỏ qua bước này là lỗ hổng nghiêm trọng: ai đó có thể gửi payload giả để đánh dấu đơn đã thanh
  toán mà không cần trả tiền).
- Đối chiếu `description` theo đúng định dạng có sẵn `"CMC {orderCode}"`, so khớp `amount`.
- Idempotent: dùng trường `ProviderTransactionId` đã có sẵn trong `PaymentTransaction` (hiện bỏ
  trống), gắn unique theo `reference` của Casso — Casso thử lại tới 17 lần/24h nếu không nhận
  `200 OK`, endpoint phải chịu được gọi trùng.
- Tranh chấp với nút xác nhận tay của quầy (**giữ lại vĩnh viễn làm phương án dự phòng**, không
  xoá): dùng optimistic concurrency (`@Version`, cùng pattern với Order Round) để chỉ một bên thắng.
- Secret lưu qua biến môi trường theo đúng convention `.env.example` sẵn có, không commit.

### Không nhận vào phạm vi Java

- #1 (load test), #4 (coverage/a11y) — việc đo lường áp dụng cho hệ thống đang chạy thật, ưu tiên
  đo trên bản .NET production, không đo trên bản Java demo.
- #7 (audit nhãn dị nguyên) — việc dữ liệu/AI, không thuộc backend.

---

## 7. Cải tiến UX ba luồng vận hành (`ops-web`)

> Xác nhận trước khi đọc phần này: **UI (màu sắc, bố cục) đã được đánh giá là ổn, không cần thiết
> kế lại.** Đây là cải tiến UX/thao tác thuần — dựa trên báo cáo đọc mã thật ba luồng Counter,
> Kitchen, Admin trong `frontend/apps/admin-web` (tên package `@cmc/ops-web`).

### 7.1 Đính chính một giả định sai ảnh hưởng tới §9

Số điện thoại loyalty **không phải do quầy gõ tay** như tài liệu vận hành cũ mô tả — mà do chính
**khách hàng tự gõ** lúc thanh toán trên `ordering-web`
(`frontend/src/ordering/TableInvoicePaymentModal.tsx:141-149`, input tự do, không kiểm định dạng,
không tra cứu trùng). Quầy chỉ **nhìn thấy** số đó dạng chỉ đọc
(`frontend/src/pages/StaffPaymentsPage.tsx:141`), không có cách sửa nếu khách gõ sai hoặc bỏ trống.

Hệ quả cho §9: giá trị thật của app mobile ở bước này không phải "quầy quét thẻ thành viên", mà là
**tự động điền số điện thoại đúng ở bước khách đang tự gõ** khi khách đã đăng nhập — bỏ hẳn thao
tác thủ công dễ sai, không cần quầy làm gì thêm.

### 7.2 Counter

| Vấn đề | File | Sửa |
|---|---|---|
| Xác nhận thanh toán chờ refetch cả danh sách, không optimistic | `StaffPaymentsPage.tsx:143-154` | Xoá khỏi danh sách "chờ thu" ngay khi bấm, rollback nếu API lỗi |
| **Đóng ca — thao tác không thể hoàn tác, ghi lệch quỹ tiền mặt — không có hộp xác nhận nào** | `CounterShiftPanel.tsx:73-87` (`handleCloseShift`) | Thêm hộp xác nhận có hiện số tiền lệch trước khi chốt — đây là khoảng trống an toàn, không chỉ UX |
| Không có xác nhận hàng loạt lúc đông khách | `StaffPaymentsPage.tsx` | Thêm nút "Xác nhận tất cả COD" cho các hoá đơn COD đang chờ |
| Không phím tắt | toàn bộ `pages/counter/*` | Thêm phím tắt cho thao tác xác nhận lặp lại nhiều nhất |

**Giữ nguyên, không sửa:** `useOpsRealtime` (WebSocket + polling fallback 5s) đã cập nhật hàng chờ
hoá đơn tốt, không cần bấm "Làm mới".

### 7.3 Kitchen

**Giữ nguyên, không sửa — đây là luồng UX tốt nhất hệ thống:** kéo-thả giữa cột
(`KitchenBoard.tsx:449-505`), vuốt cảm ứng (`handleTouchEnd:125-131`), điều hướng bàn phím đầy đủ
(Enter mở chi tiết, Space chuyển trạng thái, `onKeyDown:145-151`).

| Vấn đề | File | Sửa |
|---|---|---|
| Mỗi thao tác vẫn chờ round-trip mới cập nhật giao diện, dù là chuyển trạng thái đã biết trước | `KitchenBoard.tsx:414-447, 507-522` | Optimistic update — patch trạng thái tại chỗ, rollback nếu API lỗi (đúng pattern menu-availability toggle đã có ở Admin) |
| "Chuyển tất cả sang trạng thái kế" chạy tuần tự từng món (`for` + `await`), N món = N round-trip nối tiếp | `KitchenBoard.tsx:429-434` (`handleMoveNext`) | Đổi sang `Promise.all` |
| Panel "86 hết món" mặc định thu gọn, không tìm kiếm, phải cuộn tay lúc gấp | `KitchenRealtimePage.tsx:192-212` | Mở sẵn trong giờ cao điểm hoặc thêm ô tìm kiếm nhanh |

### 7.4 Admin

**Giữ nguyên, không sửa — mẫu tốt nên nhân rộng:** quản lý menu đã có filter/search, modal sửa,
optimistic toggle khả dụng (`AdminMenuManager.tsx:171-178, 196-237`); sửa tên bàn tại chỗ
(inline-edit, `AdminTableCrudPanel.tsx:179-188, 197-210`).

| Vấn đề | File | Sửa |
|---|---|---|
| Sửa bàn/người dùng refetch toàn bộ sau mỗi thao tác thay vì cập nhật tại chỗ | `AdminTableCrudPanel.tsx:75-117`, `AdminUserManager.tsx:170-208` | Áp dụng đúng pattern optimistic đã có ở `AdminMenuManager` |
| Hộp xác nhận xoá dùng `confirm()` thô của trình duyệt, rải rác không nhất quán | `AdminCategoryManager.tsx:66`, `AdminMenuManager.tsx:161`, `AdminUserManager.tsx:196`, `AdminTableSessionMonitor.tsx:87`, `AdminTableCrudPanel.tsx:105` | Một component `ConfirmDialog` dùng chung, có "gõ để xác nhận" cho thao tác xoá không thể hoàn tác |
| Không có thao tác hàng loạt (menu, bàn, người dùng đều sửa từng dòng) | toàn bộ Admin | Thêm chọn nhiều dòng + hành động hàng loạt cho thao tác lặp lại nhiều nhất (vd bật/tắt nhiều món cùng lúc) |

### 7.5 Dọn dẹp phát hiện phụ

Có code debug/agent-harness sót lại — `fetch("http://127.0.0.1:7639/ingest/...")` kèm
`hypothesisId`/`sessionId` trong xử lý lỗi, xuất hiện ở `KitchenRealtimePage.tsx:109-126`,
`OpsToastProvider.tsx`, `OpsErrorBoundary.tsx`. Không phải vấn đề UX nhưng nên xoá — không nên còn
trong mã nộp báo cáo.

---

## 8. Kế hoạch triển khai phần mềm (môn Triển khai phần mềm)

### 8.1 Ranh giới an toàn

Pipeline hiện có (`.github/workflows/*`, VPS production) **thuộc về repo nhóm gốc**, đang phục vụ
điểm môn INFO2005 của 4 người khác — không sửa `deploy-staging.yml`/`deploy-production.yml` gốc,
không SSH hay deploy thật lên VPS đó. Toàn bộ việc dưới đây chỉ chạy trong fork cá nhân và **chỉ
local Docker Compose**.

### 8.2 Vì sao không chỉ viết báo cáo phân tích

Pipeline gốc đã rất đầy đủ (9 workflow, staging/production tách biệt, auto-rollback, CodeQL +
Trivy + gitleaks + dependency-review, 14 cổng generator-check). Việc có giá trị hơn cho môn học:
**tự tay dựng một đường triển khai song song cho bản Java**, so sánh có số liệu với bản .NET đang
chạy thật.

### 8.3 Việc cụ thể

| # | Việc | Đối chiếu với hạ tầng .NET hiện có |
|---|---|---|
| D1 | Dockerfile multi-stage cho Spring Boot (build: Maven/Gradle, runtime: JRE slim) | So kích thước image với `backend/Dockerfile` |
| D2 | `deploy/docker-compose.java.yml` — biến thể thay service `api` bằng image Java, giữ nguyên `postgres`, `ai-service`, `frontend` | Tái dùng đúng healthcheck pattern `/api/health`, `depends_on: service_healthy` |
| D3 | Service `migrate` one-shot chạy Flyway thay EF Core | Giữ nguyên nguyên tắc V10: migration tách khỏi API boot |
| D4 | Workflow `ci-java.yml` mirror job `backend-test` của `ci.yml` | File mới, chạy độc lập trên fork, không đụng `ci.yml` gốc |
| D5 | Báo cáo so sánh có số liệu: build time, image size, cold start, RAM idle | Đo trên cùng máy, cùng điều kiện với bản .NET |
| D6 | *(nếu còn thời gian)* diễn tập rollback thủ công trên local | Không bắt buộc — chỉ VPS thật mới cần rollback tự động như `rollback.yml` gốc |

### 8.4 Ngoài phạm vi

Không CI/CD thật lên staging/production, không secrets thật, không sửa branch ruleset của repo
nhóm gốc.

---

## 9. Kế hoạch ứng dụng di động (môn Lập trình ứng dụng di động)

### 9.1 Vì sao đây là bài toán khác, không phải "làm lại web trên mobile"

QR ordering trên web **cố tình ẩn danh và theo từng lượt**: mở phiên khi quét bàn, hết giá trị khi
rời quán. Đúng cho khách vãng lai. Nhưng mô hình đó cấu trúc không cho phép bất cứ thứ gì cần
**nhớ khách qua nhiều lần ghé**. App nhắm đúng vào khoảng đó.

Quyết định phạm vi (đã chốt): app **không phải companion nhỏ** — có đầy đủ tính năng ngang
`ordering-web` (menu, giỏ, đơn, theo dõi, thanh toán, chat), cộng một lớp tính năng độc quyền chỉ
app mới có.

Phát hiện nền tảng: backend **đã có sẵn hạ tầng tài khoản khách hàng** — `POST /api/auth/register`
(role mặc định `Customer`), `POST /api/auth/login`, policy `CustomerOnly` — nhưng **không có luồng
nào trong sản phẩm hiện dùng nó**. App này là người dùng thật đầu tiên của hạ tầng đang nằm không.

### 9.2 Stack: Flutter (Dart)

### 9.3 Kiến trúc 2 lớp

| Lớp | Nội dung |
|---|---|
| **Lớp nền** (ngang web) | Đăng nhập, mở/tiếp tục phiên bàn theo đúng resume-state (V51-52), menu, giỏ hàng, tạo đơn, theo dõi đơn realtime + polling fallback (V53), ước lượng thời gian + huỷ món (§6 #10/#11), thanh toán COD/VietQR (tự động xác nhận khi webhook Casso đã có), chat AI trong phiên |
| **Lớp độc quyền** | Định danh bền vững qua nhiều lần ghé: tự động điền SĐT lúc thanh toán, điểm + ưu đãi, khuyến mãi riêng thành viên, lịch sử đơn nhiều lần ghé, đặt lại món cũ, hồ sơ AI bền vững (§9.8) |

### 9.4 Cơ chế gắn định danh khách vào phiên bàn

Vì lớp nền bắt buộc app phải tự gọi `POST /api/table-sessions` (để lấy resume state, menu, giỏ —
không có cách nào tránh gọi endpoint này nếu muốn full parity), việc gắn định danh khách vào đúng
lúc mở phiên trở thành **một trường nullable cộng thêm, không phải một đường xử lý mới**:

- Nếu request có `Authorization` hợp lệ với role `Customer` → set `TableSession.MemberId`.
- Nếu không có (khách vãng lai qua web như hiện tại) → giữ nguyên hành vi ẩn danh, không đổi gì.
- **Không sửa logic mở phiên hiện có** (nơi có lịch sử race-condition thật — bug B73, invariant
  V51/V52) — chỉ thêm một field và một nhánh gán giá trị, tách biệt hoàn toàn khỏi phần logic đang
  nhạy cảm.

Việc này mở khoá: lịch sử đơn theo tài khoản, "món hay gọi", và là điều kiện tiên quyết cho hồ sơ
AI bền vững ở §9.8.

### 9.5 Đối chiếu mã thật — cái gì dùng ngay, cái gì phải xây thêm

| Dùng ngay | Cần thêm nhỏ | Cần thêm — nối vào §5/§6 (đang port Java) |
|---|---|---|
| Đăng ký/đăng nhập khách (`/api/auth/register`, `/login`) | `GET /api/promotions/active` — hiện chỉ có `/api/promotions/validate` và CRUD admin | Toàn bộ luồng đơn/giỏ/thanh toán/thời gian ước lượng/huỷ món — theo tiến độ port module tương ứng |
| Tra điểm + ưu đãi đủ điều kiện (`GET /api/loyalty/lookup?phone=`) | `TableSession.MemberId` (§9.4) | Webhook Casso (§6 #3) — app chỉ cần hiển thị trạng thái thanh toán tự cập nhật, không tự xử lý webhook |
| Xem menu không cần đang ở bàn (`GET /api/menu`) | | |

### 9.6 Tính năng theo 3 pha

| Pha | Nội dung | Phụ thuộc |
|---|---|---|
| **M1** | Đăng nhập, mở phiên có gắn `MemberId`, xem menu, xem đơn + trạng thái realtime (chỉ đọc), điểm/ưu đãi, khuyến mãi độc quyền | Không phụ thuộc tiến độ Java — gọi được ngay vào bản .NET hiện có |
| **M2** | Giỏ hàng, tạo đơn, thanh toán COD/VietQR (tự động nếu Casso đã xong), chat AI trong phiên, ước lượng thời gian + huỷ món | Phụ thuộc Orders/Payments/Realtime port xong (§5 tuần 5–11) |
| **M3** | Lịch sử đơn nhiều lần ghé, đặt lại món cũ, đổi điểm lấy ưu đãi, hồ sơ AI bền vững | Phụ thuộc M1 (đã có `MemberId`) + M2 (đã có Order gắn định danh) |

M1 tách biệt tiến độ Java hoàn toàn — có thể làm và demo được ngay cả khi §5 chưa xong module nào,
vì M1 chỉ cần Auth + Loyalty + Promotions + Menu, toàn bộ đã có sẵn trên bản .NET.

### 9.7 Vì sao "tự động điền SĐT" là tính năng lõi, không phải điểm/ưu đãi

Đã đính chính ở §7.1: đây là tính năng duy nhất giải quyết đúng vấn đề thật thấy trong mã — khách
tự gõ SĐT dễ sai, không kiểm định dạng, không tra trùng. App loại bỏ hẳn bước gõ tay đó khi khách
đã đăng nhập.

### 9.8 Hồ sơ khách hàng bền vững cho AI

Đọc mã thấy hệ thống **đã có đúng khái niệm này nhưng bị xoá theo từng lượt khách**:
`ChatSessionFact` (`Kind`: allergen/diet/spice/budget/party_size/language, `Value`, `Confidence`)
trích xuất đúng thứ cần nhớ — nhưng comment trong `ChatSession.cs` ghi thẳng: *"Khi phiên bàn đóng/
hết hạn, mọi chat session gắn với nó sẽ bị xóa để phục vụ khách mới"*.

**Thiết kế:**

- Bảng mới `CustomerProfileFact` — cùng hình dạng `ChatSessionFact` nhưng khoá theo `MemberId`
  thay vì `ChatSessionId`, **không** bị xoá khi bàn đóng.
- **Promote:** khi `ChatSession` của khách đã đăng nhập đóng lại, fact `Kind=allergen/diet/spice`
  được chép sang hồ sơ bền vững.
- **Seed:** mở `ChatSession` mới cho khách đã có hồ sơ → nạp sẵn fact cũ ngay từ tin đầu tiên —
  khách không phải khai lại dị ứng mỗi lần.
- **"Món hay gọi":** không cần cơ chế mới — truy vấn top món từ lịch sử `Order` theo `MemberId`
  (có từ M2/M3).

**Ranh giới an toàn cần nói rõ:** đây là lớp cá nhân hoá tiện lợi, **không thay thế** cơ chế chặn
cứng theo nhãn dị nguyên của món (hạn chế #7 — mới phủ 44/91 món — vẫn còn nguyên, không liên quan
gì đến việc này). Có hồ sơ không có nghĩa là an toàn hơn về nhãn món.

**Phân công:** bảng/logic promote-seed là backend + AI-service (Python), không tính vào môn Lập
trình di động — việc của Flutter chỉ là hiển thị ("Món tôi hay gọi", chat cảm giác "nhớ" khách).

### 9.9 Gọi vào backend nào

Theo module, không phải theo toàn bộ backend:

- Auth, Menu, Tables, Orders, Payments, Realtime → gọi bản đang chạy tại thời điểm đó (**.NET
  trước khi §5 port xong module tương ứng, chuyển sang Java sau** — API contract không đổi nên
  Flutter không cần sửa gì khi chuyển).
- Loyalty, Promotions, hồ sơ AI bền vững → **luôn gọi bản .NET**, vì các module này cố tình để lại
  .NET (§5.1), không nằm trong lộ trình port Java.

### 9.10 WBS theo pha

**M1**
1. Đăng nhập, lưu JWT an toàn trên thiết bị.
2. Mở phiên bàn có gắn `MemberId` (cần thêm field ở backend đang dùng — §9.4).
3. Trang điểm thưởng + ưu đãi đủ điều kiện, danh sách khuyến mãi (`GET /api/promotions/active` mới).
4. Trình duyệt menu (không cần table context) + xem đơn/trạng thái chỉ đọc.

**M2**
5. Giỏ hàng + tạo đơn, theo đúng resume-state đã có ở web.
6. Thanh toán COD/VietQR, phản ánh trạng thái tự động khi webhook Casso đã xong.
7. Ước lượng thời gian món + nút huỷ món trong màn theo dõi đơn.
8. Chat AI trong phiên.

**M3**
9. Lịch sử đơn nhiều lần ghé + đặt lại món cũ.
10. Đổi điểm lấy ưu đãi.
11. Hồ sơ AI bền vững — hiển thị phía app (logic backend/AI ở §9.8 do phần Lập trình nâng cao làm).

Kiểm thử trên thiết bị thật, chụp bằng chứng cho báo cáo môn học ở mỗi pha hoàn thành, không dồn
hết vào cuối kỳ.

---

## 10. Đã thực hiện

- [x] Tạo repo riêng `Anpham120/restaurant-qr-ai-ordering-nqh` (private), remote `personal` trỏ
      vào đó; remote `origin` giữ nguyên trỏ về repo nhóm, chỉ dùng để đồng bộ đọc.
- [x] Đối chiếu hiện trạng thật (module/endpoint/invariant/hạn chế) trước khi lập kế hoạch.
- [x] Đọc mã thật cho từng quyết định lớn: `LoyaltyService`/`VietQrProvider` (thanh toán),
      `ChatSessionFact`/`ChatSession` (hồ sơ AI), ba luồng `ops-web` qua agent khảo sát riêng (UX).
- [x] Tra tài liệu kỹ thuật thật của Casso Webhook V2 trước khi thiết kế tích hợp thanh toán.

## 11. Bước tiếp theo

- [x] Commit và đẩy tài liệu này lên `personal`.
- [x] Tạo 9 milestone (M1–M9) + nhãn `module:*`/`type:*`/`priority:*` + 35 issue trên
      `Anpham120/restaurant-qr-ai-ordering-nqh`, đúng theo WBS §4.2, §6, §7, §9.10.
- [x] Bật branch ruleset cho `main` (chặn force-push và xoá nhánh).
- [ ] Đăng ký tài khoản Casso, liên kết ngân hàng cá nhân, lấy Secure Token (điều kiện tiên quyết
      cho issue #12 — hạn chế #3).
- [ ] Khởi tạo project Spring Boot (issue #2) khi sẵn sàng bắt đầu code.
