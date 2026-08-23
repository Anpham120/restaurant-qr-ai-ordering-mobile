/**
 * Định dạng tiền Việt: chấm ngăn nghìn, hậu tố đ.
 *
 * Tự viết thay vì kéo `Intl.NumberFormat` vào: trên Android, bản Hermes mặc định chỉ gói một tập
 * locale rút gọn, nên `Intl` cho ra kết quả khác nhau giữa các máy. Một hàm mười dòng cho ra cùng
 * một chuỗi ở mọi thiết bị đáng giá hơn.
 *
 * Đặt ở đây (không phải trong `promotions/`) từ lúc có caller thứ hai: màn hình thực đơn cũng
 * hiện giá. Nhân bản hàm định dạng tiền là cách chắc chắn để hai màn hình hiện cùng một số theo
 * hai kiểu khác nhau.
 */
export function tienVnd(n: number): string {
  const s = Math.abs(Math.round(n)).toString();
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) buf += '.';
    buf += s[i];
  }
  return `${n < 0 ? '-' : ''}${buf}đ`;
}
