import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/auth/auth_repository.dart';
import 'package:restaurant_mobile/core/auth/auth_session.dart';
import 'package:restaurant_mobile/core/auth/token_store.dart';
import 'package:restaurant_mobile/core/tables/table_session.dart';
import 'package:restaurant_mobile/core/tables/table_session_api.dart';
import 'package:restaurant_mobile/core/tables/table_session_repository.dart';

final moc = DateTime.utc(2026, 8, 20, 12, 0, 0);

class AuthStoreGiaLap implements TokenStore {
  AuthSession? _dang;

  @override
  Future<AuthSession?> doc() async => _dang;

  @override
  Future<void> luu(AuthSession session) async => _dang = session;

  @override
  Future<void> xoa() async => _dang = null;
}

class AuthApiGiaLap implements AuthApi {
  @override
  Future<AuthSession> dangNhap(String email, String password) async =>
      throw const AuthException(
          'KHONG_DUNG_TOI', 'không dùng trong bộ kiểm này');
}

class BanStoreGiaLap implements TableSessionStore {
  TableSession? _dang;
  int soLanXoa = 0;

  @override
  Future<TableSession?> doc() async => _dang;

  @override
  Future<void> luu(TableSession session) async => _dang = session;

  @override
  Future<void> xoa() async {
    soLanXoa++;
    _dang = null;
  }
}

class BanApiGiaLap implements TableSessionApi {
  BanApiGiaLap(this._tra);

  final TableSession _tra;
  String? tokenDaNhan;
  bool daGoi = false;

  @override
  Future<TableSession> moPhien(String qrToken,
      {String? tableCode, String? accessToken}) async {
    daGoi = true;
    tokenDaNhan = accessToken;
    return _tra;
  }
}

TableSession phienBan({DateTime? hetHan, bool isExpired = false}) =>
    TableSession(
      sessionId: 'ts_abc',
      tableCode: 'T01',
      tableDisplayName: 'Ban 01',
      status: 'Open',
      expiresAt: hetHan ?? moc.add(const Duration(hours: 4)),
      isExpired: isExpired,
      tableSessionToken: 'tst_bi_mat',
      resumeState: 'FreshStart',
    );

AuthSession phienDangNhap({DateTime? hetHan}) => AuthSession(
      accessToken: 'jwt.cua.khach',
      expiresAt: hetHan ?? moc.add(const Duration(hours: 1)),
      user: const AuthUser(
          userId: 'u1',
          fullName: 'A',
          email: 'a@example.com',
          role: 'Customer'),
    );

({
  TableSessionRepository repo,
  BanApiGiaLap api,
  BanStoreGiaLap store,
  AuthStoreGiaLap authStore
}) dung() {
  final authStore = AuthStoreGiaLap();
  final api = BanApiGiaLap(phienBan());
  final store = BanStoreGiaLap();
  return (
    repo: TableSessionRepository(
      api: api,
      store: store,
      auth: AuthRepository(
          api: AuthApiGiaLap(), store: authStore, bayGio: () => moc),
      bayGio: () => moc,
    ),
    api: api,
    store: store,
    authStore: authStore,
  );
}

void main() {
  group('đính token của khách khi mở phiên', () {
    test('đang đăng nhập thì token được chuyển xuống lớp gọi mạng', () async {
      final d = dung();
      await d.authStore.luu(phienDangNhap());

      await d.repo.moPhien('cmc-table-t01-qr', tableCode: 'T01');

      expect(d.api.tokenDaNhan, 'jwt.cua.khach');
    });

    test('chưa đăng nhập thì vẫn mở được phiên, chỉ là không gắn tài khoản',
        () async {
      // App phải dùng được cho khách vãng lai đúng như web. Nếu chỗ này ném lỗi thì app biến
      // thành bắt buộc đăng nhập — một quyết định sản phẩm không ai ra.
      final d = dung();

      final session = await d.repo.moPhien('cmc-table-t01-qr');

      expect(d.api.daGoi, isTrue);
      expect(d.api.tokenDaNhan, isNull);
      expect(session.tableCode, 'T01');
    });

    test('token đăng nhập ĐÃ HẾT HẠN thì không được gửi đi', () async {
      // Lấy token qua AuthRepository.khoiPhuc() chính là để có luật này miễn phí. Nếu cache
      // riêng một bản token ở đây thì app sẽ lặng lẽ gửi token chết và nhận 401 khó hiểu.
      final d = dung();
      await d.authStore
          .luu(phienDangNhap(hetHan: moc.subtract(const Duration(minutes: 5))));

      await d.repo.moPhien('cmc-table-t01-qr');

      expect(d.api.tokenDaNhan, isNull);
    });
  });

  test('mở phiên xong thì cất lại để lần mở app sau còn dùng', () async {
    final d = dung();

    await d.repo.moPhien('cmc-table-t01-qr');

    expect(await d.store.doc(), isNotNull);
  });

  group('khoiPhuc', () {
    test('phiên còn hạn thì trả về', () async {
      final d = dung();
      await d.store.luu(phienBan());

      expect(await d.repo.khoiPhuc(), isNotNull);
      expect(d.store.soLanXoa, 0);
    });

    test('phiên quá hạn thì trả null VÀ XOÁ khỏi máy', () async {
      final d = dung();
      await d.store
          .luu(phienBan(hetHan: moc.subtract(const Duration(minutes: 1))));

      expect(await d.repo.khoiPhuc(), isNull);
      expect(d.store.soLanXoa, 1);
    });

    test(
        'backend báo isExpired thì tin backend, kể cả khi đồng hồ máy nói còn hạn',
        () async {
      // Đồng hồ điện thoại có thể lệch. Phiên bàn do backend đóng (nhân viên chốt bàn), nên cờ
      // isExpired là sự thật, còn expiresAt chỉ là dự đoán.
      final d = dung();
      await d.store.luu(
          phienBan(hetHan: moc.add(const Duration(hours: 4)), isExpired: true));

      expect(await d.repo.khoiPhuc(), isNull);
      expect(d.store.soLanXoa, 1);
    });
  });

  test('rời bàn thì xoá phiên khỏi máy', () async {
    final d = dung();
    await d.store.luu(phienBan());

    await d.repo.roiBan();

    expect(await d.store.doc(), isNull);
  });
}
