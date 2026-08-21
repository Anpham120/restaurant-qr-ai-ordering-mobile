import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/auth/auth_repository.dart';
import 'package:restaurant_mobile/core/auth/auth_session.dart';
import 'package:restaurant_mobile/core/auth/token_store.dart';
import 'package:restaurant_mobile/core/tables/table_session.dart';
import 'package:restaurant_mobile/core/tables/table_session_api.dart';
import 'package:restaurant_mobile/core/tables/table_session_repository.dart';
import 'package:restaurant_mobile/ui/open_table_screen.dart';

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
      throw const AuthException('KHONG_DUNG_TOI', 'không dùng');
}

class BanStoreGiaLap implements TableSessionStore {
  TableSession? _dang;

  @override
  Future<TableSession?> doc() async => _dang;

  @override
  Future<void> luu(TableSession session) async => _dang = session;

  @override
  Future<void> xoa() async => _dang = null;
}

class BanApiGiaLap implements TableSessionApi {
  BanApiGiaLap(this._ketQua);

  final Object _ketQua;
  String? qrDaNhan;

  @override
  Future<TableSession> moPhien(String qrToken,
      {String? tableCode, String? accessToken}) async {
    qrDaNhan = qrToken;
    if (_ketQua is AuthException) throw _ketQua;
    return _ketQua as TableSession;
  }
}

/// Giả lập không bao giờ tự trả lời — để nhìn thấy trạng thái "đang mở bàn".
class BanApiTreo implements TableSessionApi {
  final hoanThanh = Completer<TableSession>();

  @override
  Future<TableSession> moPhien(String qrToken,
          {String? tableCode, String? accessToken}) =>
      hoanThanh.future;
}

final phienBan = TableSession(
  sessionId: 'ts_abc',
  tableCode: 'T01',
  tableDisplayName: 'Ban 01',
  status: 'Open',
  expiresAt: moc.add(const Duration(hours: 4)),
  isExpired: false,
  tableSessionToken: 'tst',
  resumeState: 'FreshStart',
  qrToken: 'cmc-table-t01-qr',
);

final phienDangNhap = AuthSession(
  accessToken: 'jwt',
  expiresAt: moc.add(const Duration(hours: 1)),
  user: const AuthUser(
      userId: 'u1',
      fullName: 'A',
      email: 'khach@example.com',
      role: 'Customer'),
);

TableSessionRepository kho(TableSessionApi api) => TableSessionRepository(
      api: api,
      store: BanStoreGiaLap(),
      auth: AuthRepository(
          api: AuthApiGiaLap(), store: AuthStoreGiaLap(), bayGio: () => moc),
      bayGio: () => moc,
    );

Widget dungMan(TableSessionRepository repo,
        {AuthSession? dangNhap, void Function(TableSession)? xong}) =>
    MaterialApp(
      home: OpenTableScreen(
        repository: repo,
        dangNhapVoi: dangNhap,
        onMoPhienXong: xong ?? (_) {},
      ),
    );

void main() {
  testWidgets('nói RÕ đơn sẽ được gắn tài khoản, TRƯỚC khi vào bàn',
      (tester) async {
    // Đây là điểm duy nhất khách còn kịp quyết định. Phiên bàn dùng chung và người gắn trước
    // giữ liên kết, nên biết sau khi đã gọi món thì không sửa được nữa.
    await tester.pumpWidget(
        dungMan(kho(BanApiGiaLap(phienBan)), dangNhap: phienDangNhap));

    expect(find.textContaining('cộng vào tài khoản của bạn'), findsOneWidget);
    expect(find.text('khach@example.com'), findsOneWidget);
  });

  testWidgets('khách vãng lai được báo là KHÔNG tích điểm', (tester) async {
    await tester.pumpWidget(dungMan(kho(BanApiGiaLap(phienBan))));

    expect(find.textContaining('khách vãng lai'), findsOneWidget);
  });

  testWidgets('vào bàn được khi CHƯA đăng nhập', (tester) async {
    // App phải dùng được cho khách vãng lai đúng như web. Nếu màn này chặn thì đăng nhập trở
    // thành bắt buộc — một quyết định sản phẩm không ai ra.
    TableSession? daVao;
    await tester.pumpWidget(
        dungMan(kho(BanApiGiaLap(phienBan)), xong: (s) => daVao = s));

    await tester.enterText(find.byType(TextField), 'cmc-table-t01-qr');
    await tester.tap(find.widgetWithText(FilledButton, 'Vào bàn'));
    await tester.pumpAndSettle();

    expect(daVao?.tableCode, 'T01');
  });

  testWidgets('QR sai thì hiện câu tiếng Việt, không vào bàn', (tester) async {
    TableSession? daVao;
    await tester.pumpWidget(dungMan(
        kho(BanApiGiaLap(const AuthException(
            'QR_NOT_FOUND', 'Mã QR không đúng hoặc bàn đã ngừng phục vụ.'))),
        xong: (s) => daVao = s));

    await tester.enterText(find.byType(TextField), 'sai');
    await tester.tap(find.widgetWithText(FilledButton, 'Vào bàn'));
    await tester.pumpAndSettle();

    expect(find.text('Mã QR không đúng hoặc bàn đã ngừng phục vụ.'),
        findsOneWidget);
    expect(daVao, isNull);
  });

  testWidgets('đang mở bàn thì khoá nút, không cho bấm hai lần',
      (tester) async {
    // Bấm hai lần lúc mạng chậm tạo hai lượt mở phiên song song cho cùng một bàn — đúng chỗ
    // backend có lịch sử race-condition (B73).
    final api = BanApiTreo();
    await tester.pumpWidget(dungMan(kho(api)));

    await tester.enterText(find.byType(TextField), 'cmc-table-t01-qr');
    await tester.tap(find.widgetWithText(FilledButton, 'Vào bàn'));
    await tester.pump();

    expect(find.text('Đang mở bàn…'), findsOneWidget);
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Đang mở bàn…'))
            .onPressed,
        isNull);

    api.hoanThanh.complete(phienBan);
    await tester.pumpAndSettle();
  });
}
