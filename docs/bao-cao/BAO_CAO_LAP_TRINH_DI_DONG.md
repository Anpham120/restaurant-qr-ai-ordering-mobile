# Báo cáo môn Lập trình ứng dụng di động

Ứng dụng Flutter cho hệ thống gọi món qua QR — `mobile/` trong kho
`Anpham120/restaurant-qr-ai-ordering-mobile`.

Kế hoạch gốc: `docs/pm/KE_HOACH_HOC_KY_2026-2.md` §9. Nhật ký thiết kế chi tiết: `mobile/README.md`.

## 1. Bài toán, và vì sao nó không phải "làm lại web trên mobile"

QR ordering trên web **cố ý ẩn danh và theo từng lượt**: mở phiên khi quét bàn, hết giá trị khi
rời quán. Đúng cho khách vãng lai, nhưng cấu trúc đó không cho phép bất cứ thứ gì cần **nhớ khách
qua nhiều lần ghé**.

Phát hiện nền tảng khi đọc mã: backend **đã có sẵn hạ tầng tài khoản khách hàng** —
`POST /api/auth/register` (role mặc định `Customer`), `POST /api/auth/login`, policy `CustomerOnly`
— nhưng **không luồng nào trong sản phẩm dùng nó**. App này là người dùng thật đầu tiên của hạ
tầng đang nằm không.

## 2. Số liệu

<!-- SINH:so-lieu-flutter -->

| Chỉ số | Giá trị |
|---|---|
| Flutter (ghim ở CI) | 3.47.1 |
| Dart SDK | `>=3.4.0 <4.0.0` |
| Tệp nguồn `.dart` (`lib/`) | 45 |
| Dòng mã nguồn | 5.859 |
| Tệp test | 22 |
| Dòng mã test | 3.193 |
| Ca kiểm (`test` + `testWidgets`) | 213 |
| Màn hình | 13 — `cart_screen`, `chat_screen`, `history_screen`, `login_screen`, `loyalty_screen`, `menu_screen`, `open_table_screen`, `orders_screen`, `payment_screen`, `promotions_screen`, `qr_scan_screen`, `server_settings_screen`, `theme` |
| Nhóm lớp lõi | 10 — `auth`, `cart`, `cau_hinh`, `chat`, `loyalty`, `menu`, `orders`, `payment`, `promotions`, `tables` |
| Phụ thuộc ngoài | 4 — `flutter_lints`, `flutter_secure_storage`, `http`, `mobile_scanner` |

> Bảng này SINH TỪ MÃ (`docs/build_bao_cao_lap_trinh_di_dong.py`), có cổng `--check` ở CI.
> Không đếm `mobile/android` và `mobile/ios`: đó là khung do `flutter create` sinh ra.

<!-- HET:so-lieu-flutter -->

## 3. Ba mốc, 11 mục việc

| Mốc | Issue | Nội dung |
|---|---|---|
| **M1** | #25–#28 | Đăng nhập + lưu JWT an toàn · phiên bàn gắn `MemberId` · điểm thưởng + khuyến mãi · thực đơn + xem đơn |
| **M2** | #29–#32 | Giỏ hàng + tạo đơn · thanh toán COD/VietQR · ước lượng thời gian + huỷ món · trợ lý AI |
| **M3** | #33–#35 | Lịch sử nhiều lần ghé + đặt lại món · đổi điểm lấy ưu đãi · món hay gọi |

## 4. Sáu defect ở backend, tìm được vì ĐO chứ không vì đọc

Đây là phần tôi cho là có giá trị nhất của môn học: mỗi lỗi dưới đây đều **biên dịch sạch**, qua
Checkstyle, và chỉ lộ ra khi gọi thật vào hệ thống đang chạy.

| Lỗi | Triệu chứng | Vì sao cổng cũ không bắt được |
|---|---|---|
| Nhân viên bị gắn làm chủ phiên bàn | `member_id` = id của nhân viên quét QR | Không có luật nào kiểm vai; §9.4 ghi "role Customer" nhưng mã nhận mọi vai |
| VietQR thiếu cấu hình → HTTP 500 | Thân lỗi mặc định của Spring, không mã | Đường thanh toán theo *đơn* đã bắt; đường theo *hoá đơn bàn* thì không |
| `@PreAuthorize` thiếu nháy (2 lần) | `Failed to evaluate expression 'hasRole(Customer)'` → 500 | SpEL phân giải **lúc chạy**, không phải lúc biên dịch |
| Số dư trả về từ cache cũ | DB 140 điểm, phản hồi 200 điểm | `@Modifying` không đụng persistence context |
| SQL thiếu nháy → tên cột | `column "cancelled" does not exist` → 500 | SQL native ngoài tầm trình biên dịch **và** ArchUnit |

