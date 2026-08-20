import 'auth_api.dart';
import 'auth_session.dart';
import 'token_store.dart';

/// Ghép lời gọi mạng với chỗ cất token, và giữ toàn bộ luật về vòng đời phiên ở một nơi.
class AuthRepository {
  AuthRepository({
    required AuthApi api,
    required TokenStore store,
    DateTime Function()? bayGio,
  })  : _api = api,
        _store = store,
        _bayGio = bayGio ?? DateTime.now;

  final AuthApi _api;
  final TokenStore _store;

  /// Tiêm được để kiểm chuyện hết hạn mà không phải chờ thật.
  final DateTime Function() _bayGio;

  Future<AuthSession> dangNhap(String email, String password) async {
    // `trim()` vì bàn phím di động tự chèn dấu cách sau khi gợi ý email, và backend so khớp
    // email nguyên văn — một dấu cách vô hình thành "sai mật khẩu" không giải thích được.
    final session = await _api.dangNhap(email.trim(), password);
    await _store.luu(session);
    return session;
  }

  /// Khôi phục phiên lúc mở app.
  ///
  /// Token hết hạn thì **XOÁ khỏi máy** rồi mới trả `null`. Chỉ trả `null` mà để nguyên là giữ
  /// lại một chuỗi bí mật vô dụng: không đăng nhập được nữa nhưng vẫn đọc được nếu máy rơi vào
  /// tay người khác. Không có lý do gì để giữ.
  Future<AuthSession?> khoiPhuc() async {
    final session = await _store.doc();
    if (session == null) return null;
    if (!session.conHieuLuc(_bayGio())) {
      await _store.xoa();
      return null;
    }
    return session;
  }

  Future<void> dangXuat() => _store.xoa();
}
