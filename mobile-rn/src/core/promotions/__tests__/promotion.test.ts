import { type Promotion, moTaDieuKien, moTaMucGiam, promotionTuJson } from '../promotion';

function km(tuyChon: Partial<Promotion> = {}): Promotion {
  return {
    code: 'GIAM10',
    name: 'Giảm 10%',
    description: null,
    type: 'Percentage',
    discountValue: 10,
    minOrderAmount: null,
    maxDiscountAmount: null,
    isFlashSale: false,
    endsAt: null,
    ...tuyChon,
  };
}

describe('mô tả mức giảm', () => {
  it('phần trăm hiện dấu %, KHÔNG hiện đồng', () => {
    // Nhầm phần trăm với số tiền là hứa với khách một con số sai hẳn về bậc.
    expect(moTaMucGiam(km({ type: 'Percentage', discountValue: 10 }))).toBe('Giảm 10%');
  });

  it('số tiền cố định hiện định dạng tiền Việt', () => {
    expect(moTaMucGiam(km({ type: 'FixedAmount', discountValue: 20000 }))).toBe('Giảm 20.000đ');
  });

  it('phần trăm có trần thì NÊU trần', () => {
    // Quên trần là hứa nhiều hơn thứ khách thật sự được giảm.
    expect(
      moTaMucGiam(km({ type: 'Percentage', discountValue: 20, maxDiscountAmount: 50000 })),
    ).toBe('Giảm 20%, tối đa 50.000đ');
  });

  it('số tiền cố định KHÔNG nêu trần dù backend có trả', () => {
    // Với số tiền cố định, trần không bao giờ ràng buộc. Nêu ra khiến khách tưởng có thêm một
    // giới hạn nữa.
    expect(
      moTaMucGiam(km({ type: 'FixedAmount', discountValue: 20000, maxDiscountAmount: 50000 })),
    ).toBe('Giảm 20.000đ');
  });

  it('phần trăm lẻ giữ nguyên phần thập phân', () => {
    expect(moTaMucGiam(km({ discountValue: 12.5 }))).toBe('Giảm 12.5%');
  });
});

describe('mô tả điều kiện', () => {
  it('có ngưỡng thì nói rõ đơn từ bao nhiêu', () => {
    // Backend cố ý vẫn trả mã dù giỏ chưa đủ tiền: giấu ngưỡng là giấu đúng thông tin khách cần
    // để quyết định gọi thêm món.
    expect(moTaDieuKien(km({ minOrderAmount: 200000 }))).toBe('Đơn từ 200.000đ');
  });

  it('không có ngưỡng thì trả null, không hiện "Đơn từ 0đ"', () => {
    expect(moTaDieuKien(km({ minOrderAmount: null }))).toBeNull();
    expect(moTaDieuKien(km({ minOrderAmount: 0 }))).toBeNull();
  });
});

describe('đọc khuyến mãi từ JSON', () => {
  it('endsAt null nghĩa là KHÔNG có hạn, không phải đã hết hạn', () => {
    expect(
      promotionTuJson({ code: 'A', name: 'B', type: 'Percentage', discountValue: 5 }).endsAt,
    ).toBeNull();
  });

  it('hạn đọc được thì quy về UTC', () => {
    expect(
      promotionTuJson({
        code: 'A',
        name: 'B',
        type: 'Percentage',
        discountValue: 5,
        endsAt: '2026-08-30T17:00:00+07:00',
      }).endsAt,
    ).toBe('2026-08-30T10:00:00.000Z');
  });

  it('hạn HỎNG cũng thành null — không ẩn mất một khuyến mãi có thật', () => {
    // Ca này KHÔNG có ở bản Flutter: DateTime.parse của Dart ném, nên một chuỗi hỏng sẽ làm hỏng
    // cả lượt đọc danh sách. Coi như không có hạn là hướng an toàn — hướng kia là im lặng giấu
    // mất một khuyến mãi đang chạy vì một lỗi định dạng ở chỗ khác.
    expect(
      promotionTuJson({ code: 'A', name: 'B', type: 'Percentage', discountValue: 5, endsAt: 'rác' })
        .endsAt,
    ).toBeNull();
  });
});
