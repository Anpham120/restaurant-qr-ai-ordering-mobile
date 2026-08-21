import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/orders/favourite_api.dart';

/// Thân đúng như backend đang chạy trả về (đo bằng curl).
final Map<String, dynamic> thatSu = {
  'items': [
    {
      'menuItemId': 'm_004',
      'name': 'Bánh cuốn Thanh Trì',
      'timesOrdered': 3,
      'totalQuantity': 3
    },
    {
      'menuItemId': 'm_020',
      'name': 'Cơm hến Huế',
      'timesOrdered': 1,
      'totalQuantity': 8
    },
    {
      'menuItemId': 'm_010',
      'name': 'Bún bò Huế',
      'timesOrdered': 1,
      'totalQuantity': 1
    },
  ]
};

HttpFavouriteApi api(int status, String body,
        {void Function(http.BaseRequest)? ghiLai}) =>
    HttpFavouriteApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

MonHayGoi mon(String id, int lan, int phan) =>
    MonHayGoi(menuItemId: id, name: id, timesOrdered: lan, totalQuantity: phan);

void main() {
  group('gọi API', () {
    test('uỷ quyền bằng JWT, không tham số định danh nào', () async {
      http.BaseRequest? daGui;
      await api(200, jsonEncode(thatSu), ghiLai: (r) => daGui = r)
          .monHayGoi('jwt');

      expect(daGui!.url.path, '/api/orders/mine/favourites');
      expect(daGui!.url.query, isEmpty);
      expect(daGui!.headers['Authorization'], 'Bearer jwt');
    });

    test('giữ NGUYÊN thứ tự máy chủ trả về', () async {
      // Backend sắp theo SỐ LẦN gọi. Nếu app sắp lại theo tổng số phần thì "Cơm hến 8 phần trong
      // một bữa liên hoan" sẽ leo lên đầu và danh sách kể sai về thói quen của khách.
      final ds = await api(200, jsonEncode(thatSu)).monHayGoi('jwt');

      expect(ds.map((m) => m.menuItemId).toList(), ['m_004', 'm_020', 'm_010']);
      expect(ds.first.timesOrdered, 3);
    });

    test('chưa có lịch sử là hợp lệ, không phải lỗi', () async {
      expect(await api(200, '{"items":[]}').monHayGoi('jwt'), isEmpty);
    });

    test('401 nói phiên hết hạn', () async {
      await expectLater(
        api(401, '{}').monHayGoi('jwt'),
        throwsA(isA<AuthException>()
            .having((e) => e.message, 'message', contains('Đăng nhập lại'))),
      );
    });
  });

  group('cái gì mới đáng gọi là thói quen', () {
    test('gọi MỘT lần thì chưa phải "hay gọi"', () {
      // Đó chỉ là một lần thử. Hiện "1 lần" dưới nhãn "Món tôi hay gọi" vừa vô nghĩa vừa khiến
      // danh sách đầy những món khách ăn thử rồi thôi.
      expect(moTaThoiQuen(mon('m1', 1, 1)), isNull);
      expect(moTaThoiQuen(mon('m1', 1, 8)), isNull,
          reason: 'tám phần trong MỘT lần vẫn là một lần');
    });

    test('gọi từ hai lần trở lên mới hiện', () {
      expect(moTaThoiQuen(mon('m1', 2, 2)), 'Đã gọi 2 lần');
      expect(moTaThoiQuen(mon('m1', 3, 3)), 'Đã gọi 3 lần');
    });

    test('lọc bỏ món chỉ gọi một lần, giữ nguyên thứ tự còn lại', () {
      final ds = locThoiQuen([mon('a', 3, 3), mon('b', 1, 8), mon('c', 2, 2)]);

      expect(ds.map((m) => m.menuItemId).toList(), ['a', 'c']);
    });

    test('mọi món đều mới thì danh sách rỗng, không phải lỗi', () {
      expect(locThoiQuen([mon('a', 1, 1), mon('b', 1, 5)]), isEmpty);
    });
  });
}
