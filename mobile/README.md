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
