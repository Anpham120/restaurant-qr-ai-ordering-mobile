import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/chat/chat.dart';
import 'package:restaurant_mobile/core/chat/chat_api.dart';

String loiJson(String code) => jsonEncode({
      'error': {'code': code, 'message': 'in English', 'details': {}}
    });

/// Thân đúng như backend đang chạy trả về (đo bằng curl).
final Map<String, dynamic> luotThat = {
  'userMessage': {
    'id': 'm1',
    'role': 'user',
    'content': 'Cho tôi món nào ít cay, hợp người lớn tuổi?',
    'suggestedCartActions': <dynamic>[],
  },
  'message': {
    'id': 'm2',
    'role': 'assistant',
    'content': 'Mời bạn tham khảo:\n- Cháo lòng Sài Gòn (45.000đ)',
    'suggestedCartActions': <dynamic>[],
  },
  'suggestedCartActions': [
    {
      'menuItemId': 'm_048',
      'name': 'Cháo lòng Sài Gòn',
      'price': 45000,
      'quantity': 1,
      'reason': 'Audience:elderly; không cay.',
      'requiresCustomerConfirmation': true,
      'evidenceIds': ['menu:m_048'],
    }
  ],
  'guardrailFlags': <dynamic>[],
  'suggestStaffHandoff': false,
};

