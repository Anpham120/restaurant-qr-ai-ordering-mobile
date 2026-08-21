import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/cart/cart.dart';
import 'package:restaurant_mobile/core/cart/cart_api.dart';
import 'package:restaurant_mobile/core/orders/create_order_api.dart';
import 'package:restaurant_mobile/core/tables/table_session.dart';

String loiJson(String code) => jsonEncode({
      'error': {'code': code, 'message': 'in English', 'details': {}}
    });

const String gioJson = '''
{"tableSessionId":"ts_abc","itemCount":2,"subtotal":120000,
 "items":[{"id":"ci1","menuItemId":"m1","name":"Phở bò tái","price":60000,
           "quantity":2,"lineTotal":120000,"isAvailable":true,"note":null}]}
''';

const String donJson =
    '{"orderId":"o1","orderCode":"DH1","status":"Placed","totalAmount":120000,'
    '"customerAccessToken":"tok"}';

HttpCartApi cartApi(int status, String body,
        {void Function(http.BaseRequest)? ghiLai}) =>
    HttpCartApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

HttpCreateOrderApi donApi(int status, String body,
        {void Function(http.Request)? ghiLai}) =>
    HttpCreateOrderApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

Cart gioMau() => const Cart(
      tableSessionId: 'ts_abc',
      itemCount: 2,
      subtotal: 120000,
      items: [
        CartItem(
            menuItemId: 'm1',
            name: 'Phở',
            price: 60000,
            quantity: 2,
            lineTotal: 120000,
            isAvailable: true),
      ],
    );

TableSession phienMau() => TableSession(
      sessionId: 'ts_abc',
      tableCode: 'T01',
      tableDisplayName: 'Ban 01',
      status: 'Open',
      expiresAt: DateTime.utc(2030),
      isExpired: false,
      tableSessionToken: 'tst',
      resumeState: 'FreshStart',
      qrToken: 'cmc-table-t01-qr',
    );

class _MatMang implements Exception {
  const _MatMang();
}

