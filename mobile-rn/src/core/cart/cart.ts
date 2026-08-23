export interface CartItem {
  readonly menuItemId: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
  readonly lineTotal: number;
  /**
   * Món có thể bị BẾP TẮT sau khi khách đã bỏ vào giỏ. Backend vẫn trả dòng đó kèm cờ này thay vì
   * lặng lẽ xoá — khách cần thấy món biến mất vì lý do gì.
   */
  readonly isAvailable: boolean;
  readonly imageUrl: string | null;
  readonly note: string | null;
}

export interface Cart {
  readonly tableSessionId: string;
  readonly items: readonly CartItem[];
  readonly itemCount: number;
  readonly subtotal: number;
}

export function cartItemTuJson(json: unknown): CartItem {
  const o = json as Record<string, unknown>;
  return {
    menuItemId: o.menuItemId as string,
    name: o.name as string,
    price: typeof o.price === 'number' ? o.price : 0,
    quantity: typeof o.quantity === 'number' ? o.quantity : 0,
    lineTotal: typeof o.lineTotal === 'number' ? o.lineTotal : 0,
    isAvailable: typeof o.isAvailable === 'boolean' ? o.isAvailable : true,
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : null,
    note: typeof o.note === 'string' ? o.note : null,
  };
}

export function cartTuJson(json: unknown): Cart {
  const o = json as Record<string, unknown>;
  return {
    tableSessionId: typeof o.tableSessionId === 'string' ? o.tableSessionId : '',
    items: Array.isArray(o.items) ? o.items.map(cartItemTuJson) : [],
    itemCount: typeof o.itemCount === 'number' ? o.itemCount : 0,
    subtotal: typeof o.subtotal === 'number' ? o.subtotal : 0,
  };
}

export function gioRong(cart: Cart): boolean {
  return cart.items.length === 0;
}

/**
 * Có món nào trong giỏ đã bị bếp tắt không.
 *
 * Chặn đặt đơn khi còn món hết là việc của app, không phải của backend: backend sẽ từ chối cả đơn
 * với `MENU_ITEM_UNAVAILABLE`, và một lời từ chối ở bước cuối sau khi khách đã bấm "Đặt món" tệ
 * hơn nhiều so với việc chỉ ra ngay trong giỏ.
 */
export function coMonHetHang(cart: Cart): boolean {
  return cart.items.some((i) => !i.isAvailable);
}

/**
 * Dấu vết nội dung giỏ — dùng để biết khi nào phải đổi khoá idempotency.
 *
 * Chỉ gồm những thứ ĐI VÀO thân request tạo đơn: mã món và số lượng. Không gồm giá hay thời điểm
 * cập nhật — giá đổi không làm đơn thành đơn khác, và nếu tính vào thì mỗi lần quán sửa giá sẽ vô
 * hiệu hoá khoá đang chờ gửi lại.
 *
 * Sắp theo mã món để thứ tự backend trả về không ảnh hưởng kết quả.
 */
export function dauVetGio(cart: Cart): string {
  return cart.items
    .map((i) => `${i.menuItemId}:${i.quantity}`)
    .sort()
    .join(',');
}
