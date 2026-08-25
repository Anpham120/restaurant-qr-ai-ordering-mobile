export interface OrderItem {
  readonly orderItemId: string;
  /** Cần cho việc đặt lại món cũ: giỏ hàng nhận `menuItemId`, không nhận `orderItemId`. */
  readonly menuItemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly status: string;
  /** Ước lượng thời gian còn lại, dạng KHOẢNG. `null` khi backend không đưa ra — xem `moTaUocLuong`. */
  readonly estimatedReadyMinutesLow: number | null;
  readonly estimatedReadyMinutesHigh: number | null;
  /**
   * Hàng đợi hoặc lời khai của bếp đang quyết định thời gian, không phải bản thân món.
   *
   * Cần cờ RIÊNG chứ không chỉ một con số lớn hơn: ước lượng nhảy từ 15–25 lên 42–57 phút mà
   * không nói vì sao trông như app tính sai. Nói "bếp đang đông" biến con số đó thành thông tin
   * khách dùng được — họ chọn đợi, đổi món, hay gọi nhân viên.
   */
  readonly kitchenBusy: boolean;
}

export interface CustomerOrder {
  readonly orderId: string;
  readonly orderCode: string;
  readonly status: string;
  readonly totalAmount: number;
  readonly createdAt: string;
  readonly items: readonly OrderItem[];
}

function soHoacNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export function orderItemTuJson(json: unknown): OrderItem {
  const o = json as Record<string, unknown>;
  return {
    orderItemId: typeof o.orderItemId === 'string' ? o.orderItemId : '',
    menuItemId: typeof o.menuItemId === 'string' ? o.menuItemId : '',
    name: o.name as string,
    quantity: typeof o.quantity === 'number' ? o.quantity : 0,
    unitPrice: typeof o.unitPrice === 'number' ? o.unitPrice : 0,
    lineTotal: typeof o.lineTotal === 'number' ? o.lineTotal : 0,
    status: typeof o.status === 'string' ? o.status : 'Pending',
    estimatedReadyMinutesLow: soHoacNull(o.estimatedReadyMinutesLow),
    estimatedReadyMinutesHigh: soHoacNull(o.estimatedReadyMinutesHigh),
    kitchenBusy: typeof o.kitchenBusy === 'boolean' ? o.kitchenBusy : false,
  };
}

export function customerOrderTuJson(json: unknown): CustomerOrder {
  const o = json as Record<string, unknown>;
  const tao = new Date(o.createdAt as string);
  if (Number.isNaN(tao.getTime())) throw new Error('createdAt không đọc được');
  return {
    orderId: o.orderId as string,
    orderCode: typeof o.orderCode === 'string' ? o.orderCode : '',
    status: typeof o.status === 'string' ? o.status : 'Placed',
    totalAmount: typeof o.totalAmount === 'number' ? o.totalAmount : 0,
    createdAt: tao.toISOString(),
    items: Array.isArray(o.items) ? o.items.map(orderItemTuJson) : [],
  };
}

/**
 * Nhãn tiếng Việt cho trạng thái đơn.
 *
 * Tách thành hàm thuần vì đây là chỗ dễ nói sai nhất với khách: `Ready` nghĩa là bếp đã nấu xong
 * và món đang chờ mang ra, KHÔNG phải "đã xong bữa". Dịch nó thành "Hoàn tất" sẽ khiến khách
 * tưởng có thể đứng dậy đi về.
 *
 * Trạng thái LẠ trả về nguyên văn thay vì một câu chung chung. Backend có thể thêm trạng thái mới
 * trước khi app kịp cập nhật; hiện "Đang xử lý" cho mọi thứ chưa biết sẽ giấu mất chuyện đó và
 * không ai phát hiện app đã lạc hậu.
 */
/**
 * Mã của đơn đang mở trong phiên, để áp ưu đãi giảm tiền vào.
 *
 * "Đang mở" = chưa {@code Completed} và chưa {@code Cancelled} — cùng định nghĩa backend dùng khi
 * từ chối `LOYALTY_ORDER_CLOSED`. Hai bên lệch nhau thì app sẽ chào một đơn mà backend từ chối.
 *
 * Nhiều đơn cùng mở là chuyện bình thường: một bàn gọi thêm vài lượt. Lấy đơn MỚI NHẤT vì đó là
 * đơn khách vừa gọi và đang nghĩ tới.
 */
export function maDonDangMo(don: readonly CustomerOrder[]): string | null {
  for (let i = don.length - 1; i >= 0; i--) {
    const d = don[i];
    if (d !== undefined && d.status !== 'Completed' && d.status !== 'Cancelled') {
      return d.orderCode;
    }
  }
  return null;
}

