/// Định dạng tiền Việt: chấm ngăn nghìn, hậu tố đ.
///
/// Tự viết thay vì kéo `intl` vào: một phụ thuộc mới phải nâng cấp và kiểm mãi về sau, cho đúng
/// một hàm mười dòng. Nếu sau này cần đa ngôn ngữ thật thì đổi, và lúc đó lý do đã rõ ràng.
///
/// Đặt ở đây (không phải trong `promotions/`) từ lúc có caller thứ hai: màn hình thực đơn cũng
/// hiện giá. Nhân bản hàm định dạng tiền là cách chắc chắn để hai màn hình hiện cùng một số theo
/// hai kiểu khác nhau.
String tienVnd(num n) {
  final s = n.round().abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}${buf.toString()}đ';
}
