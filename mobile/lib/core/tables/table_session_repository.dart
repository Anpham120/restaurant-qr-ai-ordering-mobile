import '../auth/auth_repository.dart';
import 'table_session.dart';
import 'table_session_api.dart';

/// Nơi cất phiên bàn giữa các lần mở app.
abstract class TableSessionStore {
  Future<void> luu(TableSession session);
  Future<TableSession?> doc();
  Future<void> xoa();
}

/// Mở phiên bàn, tự đính token của khách nếu đang đăng nhập.
class TableSessionRepository {
  TableSessionRepository({
    required TableSessionApi api,
    required TableSessionStore store,
    required AuthRepository auth,
    DateTime Function()? bayGio,
  })  : _api = api,
        _store = store,
        _auth = auth,
        _bayGio = bayGio ?? DateTime.now;

  final TableSessionApi _api;
  final TableSessionStore _store;
  final AuthRepository _auth;
  final DateTime Function() _bayGio;

  /// Mở hoặc tiếp tục phiên cho mã QR đã quét.
  ///
  /// Token của khách lấy qua [AuthRepository.khoiPhuc] chứ không cache riêng: hàm đó đã mang sẵn
  /// luật "hết hạn thì xoá". Giữ một bản sao token ở đây sẽ tạo ra một đường vòng lặng lẽ dùng
  /// token đã chết.
  ///
  /// Chưa đăng nhập thì vẫn mở phiên bình thường — app phải dùng được cho khách vãng lai, đúng
  /// như web. Chỉ khác: phiên đó không gắn tài khoản nào.
  Future<TableSession> moPhien(String qrToken, {String? tableCode}) async {
    final phienDangNhap = await _auth.khoiPhuc();
    final session = await _api.moPhien(
      qrToken.trim(),
      tableCode: tableCode?.trim(),
      accessToken: phienDangNhap?.accessToken,
    );
    await _store.luu(session);
    return session;
  }

  /// Khôi phục phiên bàn lúc mở lại app.
  ///
  /// Hết hạn thì XOÁ rồi mới trả `null` — cùng luật với phiên đăng nhập. `tableSessionToken` là
  /// một chìa khoá năng lực: nó cho phép xem đơn và hoá đơn của bàn, nên giữ lại bản đã chết chỉ
  /// còn là rủi ro.
  Future<TableSession?> khoiPhuc() async {
    final session = await _store.doc();
    if (session == null) return null;
    if (!session.conHieuLuc(_bayGio())) {
      await _store.xoa();
      return null;
    }
    return session;
  }

  Future<void> roiBan() => _store.xoa();
}
