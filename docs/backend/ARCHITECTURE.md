# Kiến trúc backend

> **⚠️ Kiểm lần cuối: 2026-07-16. Mã sửa gần nhất: 2026-08-02.**
>
> Tài liệu này KHÔNG trỏ vào tệp hay endpoint nào đã biến mất — đã kiểm bằng máy. Nhưng phép
> kiểm đó chỉ bắt được *đường dẫn chết*, **không** bắt được *hành vi đã đổi*: một endpoint còn
> nguyên tên mà đổi dạng phản hồi thì vẫn 'sạch'. Đối chiếu với mã trước khi tin phần chi tiết.

> **Một tài liệu cho toàn bộ mảng này.** Gộp từ 3 tệp: `BACKEND_MODULAR_MONOLITH_ARCHITECTURE.md`, `QR_SESSION_STATE_MACHINE.md`, `BA_SA_SYSTEM_DESIGN.md`.
>
> Ba tệp cùng mô tả cấu trúc backend ở ba mức: khối kiến trúc, máy trạng thái phiên QR, và phân tích/thiết kế hệ thống. Người đọc cần cả ba cùng lúc mới hiểu được một luồng.



<!-- SINH:backend-modules -->

## Module và bề mặt API — SINH TỪ MÃ

**13 module**, **85 endpoint**, **7 migration** cơ sở dữ liệu.

> Bảng này chỉ nói **cái gì tồn tại**. Ý nghĩa nghiệp vụ của từng module là phần người
> viết ở các mục dưới.

| Module | Endpoint | Số tệp |
|---|---:|---:|
| `auth` | 9 | 19 |
| `cart` | 3 | 9 |
| `chat` | 8 | 19 |
| `counter` | 4 | 12 |
| `loyalty` | 10 | 13 |
| `menu` | 14 | 13 |
| `orders` | 6 | 13 |
| `payments` | 6 | 19 |
| `promotions` | 6 | 12 |
| `realtime` | 0 | 6 |
| `reports` | 1 | 6 |
| `shared` | 1 | 8 |
| `tables` | 17 | 26 |

<!-- HET:backend-modules -->
---

## Modular monolith — ranh giới module

*(gộp từ `docs/BACKEND_MODULAR_MONOLITH_ARCHITECTURE.md`)*

Tài liệu này mô tả kiến trúc đang chạy của API CMC Restaurant. Nó thay thế các mô tả cũ về các in-memory store độc lập.

### 1. Hình dạng hệ thống

```mermaid
flowchart LR
  Portals[Customer / Admin / Staff / Kitchen] --> API[ASP.NET Core API]
  API --> Auth[Auth + Users]
  API --> Menu[Menu + Categories]
  API --> Tables[Tables + QR sessions]
  API --> Orders[Orders + Payments]
  API --> Chat[Chat + AI adapter]
  API --> Realtime[SignalR realtime]
  Auth --> DB[(PostgreSQL via EF Core)]
  Menu --> DB
  Tables --> DB
  Orders --> DB
  Chat --> DB
  Chat --> AI[External AI / Python RAG]
  Realtime --> Portals
```

`RestaurantQrAiOrdering.Api` là một modular monolith: các module được tổ chức theo khả năng nghiệp vụ, cùng triển khai trong một API và cùng transaction boundary khi cần.

### 2. Persistence và runtime

- Production/staging dùng `RestaurantDbContext` với PostgreSQL/Npgsql.
- Development hoặc integration test có thể dùng EF InMemory; đây là provider thay thế, không phải các in-memory store nghiệp vụ.
- Deploy chạy migration qua container one-shot `migrate`; API thường chạy với `RUN_DB_MIGRATIONS_ON_STARTUP=false`.
- `DbUserStore` là implementation đăng ký cho `IUserStore`; `DbChatStore` là implementation đăng ký cho `IChatStore`.
- Menu, categories, tables, orders và payments đọc/ghi trực tiếp qua `RestaurantDbContext` tại module sở hữu.

Không còn `RestaurantDataStore`, `ChatStore` hoặc `UserStore` in-memory trong runtime.

### 3. Ranh giới module

