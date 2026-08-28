# Cấu hình Firebase, Google và SePay

Mã đã sẵn sàng và có phép kiểm. Ba thứ dưới đây đang **tắt an toàn**: chưa cấu hình thì máy chủ
từ chối mọi lời gọi, chứ không chạy ở chế độ bỏ qua kiểm tra.

Mọi tên biến trong tài liệu này đọc trực tiếp từ `backend-java/src/main/resources/application.yml`
và mã nguồn.

---

## Trước khi bắt đầu

SePay cần gọi được vào máy chủ **từ Internet**. Máy chủ đang chạy ở máy cá nhân, nên phải mở một
đường hầm (`ngrok`, `cloudflared`).

> **KHÔNG trỏ SePay vào VPS chung của nhóm.** Máy đó đang phục vụ điểm của bốn bạn khác.

Firebase và Google thì không cần đường hầm: app gọi thẳng ra họ, máy chủ chỉ đối chiếu token.

---

## 1. Firebase — OTP lúc đăng ký

Xác minh khách sở hữu số điện thoại. Chạy **đúng một lần lúc đăng ký**; đăng nhập về sau dùng mật
khẩu, nên mỗi khách chỉ tốn một tin nhắn cả đời.

### Các bước

1. **Tạo dự án** — `console.firebase.google.com` → *Add project*. Tắt Google Analytics cho nhanh,
   không dùng tới.

2. **Bật đăng nhập bằng số điện thoại** — `Authentication → Sign-in method → Phone → Enable`.

3. **Thêm số điện thoại thử** — ngay trong màn Phone, mở `Phone numbers for testing`. Thêm một số
   *không có thật* kèm mã sáu chữ số do bạn tự đặt.

4. **Lấy hai giá trị cho máy chủ** — `Project settings → General`: chép **Web API Key** và
   **Project ID**.

### Số thử: không gửi SMS, không tính quota, không bị chặn tốc độ

Đây là thứ làm cho buổi bảo vệ tốn **0 đồng**. Firebase không gửi tin nhắn thật cho các số này, và
mã xác minh luôn là mã bạn đặt sẵn — đăng ký lại bao nhiêu lần cũng được. Không cần gắn thẻ, không
cần gói Blaze.

Số **thật** thì phải nâng lên gói Blaze và gắn thẻ tín dụng. Mười tin đầu mỗi ngày không bị tính
tiền, nhưng với demo thì không cần chạm tới.

### Điền vào `backend-java/.env`

```dotenv
FIREBASE_API_KEY=AIza…            # Web API Key
FIREBASE_PROJECT_ID=ten-du-an     # Project ID
```

---

## 2. Google — đăng nhập bằng tài khoản Google

Đường vào thứ hai, cho khách không muốn đặt mật khẩu. Vào bằng Google thì **vẫn phải liên kết số**
ở mục Hồ sơ, vì Google trả email chứ không trả số điện thoại.

### Các bước

1. **Tạo OAuth client ID loại Web** — `console.cloud.google.com → APIs & Services → Credentials →
   Create credentials → OAuth client ID → Web application`.

   Đúng là loại **Web**, kể cả khi app chạy trên Android. Thư viện dùng web client ID để xin
   `idToken`.

2. **Tạo thêm một client ID loại Android** — package `vn.cmc.restaurantqr`, kèm SHA-1 của keystore.
   Client này chỉ cần **tồn tại**, không điền vào đâu cả. SHA-1 lấy từ `eas credentials` sau lần
   build đầu tiên.

3. **Điền cùng một giá trị vào hai nơi** — máy chủ dùng nó để đối chiếu `aud`; app dùng nó để xin
   token.

### Điền vào hai chỗ

`backend-java/.env`:

```dotenv
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
```

`mobile-rn/src/core/auth/googleClientId.ts`:

```ts
export const GOOGLE_WEB_CLIENT_ID = '…apps.googleusercontent.com';
```

### Client ID không phải bí mật

Nó nằm sẵn trong gói cài của mọi ứng dụng dùng Google Sign-In. Phần bí mật là client *secret*, và
luồng đăng nhập trên di động không dùng tới — nên để trong mã nguồn không vi phạm luật bí mật của
dự án.

