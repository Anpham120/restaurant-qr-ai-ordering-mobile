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

HttpOrderApi api(int status, String body,
        {void Function(http.BaseRequest)? ghiLai}) =>
    HttpOrderApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('ước lượng thời gian (hạn chế #10)', () {
    test('KHÔNG có ước lượng thì trả null — app không được bịa con số', () {
      // Backend chỉ ước lượng khi món có từ 20 mẫu lịch sử. Đo trên hệ thống đang chạy: chưa món
      // nào đủ mẫu nên mọi món đều null. Bịa "khoảng 15 phút" ở tầng app phá đúng cơ chế mà
      // hạn chế #10 dựng lên, và không ai thấy.
      expect(moTaUocLuong(null, null), isNull);
      expect(moTaUocLuong(10, null), isNull);
      expect(moTaUocLuong(null, 15), isNull);
    });

    test('có ước lượng thì hiện dạng KHOẢNG, không phải một con số', () {
      // Điều kiện thứ hai của #10: không bao giờ một con số chính xác giả tạo.
      expect(moTaUocLuong(10, 15), '10–15 phút');
    });

    test('khoảng suy biến (low == high) vẫn nói rõ là "khoảng"', () {
      // Backend đảm bảo high >= low + 1, nhưng nếu một ngày điều đó đổi thì app vẫn không được
      // hiện "10-10 phút" như thể đó là con số chắc chắn.
      expect(moTaUocLuong(10, 10), 'khoảng 10 phút');
      expect(moTaUocLuong(12, 11), 'khoảng 12 phút');
    });
  });

  group('huỷ món (hạn chế #11)', () {
    test('CHỈ huỷ được món đang Pending', () {
      // Backend chặt hơn đường của nhân viên có chủ ý: nhân viên vẫn huỷ được món Preparing,
      // khách thì không, vì tới lúc đó bếp đã dùng nguyên liệu.
      expect(chophepHuyMon('Pending', coTokenDon: true), isTrue);
      for (final s in ['Preparing', 'Ready', 'Served', 'Cancelled']) {
        expect(chophepHuyMon(s, coTokenDon: true), isFalse,
            reason: 'không được huỷ khi $s');
      }
    });

    test('KHÔNG có token của đơn thì không huỷ được, dù món đang Pending', () {
      // Đơn do máy khác trong bàn đặt. Người đặt mới là người quyết định huỷ.
      expect(chophepHuyMon('Pending', coTokenDon: false), isFalse);
    });

    test('gửi X-Order-Token, KHÔNG gửi token bàn', () async {
      http.BaseRequest? daGui;
      await api(200, '{}', ghiLai: (r) => daGui = r)
          .huyMon('ORD-1016', 'oi1', 'otok');

      expect(daGui!.url.path, '/api/orders/ORD-1016/items/oi1/cancel');
      expect(daGui!.method, 'POST');
      expect(daGui!.headers['X-Order-Token'], 'otok');
      expect(daGui!.headers.containsKey('X-Table-Session-Token'), isFalse);
    });

    test('bếp đã nấu: nói ĐÚNG LÝ DO và chỉ ra lối đi tiếp', () async {
      // "Không huỷ được" khiến khách tưởng app hỏng và bấm lại. Sự thật là giới hạn có thật, và
      // nhân viên vẫn xử lý được.
      try {
        await api(400, loiJson('ORDER_ITEM_CANCEL_NOT_ALLOWED'))
            .huyMon('ORD-1', 'oi1', 'tok');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, contains('Bếp đã bắt đầu nấu'));
        expect(e.message, contains('nhân viên'));
      }
    });

    test('404 phủ được CẢ HAI nghĩa: không có đơn, hoặc sai token', () async {
      // Backend cố ý trả ORDER_NOT_FOUND cho trường hợp sai token, vì mã đơn tăng dần nên xác
      // nhận "đơn này tồn tại" đã là rò rỉ. Câu thông báo của app phải phủ cả hai.
      try {
        await api(404, loiJson('ORDER_NOT_FOUND'))
            .huyMon('ORD-1', 'oi1', 'sai');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, contains('không có quyền'));
      }
    });
  });
}
