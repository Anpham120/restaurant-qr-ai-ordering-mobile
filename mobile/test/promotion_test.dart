import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/promotions/promotion.dart';
import 'package:restaurant_mobile/core/promotions/promotion_api.dart';

Promotion km({
  String type = 'Percentage',
  num discountValue = 10,
  num? minOrderAmount,
  num? maxDiscountAmount,
  bool isFlashSale = false,
  DateTime? endsAt,
}) =>
    Promotion(
      code: 'SALE',
      name: 'Sale',
      type: type,
      discountValue: discountValue,
      minOrderAmount: minOrderAmount,
      maxDiscountAmount: maxDiscountAmount,
      isFlashSale: isFlashSale,
      endsAt: endsAt,
    );

HttpPromotionApi apiTraVe(int status, String body,
        {void Function(http.Request)? ghiLai}) =>
    HttpPromotionApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('mô tả mức giảm', () {
    test('phần trăm', () {
      expect(moTaMucGiam(km(discountValue: 10)), 'Giảm 10%');
    });

    test('số tiền cố định có dấu chấm ngăn nghìn', () {
      expect(moTaMucGiam(km(type: 'FixedAmount', discountValue: 50000)),
          'Giảm 50.000đ');
    });

    test('phần trăm có trần giảm thì NÊU trần ra', () {
      // Quên trần là hứa với khách một con số không đúng: "giảm 20%" trên hoá đơn 2 triệu nghe
      // như 400.000 trong khi thực nhận chỉ 100.000.
      expect(moTaMucGiam(km(discountValue: 20, maxDiscountAmount: 100000)),
          'Giảm 20%, tối đa 100.000đ');
    });

    test('số tiền cố định KHÔNG nêu trần, dù dữ liệu có', () {
      // Với mã giảm thẳng tiền, trần không bao giờ ràng buộc. Nêu ra khiến khách tưởng có thêm
      // một giới hạn nữa.
      expect(
          moTaMucGiam(km(
              type: 'FixedAmount',
              discountValue: 50000,
              maxDiscountAmount: 30000)),
          'Giảm 50.000đ');
    });

    test('phần trăm lẻ giữ nguyên, phần trăm tròn bỏ đuôi .0', () {
      expect(moTaMucGiam(km(discountValue: 12.5)), 'Giảm 12.5%');
      expect(moTaMucGiam(km(discountValue: 15.0)), 'Giảm 15%');
    });

    test('số tiền hàng triệu ngăn đúng ba chữ số', () {
      expect(moTaMucGiam(km(type: 'FixedAmount', discountValue: 1234567)),
          'Giảm 1.234.567đ');
    });
  });

  group('điều kiện tối thiểu', () {
    test('có ngưỡng thì hiện ra', () {
      expect(moTaDieuKien(km(minOrderAmount: 200000)), 'Đơn từ 200.000đ');
    });

    test('không có ngưỡng thì không hiện dòng nào', () {
      expect(moTaDieuKien(km()), isNull);
    });

    test('ngưỡng bằng 0 coi như không có', () {
      // Backend cho phép 0. Hiện "Đơn từ 0đ" là một dòng vô nghĩa chiếm chỗ.
      expect(moTaDieuKien(km(minOrderAmount: 0)), isNull);
    });
  });

  group('gọi API', () {
    test('KHÔNG gửi Authorization — endpoint công khai', () async {
      // Bắt đăng nhập mới xem được khuyến mãi sẽ biến app thành cửa duy nhất, một quyết định
      // sản phẩm không ai ra.
      http.Request? daGui;
      await apiTraVe(200, '{"items":[]}', ghiLai: (r) => daGui = r).dangChay();

      expect(daGui!.url.path, '/api/promotions/active');
      expect(daGui!.headers.containsKey('Authorization'), isFalse);
    });

    test('phân giải danh sách, giữ endsAt ở UTC', () async {
      final ds = await apiTraVe(
          200,
          jsonEncode({
            'items': [
              {
                'code': 'FLASH20',
                'name': 'Giờ vàng',
                'description': 'Chỉ trong hôm nay',
                'type': 'Percentage',
                'discountValue': 20,
                'minOrderAmount': 200000,
                'maxDiscountAmount': 100000,
                'isFlashSale': true,
                'endsAt': '2026-08-20T16:00:00.123456789Z',
              }
            ]
          })).dangChay();

      expect(ds, hasLength(1));
      expect(ds.first.code, 'FLASH20');
      expect(ds.first.isFlashSale, isTrue);
      expect(ds.first.endsAt!.isUtc, isTrue);
      expect(ds.first.endsAt, DateTime.utc(2026, 8, 20, 16, 0, 0, 123, 456));
    });

    test('endsAt null nghĩa là KHÔNG có hạn, không phải đã hết hạn', () async {
      final ds = await apiTraVe(
          200,
          jsonEncode({
            'items': [
              {
                'code': 'ALWAYS',
                'name': 'Thường trực',
                'type': 'FixedAmount',
                'discountValue': 10000,
                'isFlashSale': false,
                'endsAt': null,
              }
            ]
          })).dangChay();

      expect(ds.first.endsAt, isNull);
    });

    test('danh sách rỗng là hợp lệ, không phải lỗi', () async {
      expect(await apiTraVe(200, '{"items":[]}').dangChay(), isEmpty);
    });

    test('thiếu hẳn khoá items thì coi như rỗng, không nổ', () async {
      expect(await apiTraVe(200, '{}').dangChay(), isEmpty);
    });

    test('502 cho câu đọc được', () async {
      await expectLater(
        apiTraVe(502, '<html>502</html>').dangChay(),
        throwsA(
            isA<AuthException>().having((e) => e.code, 'code', 'SERVER_ERROR')),
      );
    });
  });
}
