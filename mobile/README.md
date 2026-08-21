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

## Ước lượng thời gian (#10): app không được bịa con số

Backend chỉ ước lượng khi món đã có **từ 20 mẫu lịch sử**, luôn trả **khoảng** (p25–p75), và cộng
thêm độ sâu hàng đợi bếp. Dưới ngưỡng đó nó trả `null` thay vì đoán.

Đo trên hệ thống đang chạy:

```
ORD-1016 · Bánh cuốn Thanh Trì · status=Pending · ước lượng = null-null
order_items có ready_at → 0 dòng
```

Nên **null là trạng thái bình thường**, không phải lỗi tải. App hiện **không gì cả** — không
"đang tính", không "khoảng 15 phút".

Nhóm gốc đã cố ý không làm tính năng này: *"một ước lượng sai làm mất lòng tin hơn là không có
ước lượng"*. Ba điều kiện của #10 tồn tại để quyết định đó không bị lặp lại một cách mù quáng —
và một con số bịa ở tầng app phá đúng cả ba mà không ai thấy.

`moTaUocLuong` cũng không hiện `"10-10 phút"` khi khoảng suy biến: nó nói `"khoảng 10 phút"`, vì
một khoảng rộng 0 phút đọc như một con số chắc chắn.

## Huỷ món (#11): hai điều kiện, không phải một

```
token đơn ĐÚNG,  món Pending    → 200
token đơn SAI                   → 404 ORDER_NOT_FOUND
token BÀN thay token đơn        → 404 ORDER_NOT_FOUND
token đúng,      món Preparing  → 400 ORDER_ITEM_CANCEL_NOT_ALLOWED
```

**Điều kiện 1 — món phải đang `Pending`.** Backend chặt hơn đường của nhân viên *có chủ ý*: nhân
viên vẫn huỷ được món `Preparing`, khách thì không, vì tới lúc đó bếp đã dùng nguyên liệu.

**Điều kiện 2 — máy phải có `X-Order-Token` của đúng đơn đó.** Token bàn **không** dùng thay được
(đo ở trên: 404). Backend chỉ trả token này **một lần**, lúc tạo đơn, nên app cất nó vào
Keychain/Keystore ngay khi đặt xong và xoá khi rời bàn.

Hệ quả với người dùng: đơn do **máy khác** trong bàn đặt thì máy này **không hiện nút huỷ**. Đó là
đúng — người đặt mới là người quyết định huỷ — và tốt hơn một nút bấm vào rồi báo lỗi.

Khoá **theo từng món**, không theo cả đơn: đo thật, huỷ được món 1 trong khi món 2 cùng đơn vẫn
`Pending`.

Token sai và đơn không tồn tại **trả cùng một mã** — cố ý, vì mã đơn tăng dần nên xác nhận
"ORD-1002 có thật" đã là rò rỉ. Câu thông báo của app phải phủ được cả hai nghĩa.

## Trợ lý AI: gợi ý là NÚT BẤM, không phải hành động

Backend chỉ chuyển tiếp gợi ý có `requiresCustomerConfirmation == true` — `ChatService
.toCartActions` lọc thẳng, nên **mọi** gợi ý app nhận được đều là "hỏi khách".

App tôn trọng đúng điều đó: món gợi ý hiện thành thẻ có nút **Thêm**, và nút đó gọi đúng API giỏ
hàng như khi khách tự chọn món. Tự thêm là **tiêu tiền của khách theo lời một mô hình ngôn ngữ**.

Màn hình còn nói thẳng: *"Bấm để thêm vào giỏ — trợ lý không tự thêm gì cả."* Không có dòng đó,
một danh sách món kèm nút bấm rất dễ đọc như "đã chọn giúp bạn".

### 9,8 giây cho một câu trả lời

Đo trên hệ thống đang chạy:

```
POST /api/chat/sessions/{id}/messages   → HTTP 200 · 9.81s
6 gợi ý giỏ, tất cả requiresCustomerConfirmation=true
```

