import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Cất `X-Order-Token` của những đơn CHÍNH MÁY NÀY đã đặt.
///
/// Vì sao phải cất: backend chỉ trả `customerAccessToken` **một lần duy nhất**, trong phản hồi
/// tạo đơn. Danh sách đơn của phiên bàn không kèm nó. Mất token là mất luôn quyền huỷ món của
/// chính mình (#11) và quyền xem đơn theo mã.
///
/// Vì sao cất ở chỗ AN TOÀN: đây là chìa khoá năng lực — cầm nó là huỷ được món của đơn đó. Cùng
/// hạng với token phiên bàn, nên cùng chỗ cất.
///
/// Đơn do MÁY KHÁC trong bàn đặt sẽ không có ở đây, và đó là đúng: người đặt mới là người quyết
/// định huỷ. App chỉ đơn giản không hiện nút huỷ cho những đơn đó.
class OrderTokenStore {
  OrderTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const String _khoa = 'order_tokens_v1';

  final FlutterSecureStorage _storage;

  Future<Map<String, String>> _doc() async {
    final raw = await _storage.read(key: _khoa);
    if (raw == null) return {};
    try {
      return (jsonDecode(raw) as Map<String, dynamic>)
          .map((k, v) => MapEntry(k, v.toString()));
    } catch (_) {
      // Dữ liệu hỏng — xoá thay vì để app kẹt. Mất token nghĩa là mất quyền huỷ món, không mất
      // đơn: đơn vẫn hiện trong danh sách của bàn.
      await _storage.delete(key: _khoa);
      return {};
    }
  }

  Future<void> luu(String orderCode, String token) async {
    final all = await _doc();
    all[orderCode] = token;
    await _storage.write(key: _khoa, value: jsonEncode(all));
  }

  Future<String?> token(String orderCode) async => (await _doc())[orderCode];

  Future<Map<String, String>> tatCa() => _doc();

  /// Xoá khi rời bàn: token của bàn cũ không dùng được nữa và không có lý do giữ.
  Future<void> xoaHet() => _storage.delete(key: _khoa);
}