| Module | Sở hữu | Điểm vào chính | Persistence |
|---|---|---|---|
| Auth + Users | đăng nhập, token, tài khoản, vai trò | `AuthEndpoints`, `UserEndpoints` | `DbUserStore`, EF Core |
| Menu + Categories | danh mục, món, khả dụng, giá | `MenuEndpoints`, category endpoints | EF Core |
| Tables | QR bàn, phiên bàn | `TableEndpoints` | EF Core |
| Orders + Payments | đơn, item, timeline, thanh toán | `OrderEndpoints`, `PaymentEndpoints` | `OrderStore`, EF Core |
| Chat | chat session/message, capability, gọi AI | `ChatEndpoints` | `DbChatStore`, EF Core |
| Realtime | phát sự kiện đơn hàng | `OrderRealtimeNotifier`, hub | SignalR |

Contract nằm cạnh implementation sở hữu: ví dụ `IUserStore.cs` và `IChatStore.cs` mô tả seam, còn adapter database tương ứng nằm trong cùng module.

### 4. Invariants vận hành

- Một phiên bàn usable phải `Open`, chưa `ClosedAt` và chưa quá `ExpiresAt`.
- Khi phiên bàn đóng/hết hạn, mọi chat capability gắn với phiên đó bị thu hồi.
- Mỗi bàn chỉ có tối đa một phiên `Open` nhờ filtered unique index `UX_table_sessions_active_restaurant_table`.
- `Completed` và `Cancelled` là trạng thái terminal của đơn; item trong đơn terminal không thể đổi trạng thái.
- Payment `Refunded` là terminal cho thao tác confirm/fail thủ công.
- Chat tư vấn menu đọc availability và giá hiện tại từ database, không dùng snapshot lúc khởi động.

### 5. Transaction và cạnh tranh

Mở phiên QR trước tiên chuyển mọi phiên quá hạn của bàn sang `Expired`, rồi tìm phiên live. Nếu hai request cùng tạo phiên, PostgreSQL unique index chặn phiên trùng; API đọc lại phiên vừa được request còn lại tạo.

Migration `EnforceSingleActiveTableSession` cũng chuyển các phiên đã quá hạn trước khi tạo index. Các phiên live bị trùng cần được kiểm tra bằng preflight trong [Production Operations](../devops/PIPELINE_AND_DEPLOY.md).

### 6. Kiểm chứng

Regression suite ở `backend/tests/RestaurantQrAiOrdering.Api.Tests` chạy qua HTTP với factory InMemory, bao phủ payment terminal state, lifecycle phiên bàn/chat, menu live, đơn terminal và EF embedding tracking.

```bash
dotnet test backend/RestaurantQrAiOrdering.sln --configuration Release
dotnet build backend/RestaurantQrAiOrdering.sln --configuration Release
```

CI chạy các regression test này ở job `backend-test`; frontend và AI vẫn có build/compile checks riêng.

### 7. Quy tắc thay đổi

1. Không xoá source trước khi chứng minh không có caller và chạy build/test.
2. State transition mới phải có test qua public seam hoặc model invariant.
3. Mỗi thay đổi schema phải có migration, preflight dữ liệu nếu có thể đụng production data, và đường rollback rõ ràng.
4. Public route/contract chỉ được bỏ sau deprecation có chủ đích; không coi “không có caller trong repo” là đủ.

---

## Máy trạng thái phiên QR

*(gộp từ `docs/QR_SESSION_STATE_MACHINE.md`)*

### Stable table QR

- Table QR token is stable for the life of an open visit.
- Repeated scans on multiple devices attach to the **same open session** (`TABLE_QR_SINGLE_USE` disabled).
- Each scan returns a fresh capability token and deterministic `resumeState`.

### Resume states

| State | Customer destination |
|-------|---------------------|
| `New` | `/table-session/:id/menu` |
| `CartPending` | `/table-session/:id/cart` |
| `OrderInProgress` | `/table-session/:id/orders` |
| `ReadyForPayment` | `/table-session/:id/orders?focus=invoice` |
| `PaymentPending` | `/table-session/:id/orders?focus=invoice` |
| `Paid` | `/table-session/:id/orders?focus=invoice` |

Resolver: `TableSessionResumeStateResolver` (backend) and `getSessionResumeDestination` (frontend).

### Order round atomicity

Creating an order round clears the shared server cart in the **same serializable transaction** as order persistence. Idempotency keys prevent duplicate rounds across devices.

