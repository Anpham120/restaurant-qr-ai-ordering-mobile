import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/tables/table_session_api.dart';

const String phienJson = '''
{"sessionId":"ts_abc","orderType":"DineIn","status":"Open","tableCode":"T01",
 "tableDisplayName":"Ban 01","openedAt":"2026-08-20T12:00:00Z",
 "expiresAt":"2026-08-20T16:00:00.123456789Z","closedAt":null,"isExpired":false,
 "tableSessionToken":"tst_bi_mat","resumeState":"FreshStart"}
''';

String loiJson(String code) => jsonEncode({
      'error': {'code': code, 'message': 'in English', 'details': {}}
    });

HttpTableSessionApi apiTraVe(int status, String body,
    {void Function(http.Request)? ghiLai}) {
  return HttpTableSessionApi(
    baseUrl: 'http://test',
    client: MockClient((request) async {
      ghiLai?.call(request);
      return http.Response(body, status,
          headers: {'content-type': 'application/json; charset=utf-8'});
    }),
  );
}

void main() {
  group('gắn tài khoản vào phiên bàn (§9.4)', () {
    test('CÓ gửi Authorization khi khách đã đăng nhập', () {
      // Đây là toàn bộ cơ chế gắn `MemberId`. Quên header này thì app chạy đúng như web và mất
      // sạch lớp tính năng độc quyền — mà không có gì đỏ, vì phiên vẫn mở thành công.
      http.Request? daGui;
      return apiTraVe(200, phienJson, ghiLai: (r) => daGui = r)
          .moPhien('cmc-table-t01-qr',
              tableCode: 'T01', accessToken: 'jwt.cua.khach')
          .then((_) {
        expect(daGui!.headers['Authorization'], 'Bearer jwt.cua.khach');
      });
    });

    test('KHÔNG gửi Authorization khi là khách vãng lai', () async {
      // App phải dùng được khi chưa đăng nhập, đúng như web. Gửi header rỗng hoặc "Bearer null"
      // sẽ khiến backend từ chối và biến app thành bắt buộc đăng nhập.
      http.Request? daGui;
      await apiTraVe(200, phienJson, ghiLai: (r) => daGui = r)
          .moPhien('cmc-table-t01-qr');

      expect(daGui!.headers.containsKey('Authorization'), isFalse);
    });

    test('gửi đúng đường dẫn và thân JSON', () async {
      http.Request? daGui;
      await apiTraVe(200, phienJson, ghiLai: (r) => daGui = r)
          .moPhien('cmc-table-t01-qr', tableCode: 'T01');

      expect(daGui!.url.path, '/api/table-sessions');
      expect(jsonDecode(daGui!.body),
          {'qrToken': 'cmc-table-t01-qr', 'tableCode': 'T01'});
    });

    test('bỏ hẳn tableCode khi không có, không gửi chuỗi rỗng', () async {
      // Backend coi tableCode rỗng khác với thiếu: chuỗi rỗng đi vào nhánh kiểm định dạng và
      // trả TABLE_CODE_INVALID.
      http.Request? daGui;
      await apiTraVe(200, phienJson, ghiLai: (r) => daGui = r)
          .moPhien('cmc-table-t01-qr');

      expect(jsonDecode(daGui!.body), {'qrToken': 'cmc-table-t01-qr'});
    });
  });

  test('phân giải phiên, giữ hạn ở UTC với Instant 9 chữ số', () async {
    final session = await apiTraVe(200, phienJson).moPhien('cmc-table-t01-qr');

    expect(session.sessionId, 'ts_abc');
    expect(session.tableCode, 'T01');
    expect(session.resumeState, 'FreshStart');
    expect(session.expiresAt.isUtc, isTrue);
    expect(session.expiresAt, DateTime.utc(2026, 8, 20, 16, 0, 0, 123, 456));
  });

  test('toString() KHÔNG chứa tableSessionToken', () async {
    // Token phiên bàn là chìa khoá năng lực: cầm nó là xem được đơn và hoá đơn của bàn.
    final session = await apiTraVe(200, phienJson).moPhien('cmc-table-t01-qr');

    expect(session.toString(), isNot(contains('tst_bi_mat')));
    expect(session.toString(), contains('T01'));
  });

  group('dịch lỗi theo mã', () {
    test('QR sai cho câu tiếng Việt', () async {
      await expectLater(
        apiTraVe(404, loiJson('QR_NOT_FOUND')).moPhien('sai'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'QR_NOT_FOUND')
            .having(
                (e) => e.message, 'message', isNot(contains('in English')))),
      );
    });

    test('QR không thuộc bàn vừa chọn', () async {
      await expectLater(
        apiTraVe(400, loiJson('QR_TABLE_MISMATCH'))
            .moPhien('x', tableCode: 'T99'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'QR_TABLE_MISMATCH')),
      );
    });

    test('502 HTML của nginx vẫn cho câu đọc được', () async {
      await expectLater(
        apiTraVe(502, '<html>502</html>').moPhien('x'),
        throwsA(
            isA<AuthException>().having((e) => e.code, 'code', 'SERVER_ERROR')),
      );
    });
  });
}
