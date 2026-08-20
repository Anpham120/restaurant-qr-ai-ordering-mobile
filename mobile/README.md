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