Hệ quả thiết kế:

- **Thời gian chờ 60 giây**, không phải 5–10. Đặt ngắn sẽ giết đúng những câu trả lời hợp lệ;
  không đặt gì thì `package:http` treo vô hạn khi dịch vụ AI chết.
- **Nói rõ đang chờ**: *"Trợ lý đang xem thực đơn…"* thay vì một vòng quay im lặng — 10 giây im
  lặng đọc như app treo.

### `charset=utf-8` là bắt buộc

Thiếu nó, câu hỏi tiếng Việt có dấu bị đọc sai byte:

```
400  HttpMessageNotReadableException: JSON parse error: Invalid UTF-8 middle byte 0x69
```

Gặp thật khi đo bằng curl. Có phép kiểm chốt header này.

### Chặn câu rỗng ở app

Backend trả `CHAT_MESSAGE_EMPTY`, nhưng **một lượt hỏng vẫn tính vào hạn mức 10 tin/phút**. Chặn ở
app giữ hạn mức lại cho câu hỏi thật.

### Giới hạn tốc độ không phải "lỗi"

`CHAT_RATE_LIMITED` → *"Bạn hỏi hơi nhanh. Chờ một chút rồi hỏi tiếp nhé."* Khách không làm gì
sai. Có phép kiểm chặn cả việc câu thông báo chứa chữ "lỗi".

Tương tự, `AI_PROVIDER_UNAVAILABLE` chỉ ra **lối thoát có thật** (xem thực đơn, gọi nhân viên) chứ
không bảo "thử lại" — trợ lý chết thì thử lại cũng chết.

### Dùng đường không streaming