### Kitchen path

Orders must pass `Ready → Served` before session settlement. `Ready → Completed` skip is rejected at the domain layer.

### Settlement

Dine-in settlement uses **table invoice** only. Per-order payment endpoints remain for compatibility but are not the dine-in source of truth.

---

## Phân tích và thiết kế hệ thống (BA/SA)

*(gộp từ `docs/BA_SA_SYSTEM_DESIGN.md`)*

Tài liệu này chuẩn hóa phân tích nghiệp vụ và kiến trúc giải pháp cho giai đoạn backend-first. Mục tiêu là để thành viên mới đọc xong có thể hiểu đúng actor, luồng nghiệp vụ, ranh giới module, dữ liệu lõi và hợp đồng API trước khi thiết kế UI hoặc viết code.

> **Nguồn chuẩn hợp nhất: [`docs/SYSTEM_ANALYSIS_DESIGN.md`](../archive/SYSTEM_ANALYSIS_DESIGN.md).** Tài liệu BA/SA này giữ các sơ đồ phân tích; đã đồng bộ state machine + ERD với branch `develop` (bỏ Delivery, order tạo ở `Placed`, thêm `Refunded`, per-order access token, `order_status_history`, ràng buộc order ↔ table session).

### 1. Bối Cảnh Và Phạm Vi

CMC Restaurant là hệ thống gọi món bằng QR có hỗ trợ AI gợi ý món. Hệ thống ưu tiên backend thật trước, sau đó UI bám theo API thật. Các logic mock/localStorage chỉ được dùng cho demo cũ, không được dùng làm nguồn sự thật nghiệp vụ.

Phạm vi hiện tại:

- Khách quét QR tại bàn, xem menu, tạo đơn dine-in (gọi món tại bàn).
- Nhân viên quầy theo dõi đơn, xác nhận thanh toán, hỗ trợ khách.
- Bếp nhận đơn, cập nhật trạng thái từng món theo thời gian thực.
- Quản lý/Admin quản lý menu, danh mục, bàn/QR và theo dõi vận hành.
- AI service gợi ý món dựa trên menu/FAQ/RAG, chỉ đề xuất và không tự sửa giỏ hàng.
- Thanh toán MVP hỗ trợ COD và VietQR.
- PostgreSQL là nguồn dữ liệu chính cho backend.

Ngoài phạm vi hiện tại:

- Không tích hợp cổng thanh toán ngân hàng real-time callback.
- Không tự động fine-tune model LLM trong app.
- Không xem AI provider như actor nghiệp vụ của người dùng. AI provider là hạ tầng phía sau AI service.

### 2. Actor Và Trách Nhiệm

| Actor | Vai trò | Quyền chính |
| --- | --- | --- |
| Customer | Khách dùng web qua QR tại bàn | Xem menu, tạo đơn, theo dõi đơn, tạo VietQR, chat gợi ý món |
| Staff/Counter | Nhân viên quầy | Xem đơn, xác nhận thanh toán, hỗ trợ trạng thái đơn |
| Kitchen | Bếp | Nhận đơn mới, cập nhật trạng thái từng món |
| Admin/Manager | Quản lý | Quản lý menu, danh mục, bàn/QR, xem trạng thái vận hành |
| AI Service | Hệ thống phụ trợ | Nhận câu hỏi, truy xuất knowledge base, gọi Google Gemini API, trả gợi ý an toàn |
| Payment/Bank/VietQR | Hệ thống thanh toán phụ trợ | Sinh nội dung chuyển khoản/VietQR để khách thanh toán |

Ghi chú bảo vệ phạm vi: `AI Service` và `Payment/Bank/VietQR` là supporting systems, không phải người dùng chính. Các use case quản trị/bếp/nhân viên phải `include` đăng nhập trước khi thao tác.

### 3. Use Case Tổng Quan

