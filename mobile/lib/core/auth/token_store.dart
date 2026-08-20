import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_session.dart';

/// Nơi cất phiên đăng nhập.
///
/// Tách thành interface để phần quyết định (hết hạn thì xoá, đăng xuất thì xoá) kiểm được mà
/// không cần thiết bị thật: `flutter_secure_storage` chạy qua platform channel, trong `flutter
/// test` nó không có Keychain/Keystore nào để nói chuyện.
abstract class TokenStore {
  Future<void> luu(AuthSession session);
  Future<AuthSession?> doc();
  Future<void> xoa();
}

/// Bản cất thật trên thiết bị: Keychain (iOS) và Keystore/EncryptedSharedPreferences (Android).
///
/// Vì sao KHÔNG dùng `SharedPreferences`: nó là file XML thường. Trên máy đã root, hoặc qua
/// `adb backup` ở app cho phép sao lưu, token đọc được bằng mắt. JWT ở đây là thứ thay được cả
/// mật khẩu cho tới lúc hết hạn.
class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                // Bắt buộc bật. Không có cờ này, bản Android rơi về SharedPreferences thường —
                // tức mất đúng thứ mà cả lớp lưu trữ này sinh ra để có.
                encryptedSharedPreferences: true,
              ),
              iOptions: IOSOptions(
                // `first_unlock_THIS_DEVICE`, không phải `first_unlock`.
                //
                // Mặc định của Keychain cho phép mục dữ liệu đi theo bản sao lưu iCloud và sống
                // lại trên MÁY KHÁC. Token của quán ăn không có lý do gì để tồn tại trên một
                // thiết bị mà khách chưa từng đăng nhập; `ThisDeviceOnly` chặn đúng đường đó.
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const String _khoa = 'auth_session_v1';

  final FlutterSecureStorage _storage;

  @override
  Future<void> luu(AuthSession session) =>
      _storage.write(key: _khoa, value: jsonEncode(session.toJson()));

  @override
  Future<AuthSession?> doc() async {
    final raw = await _storage.read(key: _khoa);
    if (raw == null) return null;
    try {
      return AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // Dữ liệu hỏng hoặc từ phiên bản cũ. Xoá thay vì để app kẹt ở màn hình trắng mỗi lần mở:
      // người dùng không có cách nào tự dọn Keychain.
      await xoa();
      return null;
    }
  }

  @override
  Future<void> xoa() => _storage.delete(key: _khoa);
}
