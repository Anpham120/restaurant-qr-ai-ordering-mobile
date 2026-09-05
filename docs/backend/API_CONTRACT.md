# Hop Dong API - CMC Restaurant

> **Phần KIỂM KÊ ENDPOINT dưới đây được SINH TỪ MÃ** (`docs/build_api_inventory.py`), có cổng CI
> đối chiếu — nên nó không thể thiếu endpoint hay trỏ vào endpoint đã xoá.
>
> Các mục CÒN LẠI (payload, mã lỗi, phân quyền) do người viết và **chưa được kiểm tự động**. Kiểm
> lần cuối 2026-09-05.


<!-- SINH:api-inventory -->

## Kiểm kê endpoint — SINH TỪ MÃ

**88 endpoint** trong **11 module**, đọc trực tiếp từ
`backend-java/src/main/java/com/cmc/restaurant/**/*.java` bởi `docs/build_api_inventory.py`.

> Bảng này **không thể thiếu endpoint**: CI chạy `--check` và đỏ nếu mã có endpoint mà
> bảng chưa có. Trước khi có nó, tài liệu viết tay liệt kê 10/88 endpoint.
>
> Nhưng nó chỉ biết **đường dẫn và động từ**. Dạng phản hồi, mã lỗi, quy tắc phân quyền là
> phần người viết — xem các mục bên dưới.

### auth (10)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `POST` | `/api/auth/change-password` | `auth/AuthController.java` |
| `POST` | `/api/auth/google` | `auth/AuthController.java` |
| `POST` | `/api/auth/login` | `auth/AuthController.java` |
| `GET` | `/api/auth/me` | `auth/AuthController.java` |
| `POST` | `/api/auth/register` | `auth/AuthController.java` |
| `GET` | `/api/users` | `auth/AdminUserController.java` |
| `POST` | `/api/users` | `auth/AdminUserController.java` |
| `DELETE` | `/api/users/{userId}` | `auth/AdminUserController.java` |
| `PUT` | `/api/users/{userId}` | `auth/AdminUserController.java` |
| `POST` | `/api/users/{userId}/reset-password` | `auth/AdminUserController.java` |

### cart (3)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `DELETE` | `/api/table-sessions/{tableSessionId}/cart` | `cart/CartController.java` |
| `GET` | `/api/table-sessions/{tableSessionId}/cart` | `cart/CartController.java` |
| `POST` | `/api/table-sessions/{tableSessionId}/cart/items` | `cart/CartController.java` |

### counter (4)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/counter/shifts/current` | `counter/CounterController.java` |
| `POST` | `/api/counter/shifts/open` | `counter/CounterController.java` |
| `POST` | `/api/counter/shifts/{shiftId}/adjustments` | `counter/CounterController.java` |
| `POST` | `/api/counter/shifts/{shiftId}/close` | `counter/CounterController.java` |

### loyalty (15)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/admin/loyalty/members` | `loyalty/AdminLoyaltyController.java` |
| `POST` | `/api/admin/loyalty/members` | `loyalty/AdminLoyaltyController.java` |
| `DELETE` | `/api/admin/loyalty/members/{memberId}` | `loyalty/AdminLoyaltyController.java` |
| `GET` | `/api/admin/loyalty/members/{memberId}` | `loyalty/AdminLoyaltyController.java` |
| `PUT` | `/api/admin/loyalty/members/{memberId}` | `loyalty/AdminLoyaltyController.java` |
| `GET` | `/api/admin/loyalty/rewards` | `loyalty/AdminLoyaltyController.java` |
| `POST` | `/api/admin/loyalty/rewards` | `loyalty/AdminLoyaltyController.java` |
| `DELETE` | `/api/admin/loyalty/rewards/{rewardId}` | `loyalty/AdminLoyaltyController.java` |
| `PUT` | `/api/admin/loyalty/rewards/{rewardId}` | `loyalty/AdminLoyaltyController.java` |
| `POST` | `/api/loyalty/counter/redeem` | `loyalty/LoyaltyController.java` |
| `GET` | `/api/loyalty/lookup` | `loyalty/LoyaltyController.java` |
| `GET` | `/api/loyalty/me` | `loyalty/LoyaltyController.java` |
| `POST` | `/api/loyalty/me/phone` | `loyalty/LoyaltyController.java` |
| `POST` | `/api/loyalty/me/redeem` | `loyalty/LoyaltyController.java` |
| `POST` | `/api/loyalty/redemptions/{redemptionId}/honour` | `loyalty/LoyaltyController.java` |