```mermaid
flowchart LR
    Customer["Customer"]
    Staff["Staff/Counter"]
    Kitchen["Kitchen"]
    Admin["Admin/Manager"]
    AI["AI Service"]
    Bank["Payment/Bank/VietQR"]

    UC1["Quét QR / mở phiên bàn"]
    UC2["Xem menu"]
    UC3["Tạo đơn hàng"]
    UC4["Theo dõi trạng thái đơn"]
    UC5["Chat gợi ý món"]
    UC6["Sinh VietQR / chọn COD"]
    UC7["Đăng nhập"]
    UC8["Quản lý đơn"]
    UC9["Cập nhật món trong bếp"]
    UC10["Quản lý menu"]
    UC11["Quản lý bàn/QR"]
    UC12["Xác nhận thanh toán"]

    Customer --> UC1 --> UC2 --> UC3 --> UC4
    Customer --> UC5
    Customer --> UC6
    UC5 --> AI
    UC6 --> Bank

    Staff --> UC7
    Kitchen --> UC7
    Admin --> UC7
    UC8 -. include .-> UC7
    UC9 -. include .-> UC7
    UC10 -. include .-> UC7
    UC11 -. include .-> UC7
    UC12 -. include .-> UC7

    Staff --> UC8
    Staff --> UC12
    Kitchen --> UC9
    Admin --> UC10
    Admin --> UC11
```

### 4. Luồng Nghiệp Vụ Chính

#### 4.1 QR / Table Session

1. Customer quét QR hoặc mở link có `tableCode`.
2. Frontend gọi `GET /api/tables/{tableCode}` để lấy thông tin bàn và session.
3. Nếu bàn hợp lệ, customer xem menu theo ngữ cảnh bàn.
4. Khi tạo đơn, backend gắn đơn với `tableCode` và phiên bàn (`tableSessionId`).

#### 4.2 Menu

1. Customer gọi `GET /api/menu`.
2. Admin đăng nhập rồi quản lý danh mục/món qua các endpoint `/api/admin/categories` và `/api/admin/menu-items`.
3. UI không tự bịa danh mục/món ngoài API thật.
4. Trạng thái món hết hàng được backend trả về để UI khóa thao tác thêm vào giỏ.

#### 4.3 Order

1. Customer gửi `POST /api/orders` với item, số lượng, payment method và context.
2. Backend validate menu item, giá, trạng thái availability và tạo `orderCode`.
3. Kitchen/Staff nhận đơn qua API polling hoặc SignalR event `order.created`.
4. Kitchen cập nhật từng món qua `PATCH /api/orders/{orderCode}/items/{orderItemId}/status`.
5. Staff/Admin cập nhật trạng thái đơn qua `PATCH /api/orders/{orderCode}/status`.
6. Customer theo dõi qua `GET /api/orders/{orderCode}`.

#### 4.4 Kitchen

```mermaid
flowchart TD
    A["OrderCreated"] --> B["Kitchen xem danh sách đơn"]
    B --> C["Món mới: Pending"]
    C --> D["Kitchen nhận món: Preparing"]
    D --> E["Món hoàn thành: Ready"]
    E --> F["Staff phục vụ / giao khách"]
    F --> G["Order Completed"]
```

#### 4.5 Payment

```mermaid
flowchart TD
    A["Customer chọn thanh toán"] --> B{"Payment method"}
    B -->|COD| C["Backend ghi payment Pending/COD"]
    B -->|VietQR| D["Backend tạo payment transaction"]
    D --> E["Sinh QR payload theo ngân hàng, số tiền, nội dung"]
    E --> F["Customer chuyển khoản"]
    F --> G["Staff kiểm tra và xác nhận Paid"]
    C --> H["Staff thu tiền tại quầy/bàn"]
    H --> G
    G --> I["Order paymentStatus = Paid"]
```

#### 4.6 AI Suggestion

1. Customer mở chat và gửi câu hỏi.
2. Backend tạo/đọc chat session qua `/api/chat/sessions`.
3. Backend gọi AI service nội bộ.
4. AI service truy xuất knowledge base menu/FAQ, gọi Google Gemini API nếu có cấu hình.
5. AI trả lời bằng văn bản và có thể trả `SuggestedCartAction`.
6. Frontend chỉ hiển thị đề xuất. Customer phải xác nhận trước khi thêm vào giỏ.
7. Nếu AI lỗi hoặc trả payload không an toàn, backend dùng fallback an toàn, không tạo đơn và không sửa giỏ hàng.

### 5. Activity Diagram - Đặt Món Dine-in

