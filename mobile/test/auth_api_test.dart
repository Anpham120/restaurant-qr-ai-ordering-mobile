import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';

HttpAuthApi apiTraVe(int status, String body,
    {void Function(http.Request)? ghiLai}) {
  return HttpAuthApi(
    baseUrl: 'http://test',
    client: MockClient((request) async {
      ghiLai?.call(request);
      return http.Response(body, status,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }),
  );
}

const String thanCongJson = '''
{"accessToken":"jwt.abc","expiresAt":"2026-08-20T15:24:15.752877577Z",
 "user":{"userId":"u1","fullName":"Nguyễn Văn A","email":"a@example.com","role":"Customer"}}
''';

String loiJson(String code, String message) => jsonEncode({
      'error': {'code': code, 'message': message, 'details': {}}
    });

void main() {
  test('gửi đúng đường dẫn và thân JSON mà backend Java chờ', () async {
    http.Request? daGui;
    await apiTraVe(200, thanCongJson, ghiLai: (r) => daGui = r)
        .dangNhap('a@example.com', 'matkhau123');

    expect(daGui!.url.path, '/api/auth/login');
    expect(daGui!.method, 'POST');
    expect(jsonDecode(daGui!.body),
        {'email': 'a@example.com', 'password': 'matkhau123'});
  });

  test('phân giải phiên từ phản hồi 200', () async {
    final session =
        await apiTraVe(200, thanCongJson).dangNhap('a@example.com', 'x');

    expect(session.accessToken, 'jwt.abc');
    expect(session.user.role, 'Customer');
    expect(session.expiresAt, DateTime.utc(2026, 8, 20, 15, 24, 15, 752, 877));
  });

  test('đọc đúng tiếng Việt có dấu trong tên (UTF-8, không phải latin-1)',
      () async {
    // `response.body` của package http giải mã theo charset trong header; thiếu charset thì nó
    // đoán latin-1 và "Nguyễn" thành "Nguyá»…n". Ca này chốt việc giải mã theo bodyBytes.
    final session =
        await apiTraVe(200, thanCongJson).dangNhap('a@example.com', 'x');
    expect(session.user.fullName, 'Nguyễn Văn A');
  });

  group('dịch lỗi theo MÃ, không hiển thị câu tiếng Anh của máy chủ', () {
    test('401 INVALID_CREDENTIALS', () async {
      final api = apiTraVe(401,
          loiJson('INVALID_CREDENTIALS', 'Email or password is incorrect.'));

      await expectLater(
        api.dangNhap('a@example.com', 'sai'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'INVALID_CREDENTIALS')
            .having((e) => e.message, 'message',
                'Email hoặc mật khẩu không đúng.')),
      );
    });

    test('không rò câu tiếng Anh của máy chủ ra màn hình', () async {
      final api = apiTraVe(401,
          loiJson('INVALID_CREDENTIALS', 'Email or password is incorrect.'));
      try {
        await api.dangNhap('a@example.com', 'sai');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, isNot(contains('Email or password')));
      }
    });

    test('400 EMAIL_INVALID', () async {
      final api = apiTraVe(400, loiJson('EMAIL_INVALID', 'Email is invalid.'));
      await expectLater(
          api.dangNhap('sai', 'x'),
          throwsA(isA<AuthException>()
              .having((e) => e.code, 'code', 'EMAIL_INVALID')));
    });

    test('502 trả thân HTML của nginx vẫn cho câu đọc được', () async {
      // Thân không phải JSON là chuyện có thật khi reverse proxy chết. Nếu jsonDecode ném ra mà
      // không ai bắt, người dùng thấy màn hình đỏ thay vì một câu thông báo.
      final api = apiTraVe(502, '<html><body>502 Bad Gateway</body></html>');
      await expectLater(
        api.dangNhap('a@example.com', 'x'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'SERVER_ERROR')
            .having((e) => e.message, 'message', contains('Thử lại sau'))),
      );
    });
  });

  test('mất mạng cho mã NETWORK_ERROR, không phải "sai mật khẩu"', () async {
    // Bảo khách kiểm tra lại mật khẩu trong khi thực ra rớt wifi là cách nhanh nhất khiến họ
    // đổi mật khẩu một cách vô ích.
    final api = HttpAuthApi(
      baseUrl: 'http://test',
      client: MockClient((_) async => throw const SocketExceptionGiaLap()),
    );

    await expectLater(
      api.dangNhap('a@example.com', 'x'),
      throwsA(
          isA<AuthException>().having((e) => e.code, 'code', 'NETWORK_ERROR')),
    );
  });
}

class SocketExceptionGiaLap implements Exception {
  const SocketExceptionGiaLap();
}
