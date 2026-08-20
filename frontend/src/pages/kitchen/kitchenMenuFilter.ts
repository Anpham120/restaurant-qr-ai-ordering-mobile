export type MonCoTheTat = { id: string; name: string; isAvailable: boolean };

/**
 * Bỏ dấu tiếng Việt để so khớp khi tìm món.
 *
 * Bếp gõ trong lúc đang nấu, một tay, và bàn phím máy bếp thường không đặt bộ gõ tiếng Việt. Nếu
 * bắt gõ đúng dấu thì ô tìm kiếm vô dụng đúng vào giờ mà nó cần chạy: gõ "pho" phải ra "Phở bò".
 *
 * `đ` phải xử lý riêng vì NFD KHÔNG tách nó — `đ` là một ký tự Latin độc lập (U+0111) chứ không
 * phải `d` cộng dấu, nên `replace(/[\u0300-\u036f]/g, "")` bỏ sót. Thiếu dòng này thì gõ "dau hu"
 * không tìm ra "Đậu hũ".
 *
 * KHÔNG dùng chung với `normalizeVN` trong `utils/menuImages.ts`, dù hai hàm hiện giống nhau: hàm
 * kia so khớp tên FILE ẢNH. Hai chỗ có lý do thay đổi khác nhau — sửa quy tắc vì đặt tên ảnh mà
 * lặng lẽ đổi luôn cách tìm món là thứ không cổng nào bắt được.
 */
function boDau(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

/**
 * Lọc danh sách món theo từ khoá.
 *
 * GIỮ NGUYÊN THỨ TỰ đầu vào — đây là điểm dễ làm sai nhất của màn hình này.
 *
 * Sắp món đang hết lên đầu nghe hợp lý, nhưng danh sách nằm trong khung cuộn 300px và mỗi dòng có
 * một công tắc. Nếu xếp theo tình trạng, bấm tắt một món khiến nó NHẢY lên đầu, dòng dưới trượt lên
 * đúng chỗ con trỏ vừa bấm — cú bấm tiếp theo trúng nhầm món. Giờ cao điểm bấm liên tục thì đó
 * không phải rủi ro lý thuyết. Ô tìm kiếm đã giải quyết việc tìm; thứ tự cố định giải quyết việc
 * bấm đúng.
 *
 * Từ khoá rỗng trả về nguyên danh sách (không sao chép có điều kiện — luôn trả mảng mới để chỗ gọi
 * không phải đoán khi nào tham chiếu đổi).
 */
export function locMonTheoTen<T extends MonCoTheTat>(items: T[], tuKhoa: string): T[] {
  const khoa = boDau(tuKhoa);
  if (!khoa) {
    return items;
  }
  return items.filter((item) => boDau(item.name).includes(khoa));
}
