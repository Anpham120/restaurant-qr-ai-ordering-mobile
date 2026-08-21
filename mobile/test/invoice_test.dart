import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/payment/invoice.dart';
import 'package:restaurant_mobile/core/payment/invoice_api.dart';

String loiJson(String code) => jsonEncode({
      'error': {'code': code, 'message': 'in English', 'details': {}}
    });

const String hoaDonJson = '''
{"tableSessionId":"ts_abc","invoiceCode":"INV-20260821-7150C03E","tableCode":"T30",
 "status":"Pending","method":"COD","subtotalAmount":220000,"discountAmount":0,
 "totalAmount":220000,"promotionCode":null,"customerPhoneNumber":null,
 "orderRounds":[],"items":[{"menuItemId":"m_004","name":"Bánh cuốn","unitPrice":55000,
 "quantity":4,"lineTotal":220000}],"vietQr":null}
''';

HttpInvoiceApi api(int status, String body,
        {void Function(http.BaseRequest)? ghiLai}) =>
    HttpInvoiceApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('đọc hoá đơn', () {
    test('uỷ quyền bằng token bàn, không bằng JWT', () async {
      http.BaseRequest? daGui;
      await api(200, hoaDonJson, ghiLai: (r) => daGui = r)
          .hoaDon('ts_abc', 'tst');

      expect(daGui!.url.path, '/api/table-sessions/ts_abc/invoice');
      expect(daGui!.headers['X-Table-Session-Token'], 'tst');
      expect(daGui!.headers.containsKey('Authorization'), isFalse);
    });

    test('phân giải hoá đơn COD, vietQr null', () async {
      final hd = await api(200, hoaDonJson).hoaDon('ts', 'tst');

      expect(hd.invoiceCode, 'INV-20260821-7150C03E');
      expect(hd.status, 'Pending');
      expect(hd.method, 'COD');
      expect(hd.totalAmount, 220000);
      expect(hd.vietQr, isNull);
      expect(hd.items.single.quantity, 4);
    });
  });

  group('yêu cầu thanh toán', () {
    test('LUÔN gửi Idempotency-Key và phương thức', () async {
      http.BaseRequest? daGui;
      await api(200, jsonEncode({'invoice': jsonDecode(hoaDonJson)}),
              ghiLai: (r) => daGui = r)
          .yeuCauThanhToan('ts_abc', 'tst', 'COD', 'pay.k1');

      expect(daGui!.url.path,
          '/api/table-sessions/ts_abc/invoice/payment-request');
      expect(daGui!.headers['Idempotency-Key'], 'pay.k1');
      expect(jsonDecode((daGui! as http.Request).body), {'method': 'COD'});
    });

    test('gửi số điện thoại khi có — quyết định đơn có tích điểm hay không',
        () async {
      http.BaseRequest? daGui;
      await api(200, jsonEncode({'invoice': jsonDecode(hoaDonJson)}),
              ghiLai: (r) => daGui = r)
          .yeuCauThanhToan('ts', 'tst', 'COD', 'k', soDienThoai: '0901234567');

      expect(
          (jsonDecode((daGui! as http.Request).body)
              as Map)['customerPhoneNumber'],
          '0901234567');
    });

    test('KHÔNG gửi khoá số điện thoại khi chưa liên kết', () async {
      http.BaseRequest? daGui;
      await api(200, jsonEncode({'invoice': jsonDecode(hoaDonJson)}),
          ghiLai: (r) => daGui = r).yeuCauThanhToan('ts', 'tst', 'COD', 'k');

      expect(
          (jsonDecode((daGui! as http.Request).body) as Map)
              .containsKey('customerPhoneNumber'),
          isFalse);
    });

    test('bóc hoá đơn ra khỏi khoá invoice của phản hồi', () async {
      // GET trả thẳng hoá đơn, POST bọc nó trong {invoice, payment, vietQr}. Đọc nhầm tầng thì
      // mọi trường thành null và màn hình hiện hoá đơn 0 đồng.
      final hd = await api(200,
              jsonEncode({'invoice': jsonDecode(hoaDonJson), 'payment': {}}))
          .yeuCauThanhToan('ts', 'tst', 'COD', 'k');

      expect(hd.invoiceCode, 'INV-20260821-7150C03E');
      expect(hd.totalAmount, 220000);
    });

    test('phân giải VietQR kèm nội dung chuyển khoản', () async {
      final hd = await api(
          200,
          jsonEncode({
            'invoice': {
              ...jsonDecode(hoaDonJson) as Map<String, dynamic>,
              'method': 'VietQR',
              'vietQr': {
                'invoiceCode': 'INV-1',
                'amount': 220000,
                'transferContent': 'INV1 T30',
                'quickLink': 'https://img.vietqr.io/image/x',
                'qrImageDataUri': 'data:image/png;base64,AAA',
              },
            }
          })).yeuCauThanhToan('ts', 'tst', 'VietQR', 'k');

      expect(hd.vietQr!.transferContent, 'INV1 T30');
      expect(hd.vietQr!.amount, 220000);
      expect(hd.vietQr!.qrImageDataUri, startsWith('data:image/png'));
    });

    test('chưa cấu hình ngân hàng: chỉ ra lối thoát CÓ THẬT, không bảo thử lại',
        () async {
      // Đo trên hệ thống đang chạy TRƯỚC khi sửa backend: HTTP 500 không mã lỗi. Sau khi sửa:
      // 400 VIETQR_CONFIG_MISSING. Thử lại sẽ hỏng y hệt nên câu thông báo phải nói cách khác.
      try {
        await api(400, loiJson('VIETQR_CONFIG_MISSING'))
            .yeuCauThanhToan('ts', 'tst', 'VietQR', 'k');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.code, 'VIETQR_CONFIG_MISSING');
        expect(e.message, contains('tiền mặt'));
        expect(e.message, isNot(contains('thử lại')));
      }
    });

    test('đã yêu cầu rồi thì nói rõ đang chờ nhân viên', () async {
      await expectLater(
        api(400, loiJson('TABLE_INVOICE_PAYMENT_PENDING'))
            .yeuCauThanhToan('ts', 'tst', 'COD', 'k'),
        throwsA(isA<AuthException>()
            .having((e) => e.message, 'message', contains('Chờ nhân viên'))),
      );
    });
  });

  group('nhãn và hướng dẫn', () {
    test('Pending của HOÁ ĐƠN là chờ xác nhận, không phải chờ nấu', () {
      // Cùng chữ Pending có ba nghĩa trong hệ thống này: chờ nấu (món), chờ xác nhận (hoá đơn),
      // chờ thu tiền (thanh toán). Đó là lý do mỗi cấp có hàm nhãn riêng.
      expect(nhanTrangThaiHoaDon('Pending'), 'Đang chờ xác nhận');
    });

    test('phủ hết trạng thái hoá đơn', () {
      for (final s in ['NotRequested', 'Pending', 'Paid', 'Cancelled']) {
        expect(nhanTrangThaiHoaDon(s), isNot(equals(s)),
            reason: 'thiếu nhãn cho $s');
      }
    });

    test('trạng thái lạ trả nguyên văn', () {
      expect(nhanTrangThaiHoaDon('TrangThaiMoi'), 'TrangThaiMoi');
    });

    test('hướng dẫn COD chỉ tới QUẦY, không hứa app tự xác nhận', () {
      // Khách không tự xác nhận được — đo thật: POST payment/confirm bằng token bàn trả 401.
      final h = huongDanChoXacNhan('COD');
      expect(h, contains('quầy'));
      expect(h, contains('Nhân viên xác nhận'));
    });

    test('hướng dẫn VietQR NHẤN MẠNH giữ nguyên nội dung chuyển khoản', () {
      // Webhook Casso đối soát bằng đúng chuỗi đó (#3). Sửa một ký tự là tiền về mà hệ thống
      // không nhận ra, và hoá đơn nằm chờ tới khi có người xử lý tay.
      expect(huongDanChoXacNhan('VietQR'), contains('GIỮ NGUYÊN'));
    });
  });
}