HttpChatApi api(int status, String body,
        {void Function(http.BaseRequest)? ghiLai}) =>
    HttpChatApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('mở phiên chat', () {
    test('gửi tableSessionId và tableCode', () async {
      http.BaseRequest? daGui;
      await api(
          200,
          jsonEncode({
            'chatSessionId': 'chat_1',
            'accessToken': 'ctok',
            'reused': false
          }),
          ghiLai: (r) => daGui = r).moPhien('ts_abc', 'T29');

      expect(daGui!.url.path, '/api/chat/sessions');
      expect(jsonDecode((daGui! as http.Request).body),
          {'tableSessionId': 'ts_abc', 'tableCode': 'T29'});
    });

    test('reused=true kèm lịch sử: KHÔNG được coi là phiên mới', () async {
      // Bàn đã có phiên chat thì backend dùng lại nó. Xoá màn hình rồi chào lại từ đầu nghĩa là
      // khách quay lại giữa cuộc trò chuyện của chính mình mà thấy trống trơn.
      final s = await api(
          200,
          jsonEncode({
            'chatSessionId': 'chat_1',
            'accessToken': 'ctok',
            'reused': true,
            'messages': [
              {
                'id': 'm0',
                'role': 'user',
                'content': 'câu cũ',
                'suggestedCartActions': <dynamic>[]
              }
            ],
          })).moPhien('ts', 'T29');

      expect(s.reused, isTrue);
      expect(s.messages.single.content, 'câu cũ');
      expect(s.messages.single.cuaKhach, isTrue);
    });

    test('toString() KHÔNG chứa accessToken', () async {
      final s = await api(
          200,
          jsonEncode({
            'chatSessionId': 'chat_1',
            'accessToken': 'BI_MAT_CHAT',
            'reused': false
          })).moPhien('ts', 'T29');

      expect(s.toString(), isNot(contains('BI_MAT_CHAT')));
    });
  });

  group('gửi câu hỏi', () {
    test('gửi token chat và Content-Type có charset=utf-8', () async {
      // Thiếu charset thì câu hỏi tiếng Việt có dấu bị đọc sai byte và backend trả 400
      // "Invalid UTF-8 middle byte" — đã gặp thật khi đo bằng curl.
      http.BaseRequest? daGui;
      await api(200, jsonEncode(luotThat), ghiLai: (r) => daGui = r)
          .gui('chat_1', 'ctok', 'Món nào ít cay?');

      expect(daGui!.url.path, '/api/chat/sessions/chat_1/messages');
      expect(daGui!.headers['X-Chat-Session-Token'], 'ctok');
      expect(daGui!.headers['Content-Type'], contains('utf-8'));
    });

    test('phân giải CẢ tin của khách LẪN câu trả lời', () async {
      // Bản Java trước đây trả một trường `content` duy nhất, nên cả hai phía đều undefined và
      // hội thoại vỡ ngay lượt đầu. Ca này chốt rằng app đọc đúng hai trường.
      final l = await api(200, jsonEncode(luotThat)).gui('c', 't', 'x');

      expect(l.tinKhach.cuaKhach, isTrue);
      expect(l.tinKhach.content, contains('ít cay'));
      expect(l.traLoi.cuaKhach, isFalse);
      expect(l.traLoi.content, contains('Cháo lòng'));
    });

    test('gợi ý giỏ được đọc ra nhưng KHÔNG tự thêm gì', () async {
      // Lớp API chỉ trả dữ liệu. Việc thêm vào giỏ là một hành động riêng do khách bấm — tự thêm
      // là tiêu tiền của khách theo lời một mô hình ngôn ngữ.
      final l = await api(200, jsonEncode(luotThat)).gui('c', 't', 'x');

      expect(l.goiY, hasLength(1));
      expect(l.goiY.single.menuItemId, 'm_048');
      expect(l.goiY.single.price, 45000);
      expect(l.goiY.single.reason, contains('elderly'));
    });

    test('cờ cần gọi nhân viên được đọc đúng', () async {
      final l =
          await api(200, jsonEncode({...luotThat, 'suggestStaffHandoff': true}))
              .gui('c', 't', 'x');

      expect(l.canGoiNhanVien, isTrue);
    });

    test('hỏi quá nhanh: nói "chờ một chút", không nói "lỗi"', () async {
      // 10 tin/phút. Khách không làm gì sai, chỉ hỏi nhanh quá.
      try {
        await api(429, loiJson('CHAT_RATE_LIMITED')).gui('c', 't', 'x');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.code, 'CHAT_RATE_LIMITED');
        expect(e.message, contains('Chờ một chút'));
        expect(e.message.toLowerCase(), isNot(contains('lỗi')));
      }
    });

    test('trợ lý chết: chỉ ra lối đi tiếp CÓ THẬT', () async {
      // Trợ lý chết không phải app chết. Bảo "thử lại" khi dịch vụ AI đang xuống là dẫn khách
      // vào vòng lặp; xem thực đơn và gọi nhân viên là hai lối thoát có thật.
      try {
        await api(503, loiJson('AI_PROVIDER_UNAVAILABLE')).gui('c', 't', 'x');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, contains('thực đơn'));
        expect(e.message, contains('nhân viên'));
      }
    });

    test('câu hỏi quá dài có câu riêng', () async {
      await expectLater(
        api(400, loiJson('CHAT_MESSAGE_TOO_LONG')).gui('c', 't', 'x'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'CHAT_MESSAGE_TOO_LONG')),
      );
    });
  });

  group('chặn ở app trước khi gửi', () {
    test('câu rỗng hoặc chỉ khoảng trắng thì KHÔNG gửi', () {
      // Backend trả CHAT_MESSAGE_EMPTY, nhưng một lượt hỏng VẪN tính vào hạn mức 10 tin/phút.
      // Chặn ở app giữ lại hạn mức cho câu hỏi thật.
      expect(cauHoiGuiDuoc(''), isFalse);
      expect(cauHoiGuiDuoc('   '), isFalse);
      expect(cauHoiGuiDuoc('\n\t'), isFalse);
    });

    test('câu dài quá 2000 ký tự thì KHÔNG gửi', () {
      expect(cauHoiGuiDuoc('a' * 2000), isTrue);
      expect(cauHoiGuiDuoc('a' * 2001), isFalse);
    });

    test('câu bình thường thì gửi được', () {
      expect(cauHoiGuiDuoc('Món nào ít cay?'), isTrue);
    });
  });
}
