import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/orders/order.dart';
import 'package:restaurant_mobile/core/orders/order_history_api.dart';

/// Thân đúng như backend đang chạy trả về (đo bằng curl).
final Map<String, dynamic> lichSuThat = {
  'orders': [
    {
      'orderId': 'o2',
      'orderCode': 'ORD-1019',
      'status': 'Placed',
      'totalAmount': 80000,
      'createdAt': '2026-08-21T07:00:00Z',
      'tableCode': 'T27',
      'items': [
        {
          'orderItemId': 'oi2',
          'menuItemId': 'm_010',
          'name': 'Bún bò Huế',
          'quantity': 1,
          'unitPrice': 80000,
          'lineTotal': 80000,
          'status': 'Pending',
        }
      ],
    },
    {
      'orderId': 'o1',
      'orderCode': 'ORD-1018',
      'status': 'Placed',
      'totalAmount': 110000,
      'createdAt': '2026-08-20T12:00:00Z',
      'tableCode': 'T26',
      'items': [
        {
          'orderItemId': 'oi1',
          'menuItemId': 'm_004',
          'name': 'Bánh cuốn Thanh Trì',
          'quantity': 2,
          'unitPrice': 55000,
          'lineTotal': 110000,
          'status': 'Pending',
        }
      ],
    }
  ],
  'total': 2,
};

HttpOrderHistoryApi api(int status, String body,
        {void Function(http.BaseRequest)? ghiLai}) =>
    HttpOrderHistoryApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

OrderItem mon(String id, String ten, int sl, {String status = 'Pending'}) =>
    OrderItem(
      orderItemId: 'oi_$id',
      menuItemId: id,
      name: ten,
      quantity: sl,
      unitPrice: 1000,
      lineTotal: 1000 * sl,
      status: status,
    );