### menu (14)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/admin/categories` | `menu/AdminCategoryController.java` |
| `POST` | `/api/admin/categories` | `menu/AdminCategoryController.java` |
| `DELETE` | `/api/admin/categories/{categoryId}` | `menu/AdminCategoryController.java` |
| `GET` | `/api/admin/categories/{categoryId}` | `menu/AdminCategoryController.java` |
| `PUT` | `/api/admin/categories/{categoryId}` | `menu/AdminCategoryController.java` |
| `GET` | `/api/admin/menu-items` | `menu/AdminMenuItemController.java` |
| `POST` | `/api/admin/menu-items` | `menu/AdminMenuItemController.java` |
| `DELETE` | `/api/admin/menu-items/{menuItemId}` | `menu/AdminMenuItemController.java` |
| `GET` | `/api/admin/menu-items/{menuItemId}` | `menu/AdminMenuItemController.java` |
| `PUT` | `/api/admin/menu-items/{menuItemId}` | `menu/AdminMenuItemController.java` |
| `PATCH` | `/api/admin/menu-items/{menuItemId}/availability` | `menu/AdminMenuItemController.java` |
| `GET` | `/api/kitchen/menu-items` | `menu/KitchenMenuController.java` |
| `PATCH` | `/api/kitchen/menu-items/{menuItemId}/availability` | `menu/KitchenMenuController.java` |
| `GET` | `/api/menu` | `menu/MenuController.java` |

### orders (10)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/kitchen/delay` | `orders/adapter/in/web/KitchenDelayController.java` |
| `PUT` | `/api/kitchen/delay` | `orders/adapter/in/web/KitchenDelayController.java` |
| `GET` | `/api/orders` | `orders/adapter/in/web/OrderController.java` |
| `POST` | `/api/orders` | `orders/adapter/in/web/OrderController.java` |
| `GET` | `/api/orders/mine` | `orders/adapter/in/web/OrderController.java` |
| `GET` | `/api/orders/mine/favourites` | `orders/adapter/in/web/OrderController.java` |
| `GET` | `/api/orders/{orderCode}` | `orders/adapter/in/web/OrderController.java` |
| `POST` | `/api/orders/{orderCode}/items/{orderItemId}/cancel` | `orders/adapter/in/web/OrderController.java` |
| `PATCH` | `/api/orders/{orderCode}/items/{orderItemId}/status` | `orders/adapter/in/web/OrderController.java` |
| `PATCH` | `/api/orders/{orderCode}/status` | `orders/adapter/in/web/OrderController.java` |

### payments (6)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/orders/{orderCode}/payment` | `payments/PaymentController.java` |
| `POST` | `/api/orders/{orderCode}/payment/confirm` | `payments/PaymentController.java` |
| `POST` | `/api/orders/{orderCode}/payment/fail` | `payments/PaymentController.java` |
| `POST` | `/api/orders/{orderCode}/payment/refund` | `payments/PaymentController.java` |
| `POST` | `/api/orders/{orderCode}/payment/request` | `payments/PaymentController.java` |
| `POST` | `/api/payments/webhooks/sepay` | `payments/SePayWebhookController.java` |

### promotions (7)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/admin/promotions` | `promotions/AdminPromotionController.java` |
| `POST` | `/api/admin/promotions` | `promotions/AdminPromotionController.java` |
| `DELETE` | `/api/admin/promotions/{promotionId}` | `promotions/AdminPromotionController.java` |
| `GET` | `/api/admin/promotions/{promotionId}` | `promotions/AdminPromotionController.java` |
| `PUT` | `/api/admin/promotions/{promotionId}` | `promotions/AdminPromotionController.java` |
| `GET` | `/api/promotions/active` | `promotions/PromotionController.java` |
| `POST` | `/api/promotions/validate` | `promotions/PromotionController.java` |

### reports (1)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/admin/reports/summary` | `reports/ReportController.java` |

### shared (1)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/health` | `shared/HealthController.java` |

### tables (17)

| Động từ | Đường dẫn | Khai ở |
|---|---|---|
| `GET` | `/api/admin/table-sessions` | `tables/AdminTableController.java` |
| `GET` | `/api/admin/tables` | `tables/AdminTableController.java` |
| `POST` | `/api/admin/tables` | `tables/AdminTableController.java` |
| `PATCH` | `/api/admin/tables/{tableCode}` | `tables/AdminTableController.java` |
| `POST` | `/api/admin/tables/{tableCode}/qr/rotate` | `tables/AdminTableController.java` |
| `GET` | `/api/table-invoices` | `tables/TableInvoicePaymentController.java` |
| `POST` | `/api/table-sessions` | `tables/TableController.java` |
| `GET` | `/api/table-sessions/{sessionId}` | `tables/TableController.java` |
| `POST` | `/api/table-sessions/{sessionId}/assistance` | `tables/TableController.java` |
| `POST` | `/api/table-sessions/{sessionId}/close` | `tables/TableController.java` |
| `GET` | `/api/table-sessions/{sessionId}/invoice` | `tables/TableController.java` |
| `POST` | `/api/table-sessions/{sessionId}/invoice/payment-request` | `tables/TableInvoicePaymentController.java` |
| `POST` | `/api/table-sessions/{sessionId}/invoice/payment/cancel` | `tables/TableInvoicePaymentController.java` |
| `POST` | `/api/table-sessions/{sessionId}/invoice/payment/confirm` | `tables/TableInvoicePaymentController.java` |
| `GET` | `/api/table-sessions/{sessionId}/orders` | `tables/TableController.java` |
| `GET` | `/api/tables/qr/{qrToken}` | `tables/TableController.java` |
| `GET` | `/api/tables/{tableCode}` | `tables/TableController.java` |