Web dùng SSE làm đường chính (#95) để chữ hiện dần. App dùng đường thường: nó là API hạng nhất,
kiểm được bằng `MockClient`, và không phải phân tích khung SSE trong Dart. Đánh đổi thật: khách
nhìn vòng quay thay vì thấy chữ chạy.

### Phiên dùng lại thì giữ nguyên lịch sử

`reused: true` nghĩa là bàn đã có phiên chat và backend dùng lại nó. App **không** xoá màn hình
rồi chào lại từ đầu — khách quay lại giữa cuộc trò chuyện của chính mình.

## Lịch sử đơn qua nhiều lần ghé (#33)

`orders` **không có** cột `member_id`. Đường nối là `orders → table_sessions.member_id`, thứ mà
#26 dựng lên — và §9.4 đã nói trước rằng chính nó mở khoá lịch sử đơn theo tài khoản.

```
GET /api/orders/mine   (JWT của khách)

ORD-1019 · bàn T27 · 80.000đ  · 1x Bún bò Huế
ORD-1018 · bàn T26 · 110.000đ · 2x Bánh cuốn Thanh Trì
```

Hai đơn, **hai bàn khác nhau** — đó là cả điểm của tính năng.

| Ai gọi | Kết quả |
|---|---|
| Chưa đăng nhập | 401 |
| Vai `Staff` | 403 |
| Khách khác | 0 đơn |
| Thêm `?memberId=` của người khác | **0 đơn** |

Uỷ quyền bằng **JWT**, không phải token bàn: đây là dữ liệu của *tài khoản*, ngược hẳn với
`GET /api/table-sessions/{id}/orders`.

### Truy vấn native — một đánh đổi có ý thức

JPQL sẽ phải import `TableSessionEntity` vào tầng persistence của Orders, tức Orders biết module
Tables lưu trữ bằng lớp nào. Cách còn lại là dựng một cổng mới chỉ để hỏi *"phiên nào thuộc thành
viên này"* — ba tệp cho đúng một câu truy vấn.

Chọn native: nó ràng buộc Orders vào **schema** của Tables (tên bảng, tên cột), không ràng buộc
vào **mã**. ArchUnit không bắt được kiểu ràng buộc này, nên nó được ghi thẳng vào Javadoc thay vì
để người sau tự phát hiện.

## Đặt lại món cũ: từng món một, và báo cả hai danh sách

Thực đơn đổi giữa hai lần ghé là chuyện bình thường — món cũ có thể đã ngừng bán. **Dừng ở món
đầu tiên hỏng** nghĩa là khách mất luôn những món vẫn còn, trong khi họ chỉ muốn gọi lại bữa cũ.

Nên `datLaiDon` thêm từng món, không dừng khi một món hỏng, và trả về **cả** danh sách đã thêm
**lẫn** danh sách không thêm được. Báo *"đã thêm vào giỏ"* rồi im lặng bỏ ba món là nói dối; khách
chỉ phát hiện lúc nhìn hoá đơn.

**Tuần tự, không song song** — có phép kiểm đếm số lời gọi chạy đồng thời. Giỏ hàng dùng DELTA và
mọi lời gọi cùng sửa một giỏ; gửi song song là tự tạo tranh chấp trên đúng thứ không idempotent.

**Bỏ qua món đã huỷ** ở đơn cũ: khách đã chủ động bỏ nó lần trước, thêm lại là làm ngược ý họ.

## Cổng mới: biểu thức `@PreAuthorize`

Spring Security phân giải chuỗi trong `@PreAuthorize` bằng SpEL **lúc chạy**. Một biểu thức hỏng
như `hasRole(Customer)` (thiếu nháy) biên dịch sạch, Checkstyle sạch, và chỉ nổ ở request đầu tiên:

```
IllegalArgumentException: Failed to evaluate expression 'hasRole(Customer)'  → HTTP 500
```

Đã xảy ra **hai lần** trong repo này, cả hai vì shell nuốt mất dấu nháy đơn khi sinh mã, và cả hai
chỉ phát hiện được nhờ gọi thật. `PreAuthorizeExpressionTest` quét mã nguồn và biến nó thành lỗi
lúc build. Phép kiểm còn có một ca **kiểm chính biểu thức chính quy của nó** — một mẫu viết sai sẽ
làm cổng luôn xanh và thành đồ trang trí.

## Đổi điểm lấy ưu đãi (#34): ba lớp bảo vệ

Đây là chỗ duy nhất trong app khách **tiêu** thứ họ đã tích cả tháng. DoD của issue nói rõ:
*"endpoint redeem trừ điểm có khoá chống tranh chấp"*.

| Lớp | Chặn chuyện gì |
|---|---|
| `Idempotency-Key` bắt buộc | Bấm hai lần lúc mạng chập chờn không tiêu điểm hai lần |
| `UPDATE … where points >= :chiPhi` | Hai request **song song** không thể cùng trừ |
| `UNIQUE` trên `idempotency_key` | Chốt cuối ở tầng CSDL, giữ được cả khi hai tiến trình cùng vượt qua lớp 1 |

Đo thật, hai request song song với số dư đúng 60 và ưu đãi 60 điểm:

```
r1: ĐỔI ĐƯỢC · số dư 0
r2: TỪ CHỐI  · LOYALTY_NOT_ENOUGH_POINTS
điểm trong DB: 0        ← không âm
```

Và cùng khoá gửi hai lần:

```
lần 1: red_9f2ebf94… · số dư 140
lần 2: red_9f2ebf94… · số dư 140    ← cùng redemptionId, chỉ trừ một lần
```

### Vì sao `UPDATE` có điều kiện chứ không `@Version`

Phần Orders dùng `@Version` vì bản ghi ở đó bị nhiều bên sửa vì nhiều lý do khác nhau, nên cần
phát hiện *"ai đó đã đổi trong lúc bạn đọc"*. Ở đây chỉ có **một** phép biến đổi (trừ điểm) và
**một** điều kiện (đủ điểm) — một câu UPDATE có điều kiện vừa mạnh hơn vừa **không bao giờ đỏ
oan**, nên không cần vòng thử lại.

Đánh đổi: trả về 0 dòng **không phân biệt** "không đủ điểm" với "thua tranh chấp". Với khách hai
thứ nói cùng một điều, và số dư đọc lại mới là con số thật.

### Sổ ghi, không chỉ trừ số

`loyalty_redemptions` (V10) lưu **bản sao** tên ưu đãi và số điểm **tại thời điểm đổi**. Quán đổi
tên hay ngừng một ưu đãi là chuyện thường; sổ phải kể đúng thứ khách đã nhận *lúc đó*.

Không có sổ thì điểm biến mất mà không ai đối chiếu được — khách nói *"tôi mất 200 điểm mà chưa
nhận gì"* và quầy không có gì để tra.

### Lỗi tìm được khi đo: phản hồi trả số dư **cũ**

```
DB sau khi đổi:        140 điểm  ✓
phản hồi soDuMoi:      200 điểm  ✗
```

Dữ liệu đúng, sổ đúng, chỉ **con số báo về** sai. Nguyên nhân: `@Modifying` đi thẳng xuống CSDL và
**không đụng persistence context**, nên lượt đọc ngay sau đó trả entity còn nằm trong cache bậc
một. Khách nhìn thấy số dư không đổi và sẽ bấm đổi lần nữa.

Sửa bằng `@Modifying(clearAutomatically = true, flushAutomatically = true)`. Đo lại: phản hồi 80,
DB 80.

### Hộp xác nhận nói rõ số điểm

Nút "Đổi" nằm cạnh nhiều dòng ưu đãi giống nhau. Hộp thoại nêu **tên ưu đãi**, **số điểm sẽ trừ**,
và *"không hoàn tác được"* — cùng nguyên tắc với hộp xác nhận ở #19, nhưng ở đây thứ bị tiêu là
điểm chứ không phải tiền mặt.

## §9.8 hồ sơ AI bền vững: làm được một nửa

#35 gồm hai nửa, và chỉ một nửa thuộc phạm vi môn Lập trình di động.

### Làm được: "Món tôi hay gọi"

§9.8 nói thẳng phần này **không cần cơ chế mới** — chỉ là truy vấn lịch sử `Order` theo
`MemberId`, thứ đã có từ #26/#33. `GET /api/orders/mine/favourites`.

Đo trên hệ thống đang chạy, ba lần ghé:

```
Bánh cuốn Thanh Trì · 3 lần · tổng 3 phần
Cơm hến Huế         · 1 lần · tổng 8 phần
Bún bò Huế          · 1 lần · tổng 1 phần
```

**Xếp theo SỐ LẦN gọi, không theo tổng số phần.** Một người gọi bánh cuốn ba lần "hay gọi" nó hơn
người từng gọi tám phần cơm hến trong đúng một bữa liên hoan. Sắp theo tổng số lượng sẽ cho ra
danh sách của bữa tiệc đó, không phải thói quen của khách.

App còn **lọc bỏ món chỉ gọi một lần**: một lần là một lần thử, không phải thói quen. Hiện nó dưới
nhãn *"Món bạn hay gọi"* sẽ khiến danh sách đầy những món khách ăn thử rồi thôi.

Khối này là **phần phụ** của màn hình lịch sử: lời gọi hỏng thì nuốt lỗi và vẫn hiện lịch sử, chứ
không làm hỏng cả màn hình vì một tính năng thứ yếu.

### CHƯA làm được: hồ sơ AI bền vững

§9.8 thiết kế bảng `CustomerProfileFact` — cùng hình dạng `ChatSessionFact` nhưng khoá theo
`MemberId` và **không bị xoá khi bàn đóng** — cộng logic *promote* (chép fact dị ứng/ăn chay/độ
cay sang hồ sơ bền vững khi phiên chat đóng) và *seed* (nạp lại fact cũ vào phiên chat mới).

Hiện trạng đo được:

```
chat_session_facts       → có   (kind, value, confidence, khoá theo chat_session_id)
customer_profile_facts   → KHÔNG có
```

Không có bảng đó thì **không có gì để app hiển thị**. Và §9.8 phân công rõ:

> *"bảng/logic promote-seed là backend + AI-service (Python), không tính vào môn Lập trình di
> động — việc của Flutter chỉ là hiển thị"*

Nên phần này bị chặn bởi công việc thuộc môn khác, không phải bởi thời gian. Dựng một màn hình
đọc bảng chưa tồn tại, hoặc tự suy ra "dị ứng" từ lịch sử đơn, đều là bịa dữ liệu về sức khoẻ
khách — thứ §9.8 đã cảnh báo riêng:

> *"đây là lớp cá nhân hoá tiện lợi, **không thay thế** cơ chế chặn cứng theo nhãn dị nguyên của
> món (hạn chế #7 — mới phủ 44/91 món)"*

## Test app kiểu gì

Ba mức, theo thứ tự rẻ → đắt.

### Mức 1 — chạy 198 ca kiểm, không cài gì (≈33 giây)

Không cần Flutter trên máy. SDK nằm trong Docker volume:

```bash
docker volume create flutter-sdk && docker volume create pub-cache
# lần đầu: clone SDK vào volume (~880 MB)
docker run --rm -v flutter-sdk:/sdk debian:bookworm-slim sh -c \
  'apt-get update -qq && apt-get install -y -qq git curl unzip xz-utils zip libglu1-mesa && \
   git clone --depth 1 -b stable https://github.com/flutter/flutter.git /sdk/flutter'

# từ đó về sau:
docker run --rm -v "$PWD/mobile:/app" -v flutter-sdk:/sdk -v pub-cache:/root/.pub-cache \
  -w /app ghcr.io/cirruslabs/flutter:stable \
  sh -c 'export PATH=/sdk/flutter/bin:$PATH; flutter test'
```

Kiểm được: luật hết hạn token, khoá idempotency, nhóm thực đơn, nhãn trạng thái, và widget test
cho các màn hình chính.

**Không kiểm được:** giao diện thật, ảnh có tải không, app có nói chuyện được với backend không.

### Mức 2 — cài lên điện thoại thật

APK dựng ở CI và **giữ lại 14 ngày** dưới dạng artifact.

1. Mở tab **Actions** của repo → chọn lần chạy bất kỳ đã xanh → tải **`app-debug-apk`**.
2. Chép APK vào điện thoại, bật *"Cài từ nguồn không xác định"*, cài.
3. Mở app → màn hình **Máy chủ** hiện ra ngay lần đầu → gõ IP LAN của máy chạy backend
   (Windows: `ipconfig`; macOS/Linux: `ifconfig`), ví dụ `192.168.1.5`.
4. Bấm **Kiểm tra kết nối** — nó gọi thật `GET /api/health`.

Điện thoại và máy chủ **phải cùng một wifi**. Ô địa chỉ ảnh tự đi theo ô API (cổng 8080), sửa
được nếu triển khai khác.

> Vì sao cần màn hình này thay vì `--dart-define`: `--dart-define` là **compile-time**. APK dựng ở
> CI mang sẵn `10.0.2.2` — địa chỉ chỉ có nghĩa **bên trong máy ảo Android**. Muốn mỗi lần đổi
> mạng lại dựng một APK riêng thì phải có máy dựng được APK, thứ mà máy phát triển của dự án này
> không có.

Đổi máy chủ sẽ **thoát phiên bàn và đăng nhập**: token do máy chủ cũ cấp không dùng được ở máy
chủ mới, và giữ lại chỉ tạo ra một loạt 401 khó hiểu.

### Mức 3 — máy ảo Android

Cần cài trên Windows: Android Studio + emulator + Flutter SDK (~5–6 GB). Emulator chạy native nên
không bị giới hạn RAM của Docker. Địa chỉ mặc định `10.0.2.2:8081` đúng sẵn cho máy ảo.

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8081 \
            --dart-define=IMAGE_BASE_URL=http://10.0.2.2:8080
```

### Backend phải chạy trước

```bash
cd deploy && docker compose -f docker-compose.java.yml -p cmc-restaurant-java-local up -d
curl http://localhost:8081/api/health     # {"status":"ok"}
```
