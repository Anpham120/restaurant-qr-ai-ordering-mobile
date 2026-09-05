/**
 * Link tải app di động, hiện sau khi khách thanh toán xong trên web.
 *
 * Trả `null` khi chưa cấu hình, và màn hình KHÔNG hiện lời mời nào. Thà không mời còn hơn mời rồi
 * dẫn khách tới một trang không tồn tại — ngay sau khi họ vừa trả tiền là lúc tệ nhất để làm vậy.
 *
 * Tách khỏi màn hình để kiểm được: nhánh "chưa cấu hình" nằm sâu trong trạng thái đã-thanh-toán
 * của `SessionOrdersPage`, chỗ mà phép kiểm dựng giao diện không với tới.
 */
export function layLinkTaiApp(): string | null {
  const daCauHinh = (import.meta.env.VITE_APP_DOWNLOAD_URL ?? "").trim();
  if (daCauHinh === "") {
    return null;
  }
  // Bỏ dấu / thừa ở cuối, giống getOrderingBaseUrl — dán từ trình duyệt hay dính thêm.
  return daCauHinh.replace(/\/$/, "");
}