<!-- HET:api-inventory -->
Tai lieu nay la contract chinh thuc giua backend, frontend, app di dong va DevOps. Doi endpoint, field, enum, ma loi hoac payload su kien thi phai ghi breaking-change note trong issue/PR lien quan.

> **Nguon chuan ve kien truc va nghiep vu: [`ARCHITECTURE.md`](ARCHITECTURE.md).** Tai lieu nay giu
> chi tiet request/response. Chi co `OrderType = DineIn` (QR tai ban) — khong co Delivery hay
> Pickup; per-order access token (`X-Order-Token`); hoan tien; optimistic concurrency
> (`CONFLICT_STALE`); khoa dang nhap sau nhieu lan sai.

## 1. Nguyen Tac Chung

- Base API path: `/api`.
- JSON response dung `camelCase`.
- Thoi gian dung ISO 8601 UTC, vi du `2026-06-14T04:00:00Z`.
- Tien te la VND; `price`, `amount`, `subtotalAmount`, `totalAmount` la number/decimal khong am.
- Frontend production khong duoc tu suy luan contract tu mock data. Component phai di qua service layer.
- UI production khong hien raw API payload, debug JSON, secret, token hoac provider key.
- Endpoint protected phai gui header `Authorization: Bearer <accessToken>`.
- OpenAPI duoc expose o moi truong Development qua `app.MapOpenApi()`; tai lieu nay la ban freeze de review/lam viec nhom.

## 2. Response Va Error Format

Thanh cong tra ve DTO cu the cua endpoint. Loi business/validation dung shape:

```json
{
  "error": {
    "code": "MENU_ITEM_UNAVAILABLE",
    "message": "Menu item is unavailable.",
    "details": {}
  }
}
```

Quy tac:

- `error.code` dung UPPER_SNAKE_CASE va on dinh de frontend map thong bao than thien.
- `error.message` la message ky thuat/van hanh; frontend khong duoc phu thuoc logic vao message.
- Body invalid hoac JSON sai tra `400 REQUEST_INVALID`.

## 3. Shared Enum

| Nhom | Gia tri hop le | Ghi chu |
| --- | --- | --- |
| `UserRole` | `Customer`, `Staff`, `Kitchen`, `Admin` | `Customer` cho khach; cac role van hanh dung auth seed/admin. |
| `OrderType` | `DineIn` | Bat buoc `tableCode` hop le; chi dat mon tai ban qua QR/session. `Pickup` va Delivery da bo khoi backend. |
| `PaymentMethod` | `COD`, `VietQR` | VietQR tao payload/QR de doi soat thu cong. |
| `PaymentStatus` | `Unpaid`, `Pending`, `Paid`, `Confirmed`, `Failed`, `Cancelled`, `Refunded` | Staff/Admin xac nhan, fail hoac refund payment. |
| `OrderStatus` | `Draft`, `Placed`, `Confirmed`, `Preparing`, `Ready`, `Served`, `Completed`, `Cancelled` | Order tao o `Placed`. `Completed` yeu cau payment `Confirmed/Paid`. |
| `OrderItemStatus` | `Pending`, `Preparing`, `Ready`, `Served`, `Cancelled` | Kitchen/Staff cap nhat tung mon. |
| `ChatRole` | `user`, `assistant` | Theo chuan message role cua chat. |
| `TableCode` | `T01` den `T99` hoac seed hien hanh cua DB | QR/token phai map ve table active. |

## 4. Auth Contract

### POST `/api/auth/register`

Auth: public. **Chi app di dong.** Web khong co duong tao tai khoan khach: buoc thanh toan chi
nhan so de tinh diem, va sau thanh toan chi moi tai app.

Request:

```json
{
  "fullName": "Nguyen Van A",
  "phoneIdToken": "<ID token Firebase sau khi xac minh OTP>",
  "password": "12345678"
}
```

So dien thoai lay TU TOKEN, khong lay tu than request. Diem thuong tinh theo so, nen nhan mot so
chua xac minh nghia la cho nguoi la chiem ho so diem cua khach quen — dung thu OTP sinh ra de bit.

Response `200 OK`:

```json
{
  "userId": "usr_001",
  "fullName": "Nguyen Van A",
  "email": "customer@example.com",
  "role": "Customer"
}
```

Loi chinh: `FULL_NAME_REQUIRED`, `PHONE_TOKEN_REQUIRED`, `PHONE_TOKEN_INVALID`, `PASSWORD_TOO_SHORT`, `PHONE_ALREADY_REGISTERED`, `PHONE_VERIFY_NOT_CONFIGURED`, `PHONE_VERIFY_UNREACHABLE`.

