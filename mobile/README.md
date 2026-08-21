# Ứng dụng di động (Flutter)

Môn Lập trình ứng dụng di động — kế hoạch ở `docs/pm/KE_HOACH_HOC_KY_2026-2.md` §9.

Hiện thực hiện WBS §9.10 **M1 mục 1**: đăng nhập và lưu JWT an toàn trên thiết bị.

## Gọi vào backend nào

**Backend Java, tất cả các module.**

Đề bài #25 ghi "gọi bản .NET hiện có". Câu đó đã lỗi thời: `backend/` bị xoá ở #59, và §9.9 của
kế hoạch đã được sửa ngày 2026-08-20 thành một dòng duy nhất — Flutter gọi backend Java. App chỉ
cần **một** `API_BASE_URL`, giống hệt `ordering-web`.

## Chạy

```bash
flutter pub get --enforce-lockfile
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8081
```

`10.0.2.2` là địa chỉ máy chủ **nhìn từ máy ảo Android** — `localhost` trong máy ảo trỏ về chính
máy ảo. Trên thiết bị thật, dùng IP LAN của máy chạy backend.

Cổng `8081` là cổng backend Java trong `docker-compose` bản local.

## Contract đăng nhập (đo từ backend đang chạy, không phải chép từ tài liệu)

```
POST /api/auth/login   {"email":..., "password":...}

200 {"accessToken":"eyJhbGciOiJIUzM4NCJ9...",
     "expiresAt":"2026-08-20T15:24:15.752877577Z",
     "user":{"userId":..,"fullName":..,"email":..,"role":"Customer"}}

401 {"error":{"code":"INVALID_CREDENTIALS","message":"Email or password is incorrect.","details":{}}}
```

Hai điểm chỉ lộ ra khi gọi thật:

- `expiresAt` có **9 chữ số thập phân** (`Instant` của Java in tới nanosecond). `DateTime` của
  Dart chỉ tới microsecond nên cắt 3 chữ số cuối. Bộ kiểm dùng đúng chuỗi này.
- `message` trong thân lỗi là **tiếng Anh, viết cho lập trình viên**. App dịch theo `code` chứ
  không hiển thị `message`, vì `code` là phần backend cam kết giữ ổn định.

## Cất token ở đâu và vì sao

| Quyết định | Lý do |
|---|---|
| `flutter_secure_storage`, không phải `SharedPreferences` | `SharedPreferences` là file XML thường; trên máy đã root hoặc qua `adb backup` thì đọc được bằng mắt. JWT ở đây thay được cả mật khẩu cho tới lúc hết hạn. |
| Android: `encryptedSharedPreferences: true` | Không bật cờ này, thư viện rơi về `SharedPreferences` thường — mất đúng thứ mà cả lớp lưu trữ này sinh ra để có. |
| iOS: `first_unlock_this_device` | Mặc định của Keychain cho phép mục dữ liệu đi theo bản sao lưu iCloud và **sống lại trên máy khác**. Token của quán ăn không có lý do tồn tại trên thiết bị khách chưa từng đăng nhập. |
| Hết hạn thì **xoá**, không chỉ bỏ qua | Token hết hạn nằm lại trong Keychain là một chuỗi bí mật không dùng được nhưng vẫn đọc được nếu máy rơi vào tay người khác. |
| `toString()` không in token | `toString()` bị gọi ở chỗ không ai ngờ: `print(session)` lúc gỡ lỗi, log Flutter khi widget ném lỗi, báo cáo sự cố gửi lên dịch vụ ngoài. |
| Bật lint `avoid_print` | Log Flutter đi thẳng vào logcat, `adb logcat` đọc được bất cứ lúc nào. |

## Biên an toàn trước hạn token

`AuthSession.conHieuLuc()` coi token là hết hạn **sớm hơn 1 phút** so với `expiresAt` thật.

Token còn đúng 20 giây thì không dùng được: request bay đi, mạng 3G trong quán mất 2–3 giây, tới
nơi thì token đã chết và khách nhận 401 giữa lúc đang đặt món.

## Chưa làm ở #25

Đăng ký tài khoản trong app (`POST /api/auth/register` đã có ở backend, app chưa có màn hình),
làm mới token, và toàn bộ M1 mục 2–4 (phiên bàn gắn `MemberId`, điểm thưởng, menu) — #26–#28.

## Cổng chặn trên CI

`ci-mobile.yml` có hai job, cả hai đều chặn được merge (không job nào có `continue-on-error`):

| Job | Máy | Kiểm gì |
|---|---|---|
| `mobile-build` | `ubuntu-latest` | `pub get --enforce-lockfile`, `dart format --set-exit-if-changed`, `flutter analyze --fatal-infos`, `flutter test`, `flutter build apk --debug` |
| `mobile-build-ios` | `macos-latest` | `pub get --enforce-lockfile`, `flutter build ios --debug --no-codesign` |