```mermaid
flowchart TD
    A["Khách quét QR"] --> B["Frontend lấy table/session"]
    B --> C{"Bàn hợp lệ?"}
    C -->|Không| D["Hiển thị lỗi bàn không hợp lệ"]
    C -->|Có| E["Hiển thị menu từ API"]
    E --> F["Khách chọn món"]
    F --> G["Gửi POST /api/orders"]
    G --> H{"Backend validate thành công?"}
    H -->|Không| I["Trả lỗi chuẩn API"]
    H -->|Có| J["Lưu order vào PostgreSQL"]
    J --> K["Phát realtime event"]
    K --> L["Bếp nhận đơn"]
    L --> M["Khách theo dõi trạng thái"]
```

### 6. Sequence Diagram - Order Đến Bếp

```mermaid
sequenceDiagram
    participant C as Customer Web
    participant API as ASP.NET Core API
    participant DB as PostgreSQL
    participant RT as SignalR
    participant K as Kitchen Web

    C->>API: POST /api/orders
    API->>DB: Validate menu/table and insert order
    DB-->>API: Order + orderCode
    API->>RT: Broadcast order.created
    API-->>C: 201 Created
    K->>API: GET /api/orders?status=active
    API->>DB: Query active orders
    API-->>K: Active order list
    K->>API: PATCH /api/orders/{code}/items/{id}/status
    API->>DB: Update item status
    API->>RT: Broadcast order.itemStatusChanged
    RT-->>C: Status update
```

### 7. Sequence Diagram - AI Gợi Ý Món

```mermaid
sequenceDiagram
    participant C as Customer Web
    participant API as Backend Chat API
    participant AIS as Python AI Service
    participant KB as RAG Knowledge Base
    participant R as Google Gemini API

    C->>API: POST /api/chat/sessions/{id}/messages
    API->>AIS: Chat request with menu context
    AIS->>KB: Retrieve menu/FAQ snippets
    AIS->>R: OpenAI-compatible chat completion
    R-->>AIS: Model answer
    AIS-->>API: Safe answer + optional SuggestedCartAction
    API-->>C: Chat message response
    C->>C: User confirms before changing cart
```

### 8. State Diagram

> Các sơ đồ dưới đã đồng bộ với state machine thực trong `OrderStore.cs` / `PaymentEndpoints.cs` (branch `develop`). Order được tạo ở `Placed`; mọi lần đổi trạng thái order hoặc payment được ghi vào bảng `order_status_history` (kèm actor + note). Chuyển sang `Completed` yêu cầu payment `Confirmed/Paid`; ghi đồng thời (2 người sửa cùng đơn) trả `409 CONFLICT_STALE` (optimistic concurrency `xmin`).

#### 8.1 Order State

`Draft` là giá trị enum mặc định nhưng đơn thực tế được tạo ở `Placed`. Hủy chỉ cho phép từ `Draft`/`Placed`/`Confirmed`.

```mermaid
stateDiagram-v2
    [*] --> Placed: Khách tạo đơn
    Placed --> Confirmed: Staff xác nhận
    Placed --> Preparing: Bếp bắt đầu
    Confirmed --> Preparing: Bếp bắt đầu
    Preparing --> Ready: Tất cả món sẵn sàng
    Ready --> Served: Phục vụ / khách nhận
    Ready --> Completed: Hoàn tất (payment Confirmed/Paid)
    Served --> Completed: Hoàn tất (payment Confirmed/Paid)
    Placed --> Cancelled: Hủy
    Confirmed --> Cancelled: Hủy
    Completed --> [*]
    Cancelled --> [*]
```

#### 8.2 Payment State

Trạng thái theo đúng enum `PaymentStatus`. `Confirmed` và `Paid` đều thỏa điều kiện hoàn tất đơn; `Refunded` chỉ đạt được từ `Confirmed`/`Paid`.

```mermaid
stateDiagram-v2
    [*] --> Unpaid: Tạo đơn
    Unpaid --> Pending: Sinh VietQR
    Unpaid --> Confirmed: Staff xác nhận (COD)
    Pending --> Confirmed: Staff xác nhận chuyển khoản
    Unpaid --> Failed: Đánh dấu thất bại
    Pending --> Failed: Đánh dấu thất bại
    Confirmed --> Refunded: Staff/Admin hoàn tiền
    Paid --> Refunded: Staff/Admin hoàn tiền
    Confirmed --> [*]
    Refunded --> [*]
    Failed --> [*]
```