Hai lỗi cuối cùng một nguyên nhân gốc: dấu nháy đơn bị shell nuốt lúc sinh mã. Sau lần thứ hai,
tôi dựng cổng `PreAuthorizeExpressionTest` quét mã nguồn; sau lần thứ ba (trong SQL) thì thêm một
ca tích hợp **chỉ để chốt rằng câu truy vấn native chạy được** — vì cổng SpEL không canh SQL.

## 5. Bảy quyết định thiết kế, và cái giá của phương án còn lại

### 5.1 Token cất ở Keychain/Keystore, không ở SharedPreferences

`SharedPreferences` là file XML thường: máy đã root hoặc `adb backup` là đọc được bằng mắt. JWT ở
đây thay được cả mật khẩu cho tới lúc hết hạn.

Hai chi tiết dễ mất im lặng: Android phải bật `encryptedSharedPreferences: true` (thiếu thì thư
viện **rơi về** SharedPreferences thường), và iOS phải dùng `first_unlock_this_device` (mặc định
Keychain cho token đi theo sao lưu iCloud và **sống lại trên máy khác**).

### 5.2 Biên an toàn một phút trước hạn token

Token còn đúng 20 giây thì không dùng được: request bay đi, mạng 3G trong quán mất 2–3 giây, tới
nơi token đã chết và khách nhận 401 **giữa lúc đang đặt món**.

### 5.3 Giỏ hàng không tự gửi lại, đơn hàng thì gửi lại được

Hai cơ chế ngược nhau, và nhầm là hỏng thật:

```
giỏ:  {menuItemId, delta}      cộng dồn   → gửi +2 hai lần = 4 phần (đo thật)
đơn:  {menuItemId, quantity}   tuyệt đối  → Idempotency-Key làm lần gửi lại vô hại
```

Nên lớp giỏ **không có đường gửi lại nào**, và màn hình giỏ **không cập nhật lạc quan** — ngược
với màn vận hành ở web, nơi thao tác idempotent nên đoán trước là đúng.

Khoá idempotency gắn với **nội dung giỏ**, không gắn với lần bấm: sinh khoá mới mỗi lần gửi là vô
hiệu hoá header trong khi vẫn gửi cho có, và bếp nhận hai đơn giống hệt nhau.

### 5.4 App không được bịa ước lượng thời gian