**Vì sao iOS cần máy riêng:** dựng iOS bắt buộc macOS + Xcode. Đây *không* phải giới hạn của Dart
hay Flutter — mã Dart giống hệt nhau ở cả hai nền tảng; chỉ khâu biên dịch cuối và CocoaPods là
của Apple. Runner macOS của GitHub miễn phí cho repo public, mà repo này public.

`--no-codesign` vì ký cần chứng chỉ Apple Developer, và chứng chỉ không được nằm trong repo —
cùng lý do job Android chỉ dựng bản debug. Bỏ khâu ký vẫn chạy trọn phần dễ hỏng nhất: CocoaPods
phân giải pod của `flutter_secure_storage`, rồi Xcode biên dịch toàn bộ mã Dart + Swift.

**Flutter được ghim ở 3.47.1** ở cả hai job. `channel: stable` là mục tiêu di động còn
`--enforce-lockfile` đòi mục tiêu cố định; bốn gói `matcher`, `meta`, `test_api`, `vector_math`
do chính SDK ghim, nên đổi SDK là đổi phiên bản và lockfile hết khớp. Nâng Flutter phải là một
commit sửa cả hai nơi cùng lúc.

## Điểm thưởng: liên kết số điện thoại

Điểm thưởng nằm ở `loyalty_members`, **khoá theo số điện thoại**. Tài khoản app trước đây không có
gì nối sang đó, nên app không có cách nào biết điểm của khách.

Không thể dùng `GET /api/loyalty/lookup?phone=`: nó **chỉ dành cho nhân viên, có chủ ý**.
`LoyaltyController` ghi rõ lý do — ai gọi được cũng đếm được số nào là khách và tiêu bao nhiêu.

Cách làm: thêm `users.phone_number` (V9) và hai đường **không nhận số điện thoại từ request** ở
chiều đọc:

```
GET  /api/loyalty/me         → điểm của CHÍNH tài khoản này (role Customer)
POST /api/loyalty/me/phone   → nối số vào tài khoản
```

### Luật giữ cho tính năng không thành đường đọc điểm người khác

**Chỉ nối được số CHƯA có hồ sơ tích điểm.** Nếu cho khai số bất kỳ thì ai cũng khai số của người
khác rồi đọc điểm của họ — đúng lỗ hổng mà `/lookup` dựng lên để chặn.

Ba đánh đổi, nói thẳng chứ không giấu:

| Đánh đổi | Vì sao chấp nhận |
|---|---|
| **Khách cũ tự liên kết không được.** Ai đã tiêu tiền ở quán thì đã có hồ sơ, phải nhờ quầy nối hộ. | Đây là cái giá của việc không lộ điểm. Câu thông báo trong app nói thẳng việc cần làm, không chỉ báo "số đã tồn tại". |
| **Lời từ chối vẫn tiết lộ một bit:** "số này là thành viên". | Không đóng được nếu không xác thực số (OTP), mà hệ thống chưa có SMS. Giới hạn số lần thử theo tài khoản **không giúp gì** — ai cũng đăng ký tài khoản mới miễn phí, nên đó là màn kịch an ninh chứ không phải phòng thủ. |
| **Còn một khe hẹp:** khai trước số của người *chưa từng đến quán*, chờ họ tới ăn rồi đọc điểm. | Cần biết trước số của đúng một người chưa từng là khách. Hẹp, nhưng có thật — chỉ OTP mới đóng được. |

Phản hồi 409 **không chứa số điểm**: lời từ chối buộc phải lộ một bit, nhưng không được lộ thêm gì
nữa — nhất là đúng thứ cần bảo vệ.

`MyLoyaltyResponse` **không trả `lifetimeSpend`**: màn hình không dùng tới, và tổng chi tiêu nhạy
hơn số điểm. Trường nào không cần thì không gửi.

Nhân viên vẫn dùng `/api/loyalty/lookup` như cũ — không đổi gì ở đó.

## Thực đơn và ảnh món

`GET /api/menu` **công khai và không cần đang ở bàn** — đó là khác biệt thật giữa app và web QR:
web chỉ mở thực đơn sau khi quét mã bàn, app cho xem trước ở nhà.

Phản hồi trả **hai danh sách phẳng, tách rời** (`categories`, `items`), không lồng nhau — việc
nhóm là của client. Ba luật trong `nhomTheoDanhMuc`, mỗi luật có phép kiểm:

- giữ **nguyên thứ tự danh mục** máy chủ trả về (khai vị trước, tráng miệng sau — không phải thứ
  tự bảng chữ cái);