### POST `/api/auth/login`

Auth: public.

Truong ten la **`identifier`**, KHONG phai `email` — mot o cho ca hai loai nguoi dung: khach go so
dien thoai, nhan vien go email. Gui `email` thi Jackson de null va request chet o 400
`IDENTIFIER_REQUIRED` truoc ca buoc kiem mat khau. Da xay ra that tren ca app lan web.

Request:

```json
{
  "identifier": "admin@cmc.test",
  "password": "Admin@123"
}
```

Response `200 OK`:

```json
{
  "accessToken": "<jwt>",
  "expiresAt": "2026-06-14T12:00:00Z",
  "user": {
    "userId": "usr_admin",
    "fullName": "Admin CMC",
    "email": "admin@cmc.test",
    "role": "Admin"
  }
}
```

Loi chinh: `IDENTIFIER_REQUIRED`, `PASSWORD_REQUIRED`, `INVALID_CREDENTIALS`.

Tai khoan `admin@cmc.test` o tren chi la vi du. **Khong migration nao chen nguoi dung** — tai
khoan quan tri dau tien do `AdminBootstrap` tao tu bien `ADMIN_BOOTSTRAP_EMAIL` va
`ADMIN_BOOTSTRAP_PASSWORD` luc khoi dong. Bo trong hai bien do thi co so du lieu khong co ai, va
ban trien khai tu khoa minh ra ngoai.

Lockout: sai mat khau 5 lan lien tiep → khoa tai khoan 15 phut. Khi bi khoa van tra `INVALID_CREDENTIALS` (khong lo tai khoan ton tai hoac dang bi khoa).

### GET `/api/auth/me`

Auth: any authenticated user.

Response `200 OK`:

```json
{
  "userId": "usr_admin",
  "fullName": "Admin CMC",
  "email": "admin@cmc.test",
  "role": "Admin"
}
```

### GET `/api/auth/admin-check` — CỐ Ý KHÔNG PORT (#97)

Endpoint này tồn tại ở bản .NET (`AuthEndpoints.cs`) và **không được port sang Java**.

Lý do: không nơi nào gọi nó. Đã tìm khắp kho — `frontend/src`, `scripts/`, `.github/`,
`docs/` — kết quả duy nhất là một lớp CSS trùng tên
(`.admin-check-row` trong `styles.css`), không liên quan. Frontend quyết định quyền quản trị
bằng prop `isAdmin` truyền vào `OpsHubShell`, không hỏi máy chủ.

Bản thân endpoint chỉ trả `{ "status": "ok", "requiredRole": "Admin" }` — nó không làm gì
ngoài việc xác nhận token gọi nó có vai Admin, thứ mà mọi endpoint quản trị khác đã tự kiểm.
Port nó chỉ để bảng kiểm kê đủ số sẽ tạo ra một endpoint không ai gọi mà vẫn phải bảo trì.

## 5. Menu Va Category Contract

### GET `/api/menu`

Auth: public. Chi tra category active va item con ban.

Response:

```json
{
  "categories": [
    { "categoryId": "cat_main", "name": "Mon chinh" }
  ],
  "items": [
    {
      "id": "m_001",
      "name": "Pho bo dac biet",
      "description": "Pho bo truyen thong",
      "price": 65000,
      "categoryId": "cat_main",
      "categoryName": "Mon chinh",
      "imageUrl": "https://...",
      "isAvailable": true,
      "tags": ["noodle", "beef"]
    }
  ]
}
```

### Admin Category Endpoints

Auth: role `Staff` hoac `Admin`.

| Method | Path | Muc dich |
| --- | --- | --- |
| GET | `/api/admin/categories` | Lay danh sach category. |
| GET | `/api/admin/categories/{categoryId}` | Lay chi tiet category. |
| POST | `/api/admin/categories` | Tao category. |
| PUT | `/api/admin/categories/{categoryId}` | Cap nhat category. |
| DELETE | `/api/admin/categories/{categoryId}` | Xoa category neu chua co item. |

Category request:

```json
{
  "name": "Hai san",
  "displayOrder": 40,
  "isActive": true
}
```

Category response:

```json
{
  "categoryId": "cat_hai_san",
  "name": "Hai san",
  "displayOrder": 40,
  "isActive": true,
  "createdAt": "2026-06-14T04:00:00Z",
  "updatedAt": "2026-06-14T04:00:00Z"
}
```

Loi chinh: `CATEGORY_NAME_REQUIRED`, `CATEGORY_NOT_FOUND`, `CATEGORY_HAS_MENU_ITEMS`.

### Admin Menu Item Endpoints

Auth: role `Staff` hoac `Admin`.