#### 8.3 Order Item State

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Preparing
    Pending --> Ready
    Pending --> Served
    Preparing --> Ready
    Preparing --> Served
    Ready --> Served
    Pending --> Cancelled
    Preparing --> Cancelled
    Served --> [*]
    Cancelled --> [*]
```

### 9. Class / Domain Model Mức Khái Niệm

```mermaid
classDiagram
    class AppUser {
      Guid Id
      string Username
      string Role
      string PasswordHash
    }
    class RestaurantTable {
      Guid Id
      string Code
      string Name
      bool IsActive
    }
    class TableSession {
      Guid Id
      string SessionCode
      string Status
      DateTimeOffset OpenedAt
    }
    class Category {
      Guid Id
      string Name
      int DisplayOrder
    }
    class MenuItem {
      Guid Id
      string Name
      decimal Price
      bool IsAvailable
    }
    class Order {
      Guid Id
      string OrderCode
      string Status
      string PaymentStatus
      decimal TotalAmount
    }
    class OrderItem {
      Guid Id
      int Quantity
      decimal UnitPrice
      string Status
    }
    class Payment {
      Guid Id
      string Method
      string Status
      decimal Amount
    }
    class PaymentTransaction {
      Guid Id
      string Provider
      string Reference
      string Status
    }
    class ChatSession {
      Guid Id
      string CustomerContext
    }
    class ChatMessage {
      Guid Id
      string Role
      string Content
    }

    RestaurantTable "1" --> "0..*" TableSession
    Category "1" --> "0..*" MenuItem
    TableSession "0..1" --> "0..*" Order
    Order "1" --> "1..*" OrderItem
    MenuItem "1" --> "0..*" OrderItem
    Order "1" --> "0..1" Payment
    Payment "1" --> "0..*" PaymentTransaction
    ChatSession "1" --> "0..*" ChatMessage