void main() {
  group('lịch sử đơn của chính mình', () {
    test('uỷ quyền bằng JWT, KHÔNG bằng token bàn', () async {
      // Đây là dữ liệu của TÀI KHOẢN, không phải của một cái bàn — ngược hẳn với
      // GET /api/table-sessions/{id}/orders.
      http.BaseRequest? daGui;
      await api(200, jsonEncode(lichSuThat), ghiLai: (r) => daGui = r)
          .lichSuCuaToi('jwt');

      expect(daGui!.url.path, '/api/orders/mine');
      expect(daGui!.headers['Authorization'], 'Bearer jwt');
      expect(daGui!.headers.containsKey('X-Table-Session-Token'), isFalse);
    });

    test('KHÔNG gửi tham số định danh nào', () async {
      // memberId do backend lấy từ JWT. Nếu app gửi ?memberId= thì nó đang đòi backend mở một
      // đường đọc lịch sử ăn uống của người khác.
      http.BaseRequest? daGui;
      await api(200, jsonEncode(lichSuThat), ghiLai: (r) => daGui = r)
          .lichSuCuaToi('jwt');

      expect(daGui!.url.query, isEmpty);
    });

    test('đọc được đơn từ NHIỀU BÀN — đó là cả điểm của tính năng', () async {
      final ds = await api(200, jsonEncode(lichSuThat)).lichSuCuaToi('jwt');

      expect(ds, hasLength(2));
      expect(ds.map((o) => o.orderCode).toList(), ['ORD-1019', 'ORD-1018']);
      expect(ds.first.items.single.menuItemId, 'm_010');
    });

    test('chưa có lịch sử là hợp lệ, không phải lỗi', () async {
      expect(await api(200, '{"orders":[],"total":0}').lichSuCuaToi('jwt'),
          isEmpty);
    });

    test('401/403 nói phiên hết hạn, không nói "không có quyền"', () async {
      await expectLater(
        api(403, '{}').lichSuCuaToi('jwt'),
        throwsA(isA<AuthException>()
            .having((e) => e.message, 'message', contains('Đăng nhập lại'))),
      );
    });
  });

  group('đặt lại món cũ', () {
    test('món hỏng KHÔNG chặn những món còn lại', () async {
      // Thực đơn đổi giữa hai lần ghé là chuyện bình thường. Dừng ở món đầu tiên hỏng nghĩa là
      // khách mất luôn những món vẫn còn — trong khi họ chỉ muốn gọi lại bữa cũ.
      final kq = await datLaiDon(
        mon: [
          mon('m1', 'Phở', 1),
          mon('m2', 'Món đã ngừng bán', 1),
          mon('m3', 'Chè', 2)
        ],
        themVaoGio: (id, sl) async {
          if (id == 'm2') {
            throw const AuthException('MENU_ITEM_UNAVAILABLE', 'hết');
          }
        },
        moTaLoi: (e) => (e as AuthException).message,
      );

      expect(kq.daThem, ['Phở', 'Chè']);
      expect(kq.khongThem.keys, ['Món đã ngừng bán']);
      expect(kq.tronVen, isFalse);
    });

    test('báo CẢ HAI danh sách — không im lặng bỏ món', () async {
      // Báo "đã thêm vào giỏ" rồi im lặng bỏ ba món là nói dối; khách chỉ phát hiện lúc nhìn
      // hoá đơn.
      final kq = await datLaiDon(
        mon: [mon('m1', 'A', 1), mon('m2', 'B', 1)],
        themVaoGio: (id, sl) async =>
            throw const AuthException('MENU_ITEM_UNAVAILABLE', 'hết'),
        moTaLoi: (e) => (e as AuthException).message,
      );

      expect(kq.daThem, isEmpty);
      expect(kq.khongThem, hasLength(2));
      expect(kq.thatBaiHoanToan, isTrue);
    });

    test('BỎ QUA món đã huỷ ở đơn cũ', () async {
      // Khách đã chủ động bỏ nó lần trước. Thêm lại là làm ngược ý họ.
      final themDuoc = <String>[];
      final kq = await datLaiDon(
        mon: [mon('m1', 'A', 1), mon('m2', 'B', 1, status: 'Cancelled')],
        themVaoGio: (id, sl) async => themDuoc.add(id),
        moTaLoi: (e) => 'x',
      );

      expect(themDuoc, ['m1']);
      expect(kq.daThem, ['A']);
      expect(kq.khongThem, isEmpty);
    });

    test('giữ nguyên SỐ LƯỢNG của đơn cũ', () async {
      final goi = <String, int>{};
      await datLaiDon(
        mon: [mon('m1', 'A', 3)],
        themVaoGio: (id, sl) async => goi[id] = sl,
        moTaLoi: (e) => 'x',
      );

      expect(goi, {'m1': 3});
    });

    test('thêm TUẦN TỰ, không song song', () async {
      // Giỏ hàng dùng DELTA và mọi lời gọi cùng sửa một giỏ. Gửi song song là tự tạo tranh chấp
      // trên đúng thứ không idempotent.
      var dangChay = 0;
      var toiDaSongSong = 0;
      await datLaiDon(
        mon: [mon('m1', 'A', 1), mon('m2', 'B', 1), mon('m3', 'C', 1)],
        themVaoGio: (id, sl) async {
          dangChay++;
          if (dangChay > toiDaSongSong) {
            toiDaSongSong = dangChay;
          }
          await Future<void>.delayed(const Duration(milliseconds: 5));
          dangChay--;
        },
        moTaLoi: (e) => 'x',
      );

      expect(toiDaSongSong, 1,
          reason: 'không được có hai lời gọi giỏ chạy cùng lúc');
    });

    test('đơn toàn món đã huỷ thì không gọi gì và coi như trọn vẹn', () {
      return datLaiDon(
        mon: [mon('m1', 'A', 1, status: 'Cancelled')],
        themVaoGio: (id, sl) async => fail('không được gọi'),
        moTaLoi: (e) => 'x',
      ).then((kq) {
        expect(kq.daThem, isEmpty);
        expect(kq.tronVen, isTrue);
      });
    });
  });
}