| Method | Path | Muc dich |
| --- | --- | --- |
| GET | `/api/admin/menu-items?includeInactiveCategories=true` | Lay menu item cho admin. |
| GET | `/api/admin/menu-items/{menuItemId}` | Lay chi tiet item. |
| POST | `/api/admin/menu-items` | Tao item. |
| PUT | `/api/admin/menu-items/{menuItemId}` | Cap nhat item. |
| PATCH | `/api/admin/menu-items/{menuItemId}/availability` | Bat/tat trang thai con mon. |
| DELETE | `/api/admin/menu-items/{menuItemId}` | Xoa item. |

Menu item request:

```json
{
  "categoryId": "cat_main",
  "name": "Pho bo dac biet",
  "description": "Pho bo truyen thong",
  "price": 65000,
  "imageUrl": "https://...",
  "isAvailable": true,
  "tags": ["noodle", "beef"]
}
```

Toggle availability:

```json
{ "isAvailable": false }
```

Loi chinh: `CATEGORY_REQUIRED`, `CATEGORY_INVALID`, `MENU_ITEM_NAME_REQUIRED`, `MENU_ITEM_PRICE_INVALID`, `MENU_ITEM_NOT_FOUND`.

## 6. Table Va Table Session Contract

### GET `/api/admin/tables`

Auth: `AdminOnly`. Tra danh sach ban kem `qrToken` va `customerPath` de quan ly/in QR. Staff, Kitchen va anonymous khong duoc doc token.

### GET `/api/tables/{tableCode}`

Auth: public.

Response:

```json
{
  "tableCode": "T05",
  "displayName": "Ban T05",
  "isActive": true
}
```

### GET `/api/tables/qr/{qrToken}`

Auth: public. Resolve QR token sang table active. Response chi tra `tableCode`, `displayName`; khong echo token/path.

### POST `/api/table-sessions`

Auth: public.

Request:

```json
{
  "tableCode": "T05",
  "qrToken": "opaque-physical-qr-token"
}
```

Response:

```json
{
  "sessionId": "ts_abc123",
  "tableCode": "T05",
  "orderType": "DineIn",
  "status": "Open",
  "openedAt": "2026-06-14T04:00:00Z",
  "closedAt": null,
  "tableSessionToken": "opaque-session-capability"
}
```

`tableSessionToken` chi tra khi mo session. Client luu theo session, khong dung chung giua cac ban.

### GET `/api/table-sessions/{sessionId}`

Auth: public co capability. Bat buoc header `X-Table-Session-Token`.

### POST `/api/table-sessions/{sessionId}/close`

Auth: role `Staff` hoac `Admin`.

Loi chinh: `TABLE_CODE_INVALID`, `TABLE_NOT_FOUND`, `ORDER_TYPE_INVALID`, `TABLE_SESSION_NOT_FOUND`, `TABLE_SESSION_CLOSED`.

## 7. Order Contract

### POST `/api/orders`

Auth: public. Tao don tu customer cart.

Header bat buoc: `Idempotency-Key`. Retry cung key + cung payload tra lai don cu; doi payload tra `409 IDEMPOTENCY_KEY_REUSED`.

Request:

```json
{
  "orderType": "DineIn",
  "tableCode": "T05",
  "qrToken": "opaque-physical-qr-token",
  "tableSessionId": "ts_abc123",
  "items": [
    { "menuItemId": "m_001", "quantity": 2 }
  ]
}
```

Response `201 Created`:

```json
{
  "orderId": "ord_abc123",
  "orderCode": "ORD-1001",
  "orderType": "DineIn",
  "tableCode": "T05",
  "tableSessionId": "ts_abc123",
  "status": "Placed",
  "paymentStatus": "NotRequested",
  "paymentMethod": "Unselected",
  "items": [
    {
      "orderItemId": "oi_001",
      "menuItemId": "m_001",
      "name": "Pho bo dac biet",
      "quantity": 2,
      "status": "Pending"
    }
  ],
  "customerAccessToken": "opaque-32-byte-base64url"
}
```

`customerAccessToken` chi tra ve tren response tao don. Client phai luu token va gui lai qua header `X-Order-Token` khi doc order/payment cua khach (xem muc 7-8). Mat token = khong con doc lai duoc don do.