```

### 10. ERD Mức Triển Khai

```mermaid
erDiagram
    USERS {
      uuid id PK
      string username
      string email
      string password_hash
      string role
    }
    RESTAURANT_TABLES {
      uuid id PK
      string code
      string name
      bool is_active
    }
    TABLE_SESSIONS {
      uuid id PK
      uuid table_id FK
      string session_code
      string status
      datetime opened_at
    }
    CATEGORIES {
      uuid id PK
      string name
      int display_order
    }
    MENU_ITEMS {
      uuid id PK
      uuid category_id FK
      string name
      decimal price
      bool is_available
    }
    ORDERS {
      uuid id PK
      uuid table_session_id FK
      string order_code
      string order_type
      string status
      string payment_status
      decimal total_amount
      string customer_access_token
      string pickup_customer_name "dead column (Pickup đã gỡ)"
      string pickup_customer_phone_number "dead column"
      datetime pickup_requested_at "dead column"
    }
    ORDER_ITEMS {
      uuid id PK
      uuid order_id FK
      uuid menu_item_id FK
      int quantity
      decimal unit_price
      string status
    }
    PAYMENTS {
      uuid id PK
      uuid order_id FK
      string method
      string status
      decimal amount
    }
    PAYMENT_TRANSACTIONS {
      uuid id PK
      uuid payment_id FK
      string provider
      string reference
      string status
    }
    ORDER_STATUS_HISTORY {
      uuid id PK
      uuid order_id FK
      string from_status
      string to_status
      string source
      string changed_by_role
      string note
      datetime created_at
    }

    RESTAURANT_TABLES ||--o{ TABLE_SESSIONS : opens
    TABLE_SESSIONS ||--o{ ORDERS : contains
    CATEGORIES ||--o{ MENU_ITEMS : groups
    ORDERS ||--|{ ORDER_ITEMS : includes
    MENU_ITEMS ||--o{ ORDER_ITEMS : ordered_as
    ORDERS ||--o| PAYMENTS : paid_by
    PAYMENTS ||--o{ PAYMENT_TRANSACTIONS : records
    ORDERS ||--o{ ORDER_STATUS_HISTORY : audits
```

### 11. Component Diagram

```mermaid
flowchart LR
    subgraph Browser["Client Apps"]
      CustomerWeb["Customer Web"]
      StaffWeb["Staff Web"]
      KitchenWeb["Kitchen Web"]
      AdminWeb["Admin Web"]
    end

    subgraph Backend["ASP.NET Core Modular Monolith"]
      Auth["Auth Module"]
      Menu["Menu Module"]
      Tables["Tables/QR Module"]
      Orders["Orders Module"]
      Payments["Payments Module"]
      Chat["Chat Module"]
      Realtime["SignalR Realtime"]
    end

    subgraph AIBox["Python AI Service"]
      Rag["RAG Retrieval"]
      Guardrails["Guardrails"]
    end

    DB["PostgreSQL"]
    Router["Google Gemini API"]
    Bank["VietQR/Bank"]

    CustomerWeb --> Backend
    StaffWeb --> Backend
    KitchenWeb --> Backend
    AdminWeb --> Backend
    Orders --> Realtime
    Auth --> DB
    Menu --> DB
    Tables --> DB
    Orders --> DB
    Payments --> DB
    Chat --> AIBox
    AIBox --> Router
    Payments --> Bank
```

### 12. Deployment Diagram

```mermaid
flowchart TD
    GH["GitHub Actions"]
    VPS["VPS Ubuntu"]
    Nginx["Nginx + TLS"]
    FE["frontend container"]
    API["api container"]
    AI["ai-service container"]
    PG["postgres container + volume"]
    R["Google Gemini API (external)"]

    GH -->|SSH deploy| VPS
    VPS --> Nginx
    Nginx --> FE
    Nginx --> API
    API --> PG
    API --> AI
    AI --> R
    PG --> Volume["postgres_data volume"]
```

### 13. API Traceability Checklist

| Nghiệp vụ | API/backend liên quan | Ghi chú kiểm tra |
| --- | --- | --- |
| Đăng nhập | `POST /api/auth/login`, `GET /api/auth/me` | Staff/Kitchen/Admin phải đăng nhập trước thao tác |
| Bàn/QR | `GET /api/tables/{tableCode}` | Không tự tạo table context ở UI |
| Menu khách | `GET /api/menu` | Menu UI đọc API thật |
| Quản lý menu | `/api/admin/categories`, `/api/admin/menu-items` | Cần token role phù hợp |
| Tạo đơn | `POST /api/orders` | Backend validate item/price/status |
| Theo dõi đơn | `GET /api/orders/{orderCode}` | Customer không cần đăng nhập |
| Danh sách đơn bếp/quầy | `GET /api/orders` | Dùng cho staff/kitchen dashboard |
| Cập nhật trạng thái món | `PATCH /api/orders/{orderCode}/items/{orderItemId}/status` | Kitchen flow |
| Cập nhật trạng thái đơn | `PATCH /api/orders/{orderCode}/status` | Staff/Admin flow |
| VietQR | Payment endpoints trong module `Payments` | Staff xác nhận thanh toán trong MVP |
| AI chat | `/api/chat/sessions`, `/api/chat/sessions/{id}/messages` | AI chỉ đề xuất, không tự tạo đơn |
| Realtime | SignalR hub + order events | Có polling fallback |

### 14. Quy Tắc Cho Các Issue UI/API Tiếp Theo

- UI phải bắt đầu từ use case và API traceability ở tài liệu này.
- Không đưa payload mẫu/debug API ra giao diện người dùng cuối.
- Không dùng mock/localStorage làm nguồn sự thật của order, payment, kitchen hoặc admin.
- Nếu cần dữ liệu demo, seed trong backend hoặc PostgreSQL, không hard-code ở component UI.
- Mỗi PR UI phải ghi rõ route nào gọi endpoint nào.
- Mỗi PR nghiệp vụ phải cập nhật diagram/checklist nếu làm thay đổi flow.

### 15. Definition Of Done Cho Tài Liệu BA/SA

- Actor đầy đủ và phân biệt người dùng chính với supporting system.
- Use case đăng nhập được include trước các thao tác staff/kitchen/admin.
- Có activity, sequence, state, component, deployment, class và ERD ở mức phù hợp.
- Luồng QR/session, menu, order, kitchen, payment, AI suggestion và admin đều có mô tả.
- Tài liệu không mâu thuẫn với `docs/API_CONTRACT.md`, `Program.cs`, Docker Compose và các module backend hiện tại.