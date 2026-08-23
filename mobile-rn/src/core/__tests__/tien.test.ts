import { tienVnd } from '../tien';

describe('tienVnd', () => {
  it('chấm ngăn nghìn, hậu tố đ', () => {
    expect(tienVnd(1000)).toBe('1.000đ');
    expect(tienVnd(1234567)).toBe('1.234.567đ');
  });

  it('số nhỏ hơn nghìn không có dấu chấm', () => {
    expect(tienVnd(0)).toBe('0đ');
    expect(tienVnd(999)).toBe('999đ');
  });

  it('làm tròn thay vì cắt', () => {
    expect(tienVnd(1000.6)).toBe('1.001đ');
  });

  it('số âm giữ dấu trừ ở ngoài cùng', () => {
    // Giảm giá hiện ra ở màn hình giỏ hàng. Dấu trừ nằm sau dấu chấm ngăn nghìn thì đọc thành
    // một số khác hẳn.
    expect(tienVnd(-1234)).toBe('-1.234đ');
  });
});
