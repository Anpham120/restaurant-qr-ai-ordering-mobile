import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Số màn hình phải bằng số tab — và đây là lỗi ĐÃ XẢY RA THẬT.
///
/// `NavigationBar` lấy màn hình theo CHỈ SỐ. Khi danh sách màn hình có 6 phần tử còn danh sách tab
/// chỉ có 4, Flutter không báo gì cả: nó chỉ hiện được 4 tab, và mỗi tab mở ra màn hình lệch chỗ.
///
/// Đã lọt lên máy thật và chỉ phát hiện bằng mắt qua ảnh chụp:
///
///     bấm "Đơn"        → hiện Giỏ hàng
///     bấm "Khuyến mãi" → hiện Đơn bàn T01
///     bấm "Tài khoản"  → hiện Trợ lý
///
/// Nguyên nhân: hai phép thay chuỗi thêm tab "Giỏ" và "Trợ lý" im lặng không khớp (dart format đã
/// ngắt dòng khác), trong khi phép thay thêm MÀN HÌNH thì khớp. 198 ca kiểm lúc đó đều xanh, vì
/// không ca nào đếm hai danh sách.
///
/// Đọc thẳng mã nguồn thay vì dựng widget: `_KhungChinh` là lớp riêng tư và cần cả chục API giả
/// lập mới render được, trong khi thứ cần kiểm chỉ là hai con số phải bằng nhau.
void main() {
  test('số màn hình trong _KhungChinh bằng đúng số NavigationDestination', () {
    final nguon = File('lib/main.dart').readAsStringSync();

    final batDau = nguon.indexOf('final man = [');
    expect(batDau, greaterThan(0), reason: 'không tìm thấy danh sách màn hình');
    final ketThuc = nguon.indexOf('];', batDau);
    final khoiManHinh = nguon.substring(batDau, ketThuc);

    // Mỗi phần tử của danh sách bắt đầu bằng tên lớp màn hình ở đầu dòng, thụt đúng 6 dấu cách.
    final soManHinh =
        RegExp(r'^      (?:[A-Z]\w*Screen|_Tab\w+)\(', multiLine: true)
            .allMatches(khoiManHinh)
            .length;
    final soTab = RegExp(r'NavigationDestination\(').allMatches(nguon).length;

    expect(soManHinh, greaterThan(0), reason: 'không đếm được màn hình nào');
    expect(
      soTab,
      soManHinh,
      reason:
          'Lệch $soManHinh màn hình / $soTab tab — mỗi tab sẽ mở ra màn hình sai chỗ.',
    );
  });

  test('phép đếm này TỰ NÓ phát hiện được lệch', () {
    // Không có ca này thì một biểu thức chính quy viết sai sẽ khiến ca trên luôn xanh, và cổng
    // chặn thành đồ trang trí — đúng bài học từ fixture ở #124.
    const mau = '''
    final man = [
      MenuScreen(api: x),
      CartScreen(
        cartApi: y,
      ),
      _TabTaiKhoan(
        phienBan: z,
      ),
    ];
''';
    final dem = RegExp(r'^      (?:[A-Z]\w*Screen|_Tab\w+)\(', multiLine: true)
        .allMatches(mau)
        .length;

    expect(dem, 3,
        reason: 'phải đếm được đúng 3 màn hình, kể cả loại xuống dòng');
  });
}