Loi chinh: `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `ORDER_ITEMS_REQUIRED`, `ORDER_ITEM_QUANTITY_INVALID`, `ORDER_TYPE_INVALID`, `DINE_IN_TABLE_REQUIRED`, `TABLE_SESSION_EXPIRED`, `MENU_ITEM_NOT_FOUND`, `MENU_ITEM_UNAVAILABLE`.

### GET `/api/orders/{orderCode}`

Auth: public co dieu kien. Customer phai gui header `X-Order-Token: <customerAccessToken>` (token nhan khi tao don); role `Staff/Kitchen/Admin` (Bearer JWT) doc khong can token. Thieu/sai token va khong co role → `404 ORDER_NOT_FOUND` (khong xac nhan don co ton tai).

Response:

```json
{
  "orderId": "ord_abc123",
  "orderCode": "ORD-1001",
  "orderType": "DineIn",
  "tableCode": "T05",
  "tableSessionId": "ts_abc123",
  "status": "Preparing",
  "paymentStatus": "Unpaid",
  "paymentMethod": "COD",
  "subtotalAmount": 130000,
  "totalAmount": 130000,
  "createdAt": "2026-06-14T04:00:00Z",
  "updatedAt": "2026-06-14T04:05:00Z",
  "items": [
    {
      "orderItemId": "oi_001",
      "menuItemId": "m_001",
      "name": "Pho bo dac biet",
      "unitPrice": 65000,
      "quantity": 2,
      "status": "Preparing",
      "lineTotal": 130000,
      "updatedAt": "2026-06-14T04:05:00Z"
    }
  ],
  "events": [
    { "status": "Placed", "source": "Status", "changedByRole": "Customer", "note": null, "createdAt": "2026-06-14T04:00:00Z" }
  ]
}
```

`events` la audit trail tu bang `order_status_history` (ghi moi lan doi order status hoac payment).

### GET `/api/orders`

Auth: role `Staff`, `Kitchen` hoac `Admin`.

Query optional: `status`, `orderType`, `tableCode`, `fromUtc`, `toUtc`, `page`, `pageSize`.

Response:

```json
{
  "orders": [],
  "total": 0
}
```

### PATCH `/api/orders/{orderCode}/status`

Auth: role `Staff` hoac `Admin`.

Request:

```json
{ "status": "Confirmed" }
```

Chuyen sang `Completed` yeu cau payment `Confirmed/Paid`, nguoc lai `400 ORDER_COMPLETE_REQUIRES_PAYMENT`. Hai nguoi sua cung don dong thoi → `409 CONFLICT_STALE` (optimistic concurrency `xmin`); client reload roi thu lai.

### PATCH `/api/orders/{orderCode}/items/{orderItemId}/status`

Auth: role `Kitchen`, `Staff` hoac `Admin`.

Request:

```json
{ "status": "Ready" }
```

Kitchen chi cap nhat trang thai tung mon, khong cap nhat truc tiep trang thai toan don. Backend tu dong tong hop trang thai order sau moi thay doi item:

- Order `Confirmed` chuyen sang `Preparing` khi co mon bat dau `Preparing`, `Ready` hoac `Served`.
- Order `Confirmed`/`Preparing` chuyen sang `Ready` khi tat ca mon khong bi huy da `Ready` hoac `Served`.
- Moi thay doi tong hop duoc ghi vao `order_status_history` va phat realtime `order.statusChanged`.

Loi chinh: `ORDER_NOT_FOUND`, `ORDER_STATUS_INVALID`, `ORDER_ITEM_NOT_FOUND`, `ORDER_ITEM_STATUS_INVALID`, `ORDER_CANCEL_NOT_ALLOWED`, `ORDER_COMPLETE_REQUIRES_PAYMENT`, `CONFLICT_STALE`.

## 8. Payment Contract

### GET `/api/orders/{orderCode}/payment`

Auth: public co dieu kien, giong GET order — header `X-Order-Token` hoac role `Staff/Kitchen/Admin`. Thieu/sai → `404 ORDER_NOT_FOUND`.

Response:

```json
{
  "paymentId": "pay_001",
  "orderCode": "ORD-1001",
  "method": "VietQR",
  "status": "Pending",
  "amount": 130000,
  "providerTransactionId": "CMC-ORD-1001",
  "createdAt": "2026-06-14T04:00:00Z",
  "paidAt": null,
  "updatedAt": "2026-06-14T04:05:00Z",
  "transactions": []
}
```

### POST `/api/orders/{orderCode}/payment/request`

Auth: customer capability `X-Order-Token`. Bat buoc `Idempotency-Key`.

Request:

```json
{ "method": "COD" }
```

`method` la `COD` hoac `VietQR`. Payment chuyen `NotRequested` sang `Pending`. COD tra `vietQr: null`; VietQR tra QR payload.

Response:

```json
{ "payment": { "orderCode": "ORD-1001", "method": "COD", "status": "Pending" }, "vietQr": null }
```

### POST `/api/orders/{orderCode}/payment/confirm`

Auth: role `Staff` hoac `Admin`.

Request:

```json
{
  "providerTransactionId": "BANK-TX-001",
  "note": "Da doi soat"
}
```

### POST `/api/orders/{orderCode}/payment/fail`

Auth: role `Staff` hoac `Admin`.

Request:

```json
{ "note": "Khach huy thanh toan" }
```

### POST `/api/orders/{orderCode}/payment/refund`

Auth: role `Staff` hoac `Admin`. Chi refund duoc khi payment dang `Confirmed` hoac `Paid`; nguoc lai `400 PAYMENT_NOT_REFUNDABLE`. Set payment sang `Refunded`, ghi ledger + status history. Khong tu dong huy order.

Request:

```json
{ "note": "Hoan tien cho khach" }
```

Loi chinh: `PAYMENT_NOT_FOUND`, `PAYMENT_METHOD_INVALID`, `PAYMENT_ALREADY_CONFIRMED`, `PAYMENT_ALREADY_FAILED`, `PAYMENT_NOT_REFUNDABLE`, `PAYMENT_NOTE_TOO_LONG`, `VIETQR_CONFIG_MISSING`, `CONFLICT_STALE`.

## 9. Kitchen, Staff Va Realtime Contract

Kitchen/Staff khong co endpoint rieng ngoai order endpoints:

- Staff board doc `GET /api/orders`.
- Staff confirm order doc `PATCH /api/orders/{orderCode}/status`.
- Kitchen board doc `GET /api/orders` va `PATCH /api/orders/{orderCode}/items/{orderItemId}/status`.
- Payment counter doc `POST /api/orders/{orderCode}/payment/confirm`.

STOMP over WebSocket:

- Điểm nối: `/hub/orders` (có cả biến thể SockJS cho trình duyệt cũ).
- Broker: `/topic`. Tên sự kiện đi trong **header `event`**, không nằm trong thân tin.
- Bốn đích:

| Đích | Ai được đăng ký |
|---|---|
| `/topic/order.<orderCode>` | khách, bằng token của chính đơn đó |
| `/topic/orders.operations` | Staff, Kitchen, Admin |
| `/topic/table.<tableCode>` | Staff, Kitchen, Admin |
| `/topic/menu` | mọi giao diện |

Backend chặn ngay ở bước **SUBSCRIBE**, không phải lúc phát: khách không đăng ký được đích của bàn
khác.

- Thân tin từ backend tới client:

```json
{
  "event": "order.itemStatusChanged",
  "payload": {
    "orderId": "ord_abc123",
    "orderCode": "ORD-1001",
    "orderItemId": "oi_001",
    "menuItemName": "Pho bo dac biet",
    "status": "Ready",
    "updatedAt": "2026-06-14T04:10:00Z"
  }
}
```

Tên sự kiện (đi trong header `event`):

- `order.created`
- `order.statusChanged`
- `order.itemStatusChanged`
- `payment.requested`
- `menu.availabilityChanged`

Khác biệt mô hình đáng nhớ: bản trước dùng SignalR, nơi client gọi RPC `WatchOrder(...)` và server
tự thêm connection vào group. STOMP không có RPC ấy — client **SUBSCRIBE một đích**, và quyền được
kiểm ngay tại bước đó. Ai chuyển mã cũ sang mà tìm `WatchOrder` sẽ không thấy, vì khái niệm đó
không tồn tại ở đây.

## 10. Health, CORS Va Deployment Contract

| Method | Path | Auth | Ghi chu |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Health JSON cua app. Day la endpoint health DUY NHAT. |

`/health/live` va `/health/ready` **khong ton tai**. Tai lieu nay tung khai ca hai, va cai gia da
tra: `deploy/scripts/health-check.sh` goi `/health/ready` — Spring Security tra 401 cho moi duong
khong khai, nen phep kiem suc khoe sau trien khai that bai vi mot endpoint chua bao gio co. Healthcheck
cua container trong `docker-compose.java.yml` cung dung `/api/health`.

CORS origins mac dinh:

- `https://cmcrestaurant.app`
- `https://order.cmcrestaurant.app`
- `https://customer.cmcrestaurant.app`
- `https://admin.cmcrestaurant.app`
- `https://staging.cmcrestaurant.app`
- `https://order-staging.cmcrestaurant.app`
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5177`
- `http://127.0.0.1:5177`

