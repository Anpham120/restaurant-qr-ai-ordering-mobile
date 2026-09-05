/**
 * Ước lượng thời gian lên món, cho khách xem trên web.
 *
 * <p>Máy chủ đã tính sẵn và gửi kèm từng món — đo trên máy chủ đang chạy: một món `Pending` trả về
 * {@code 24–41} phút, đã gộp cả tải bếp lẫn độ trễ bếp tự khai. App di động hiển thị nó từ lâu
 * ({@code OrdersScreen}), web thì KHÔNG: kiểu `OrderItem` của web không khai ba trường đó nên dữ
 * liệu bị vứt đi ngay lúc đọc. Khách trên web vì thế không thấy ước lượng nào.
 *
 * <p>Cách diễn đạt giữ ĐÚNG như app để hai nơi không nói hai kiểu về cùng một con số.
 */

/** Khoảng thời gian dạng người đọc, hoặc {@code null} khi món không còn chờ. */
export function moTaUocLuong(
  low: number | null | undefined,
  high: number | null | undefined,
): string | null {
  if (low === null || low === undefined) return null;
  if (high === null || high === undefined) return null;
  // Hai số bằng nhau thì "24–24 phút" đọc như một lỗi hiển thị.
  if (high <= low) return `khoảng ${low} phút`;
  return `${low}–${high} phút`;
}

/**
 * Câu giải thích vì sao món lâu hơn thường ngày, hoặc {@code null} khi bếp bình thường.
 *
 * <p>Chỉ nói khi CÓ ước lượng: báo "bếp đang đông" mà không kèm con số nào là gieo lo lắng mà
 * không cho khách thứ gì để quyết định.
 */
export function moTaBepDong(bepDong: boolean | undefined, uocLuong: string | null): string | null {
  if (!bepDong || uocLuong === null) return null;
  return "Bếp đang đông nên món lâu hơn thường ngày.";
}
