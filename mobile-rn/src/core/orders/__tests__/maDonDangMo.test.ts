import { type CustomerOrder, maDonDangMo } from '../order';

function don(orderCode: string, status: string): CustomerOrder {
  return {
    orderCode,
    status,
    orderType: 'DineIn',
    tableCode: 'B01',
    subtotalAmount: 0,
    discountAmount: 0,
    totalAmount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    items: [],
  } as unknown as CustomerOrder;
}

describe('mã đơn đang mở', () => {
  it('không có đơn nào thì trả null', () => {
    expect(maDonDangMo([])).toBeNull();
  });

  it('bỏ qua đơn đã xong và đơn đã huỷ', () => {
    // Cùng định nghĩa backend dùng cho LOYALTY_ORDER_CLOSED. Lệch nhau thì app chào một đơn mà
    // backend sẽ từ chối, và khách nhận một lời từ chối không giải thích được.
    expect(maDonDangMo([don('A', 'Completed'), don('B', 'Cancelled')])).toBeNull();
  });

  it('nhiều đơn cùng mở thì lấy đơn MỚI NHẤT', () => {
    // Một bàn gọi thêm vài lượt là chuyện thường. Đơn mới nhất là đơn khách đang nghĩ tới.
    expect(maDonDangMo([don('CU', 'Served'), don('MOI', 'Placed')])).toBe('MOI');
  });

  it('đơn mới nhất đã xong thì lùi về đơn còn mở phía trước', () => {
    expect(maDonDangMo([don('CON-MO', 'Preparing'), don('XONG', 'Completed')])).toBe('CON-MO');
  });
});
