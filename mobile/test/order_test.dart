import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/orders/order.dart';
import 'package:restaurant_mobile/core/orders/order_api.dart';

String loiJson(String code) => jsonEncode({
      'error': {'code': code, 'message': 'in English', 'details': {}}
    });

HttpOrderApi apiTraVe(int status, String body,
        {void Function(http.Request)? ghiLai}) =>
    HttpOrderApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('nhãn trạng thái đơn', () {
    test('Ready nói rõ là CHỜ MANG RA, không phải đã xong bữa', () {
      // Dịch Ready thành "Hoàn tất" sẽ khiến khách tưởng có thể đứng dậy đi về trong khi món
      // còn nằm ở bếp.
      expect(nhanTrangThaiDon('Ready'), 'Nấu xong, chờ mang ra');
      expect(nhanTrangThaiDon('Ready'), isNot(contains('Hoàn tất')));
    });

    test('Completed mới là đã thanh toán', () {
      expect(nhanTrangThaiDon('Completed'), 'Đã thanh toán');
    });

    test('phủ hết trạng thái backend có', () {
      // Thiếu một trạng thái nghĩa là khách thấy chữ tiếng Anh giữa màn hình tiếng Việt.
      for (final s in [
        'Draft',
        'Placed',
        'Confirmed',
        'Preparing',
        'Ready',
        'Served',
        'Completed',
        'Cancelled'
      ]) {
        expect(nhanTrangThaiDon(s), isNot(equals(s)),
            reason: 'thiếu nhãn cho $s');
      }
    });

    test('trạng thái LẠ trả nguyên văn, không nuốt thành câu chung chung', () {
      // Backend có thể thêm trạng thái mới trước khi app kịp cập nhật. Hiện "Đang xử lý" cho mọi
      // thứ chưa biết sẽ giấu mất chuyện đó và không ai phát hiện app đã lạc hậu.
      expect(nhanTrangThaiDon('TrangThaiMoi'), 'TrangThaiMoi');
    });
  });

  group('nhãn trạng thái món', () {
    test('Pending ở cấp MÓN là chờ nấu, không phải chờ thu tiền', () {
      // Cùng chữ Pending, hai nghĩa khác nhau ở hai cấp. Dùng chung một câu là cách nhanh nhất
      // để hiểu nhầm.
      expect(nhanTrangThaiMon('Pending'), 'Chờ nấu');
    });

    test('phủ hết trạng thái món', () {
      for (final s in [
        'Pending',
        'Preparing',
        'Ready',
        'Served',
        'Cancelled'
      ]) {
        expect(nhanTrangThaiMon(s), isNot(equals(s)),
            reason: 'thiếu nhãn cho $s');
      }
    });
  });

  group('đơn đã xong chưa', () {
    test('Completed và Cancelled là xong', () {
      expect(donDaXong('Completed'), isTrue);
      expect(donDaXong('Cancelled'), isTrue);
    });

    test('Served CHƯA xong — món đã ra bàn nhưng chưa trả tiền', () {
      // Đây là chỗ dễ sai nhất: "đã mang ra bàn" nghe như kết thúc, nhưng hoá đơn vẫn mở.
      expect(donDaXong('Served'), isFalse);
    });
  });

  group('gọi API', () {
    test('uỷ quyền bằng X-Table-Session-Token, KHÔNG bằng JWT', () async {
      // Đơn thuộc về cái BÀN, không thuộc về tài khoản. Ai đang ngồi ở bàn đều xem được, kể cả
      // khách vãng lai đi cùng — đúng như web.
      http.Request? daGui;
      await apiTraVe(200, '{"orders":[],"total":0}', ghiLai: (r) => daGui = r)
          .donCuaPhien('ts_abc', 'tst_bi_mat');

      expect(daGui!.url.path, '/api/table-sessions/ts_abc/orders');
      expect(daGui!.headers['X-Table-Session-Token'], 'tst_bi_mat');
      expect(daGui!.headers.containsKey('Authorization'), isFalse);
    });

    test('phân giải đơn và món', () async {
      final ds = await apiTraVe(
          200,
          jsonEncode({
            'orders': [
              {
                'orderId': 'o1',
                'orderCode': 'DH0001',
                'status': 'Preparing',
                'totalAmount': 175000,
                'createdAt': '2026-08-20T12:00:00.123456789Z',
                'items': [
                  {
                    'orderItemId': 'oi1',
                    'name': 'Phở bò tái',
                    'quantity': 2,
                    'unitPrice': 60000,
                    'lineTotal': 120000,
                    'status': 'Preparing',
                  }
                ],
              }
            ],
            'total': 1,
          })).donCuaPhien('ts_abc', 'tst');

      expect(ds.single.orderCode, 'DH0001');
      expect(ds.single.createdAt.isUtc, isTrue);
      expect(ds.single.items.single.name, 'Phở bò tái');
      expect(ds.single.items.single.quantity, 2);
    });

    test('phiên HẾT HẠN có câu riêng, khác hẳn token sai', () async {
      // Khách không làm gì sai, chỉ là bàn đã đóng. Báo "token không hợp lệ" khiến họ tưởng app
      // hỏng và thử đi thử lại.
      try {
        await apiTraVe(410, loiJson('TABLE_SESSION_EXPIRED'))
            .donCuaPhien('ts', 'tst');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.code, 'TABLE_SESSION_EXPIRED');
        expect(e.message, contains('đã kết thúc'));
      }
    });

    test('token sai cho câu bảo quét lại QR', () async {
      await expectLater(
        apiTraVe(401, loiJson('TABLE_SESSION_TOKEN_INVALID'))
            .donCuaPhien('ts', 'sai'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'TABLE_SESSION_TOKEN_INVALID')
            .having((e) => e.message, 'message', contains('Quét lại'))),
      );
    });

    test('phiên chưa có đơn nào là hợp lệ, không phải lỗi', () async {
      expect(
          await apiTraVe(200, '{"orders":[],"total":0}')
              .donCuaPhien('ts', 'tst'),
          isEmpty);
    });
  });
}