Production co the override bang `CORS_ALLOWED_ORIGINS`, ngan cach bang dau `;`.

## 11. Promotions, Loyalty & Reports

### Khuyen mai (Promotions)

- `POST /api/promotions/validate` — cong khai. Body `{ code, subtotalAmount }`. Tra `{ code, name, type, subtotalAmount, discountAmount, totalAmount, isFlashSale }`. Ma khong hop le tra 400 (`PROMOTION_NOT_FOUND`, `PROMOTION_INACTIVE`, `PROMOTION_NOT_STARTED`, `PROMOTION_EXPIRED`, `PROMOTION_MIN_ORDER_NOT_MET`).
- `GET/POST/PUT/DELETE /api/admin/promotions[/{id}]` — `AdminOnly`. `type` = `Percentage` | `FixedAmount`. Percentage lam tron va gioi han boi `maxDiscountAmount`; discount luon <= subtotal.
- `POST /api/orders` da nhan them `promotionCode?` va `customerPhoneNumber?`. Backend ap dung khuyen mai truoc khi tao don; ma sai lam ca request that bai (400). `OrderResponse` bo sung `discountAmount`, `promotionCode`; `totalAmount = subtotalAmount - discountAmount`.

### Tich diem (Loyalty)

- `GET /api/loyalty/lookup?phone=` — cong khai. Tra `{ phoneNumber, points, lifetimeSpend, availableRewards[] }` (rewards dang active va du diem). SDT chuan hoa ve chi so.
- `GET/POST/PUT/DELETE /api/admin/loyalty/members[/{id}]` va `.../rewards[/{id}]` — `AdminOnly`.
- Khi xac nhan thanh toan (`payment/confirm`), he thong cong diem theo `1 diem / 10.000d` cho SDT cua don (`customerPhoneNumber` uu tien, sau do `pickupCustomerPhoneNumber`).

