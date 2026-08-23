import type { KitchenDelay } from "../../services/kitchenDelayService";

/**
 * Dòng chữ trên nút độ trễ bếp (#142).
 *
 * <p>Tách ra khỏi component vì phần khó không phải là hiển thị mà là ba trạng thái dễ lẫn nhau:
 * chưa bao giờ bật, đang bật, và đã bật nhưng hết hạn. Backend gộp hai trạng thái sau thành
 * `delayMinutes = 0`, nên ở đây chỉ còn hai — và điều đó là cố ý: với người trực bếp, "đã hết
 * hạn" và "chưa bật" dẫn tới cùng một hành động.
 */
export function moTaTreBep(delay: KitchenDelay | null): string {
  if (!delay || delay.delayMinutes <= 0) {
    return "Bếp bình thường";
  }
  return `Đang cộng +${delay.delayMinutes} phút · còn ${delay.minutesLeft} phút`;
}

/**
 * Cảnh báo khi cờ sắp tự tắt.
 *
 * <p>Cờ hết hạn giữa lúc còn đông thì ước lượng tụt xuống mà không ai chạm vào gì — đúng cái kiểu
 * thay đổi khiến người ta nghi hệ thống chập chờn. Báo trước 15 phút để bếp kịp bấm lại.
 */
export function sapHetHan(delay: KitchenDelay | null): boolean {
  return !!delay && delay.delayMinutes > 0 && delay.minutesLeft <= 15;
}
