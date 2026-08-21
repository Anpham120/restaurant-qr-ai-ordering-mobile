import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/tables/quet_qr.dart';

void main() {
  group('mã QR thật do web sinh ra', () {
    test('lấy được CẢ token lẫn mã bàn', () {
      // Dạng chính xác từ AdminTableService.buildCustomerPath.
      final kq = phanTichQrBan(
          'https://order.cmcrestaurant.app/table/T01?qr=cmc-table-t01-qr');

      expect(kq!.qrToken, 'cmc-table-t01-qr');
      expect(kq.tableCode, 'T01');
    });

    test('KHÔNG lấy nguyên chuỗi URL làm token', () {
      // Đây là lỗi dễ mắc nhất khi viết bộ quét: gửi cả URL lên máy chủ và nhận QR_NOT_FOUND cho
      // một mã QR hoàn toàn hợp lệ.
      final kq =
          phanTichQrBan('https://order.example.com/table/T05?qr=abc-123');

      expect(kq!.qrToken, 'abc-123');
      expect(kq.qrToken, isNot(startsWith('http')));
    });

    test('giải mã mã bàn có ký tự đã escape', () {
      final kq = phanTichQrBan('https://o.example.com/table/Ban%2001?qr=tok-1');

      expect(kq!.tableCode, 'Ban 01');
    });

    test('lấy đoạn NGAY SAU "table", không phải đoạn cuối', () {
      // Đường dẫn dài thêm một ngày nào đó thì đoạn cuối không còn là mã bàn.
      final kq =
          phanTichQrBan('https://o.example.com/vi/table/T09/menu?qr=tok-9');

      expect(kq!.tableCode, 'T09');
    });

    test('URL http cũng nhận, không chỉ https', () {
      // Máy chủ chạy trong LAN của quán thường không có TLS.
      expect(
          phanTichQrBan('http://192.168.1.5:8080/table/T02?qr=tok-2')!.qrToken,
          'tok-2');
    });
  });

  group('token trần', () {
    test('nhận mã in kiểu cũ, không kèm URL', () {
      // Ô nhập tay trong app dùng đúng dạng này.
      final kq = phanTichQrBan('cmc-table-t01-qr');

      expect(kq!.qrToken, 'cmc-table-t01-qr');
      expect(kq.tableCode, isNull);
    });
  });

  group('từ chối thứ không phải QR của bàn', () {
    test('URL thiếu ?qr= thì trả null', () {
      // Thiếu đúng thứ bắt buộc. Đoán ở đây nghĩa là gửi token sai lên máy chủ.
      expect(phanTichQrBan('https://order.example.com/table/T01'), isNull);
    });

    test('QR wifi, danh thiếp, link ví — đều bị từ chối', () {
      // Không lọc thì mọi mã QR khác trên đời đều được gửi lên máy chủ như một token.
      expect(phanTichQrBan('WIFI:S:QuynhTrang;T:WPA;P:12345678;;'), isNull);
      expect(phanTichQrBan('BEGIN:VCARD\nFN:Nguyen Van A\nEND:VCARD'), isNull);
      expect(phanTichQrBan('00020101021138540010A00000072701'), isNotNull,
          reason:
              'chuỗi số dài vẫn hợp dạng token — máy chủ sẽ từ chối, đó là nơi đúng để chặn');
    });

    test('rỗng, khoảng trắng, quá ngắn đều trả null', () {
      expect(phanTichQrBan(null), isNull);
      expect(phanTichQrBan(''), isNull);
      expect(phanTichQrBan('   '), isNull);
      expect(phanTichQrBan('abc'), isNull);
    });

    test('chuỗi có khoảng trắng không phải token', () {
      expect(phanTichQrBan('ban so 1'), isNull);
    });
  });
}