### Bao cao (Reports)

- `GET /api/admin/reports/summary?from=&to=` — `AdminOnly`. Mac dinh 30 ngay gan nhat. Tra `{ from, to, totalOrders, paidOrders, grossRevenue, totalDiscount, netRevenue, topItems[], dailyRevenue[] }` tren cac don da `Paid`/`Confirmed`.

## 12. Ma Loi Chinh

| HTTP | Code | Module |
| --- | --- | --- |
| 400 | `REQUEST_INVALID` | Shared |
| 400 | `EMAIL_REQUIRED`, `EMAIL_INVALID`, `PASSWORD_REQUIRED`, `PASSWORD_TOO_SHORT` | Auth |
| 401 | `INVALID_CREDENTIALS` | Auth |
| 409 | `EMAIL_ALREADY_REGISTERED` | Auth |
| 400 | `TABLE_CODE_INVALID`, `ORDER_TYPE_INVALID` | Table |
| 404 | `TABLE_NOT_FOUND`, `TABLE_SESSION_NOT_FOUND` | Table |
| 400 | `CATEGORY_NAME_REQUIRED`, `CATEGORY_REQUIRED`, `CATEGORY_INVALID` | Menu |
| 404 | `CATEGORY_NOT_FOUND`, `MENU_ITEM_NOT_FOUND` | Menu |
| 409 | `CATEGORY_HAS_MENU_ITEMS` | Menu |
| 400 | `MENU_ITEM_NAME_REQUIRED`, `MENU_ITEM_PRICE_INVALID`, `MENU_ITEM_UNAVAILABLE` | Menu/Order |
| 400 | `ORDER_ITEMS_REQUIRED`, `ORDER_ITEM_QUANTITY_INVALID`, `DINE_IN_TABLE_REQUIRED` | Order |
| 404 | `ORDER_NOT_FOUND`, `ORDER_ITEM_NOT_FOUND` | Order |
| 400 | `ORDER_STATUS_INVALID`, `ORDER_ITEM_STATUS_INVALID`, `ORDER_CANCEL_NOT_ALLOWED`, `ORDER_COMPLETE_REQUIRES_PAYMENT` | Order |
| 409 | `CONFLICT_STALE` | Order/Payment (optimistic concurrency) |
| 404 | `PAYMENT_NOT_FOUND` | Payment |
| 400 | `PAYMENT_METHOD_INVALID`, `PAYMENT_ALREADY_CONFIRMED`, `PAYMENT_ALREADY_FAILED`, `PAYMENT_NOT_REFUNDABLE`, `PAYMENT_NOTE_TOO_LONG`, `VIETQR_CONFIG_MISSING` | Payment |
| 400 | `CHAT_MESSAGE_EMPTY` | Chat |
| 404 | `CHAT_SESSION_NOT_FOUND` | Chat |
| 400 | `PROMOTION_CODE_REQUIRED`, `PROMOTION_NAME_REQUIRED`, `PROMOTION_TYPE_INVALID`, `PROMOTION_DISCOUNT_INVALID`, `PROMOTION_DATE_RANGE_INVALID`, `PROMOTION_INACTIVE`, `PROMOTION_NOT_STARTED`, `PROMOTION_EXPIRED`, `PROMOTION_MIN_ORDER_NOT_MET` | Promotions |
| 404 | `PROMOTION_NOT_FOUND` | Promotions |
| 409 | `PROMOTION_CODE_EXISTS` | Promotions |
| 400 | `LOYALTY_PHONE_REQUIRED`, `LOYALTY_POINTS_INVALID`, `LOYALTY_REWARD_NAME_REQUIRED`, `LOYALTY_REWARD_POINTS_INVALID` | Loyalty |
| 404 | `LOYALTY_MEMBER_NOT_FOUND`, `LOYALTY_REWARD_NOT_FOUND` | Loyalty |
| 409 | `LOYALTY_PHONE_EXISTS` | Loyalty |

## 13. Checklist Cho Frontend

- Dung service layer cho moi endpoint, khong fetch truc tiep trong component.
- Loading/error/empty state phai hien thong bao than thien.
- LocalStorage chi duoc luu token/session/cart tam thoi tren client, khong lam source of truth cho order/menu/payment.
- Menu, order, payment, admin data production phai lay tu API.
- Khi them field moi vao DTO, cap nhat TypeScript type va tai lieu nay trong cung PR hoac PR lien quan.
- Neu response thay doi breaking, PR phai ghi ro migration impact cho frontend/admin/kitchen/AI.