Backend chỉ ước lượng khi món có **từ 20 mẫu lịch sử**, luôn trả **khoảng**, và cộng độ sâu hàng
đợi bếp (hạn chế #10). Dưới ngưỡng thì trả `null`.

Phản xạ tự nhiên của người viết giao diện là điền một câu cho màn hình đỡ trống — *"đang tính"*,
*"khoảng 15 phút"*. Chính câu đó **vô hiệu hoá cả ba điều kiện**, trong khi màn hình trông đầy đủ
hơn trước. Nhóm gốc đã cố ý không làm tính năng này: *"một ước lượng sai làm mất lòng tin hơn là
không có ước lượng"*.

### 5.5 Trợ lý AI gợi ý, khách quyết định

Backend chỉ chuyển tiếp hành động có `requiresCustomerConfirmation == true`. App hiện chúng thành
**thẻ có nút Thêm**, và nút đó gọi đúng API giỏ như khi khách tự chọn. Tự thêm là **tiêu tiền của
khách theo lời một mô hình ngôn ngữ**.

Đo thật: một câu trả lời mất **9,81 giây**. Con số đó quyết định hai thứ — thời gian chờ đặt 60
giây (đặt 5–10s sẽ giết đúng câu trả lời hợp lệ), và phải nói rõ *"Trợ lý đang xem thực đơn…"* vì
10 giây im lặng đọc như app treo.

### 5.6 Ba lớp chống tiêu điểm hai lần

Đổi điểm là chỗ **duy nhất** trong app khách tiêu thứ họ tích cả tháng:

| Lớp | Chặn gì |
|---|---|
| `Idempotency-Key` | Cú bấm thứ hai của cùng một người |
| `UPDATE … where points >= :chiPhi` | Hai request **song song** |
| `UNIQUE` trên `idempotency_key` | Hai **tiến trình** cùng vượt qua lớp 1 |

Đo thật với số dư đúng 60 và ưu đãi 60 điểm: một request thành công, một bị từ chối, DB về 0 —
**không âm**.

Chọn `UPDATE` có điều kiện thay vì `@Version` (thứ phần Orders dùng) vì ở đây chỉ có **một** phép
biến đổi và **một** điều kiện: câu lệnh đơn giản hơn lại mạnh hơn và không bao giờ đỏ oan.

### 5.7 Từ chối làm nửa sau của §9.8

Hồ sơ AI bền vững cần bảng `customer_profile_facts`, **chưa tồn tại**, và §9.8 giao nó cho backend
+ AI-service. Chỗ duy nhất có sẵn dữ liệu là lịch sử đơn — nhưng suy *"khách này dị ứng gì"* từ
*"họ hay gọi món gì"* là **bịa dữ liệu sức khoẻ**, đúng thứ §9.8 dựng riêng một đoạn để chặn.

## 6. Cổng chặn

`ci-mobile.yml` có hai job, **cả hai đều chặn được merge**:

| Job | Máy | Kiểm gì |
|---|---|---|
| `mobile-build` | `ubuntu-latest` | `pub get --enforce-lockfile` · `dart format --set-exit-if-changed` · `flutter analyze --fatal-infos` · `flutter test` · `flutter build apk --debug` |
| `mobile-build-ios` | `macos-latest` | `pub get --enforce-lockfile` · `flutter build ios --debug --no-codesign` |

**Flutter ghim ở một phiên bản cụ thể**, không dùng `channel: stable`. Bốn gói `matcher`, `meta`,
`test_api`, `vector_math` do **chính SDK** ghim, nên khi `stable` nhích lên thì `--enforce-lockfile`
đỏ. Bỏ cờ đó sẽ làm CI xanh và làm lockfile vô nghĩa cùng lúc; ghim phiên bản biến việc nâng
Flutter thành một commit có chủ ý sửa cả hai nơi.

**iOS không phải giới hạn của ngôn ngữ.** Mã Dart giống hệt nhau; chỉ khâu biên dịch cuối và
CocoaPods là của Apple và bắt buộc macOS. Runner macOS của GitHub miễn phí cho repo public, nên
việc thiếu cổng iOS lúc đầu là một khoảng trống, không phải một ràng buộc kỹ thuật.

### Cách viết phép kiểm: mỗi luật phải **đỏ được**

Mọi PR trong loạt này đều gieo lỗi có chủ ý để chứng minh cổng phân biệt được đúng/sai. Ba ví dụ:

| Làm hỏng | Ca đỏ |
|---|---|
| Bịa *"khoảng 15 phút"* khi backend trả `null` | `KHÔNG có ước lượng thì trả null` |
| Sinh khoá idempotency mới mỗi lần gọi | `giỏ không đổi thì gửi lại cũng CÙNG một khoá` |
| Bỏ `and points >= :chiPhi` khỏi câu UPDATE | `hai request SONG SONG: đúng một thành công` |

Một lần phép kiểm **không** đỏ, và đó là bài học riêng: fixture của tôi tình cờ đặt món đang hết
lên trước, nên phép kiểm "giữ nguyên thứ tự" không thể đỏ dù cách nào. Sửa fixture rồi ghi lý do
ngay trong tệp để lần sau không ai "dọn cho gọn" rồi biến nó thành đồ trang trí.

## 7. Kiểm chứng trên hệ thống thật

Mọi contract trong báo cáo này được đo bằng cách gọi vào backend Java đang chạy (Docker Compose,
PostgreSQL thật), không chép từ tài liệu. Hai chi tiết chỉ lộ ra theo cách đó:

- `expiresAt` trả về có **9 chữ số thập phân** (`Instant` của Java in tới nanosecond), trong khi
  `DateTime` của Dart chỉ tới microsecond. Bộ kiểm ban đầu của tôi dùng chuỗi gọn **tự nghĩ ra** —
  tức kiểm app với dữ liệu do chính app tưởng tượng.
- **Ảnh món không do API phục vụ**: `:8081/menu-images/...` trả 401, `:8080/...` trả 200. Ghép
  nhầm base URL thì thực đơn hiện trắng trơn **mà không có lỗi nào để lần theo**.

## 8. Việc còn lại

- **Bảng `customer_profile_facts` + logic promote/seed** — §9.8, thuộc backend + AI-service. Khi
  có, phần hiển thị ở app là việc nhỏ.
- **Quét QR bằng camera** — hiện khách nhập mã bằng tay. Cần plugin nền tảng mà `flutter test`
  không kiểm được và bước build APK không chứng minh được.
- **Kiểm thử trên thiết bị thật** — CI dựng được APK và bản iOS không ký, nhưng chưa có bằng
  chứng chạy trên máy thật cho báo cáo (§9.10 yêu cầu chụp ở mỗi pha).
