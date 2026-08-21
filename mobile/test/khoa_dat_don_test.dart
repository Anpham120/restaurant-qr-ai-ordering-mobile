import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/cart/cart.dart';
import 'package:restaurant_mobile/core/orders/khoa_dat_don.dart';

Cart gio(List<(String, int)> mon) => Cart(
      tableSessionId: 'ts',
      itemCount: mon.fold(0, (s, m) => s + m.$2),
      subtotal: 0,
      items: mon
          .map((m) => CartItem(
                menuItemId: m.$1,
                name: m.$1,
                price: 1000,
                quantity: m.$2,
                lineTotal: 1000 * m.$2,
                isAvailable: true,
              ))
          .toList(),
    );

void main() {
  group('khoá gắn với NỘI DUNG giỏ, không gắn với lần bấm', () {
    test('giỏ không đổi thì gửi lại bao nhiêu lần cũng CÙNG một khoá', () {
      // Đây là toàn bộ lý do Idempotency-Key tồn tại. Sinh khoá mới lúc gửi lại là vô hiệu hoá
      // nó trong khi vẫn gửi header cho có — và bếp nhận hai đơn giống hệt nhau.
      final k = KhoaDatDon();
      final dv = dauVetGio(gio([('m1', 2)]));

      expect(k.khoaCho(dv), k.khoaCho(dv));
      expect(k.khoaCho(dv), k.khoaCho(dv));
    });

    test('giỏ đổi thì khoá ĐỔI', () {
      // Giữ nguyên khoá sau khi giỏ đổi sẽ khiến backend trả 409 IDEMPOTENCY_KEY_REUSED, và
      // khách nhận một lỗi khó hiểu cho việc họ làm hoàn toàn đúng.
      final k = KhoaDatDon();

      final truoc = k.khoaCho(dauVetGio(gio([('m1', 2)])));
      final sau = k.khoaCho(dauVetGio(gio([('m1', 3)])));

      expect(sau, isNot(truoc));
    });

    test('quen() rồi thì lần đặt sau có khoá mới, kể cả giỏ trùng nội dung',
        () {
      // Khách gọi thêm ĐÚNG món cũ là chuyện rất thường. Không quên khoá thì backend trả lại
      // chính đơn cũ: khách bấm đặt, thấy "thành công", mà bếp không nhận gì thêm.
      final k = KhoaDatDon();
      final dv = dauVetGio(gio([('m1', 2)]));
      final lan1 = k.khoaCho(dv);

      k.quen();

      expect(k.khoaCho(dv), isNot(lan1));
    });
  });

  group('dấu vết giỏ', () {
    test('thứ tự món KHÔNG ảnh hưởng dấu vết', () {
      // Backend có thể trả các dòng theo thứ tự khác nhau giữa hai lần đọc. Nếu thứ tự tính vào
      // dấu vết thì khoá đổi vô cớ và lần gửi lại trở thành một đơn thứ hai.
      expect(dauVetGio(gio([('m1', 1), ('m2', 2)])),
          dauVetGio(gio([('m2', 2), ('m1', 1)])));
    });

    test('đổi số lượng thì đổi dấu vết', () {
      expect(dauVetGio(gio([('m1', 1)])), isNot(dauVetGio(gio([('m1', 2)]))));
    });

    test('thêm món thì đổi dấu vết', () {
      expect(dauVetGio(gio([('m1', 1)])),
          isNot(dauVetGio(gio([('m1', 1), ('m2', 1)]))));
    });

    test('giỏ rỗng cho dấu vết rỗng, không nổ', () {
      expect(dauVetGio(gio([])), '');
    });
  });

  group('khoá hợp lệ với backend', () {
    test('khoá sinh ra khớp đúng mẫu backend cho phép và không quá 100 ký tự',
        () {
      // Lọt một ký tự lạ thì backend trả 400 IDEMPOTENCY_KEY_INVALID và khách không đặt được
      // món nào cả, trong khi mã app trông vẫn đúng.
      final k = KhoaDatDon(ngauNhien: Random(42));
      for (var i = 0; i < 200; i++) {
        k.quen();
        expect(khoaHopLe(k.khoaCho('m$i:1')), isTrue);
      }
    });

    test('nhận diện khoá KHÔNG hợp lệ', () {
      expect(khoaHopLe(''), isFalse);
      expect(khoaHopLe('co khoang trang'), isFalse);
      expect(khoaHopLe('co/gach-cheo'), isFalse);
      expect(khoaHopLe('a' * 101), isFalse);
    });

    test('khoá dài đúng 100 ký tự vẫn hợp lệ', () {
      expect(khoaHopLe('a' * 100), isTrue);
    });

    test('hai lần sinh cho hai khoá khác nhau', () {
      // Trùng khoá giữa hai đơn khác nhau nghĩa là đơn thứ hai bị nuốt và trả về đơn thứ nhất.
      final k = KhoaDatDon();
      final ds = <String>{};
      for (var i = 0; i < 500; i++) {
        k.quen();
        ds.add(k.khoaCho('x'));
      }
      expect(ds, hasLength(500));
    });
  });

  group('món hết trong giỏ', () {
    test('phát hiện được để chặn TRƯỚC khi bấm đặt', () {
      // Backend sẽ từ chối cả đơn với MENU_ITEM_UNAVAILABLE. Một lời từ chối ở bước cuối, sau
      // khi khách đã bấm "Đặt món", tệ hơn nhiều so với chỉ ra ngay trong giỏ.
      const g = Cart(
        tableSessionId: 'ts',
        itemCount: 1,
        subtotal: 1000,
        items: [
          CartItem(
              menuItemId: 'm1',
              name: 'Phở',
              price: 1000,
              quantity: 1,
              lineTotal: 1000,
              isAvailable: false),
        ],
      );

      expect(coMonHetHang(g), isTrue);
    });

    test('giỏ toàn món còn hàng thì không chặn', () {
      expect(coMonHetHang(gio([('m1', 1)])), isFalse);
    });
  });
}
