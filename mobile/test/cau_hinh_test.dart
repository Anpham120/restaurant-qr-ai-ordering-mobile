import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/cau_hinh/cau_hinh.dart';

void main() {
  group('chuẩn hoá địa chỉ người dùng gõ', () {
    test('chỉ gõ IP thì thêm scheme và cổng mặc định', () {
      // Người gõ trên bàn phím điện thoại sẽ gõ đúng thế này. Bắt họ gõ đủ
      // "http://192.168.1.5:8081" là bắt gõ đúng ba thứ dễ sai trên bàn phím nhỏ.
      expect(chuanHoaDiaChi('192.168.1.5', congMacDinh: 8081),
          'http://192.168.1.5:8081');
    });

    test('gõ kèm cổng thì GIỮ cổng đó', () {
      expect(chuanHoaDiaChi('192.168.1.5:9000', congMacDinh: 8081),
          'http://192.168.1.5:9000');
    });

    test('gõ đủ URL thì giữ nguyên', () {
      expect(chuanHoaDiaChi('http://10.0.2.2:8081', congMacDinh: 8081),
          'http://10.0.2.2:8081');
    });

    test('https được giữ, không ép về http', () {
      expect(chuanHoaDiaChi('https://quan.example.com', congMacDinh: 8081),
          'https://quan.example.com:8081');
    });

    test('cắt dấu / thừa ở cuối', () {
      // Không cắt thì mọi đường dẫn ghép sau này thành "//api/menu".
      expect(chuanHoaDiaChi('192.168.1.5:8081/', congMacDinh: 8081),
          'http://192.168.1.5:8081');
    });

    test('TỪ CHỐI đường dẫn đầy đủ tới endpoint', () {
      // Người dùng rất dễ dán nguyên "http://192.168.1.5:8081/api/menu" từ trình duyệt. Nhận nó
      // sẽ tạo ra "/api/menu/api/menu" và mọi lời gọi hỏng với lỗi khó hiểu.
      expect(
          chuanHoaDiaChi('http://192.168.1.5:8081/api/menu', congMacDinh: 8081),
          isNull);
    });

    test('rỗng hoặc rác thì trả null', () {
      expect(chuanHoaDiaChi('', congMacDinh: 8081), isNull);
      expect(chuanHoaDiaChi('   ', congMacDinh: 8081), isNull);
      expect(chuanHoaDiaChi('http://', congMacDinh: 8081), isNull);
    });
  });

  group('suy ra địa chỉ ảnh', () {
    test('cùng máy, đổi sang cổng 8080', () {
      // Ảnh do container web phục vụ ở 8080, API ở 8081 — đo thật: :8081/menu-images → 401,
      // :8080/menu-images → 200.
      expect(
          suyRaDiaChiAnh('http://192.168.1.5:8081'), 'http://192.168.1.5:8080');
    });

    test('giữ scheme https', () {
      expect(suyRaDiaChiAnh('https://quan.example.com:8081'),
          'https://quan.example.com:8080');
    });

    test('địa chỉ hỏng thì trả nguyên vào, không nổ', () {
      expect(suyRaDiaChiAnh('rác'), 'rác');
    });
  });
}