---

## 3. SePay — đối soát tiền tự động

Khách quét QR chuyển khoản → SePay bắn webhook khi tiền về → hệ thống tự đánh dấu hoá đơn đã thanh
toán. Không cần nhân viên bấm xác nhận.

### Các bước

1. **Liên kết tài khoản ngân hàng** trong SePay. Phải là **đúng tài khoản** sẽ điền ở bước 4 — mã
   QR sinh từ nó, và webhook cũng bắn từ nó.

2. **Mở đường hầm ra Internet**:

   ```bash
   ngrok http 8081
   # hoặc
   cloudflared tunnel --url http://localhost:8081
   ```

3. **Tạo webhook** trong SePay:

   - URL: `https://<đường-hầm>/api/payments/webhooks/sepay`
   - Kiểu xác thực: **API Key**

   SePay sẽ gửi kèm header `Authorization: Apikey <khoá>` — máy chủ so **đúng cả tiền tố** đó.

4. **Điền vào máy chủ**.

### Điền vào `backend-java/.env`

```dotenv
PAYMENTS_SEPAY_APIKEY=…              # khoá webhook

# Tài khoản nhận tiền — dùng để sinh mã QR.
# CHỈ khai ở đây. Hai bản sao sẽ trôi khỏi nhau, và khi đó QR chỉ khách
# một tài khoản còn đối soát trông chờ tài khoản khác: tiền vào mà không
# đơn nào được đánh dấu đã trả.
PAYMENTS_VIETQR_BANKID=MB
PAYMENTS_VIETQR_ACCOUNTNUMBER=0123456789
PAYMENTS_VIETQR_ACCOUNTNAME=NGUYEN VAN A
```

### Nội dung chuyển khoản phải giữ nguyên

Hệ thống khớp tiền với đơn bằng cách tìm `CMC ORD-1234` trong nội dung chuyển khoản
(`BankTransferReconciler`, biểu thức `CMC\s+(ORD-\d+)`).

Mã QR đã điền sẵn chuỗi này, nhưng nếu khách **tự sửa nội dung** thì tiền vào tài khoản mà **không
đơn nào được đánh dấu đã trả** — hỏng âm thầm, không có gì báo động.

Hệ thống đọc **cả** trường `content` lẫn `description`, vì ngân hàng khác nhau điền vào chỗ khác
nhau.

---

## 4. Kiểm tra đã chạy chưa

| Phần | Cách thử | Dấu hiệu đúng | Chưa cấu hình |
|---|---|---|---|
| Firebase | Đăng ký trong app bằng số thử | Tạo được tài khoản | `PHONE_VERIFY_NOT_CONFIGURED` |
| Google | Mở màn đăng nhập trong app | Nút "Tiếp tục với Google" hiện ra | Nút bị ẩn (cố ý) |
| SePay | Bấm **Gửi thử** trong màn webhook của SePay | `success: true` | `SEPAY_WEBHOOK_NOT_CONFIGURED` |

Khoá SePay sai hoặc thiếu header → `SEPAY_KEY_INVALID`.

Nút Google bị ẩn là **cố ý**: thà không có nút còn hơn một nút bấm vào chỉ nhận lỗi cấu hình.

---

## Vì sao cả ba đều "tắt an toàn"

Chưa cấu hình thì từ chối mọi lời gọi, chứ không chạy ở chế độ bỏ qua kiểm tra.

Với SePay điều này quan trọng nhất: không có khoá thì không phân biệt được webhook thật với webhook
giả, mà nhận nhầm một cái giả nghĩa là **đánh dấu đơn đã trả tiền khi không có đồng nào vào tài
khoản**.

Cùng luật đã đặt cho `AI_INTERNAL_TOKEN` và `GOOGLE_CLIENT_ID`.

---

## Điều cần biết trước khi cấu hình Firebase

Cấu hình xong thì **backend nhận được, nhưng app chưa có màn nào để dùng nó**. Luồng nhập số →
nhận OTP → đặt mật khẩu ở phía app **chưa làm** — mới xong backend.

Nên bước kiểm tra Firebase ở trên chỉ chạy được sau khi phần app xong. Google và SePay thì cấu hình
xong là dùng được ngay.
