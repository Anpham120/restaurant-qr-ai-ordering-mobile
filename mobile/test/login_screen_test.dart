import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/auth/auth_repository.dart';
import 'package:restaurant_mobile/core/auth/auth_session.dart';
import 'package:restaurant_mobile/core/auth/token_store.dart';
import 'package:restaurant_mobile/ui/login_screen.dart';

class StoreGiaLap implements TokenStore {
  AuthSession? _dang;

  @override
  Future<AuthSession?> doc() async => _dang;

  @override
  Future<void> luu(AuthSession session) async => _dang = session;

  @override
  Future<void> xoa() async => _dang = null;
}

class ApiGiaLap implements AuthApi {
  ApiGiaLap(this._ketQua);

  final Object _ketQua;

  @override
  Future<AuthSession> dangNhap(String email, String password) async {
    if (_ketQua is AuthException) throw _ketQua;
    return _ketQua as AuthSession;
  }
}

final phienHopLe = AuthSession(
  accessToken: 'jwt',
  expiresAt: DateTime.utc(2030),
  user: const AuthUser(
    userId: 'u1',
    fullName: 'Nguyễn Văn A',
    email: 'a@example.com',
    role: 'Customer',
  ),
);

/// Giả lập KHÔNG BAO GIỜ tự trả lời — người kiểm quyết định lúc nào lời gọi kết thúc.
///
/// Cần thứ này để nhìn thấy trạng thái "đang gửi". Bản giả lập thường trả về ngay trong cùng một
/// microtask, nên tới lúc pump() chạy thì việc đã xong và trạng thái đang-gửi chưa từng tồn tại —
/// tức phép kiểm đang soi một khoảnh khắc mà chính nó xoá mất.
class ApiTreo implements AuthApi {
  final hoanThanh = Completer<AuthSession>();

  @override
  Future<AuthSession> dangNhap(String email, String password) =>
      hoanThanh.future;
}

Widget dungMan(AuthRepository repo, void Function(AuthSession) xong) =>
    MaterialApp(home: LoginScreen(repository: repo, onDangNhapXong: xong));

void main() {
  testWidgets('sai mật khẩu thì hiện câu tiếng Việt và KHÔNG cho vào app',
      (tester) async {
    AuthSession? daVao;
    final repo = AuthRepository(
      api: ApiGiaLap(const AuthException(
          'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')),
      store: StoreGiaLap(),
    );

    await tester.pumpWidget(dungMan(repo, (s) => daVao = s));
    await tester.enterText(find.byType(TextField).first, 'a@example.com');
    await tester.enterText(find.byType(TextField).last, 'sai');
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(find.text('Email hoặc mật khẩu không đúng.'), findsOneWidget);
    expect(daVao, isNull);
  });

  testWidgets('đăng nhập đúng thì báo phiên ra ngoài', (tester) async {
    AuthSession? daVao;
    final repo =
        AuthRepository(api: ApiGiaLap(phienHopLe), store: StoreGiaLap());

    await tester.pumpWidget(dungMan(repo, (s) => daVao = s));
    await tester.enterText(find.byType(TextField).first, 'a@example.com');
    await tester.enterText(find.byType(TextField).last, 'matkhau12345');
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(daVao?.user.email, 'a@example.com');
  });

  testWidgets('ô mật khẩu che ký tự và không đưa vào từ điển bàn phím',
      (tester) async {
    // Ba thuộc tính này dễ bị tắt lúc gỡ lỗi rồi quên bật lại. `enableSuggestions` mới là cái
    // hay bị bỏ sót: bàn phím di động lưu từ đã gõ để gợi ý, nên mật khẩu nằm trong từ điển cá
    // nhân và bật lên ở ô nhập của app khác.
    final repo =
        AuthRepository(api: ApiGiaLap(phienHopLe), store: StoreGiaLap());
    await tester.pumpWidget(dungMan(repo, (_) {}));

    final matKhau = tester.widget<TextField>(find.byType(TextField).last);
    expect(matKhau.obscureText, isTrue);
    expect(matKhau.enableSuggestions, isFalse);
    expect(matKhau.autocorrect, isFalse);
  });

  testWidgets('đang gửi thì khoá nút, không cho bấm hai lần', (tester) async {
    // Bấm hai lần lúc mạng chậm tạo hai lượt đăng nhập song song; lượt về sau ghi đè phiên của
    // lượt trước. Vô hại ở màn này nhưng là thói quen sai khi sang màn tạo đơn (#29).
    final api = ApiTreo();
    final repo = AuthRepository(api: api, store: StoreGiaLap());
    await tester.pumpWidget(dungMan(repo, (_) {}));

    await tester.tap(find.byType(FilledButton));
    await tester.pump();

    expect(find.text('Đang đăng nhập…'), findsOneWidget);
    final nut = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(nut.onPressed, isNull);

    api.hoanThanh.complete(phienHopLe);
    await tester.pumpAndSettle();
  });
}
