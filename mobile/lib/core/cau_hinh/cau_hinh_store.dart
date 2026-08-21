import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'cau_hinh.dart';

/// Cất địa chỉ máy chủ giữa các lần mở app.
///
/// Dùng `flutter_secure_storage` dù địa chỉ máy chủ KHÔNG phải bí mật: kéo thêm
/// `shared_preferences` vào chỉ để lưu hai chuỗi là thêm một phụ thuộc phải nâng cấp và kiểm mãi
/// về sau. Ghi rõ ở đây để người sau không tưởng địa chỉ này cần bảo vệ.
class CauHinhStore {
  CauHinhStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const String _khoa = 'cau_hinh_may_chu_v1';

  final FlutterSecureStorage _storage;

  Future<CauHinhMayChu?> doc() async {
    final raw = await _storage.read(key: _khoa);
    if (raw == null) return null;
    try {
      return CauHinhMayChu.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      await xoa();
      return null;
    }
  }

  Future<void> luu(CauHinhMayChu cauHinh) =>
      _storage.write(key: _khoa, value: jsonEncode(cauHinh.toJson()));

  Future<void> xoa() => _storage.delete(key: _khoa);
}
