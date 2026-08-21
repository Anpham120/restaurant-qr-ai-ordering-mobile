import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/loyalty/loyalty_api.dart';

String loiJson(String code) => jsonEncode({
      'error': {'code': code, 'message': 'in English', 'details': {}}
    });

/// Thân đúng như backend đang chạy trả về (đo bằng curl).
final Map<String, dynamic> ketQuaThat = {
  'redemptionId': 'red_9f2ebf94',
  'rewardId': 'rw_1',
  'rewardName': 'Tra dao mien phi',
  'pointsSpent': 60,
  'redeemedAt': '2026-08-21T08:00:00Z',
  'soDuMoi': {
    'linked': true,
    'phoneNumber': '0971234567',
    'points': 140,
    'availableRewards': <dynamic>[],
  },
};

HttpLoyaltyApi api(int status, String body,
        {void Function(http.BaseRequest)? ghiLai}) =>
    HttpLoyaltyApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('đổi điểm', () {
    test('LUÔN gửi Idempotency-Key — ở đây nó tiêu điểm THẬT của khách',
        () async {
      http.BaseRequest? daGui;
      await api(200, jsonEncode(ketQuaThat), ghiLai: (r) => daGui = r)
          .doiDiem('jwt', 'rw_1', 'rd.k1');

      expect(daGui!.url.path, '/api/loyalty/me/redeem');
      expect(daGui!.headers['Idempotency-Key'], 'rd.k1');
      expect(daGui!.headers['Authorization'], 'Bearer jwt');
      expect(jsonDecode((daGui! as http.Request).body), {'rewardId': 'rw_1'});
    });

    test('đọc SỐ DƯ MỚI từ phản hồi, không phải số dư cũ', () async {
      // Backend trả kèm số dư sau khi đổi. Bắt app gọi thêm một lượt tạo ra khoảng thời gian
      // màn hình còn hiện số dư CŨ — và khách sẽ bấm đổi lần nữa.
      final kq =
          await api(200, jsonEncode(ketQuaThat)).doiDiem('jwt', 'rw_1', 'k');

      expect(kq.pointsSpent, 60);
      expect(kq.soDuMoi.points, 140);
      expect(kq.rewardName, 'Tra dao mien phi');
    });

    test('không đủ điểm: câu ngắn gọn, không đổ lỗi', () async {
      // Backend cố ý không phân biệt "không đủ điểm" với "thua tranh chấp" — với khách hai thứ
      // nói cùng một điều.
      await expectLater(
        api(400, loiJson('LOYALTY_NOT_ENOUGH_POINTS'))
            .doiDiem('jwt', 'rw_1', 'k'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'LOYALTY_NOT_ENOUGH_POINTS')
            .having((e) => e.message, 'message', contains('Chưa đủ điểm'))),
      );
    });

    test('chưa liên kết SĐT: chỉ ra VIỆC CẦN LÀM', () async {
      try {
        await api(400, loiJson('LOYALTY_NOT_LINKED'))
            .doiDiem('jwt', 'rw_1', 'k');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, contains('Liên kết số điện thoại'));
      }
    });

    test('ưu đãi đã ngừng có câu riêng, không nhập chung với "không đủ điểm"',
        () async {
      // Hai lý do khác hẳn nhau: một cái khách khắc phục được bằng cách tích thêm điểm, một cái
      // thì không bao giờ.
      await expectLater(
        api(400, loiJson('LOYALTY_REWARD_INACTIVE'))
            .doiDiem('jwt', 'rw_1', 'k'),
        throwsA(isA<AuthException>()
            .having((e) => e.message, 'message', contains('ngừng áp dụng'))),
      );
    });

    test('không rò câu tiếng Anh của máy chủ', () async {
      try {
        await api(400, loiJson('LOYALTY_NOT_ENOUGH_POINTS'))
            .doiDiem('jwt', 'rw_1', 'k');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, isNot(contains('in English')));
      }
    });
  });
}
