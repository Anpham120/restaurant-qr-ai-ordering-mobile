import { type Cart, type CartItem, coMonHetHang, dauVetGio, gioRong } from '../cart';

function mon(menuItemId: string, quantity: number, isAvailable = true): CartItem {
  return {
    menuItemId,
    name: menuItemId,
    price: 10000,
    quantity,
    lineTotal: 10000 * quantity,
    isAvailable,
    imageUrl: null,
    note: null,
  };
}

function gio(items: CartItem[]): Cart {
  return {
    tableSessionId: 'ts',
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: items.reduce((s, i) => s + i.lineTotal, 0),
  };
}

describe('món hết trong giỏ', () => {
  it('phát hiện được món bị bếp tắt sau khi đã bỏ vào giỏ', () => {
    // Chặn ngay trong giỏ là việc của app. Backend sẽ từ chối CẢ đơn với MENU_ITEM_UNAVAILABLE,
    // và một lời từ chối ở bước cuối sau khi khách đã bấm "Đặt món" tệ hơn nhiều.
    expect(coMonHetHang(gio([mon('m1', 1), mon('m2', 2, false)]))).toBe(true);
  });

  it('giỏ toàn món còn hàng thì không chặn', () => {
    expect(coMonHetHang(gio([mon('m1', 1), mon('m2', 2)]))).toBe(false);
  });

  it('giỏ rỗng thì không có món hết', () => {
    expect(coMonHetHang(gio([]))).toBe(false);
    expect(gioRong(gio([]))).toBe(true);
  });
});

describe('dấu vết giỏ để đổi khoá idempotency', () => {
  it('cùng nội dung, KHÁC thứ tự backend trả về thì cho cùng một dấu vết', () => {
    // Thứ tự là chi tiết của backend. Nếu nó lọt vào dấu vết thì một lần backend đổi thứ tự sẽ
    // sinh khoá mới cho đúng một giỏ — và lần gửi lại tạo thành đơn thứ hai.
    expect(dauVetGio(gio([mon('m1', 1), mon('m2', 2)]))).toBe(
      dauVetGio(gio([mon('m2', 2), mon('m1', 1)])),
    );
  });

  it('đổi số lượng thì đổi dấu vết', () => {
    expect(dauVetGio(gio([mon('m1', 1)]))).not.toBe(dauVetGio(gio([mon('m1', 2)])));
  });

  it('đổi món thì đổi dấu vết', () => {
    expect(dauVetGio(gio([mon('m1', 1)]))).not.toBe(dauVetGio(gio([mon('m2', 1)])));
  });

  it('GIÁ đổi thì dấu vết KHÔNG đổi', () => {
    // Giá không đi vào thân request tạo đơn, nên giá đổi không làm đơn thành đơn khác. Tính giá
    // vào dấu vết sẽ khiến mỗi lần quán sửa giá là vô hiệu hoá khoá đang chờ gửi lại — tức biến
    // một lần thử lại an toàn thành một đơn trùng.
    const re = { ...mon('m1', 1), price: 99000, lineTotal: 99000 };
    expect(dauVetGio(gio([re]))).toBe(dauVetGio(gio([mon('m1', 1)])));
  });

  it('món hết hàng vẫn tính vào dấu vết', () => {
    // Nó vẫn nằm trong giỏ và vẫn đi vào thân request. Bỏ qua nó thì hai giỏ khác nhau cho cùng
    // một khoá.
    expect(dauVetGio(gio([mon('m1', 1, false)]))).toBe(dauVetGio(gio([mon('m1', 1)])));
  });

  it('giỏ rỗng cho dấu vết rỗng', () => {
    expect(dauVetGio(gio([]))).toBe('');
  });
});