void main() {
  group('giỏ hàng gửi DELTA', () {
    test('gửi đúng thân {menuItemId, delta} và token bàn', () async {
      http.BaseRequest? daGui;
      await cartApi(200, gioJson, ghiLai: (r) => daGui = r)
          .doiSoLuong('ts_abc', 'tst', 'm1', 1);

      expect(daGui!.url.path, '/api/table-sessions/ts_abc/cart/items');
      expect(jsonDecode((daGui! as http.Request).body),
          {'menuItemId': 'm1', 'delta': 1});
      expect(daGui!.headers['X-Table-Session-Token'], 'tst');
    });

    test('KHÔNG tự gửi lại khi lỗi mạng — delta không idempotent', () async {
      // Gửi +1 hai lần thì khách có hai phần, không phải một. Khi một lời gọi hỏng mà không rõ
      // máy chủ đã nhận hay chưa, việc đúng là đọc lại giỏ chứ không đoán rồi gửi thêm delta.
      var soLan = 0;
      final api = HttpCartApi(
        baseUrl: 'http://test',
        client: MockClient((_) async {
          soLan++;
          throw const _MatMang();
        }),
      );

      await expectLater(
          api.doiSoLuong('ts', 'tst', 'm1', 1),
          throwsA(isA<AuthException>()
              .having((e) => e.code, 'code', 'NETWORK_ERROR')));
      expect(soLan, 1, reason: 'chỉ được gọi đúng MỘT lần, không gửi lại');
    });

    test('bớt món gửi delta âm', () async {
      http.BaseRequest? daGui;
      await cartApi(200, gioJson, ghiLai: (r) => daGui = r)
          .doiSoLuong('ts_abc', 'tst', 'm1', -1);

      expect(jsonDecode((daGui! as http.Request).body),
          {'menuItemId': 'm1', 'delta': -1});
    });

    test('xoá hết dùng DELETE', () async {
      http.BaseRequest? daGui;
      await cartApi(200,
          '{"tableSessionId":"ts_abc","items":[],"itemCount":0,"subtotal":0}',
          ghiLai: (r) => daGui = r).xoaHet('ts_abc', 'tst');

      expect(daGui!.method, 'DELETE');
    });

    test('đang chờ thanh toán: câu thông báo nói rõ VẪN BỚT ĐƯỢC món',
        () async {
      // Backend cố ý chỉ chặn THÊM món, vẫn cho bớt — nếu không thì khách lỡ thêm nhầm sẽ kẹt
      // phải trả tiền cho nó. Câu chung chung "giỏ đã khoá" làm mất đúng thông tin đó.
      try {
        await cartApi(400, loiJson('TABLE_INVOICE_PAYMENT_PENDING'))
            .doiSoLuong('ts', 'tst', 'm1', 1);
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, contains('bớt được'));
      }
    });

    test('món vừa hết cho câu riêng', () async {
      await expectLater(
        cartApi(400, loiJson('MENU_ITEM_UNAVAILABLE'))
            .doiSoLuong('ts', 'tst', 'm1', 1),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'MENU_ITEM_UNAVAILABLE')),
      );
    });
  });

  group('tạo đơn', () {
    test('LUÔN gửi Idempotency-Key — backend bắt buộc', () async {
      http.Request? daGui;
      await donApi(201, donJson, ghiLai: (r) => daGui = r).taoDon(
          phienBan: phienMau(), gio: gioMau(), khoaIdempotency: 'ord.abc123');

      expect(daGui!.headers['Idempotency-Key'], 'ord.abc123');
      expect(daGui!.headers['X-Table-Session-Token'], 'tst');
    });

    test('gửi items dạng {menuItemId, quantity} — KHÔNG phải delta', () async {
      // Giỏ dùng delta, đơn dùng số lượng tuyệt đối. Nhầm hai chỗ này là đặt sai số phần.
      http.Request? daGui;
      await donApi(201, donJson, ghiLai: (r) => daGui = r)
          .taoDon(phienBan: phienMau(), gio: gioMau(), khoaIdempotency: 'k');

      final body = jsonDecode(daGui!.body) as Map<String, dynamic>;
      expect(body['items'], [
        {'menuItemId': 'm1', 'quantity': 2}
      ]);
      expect(body['tableSessionId'], 'ts_abc');
      expect(body['orderType'], 'DineIn');
    });

    test('TỰ ĐIỀN số điện thoại khi có — §9.7 gọi đây là tính năng lõi',
        () async {
      http.Request? daGui;
      await donApi(201, donJson, ghiLai: (r) => daGui = r).taoDon(
          phienBan: phienMau(),
          gio: gioMau(),
          khoaIdempotency: 'k',
          soDienThoai: '0901234567');

      expect((jsonDecode(daGui!.body) as Map)['customerPhoneNumber'],
          '0901234567');
    });

    test('KHÔNG gửi khoá số điện thoại khi chưa liên kết', () async {
      // Gửi chuỗi rỗng khác hẳn không gửi: backend sẽ coi đó là một số và tạo hồ sơ tích điểm rác.
      http.Request? daGui;
      await donApi(201, donJson, ghiLai: (r) => daGui = r)
          .taoDon(phienBan: phienMau(), gio: gioMau(), khoaIdempotency: 'k');

      expect(
          (jsonDecode(daGui!.body) as Map).containsKey('customerPhoneNumber'),
          isFalse);
    });

    test('nhận cả 201 lẫn 200 cho lần gửi lại theo khoá cũ', () async {
      // Gửi lại sau lỗi mạng: backend nhận ra khoá cũ và trả lại đơn đã tạo thay vì tạo đơn thứ
      // hai. ĐO THẬT: nó trả 201, không phải 200 như tôi đoán lúc đầu — cùng mã đơn cả hai lần
      // (ORD-1016), và bảng orders chỉ có một dòng. Vẫn nhận 200 vì đó là mã hợp lẽ cho "trả
      // lại thứ đã có" và không có gì bảo đảm hành vi này không đổi.
      final don = await donApi(200, donJson)
          .taoDon(phienBan: phienMau(), gio: gioMau(), khoaIdempotency: 'k');

      expect(don.orderCode, 'DH1');
      expect(don.customerAccessToken, 'tok');
    });

    test('409 khoá dùng lại: câu thông báo KHÔNG đổ lỗi cho khách', () async {
      try {
        await donApi(409, loiJson('IDEMPOTENCY_KEY_REUSED'))
            .taoDon(phienBan: phienMau(), gio: gioMau(), khoaIdempotency: 'k');
        fail('phải ném lỗi');
      } on AuthException catch (e) {
        expect(e.message, contains('đặt lại'));
        expect(e.message, isNot(contains('in English')));
      }
    });

    test('món vừa hết lúc đặt cho câu bảo xem lại giỏ', () async {
      await expectLater(
        donApi(400, loiJson('MENU_ITEM_UNAVAILABLE'))
            .taoDon(phienBan: phienMau(), gio: gioMau(), khoaIdempotency: 'k'),
        throwsA(isA<AuthException>()
            .having((e) => e.message, 'message', contains('Xem lại giỏ'))),
      );
    });
  });
}
