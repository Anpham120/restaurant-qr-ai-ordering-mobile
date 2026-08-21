import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/loyalty/loyalty_api.dart';

String loiJson(String code) => jsonEncode({
      'error': {'code': code, 'message': 'in English', 'details': {}}
    });

HttpLoyaltyApi apiTraVe(int status, String body,
        {void Function(http.Request)? ghiLai}) =>
    HttpLoyaltyApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('đọc điểm của chính mình', () {
    test('gửi Bearer và KHÔNG gửi số điện thoại ở bất cứ đâu', () async {
      // Đây là luật KHÔNG được vi phạm. Nếu app gửi ?phone= thì nó đang đòi backend mở lại đúng
      // lỗ hổng mà /api/loyalty/lookup (chỉ nhân viên) dựng lên để chặn.
      http.Request? daGui;
      await apiTraVe(200, '{"linked":false,"points":0,"availableRewards":[]}',
          ghiLai: (r) => daGui = r).cuaToi('jwt.khach');

      expect(daGui!.url.path, '/api/loyalty/me');
      expect(daGui!.url.query, isEmpty);
      expect(daGui!.headers['Authorization'], 'Bearer jwt.khach');
    });

    test('tài khoản chưa liên kết KHÔNG phải lỗi', () async {
      // Trạng thái của mọi tài khoản mới. Coi nó là lỗi thì màn hình sẽ báo hỏng với người chưa
      // làm gì sai.
      final kq = await apiTraVe(
              200, '{"linked":false,"points":0,"availableRewards":[]}')
          .cuaToi('jwt');

      expect(kq.linked, isFalse);
      expect(kq.points, 0);
      expect(kq.phoneNumber, isNull);
      expect(kq.availableRewards, isEmpty);
    });

    test('đã liên kết thì đọc được điểm và ưu đãi đủ điều kiện', () async {
      final kq = await apiTraVe(
          200,
          jsonEncode({
            'linked': true,
            'phoneNumber': '0901234567',
            'points': 250,
            'availableRewards': [
              {
                'rewardId': 'rw1',
                'name': 'Trà đào miễn phí',
                'description': 'Áp dụng cả ngày',
                'pointsRequired': 100,
              }
            ],
          })).cuaToi('jwt');

      expect(kq.linked, isTrue);
      expect(kq.points, 250);
      expect(kq.availableRewards.single.name, 'Trà đào miễn phí');
      expect(kq.availableRewards.single.pointsRequired, 100);
    });
  });

  group('nối số điện thoại', () {
    test('gửi POST đúng đường dẫn với số đã cắt khoảng trắng', () async {
      http.Request? daGui;
      await apiTraVe(200,
          '{"linked":true,"phoneNumber":"0901234567","points":0,"availableRewards":[]}',
          ghiLai: (r) => daGui = r).noiSo('jwt', '  0901234567 ');

      expect(daGui!.url.path, '/api/loyalty/me/phone');
      expect(daGui!.method, 'POST');
      expect(jsonDecode(daGui!.body), {'phone': '0901234567'});
    });

    test(
        'số đã có hồ sơ: câu thông báo phải NÓI VIỆC CẦN LÀM, không chỉ báo lỗi',
        () async {
      // "Số đã tồn tại" khiến khách nghĩ mình gõ nhầm và gõ lại mãi. Sự thật là họ đã là thành
      // viên và phải nhờ quầy nối hộ — câu thông báo phải nói đúng điều đó.
      try {
        await apiTraVe(409, loiJson('LOYALTY_PHONE_ALREADY_MEMBER'))
            .noiSo('jwt', '0901234567');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.code, 'LOYALTY_PHONE_ALREADY_MEMBER');
        expect(e.message, contains('nhân viên'));
        expect(e.message, isNot(contains('in English')));
      }
    });

    test('số đang gắn tài khoản khác', () async {
      await expectLater(
        apiTraVe(409, loiJson('LOYALTY_PHONE_TAKEN'))
            .noiSo('jwt', '0901234567'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'LOYALTY_PHONE_TAKEN')),
      );
    });

    test('số không hợp lệ', () async {
      await expectLater(
        apiTraVe(400, loiJson('LOYALTY_PHONE_INVALID')).noiSo('jwt', '12'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'LOYALTY_PHONE_INVALID')),
      );
    });
  });

  test('403 nói phiên hết hạn, không nói "không có quyền"', () async {
    // Khách không hiểu "403". Với họ chuyện xảy ra là phải đăng nhập lại.
    await expectLater(
      apiTraVe(403, loiJson('FORBIDDEN')).cuaToi('jwt'),
      throwsA(isA<AuthException>()
          .having((e) => e.message, 'message', contains('Đăng nhập lại'))),
    );
  });

  test('502 HTML của nginx vẫn cho câu đọc được', () async {
    await expectLater(
      apiTraVe(502, '<html>502</html>').cuaToi('jwt'),
      throwsA(
          isA<AuthException>().having((e) => e.code, 'code', 'SERVER_ERROR')),
    );
  });
}
