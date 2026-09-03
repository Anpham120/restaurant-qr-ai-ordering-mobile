import { type CustomerOrder } from './order';

/**
 * Khi nào màn đơn còn phải hỏi lại máy chủ.
 *
 * <p><b>LỖI CÓ THẬT.</b> `OrdersScreen` tải đúng MỘT lần lúc mở màn: không `setInterval`, không
 * WebSocket, không kéo-để-tải-lại. Bếp gạch xong món thì màn hình khách vẫn ghi "Chờ chế biến"
 * cho tới khi khách thoát ra vào lại.
 *
 * <p>Nghĩa là toàn bộ phần trạng thái theo từng món — thứ bếp vừa được mở đường để cập nhật — KHÔNG
 * bao giờ tới được người cần biết nó nhất.
 *
 * <p>Tách thành hàm thuần vì phần khó không phải là gọi `setInterval`, mà là biết lúc nào NGỪNG.
 * Hỏi mãi một đơn đã xong là đốt pin và đốt dữ liệu di động của khách suốt bữa ăn.
 */

/** Trạng thái món không còn đổi được nữa. */
const MON_DA_XONG = new Set(['Served', 'Cancelled']);

/** Trạng thái đơn không còn đổi được nữa. */
const DON_DA_DONG = new Set(['Completed', 'Cancelled']);

/**
 * Còn thứ gì để chờ không.
 *
 * <p>Trả `false` khi mọi đơn đã đóng hoặc mọi món đã tới bàn — lúc đó hỏi thêm chỉ tốn pin.
 */
export function conGiDeCho(danhSach: readonly CustomerOrder[]): boolean {
  if (danhSach.length === 0) {
    // Chưa gọi món nào. Vẫn phải hỏi lại: khách có thể vừa đặt ở màn khác, hoặc nhân viên vừa
    // thêm món tặng vào đơn.
    return true;
  }
  return danhSach.some((don) => {
    if (DON_DA_DONG.has(don.status)) return false;
    const monConSong = don.items.filter((m) => !MON_DA_XONG.has(m.status));
    return monConSong.length > 0;
  });
}

/**
 * Những món vừa chuyển sang "xong, đang mang ra" giữa hai lần hỏi.
 *
 * <p>Đây là thứ đáng báo cho khách. Không báo "đơn có cập nhật" — câu đó không nói được khách nên
 * làm gì. Báo TÊN MÓN, vì khách đang chờ một món cụ thể.
 *
 * <p>So theo `orderItemId` chứ không theo vị trí trong mảng: bếp huỷ một món thì mảng ngắn lại và
 * so theo vị trí sẽ báo nhầm gần hết danh sách.
 */
export function monVuaSanSang(
  truoc: readonly CustomerOrder[],
  sau: readonly CustomerOrder[],
): string[] {
  const cu = new Map<string, string>();
  for (const don of truoc) {
    for (const m of don.items) cu.set(m.orderItemId, m.status);
  }

  const ten: string[] = [];
  for (const don of sau) {
    for (const m of don.items) {
      // CHỈ báo khi đã biết trạng thái cũ. Lần tải đầu tiên chưa có gì để so, và báo hết mọi món
      // đang sẵn sàng lúc mở màn là dội một loạt thông báo cho thứ khách đã biết.
      const truocDo = cu.get(m.orderItemId);
      if (truocDo !== undefined && truocDo !== 'Ready' && m.status === 'Ready') {
        ten.push(m.name);
      }
    }
  }
  return ten;
}