export function nhanTrangThaiDon(status: string): string {
  switch (status) {
    case 'Draft':
      return 'Nháp';
    case 'Placed':
      return 'Đã gửi bếp';
    case 'Confirmed':
      return 'Bếp đã nhận';
    case 'Preparing':
      return 'Đang nấu';
    case 'Ready':
      return 'Nấu xong, chờ mang ra';
    case 'Served':
      return 'Đã mang ra bàn';
    case 'Completed':
      return 'Đã thanh toán';
    case 'Cancelled':
      return 'Đã huỷ';
    default:
      return status;
  }
}

/**
 * Nhãn tiếng Việt cho trạng thái từng món.
 *
 * `Pending` ở cấp MÓN nghĩa là chưa ai bắt đầu nấu — khác hẳn `Pending` ở cấp thanh toán (chờ thu
 * tiền). Dùng chung một chữ cho hai nghĩa là cách nhanh nhất để hiểu nhầm.
 */
export function nhanTrangThaiMon(status: string): string {
  switch (status) {
    case 'Pending':
      return 'Chờ nấu';
    case 'Preparing':
      return 'Đang nấu';
    case 'Ready':
      return 'Nấu xong';
    case 'Served':
      return 'Đã mang ra';
    case 'Cancelled':
      return 'Đã huỷ';
    default:
      return status;
  }
}

/** Đơn đã kết thúc chưa — dùng để tách phần "đang phục vụ" khỏi phần lịch sử. */
export function donDaXong(status: string): boolean {
  return status === 'Completed' || status === 'Cancelled';
}

/**
 * Câu mô tả thời gian chờ, hoặc `null` khi backend không đưa ra ước lượng.
 *
 * **Trả `null` là trạng thái BÌNH THƯỜNG, không phải lỗi.**
 *
 * Chú ý: chú thích ở bản Flutter đã lạc hậu — nó nói backend cần "20 mẫu lịch sử". Mô hình thống
 * kê đó đã bị thay ở #141: giờ backend tính từ `menu_items.prep_minutes` do BẾP KHAI, cộng tải
 * hàng đợi chia cho số món làm song song, cộng độ trễ bếp tự khai (#142). Món chưa được khai
 * `prep_minutes` thì KHÔNG có ước lượng — 34/91 món đang ở tình trạng đó.
 *
 * App **TUYỆT ĐỐI KHÔNG** được bịa câu thay thế kiểu "khoảng 15 phút". Ba điều kiện của #10
 * (không đoán bừa, luôn là khoảng, có tính tải bếp) vẫn giữ nguyên qua lần viết lại, và một con
 * số bịa ở tầng app phá cả ba mà không ai thấy.
 */
export function moTaUocLuong(low: number | null, high: number | null): string | null {
  if (low === null || high === null) return null;
  if (high <= low) return `khoảng ${low} phút`;
  return `${low}–${high} phút`;
}

/**
 * Câu giải thích vì sao món lâu hơn thường ngày, hoặc `null` khi bếp bình thường.
 *
 * Chỉ nói khi CÓ ước lượng: báo "bếp đang đông" mà không kèm con số nào là gieo lo lắng mà không
 * cho khách thứ gì để quyết định.
 */
export function moTaBepDong(bepDong: boolean, uocLuong: string | null): string | null {
  if (!bepDong || uocLuong === null) return null;
  return 'Bếp đang đông nên món lâu hơn thường ngày.';
}

/**
 * Khách có tự huỷ được món này không (hạn chế #11).
 *
 * Hai điều kiện, và cả hai đều bắt buộc:
 *
 * - **Món phải đang `Pending`.** Backend chặt hơn đường của nhân viên có chủ ý: nhân viên vẫn huỷ
 *   được món `Preparing`, khách thì không, vì tới lúc đó bếp đã dùng nguyên liệu.
 * - **App phải có `X-Order-Token` của ĐÚNG đơn đó.** Token này backend chỉ trả một lần, lúc tạo
 *   đơn. Đơn do máy khác trong bàn đặt thì máy này không có token, nên không huỷ hộ được — và đó
 *   là đúng: người đặt mới là người quyết định huỷ.
 *
 * Khoá theo TỪNG MÓN, không theo cả đơn: khách huỷ được món chưa ai đụng tới ngay cả khi món khác
 * cùng đơn đã lên bếp.
 */
export function chophepHuyMon(trangThaiMon: string, coTokenDon: boolean): boolean {
  return trangThaiMon === 'Pending' && coTokenDon;
}
