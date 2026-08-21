import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:restaurant_mobile/core/auth/auth_api.dart';
import 'package:restaurant_mobile/core/menu/menu.dart';
import 'package:restaurant_mobile/core/menu/menu_api.dart';

MenuCategory dm(String id, String ten) =>
    MenuCategory(categoryId: id, name: ten);

MenuItem mon(String id, String danhMuc, {bool con = true}) => MenuItem(
      id: id,
      name: 'Món $id',
      price: 50000,
      categoryId: danhMuc,
      categoryName: danhMuc,
      isAvailable: con,
      tags: const [],
    );

HttpMenuApi apiTraVe(int status, String body,
        {void Function(http.Request)? ghiLai}) =>
    HttpMenuApi(
      baseUrl: 'http://test',
      client: MockClient((request) async {
        ghiLai?.call(request);
        return http.Response(body, status,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('nhóm món theo danh mục', () {
    test('giữ NGUYÊN thứ tự danh mục do máy chủ trả về', () {
      // Đó là thứ tự quán muốn thực đơn hiện ra (khai vị trước, tráng miệng sau), không phải
      // thứ tự bảng chữ cái.
      final nhom = nhomTheoDanhMuc(
        [dm('c2', 'Zeta'), dm('c1', 'Alpha')],
        [mon('m1', 'c1'), mon('m2', 'c2')],
      );

      expect(nhom.map((n) => n.tenDanhMuc).toList(), ['Zeta', 'Alpha']);
    });

    test('bỏ danh mục rỗng', () {
      // Một tiêu đề không có món nào bên dưới trông như lỗi tải.
      final nhom = nhomTheoDanhMuc(
          [dm('c1', 'Có món'), dm('c2', 'Rỗng')], [mon('m1', 'c1')]);

      expect(nhom.map((n) => n.tenDanhMuc).toList(), ['Có món']);
    });

    test('KHÔNG đánh rơi món mồ côi — gom vào khối cuối', () {
      // Món có categoryId không khớp danh mục nào vẫn phải hiện ra. Lặng lẽ bỏ đi nghĩa là một
      // món có thật biến mất khỏi thực đơn vì lỗi dữ liệu ở chỗ khác, và không ai thấy gì để sửa.
      final nhom = nhomTheoDanhMuc(
          [dm('c1', 'Khai vị')], [mon('m1', 'c1'), mon('m2', 'KHONG_CO')]);

      expect(nhom.map((n) => n.tenDanhMuc).toList(), ['Khai vị', 'Món khác']);
      expect(nhom.last.mon.single.id, 'm2');
    });

    test('tổng số món sau khi nhóm bằng đúng số món đầu vào', () {
      // Bất biến đếm được: dù nhóm thế nào cũng không được mất hay nhân đôi món.
      final dsMon = [
        mon('m1', 'c1'),
        mon('m2', 'c1'),
        mon('m3', 'c2'),
        mon('m4', 'LAC')
      ];
      final nhom = nhomTheoDanhMuc([dm('c1', 'A'), dm('c2', 'B')], dsMon);

      expect(nhom.fold<int>(0, (s, n) => s + n.mon.length), dsMon.length);
    });

    test('không có danh mục nào thì mọi món vào khối Món khác', () {
      final nhom = nhomTheoDanhMuc([], [mon('m1', 'c1')]);

      expect(nhom.single.tenDanhMuc, 'Món khác');
    });

    test('không có món nào thì không có khối nào', () {
      expect(nhomTheoDanhMuc([dm('c1', 'A')], []), isEmpty);
    });

    test('giữ cả món ĐANG HẾT, không lọc bỏ', () {
      // Khách cần biết quán CÓ món đó, kể cả hôm nay hết. Lọc đi thì họ tưởng quán không bán.
      final nhom =
          nhomTheoDanhMuc([dm('c1', 'A')], [mon('m1', 'c1', con: false)]);

      expect(nhom.single.mon.single.isAvailable, isFalse);
    });
  });

  group('địa chỉ ảnh món', () {
    // Ảnh KHÔNG do API phục vụ. Đo trên hệ thống đang chạy:
    //   :8081/menu-images/...  → 401   (API)
    //   :8080/menu-images/...  → 200   (web)
    const base = 'http://10.0.2.2:8080';

    test('ghép đường dẫn tương đối vào base của ẢNH', () {
      expect(urlAnh('/menu-images/04.webp', base),
          'http://10.0.2.2:8080/menu-images/04.webp');
    });

    test('giữ NGUYÊN URL tuyệt đối', () {
      // Nếu một ngày ảnh chuyển sang CDN thì imageUrl là URL đầy đủ; ghép thêm base vào trước
      // sẽ tạo ra một địa chỉ vô nghĩa và mọi ảnh hỏng cùng lúc.
      expect(urlAnh('https://cdn.example.com/a.webp', base),
          'https://cdn.example.com/a.webp');
    });

    test('base có dấu / ở cuối không tạo ra //', () {
      expect(urlAnh('/menu-images/04.webp', '$base/'),
          'http://10.0.2.2:8080/menu-images/04.webp');
    });

    test('đường dẫn không bắt đầu bằng / vẫn ghép đúng', () {
      expect(urlAnh('menu-images/04.webp', base),
          'http://10.0.2.2:8080/menu-images/04.webp');
    });

    test('null hoặc rỗng trả null, không trả base trơ trọi', () {
      // Trả về base trơ trọi sẽ khiến widget ảnh đi tải trang chủ và hiện lỗi khó hiểu.
      expect(urlAnh(null, base), isNull);
      expect(urlAnh('', base), isNull);
      expect(urlAnh('   ', base), isNull);
    });
  });

  group('gọi API', () {
    test('KHÔNG gửi Authorization lẫn token phiên bàn', () async {
      // Thực đơn xem được mà không cần đang ở bàn — đó là khác biệt thật giữa app và web QR.
      http.Request? daGui;
      await apiTraVe(200, '{"categories":[],"items":[]}',
          ghiLai: (r) => daGui = r).thucDon();

      expect(daGui!.url.path, '/api/menu');
      expect(daGui!.headers.containsKey('Authorization'), isFalse);
      expect(daGui!.headers.containsKey('X-Table-Session-Token'), isFalse);
    });

    test('phân giải đúng hình dạng PHẲNG mà backend trả về', () async {
      // categories và items là hai danh sách tách rời, không lồng nhau.
      final data = await apiTraVe(
          200,
          jsonEncode({
            'categories': [
              {'categoryId': 'cat_appetizer', 'name': 'Khai vị'}
            ],
            'items': [
              {
                'id': 'm_004',
                'name': 'Bánh cuốn Thanh Trì',
                'description': 'Bánh cuốn mỏng mịn',
                'price': 55000,
                'categoryId': 'cat_appetizer',
                'categoryName': 'Khai vị',
                'imageUrl': '/menu-images/04-banh-cuon-thanh-tri.webp',
                'isAvailable': true,
                'tags': ['region:hanoi', 'spice:none'],
              }
            ],
          })).thucDon();

      expect(data.categories.single.name, 'Khai vị');
      expect(data.items.single.name, 'Bánh cuốn Thanh Trì');
      expect(data.items.single.tags, contains('region:hanoi'));
    });

    test('đọc đúng tiếng Việt có dấu (UTF-8)', () async {
      final data = await apiTraVe(
          200,
          jsonEncode({
            'categories': [],
            'items': [
              {
                'id': 'm1',
                'name': 'Phở bò tái',
                'price': 60000,
                'isAvailable': true
              }
            ],
          })).thucDon();

      expect(data.items.single.name, 'Phở bò tái');
    });

    test('502 cho câu đọc được', () async {
      await expectLater(
        apiTraVe(502, '<html>502</html>').thucDon(),
        throwsA(
            isA<AuthException>().having((e) => e.code, 'code', 'SERVER_ERROR')),
      );
    });
  });
}
