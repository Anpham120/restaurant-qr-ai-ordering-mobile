import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'table_session.dart';
import 'table_session_repository.dart';

/// Cất phiên bàn ở Keychain/Keystore, cùng cấu hình với phiên đăng nhập.
///
/// Vì sao cũng phải là chỗ cất an toàn, dù phiên bàn "chỉ" là một cái bàn: `tableSessionToken` là
/// một chìa khoá năng lực — cầm nó là xem được đơn và hoá đơn của bàn đó. Đặt nó vào
/// SharedPreferences thường trong khi JWT nằm ở Keychain là khoá cửa trước rồi để ngỏ cửa sau.
class SecureTableSessionStore implements TableSessionStore {
  SecureTableSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const String _khoa = 'table_session_v1';

  final FlutterSecureStorage _storage;

  @override
  Future<void> luu(TableSession session) =>
      _storage.write(key: _khoa, value: jsonEncode(session.toJson()));

  @override
  Future<TableSession?> doc() async {
    final raw = await _storage.read(key: _khoa);
    if (raw == null) return null;
    try {
      return TableSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // Dữ liệu hỏng hoặc từ phiên bản cũ — xoá thay vì để app kẹt mỗi lần mở.
      await xoa();
      return null;
    }
  }

  @override
  Future<void> xoa() => _storage.delete(key: _khoa);
}