- **bỏ danh mục rỗng** (tiêu đề không có món nào bên dưới trông như lỗi tải);
- **không đánh rơi món mồ côi** — món có `categoryId` không khớp danh mục nào vẫn hiện, gom vào
  khối "Món khác". Lặng lẽ bỏ đi nghĩa là một món có thật biến mất vì lỗi dữ liệu ở chỗ khác, và
  không ai thấy gì để sửa.

Món **đang hết vẫn hiện**, chỉ đánh dấu. Lọc đi thì khách tưởng quán không bán món đó.

### Ảnh món không do API phục vụ

Đo trên hệ thống đang chạy:

```
GET :8081/menu-images/04-banh-cuon-thanh-tri.webp  → 401   (API Spring)
GET :8080/menu-images/04-banh-cuon-thanh-tri.webp  → 200   (container web)
```

Nên app có **hai** base URL:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:8081 \
  --dart-define=IMAGE_BASE_URL=http://10.0.2.2:8080
```

Ghép nhầm ảnh vào base API thì thực đơn hiện ra trắng trơn **mà không có lỗi nào để lần theo** —
widget ảnh chỉ lặng lẽ hiện ô trống.

## Xem đơn chỉ đọc

`GET /api/table-sessions/{id}/orders`, uỷ quyền bằng **`X-Table-Session-Token`, không phải JWT**.
Đó là chủ ý của backend: đơn thuộc về cái **bàn**, không thuộc về tài khoản — ai đang ngồi ở bàn
đều xem được, kể cả khách vãng lai đi cùng, đúng như web.

Đo thật: token đúng → 200; token sai → 401 `TABLE_SESSION_TOKEN_INVALID`; không token → 401.

Nhãn trạng thái là chỗ dễ nói sai nhất với khách, nên tách thành hàm thuần có phép kiểm:

- `Ready` = *"Nấu xong, chờ mang ra"*, **không phải** "Hoàn tất" — dịch sai sẽ khiến khách tưởng
  có thể đứng dậy đi về trong khi món còn ở bếp.
- `Served` **chưa phải** đã xong: món đã ra bàn nhưng hoá đơn vẫn mở.
- `Pending` ở cấp **món** là *chờ nấu*, khác hẳn `Pending` ở cấp thanh toán (*chờ thu tiền*).
- Trạng thái **lạ trả nguyên văn**, không nuốt thành "Đang xử lý": backend có thể thêm trạng thái
  mới trước khi app kịp cập nhật, và một câu chung chung sẽ giấu mất chuyện đó.

Màn hình này **không có nút huỷ món và không có nút thanh toán** — hai việc đó ở #31 và #30. Dựng
sẵn nút rồi để nó không làm gì là cách chắc chắn để khách bấm và tưởng đã huỷ được món.

## Giỏ hàng và đặt món: hai cơ chế khác nhau, đừng nhầm

| | Giỏ hàng | Tạo đơn |
|---|---|---|
| Thân | `{menuItemId, delta}` — **cộng dồn** | `{menuItemId, quantity}` — **tuyệt đối** |
| Gửi lại có an toàn không | **KHÔNG** | **Có**, nhờ `Idempotency-Key` |

Đo trên hệ thống đang chạy:

```
POST .../cart/items {"menuItemId":"m_004","delta":2}   → itemCount=2
POST .../cart/items {"menuItemId":"m_004","delta":2}   → itemCount=4   ← cộng dồn
```

Nên `HttpCartApi` **không tự gửi lại** khi lỗi mạng, và không có chỗ nào để bật lại. Khi một lời
gọi hỏng mà không rõ máy chủ đã nhận hay chưa, việc đúng là **đọc lại giỏ** (`GET`) và hiện sự
thật — chứ không đoán rồi gửi thêm một delta nữa.

Cùng lý do, màn hình giỏ **không cập nhật lạc quan**. Ở màn vận hành (#19) cập nhật lạc quan là
đúng vì thao tác idempotent; ở đây nếu đoán sai thì con số lệch hẳn với máy chủ và khách sẽ bấm
thêm để "sửa", làm lệch thêm.

### `Idempotency-Key` gắn với NỘI DUNG GIỎ, không gắn với lần bấm

`POST /api/orders` **bắt buộc** có header này. Hai cách làm sai đều có hậu quả thật:

- **sinh khoá mới mỗi lần gửi** → mạng chập chờn, khách bấm lại, bếp nhận **hai đơn giống hệt**.
  Đó đúng là tình huống header này sinh ra để chặn;
- **giữ nguyên khoá sau khi giỏ đổi** → `409 IDEMPOTENCY_KEY_REUSED`, khách nhận lỗi khó hiểu cho
  việc họ làm hoàn toàn đúng.

Đo thật:

```
POST /api/orders  khoá K, giỏ 4 phần  → 201  ORD-1016
POST /api/orders  khoá K, giỏ 4 phần  → 201  ORD-1016   ← cùng đơn, không tạo đơn thứ hai
POST /api/orders  khoá K, giỏ 1 phần  → 409  IDEMPOTENCY_KEY_REUSED
thiếu hẳn header                      → 400  IDEMPOTENCY_KEY_REQUIRED
bảng orders                           → 1 dòng
```

Lần gửi lại trả **201**, không phải 200 — client nhận cả hai, nhưng con số đo được là 201.

Khoá được **quên sau khi đơn tạo xong**: khách gọi thêm đúng món cũ là chuyện rất thường, và giữ
khoá cũ sẽ khiến backend trả lại chính đơn cũ — khách thấy "thành công" mà bếp không nhận gì thêm.

### Đơn tại bàn đòi cả `tableCode` lẫn `qrToken`

Chỉ gửi `tableSessionId` là **không đủ**, dù nó đã xác định đúng một cái bàn:

```
thiếu tableCode → 400 DINE_IN_TABLE_REQUIRED
thiếu qrToken   → 400 QR_TOKEN_INVALID
```

Nên app **cất lại mã QR** cùng phiên bàn. Backend không trả nó về, app tự giữ thứ chính mình đã
gửi — và phải cất xuống máy, vì khách mở lại app rồi mới đặt món là luồng bình thường.

### Tự điền số điện thoại

§9.7 gọi đây là **tính năng lõi của app**, không phải điểm thưởng: khách gõ tay dễ sai, không kiểm
định dạng, không tra trùng. App đã có số đã liên kết (#27) nên bỏ hẳn bước gõ.

Chỉ gửi khi **thật sự có** — gửi chuỗi rỗng khác hẳn không gửi, backend sẽ coi đó là một số và tạo
hồ sơ tích điểm rác.

## Thanh toán: khách YÊU CẦU, nhân viên hoặc webhook XÁC NHẬN

Khách **không có quyền xác nhận đã trả tiền**. Đo thật:

```
POST .../invoice/payment/confirm  (token bàn)  → 401
```

Endpoint đó là `@PreAuthorize("hasAnyRole('CounterStaff','Staff','Admin')")`. Nên màn hình thanh
toán **cố ý không có nút "Tôi đã trả"** — một nút không làm gì sẽ khiến khách bấm rồi tưởng đã
xong và bỏ đi.

Sau khi yêu cầu, ai xác nhận:

| Cách trả | Ai xác nhận |
|---|---|
| COD | Nhân viên quầy, sau khi nhận tiền mặt (#19 có nút xác nhận hàng loạt) |
| VietQR | **Webhook Casso tự đối soát** (#3) khi tiền về |

### Nội dung chuyển khoản không được sửa

Casso đối soát bằng **đúng chuỗi** đó. Sửa một ký tự là tiền về mà hệ thống không nhận ra, và hoá
đơn nằm chờ tới khi có người xử lý tay. Nên app cho **chép** (`SelectableText` + nút copy) chứ
không cho sửa, và câu hướng dẫn viết hoa `GIỮ NGUYÊN` — có phép kiểm cho đúng chữ đó.

### Yêu cầu thanh toán khoá việc THÊM món, không khoá việc bớt

Đo thật sau khi yêu cầu COD:

```
thêm món  → 400 TABLE_INVOICE_PAYMENT_PENDING
bớt món   → 200, itemCount=0
```

Đó là chủ ý của backend: khách lỡ thêm nhầm mà không bớt được thì kẹt phải trả tiền cho nó. Câu
thông báo trong app nói đúng điều đó thay vì "giỏ đã khoá".

### Defect tìm được: thiếu cấu hình ngân hàng trả 500 không mã lỗi

Đo trên hệ thống đang chạy (chưa cấu hình VietQR):

```
POST .../invoice/payment-request {"method":"VietQR"}
→ HTTP 500  {"status":500,"error":"Internal Server Error"}
```

`PaymentService` (đường thanh toán theo **đơn**) đã bắt đúng ngoại lệ này và trả
`400 VIETQR_CONFIG_MISSING`. Đường theo **hoá đơn bàn** — chính là đường app dùng — thì không.
Client không có gì để nói với khách ngoài con số 500.

**Dữ liệu không hỏng:** `@Transactional` cuộn ngược mọi thay đổi. Tôi đã đoán rằng hoá đơn sẽ kẹt
ở `Pending` không có QR; đo lại sau hai lần 500 thì hoá đơn vẫn `NotRequested` và giỏ vẫn thêm
món được. Giả thuyết đó **sai** — ghi lại để người sau không đi sửa nhầm chỗ.

Đã sửa: bắt `IllegalStateException` và trả `400 VIETQR_CONFIG_MISSING`, khớp đường còn lại. Sau
khi sửa và dựng lại: `HTTP 400 · VIETQR_CONFIG_MISSING`.
