import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/auth/auth_repository.dart';
import 'package:restaurant_mobile/core/auth/auth_session.dart';
import 'package:restaurant_mobile/core/auth/token_store.dart';

class StoreGiaLap implements TokenStore {
  AuthSession? _dang;
  int soLanXoa = 0;

  @override
  Future<AuthSession?> doc() async => _dang;

  @override
  Future<void> luu(AuthSession session) async => _dang = session;

  @override
  Future<void> xoa() async {
    soLanXoa++;
    _dang = null;
  }
}

class ApiGiaLap implements AuthApi {
  ApiGiaLap(this._ketQua);

  final Object _ketQua;
  String? emailDaNhan;

  @override
  Future<AuthSession> dangNhap(String email, String password) async {
    emailDaNhan = email;
    if (_ketQua is AuthException) throw _ketQua;
    return _ketQua as AuthSession;
  }
}

AuthSession phien(DateTime hetHan) => AuthSession(
      accessToken: 'jwt',
      expiresAt: hetHan,
      user: const AuthUser(
          userId: 'u1',
          fullName: 'A',
          email: 'a@example.com',
          role: 'Customer'),
    );

void main() {
  final moc = DateTime.utc(2026, 8, 20, 12, 0, 0);

  test('đăng nhập thành công thì cất phiên vào máy', () async {
    final store = StoreGiaLap();
    final repo = AuthRepository(
      api: ApiGiaLap(phien(moc.add(const Duration(hours: 2)))),
      store: store,
      bayGio: () => moc,
    );

    await repo.dangNhap('a@example.com', 'matkhau123');

    expect(await store.doc(), isNotNull);
  });

  test('cắt khoảng trắng quanh email trước khi gửi', () async {
    // Bàn phím di động chèn dấu cách sau gợi ý email. Backend so khớp nguyên văn, nên dấu cách
    // vô hình biến thành "sai mật khẩu" mà không ai giải thích được.
    final api = ApiGiaLap(phien(moc.add(const Duration(hours: 2))));
    final repo =
        AuthRepository(api: api, store: StoreGiaLap(), bayGio: () => moc);

    await repo.dangNhap('  a@example.com ', 'matkhau123');

    expect(api.emailDaNhan, 'a@example.com');
  });

  test('đăng nhập hỏng thì KHÔNG cất gì cả', () async {
    final store = StoreGiaLap();
    final repo = AuthRepository(
      api: ApiGiaLap(const AuthException('INVALID_CREDENTIALS', 'sai')),
      store: store,
      bayGio: () => moc,
    );

    await expectLater(
      repo.dangNhap('a@example.com', 'sai'),
      throwsA(isA<AuthException>()),
    );
    expect(await store.doc(), isNull);
  });

  group('khoiPhuc', () {
    test('token còn hạn thì trả về phiên', () async {
      final store = StoreGiaLap();
      await store.luu(phien(moc.add(const Duration(hours: 2))));
      final repo = AuthRepository(
          api: ApiGiaLap(phien(moc)), store: store, bayGio: () => moc);

      expect(await repo.khoiPhuc(), isNotNull);
      expect(store.soLanXoa, 0);
    });

    test('token hết hạn thì trả null VÀ XOÁ khỏi máy', () async {
      // Phần "và xoá" mới là điểm chính. Chỉ trả null mà để token nằm lại nghĩa là giữ một chuỗi
      // bí mật không còn dùng được nhưng vẫn đọc được nếu máy rơi vào tay người khác.
      final store = StoreGiaLap();
      await store.luu(phien(moc.subtract(const Duration(minutes: 5))));
      final repo = AuthRepository(
          api: ApiGiaLap(phien(moc)), store: store, bayGio: () => moc);

      expect(await repo.khoiPhuc(), isNull);
      expect(store.soLanXoa, 1);
      expect(await store.doc(), isNull);
    });

    test('máy chưa có gì thì trả null, không xoá vô ích', () async {
      final store = StoreGiaLap();
      final repo = AuthRepository(
          api: ApiGiaLap(phien(moc)), store: store, bayGio: () => moc);

      expect(await repo.khoiPhuc(), isNull);
      expect(store.soLanXoa, 0);
    });
  });

  test('đăng xuất xoá phiên khỏi máy', () async {
    final store = StoreGiaLap();
    await store.luu(phien(moc.add(const Duration(hours: 2))));
    final repo = AuthRepository(
        api: ApiGiaLap(phien(moc)), store: store, bayGio: () => moc);

    await repo.dangXuat();

    expect(await store.doc(), isNull);
  });
}
