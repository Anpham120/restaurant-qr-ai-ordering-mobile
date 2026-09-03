/**
 * Tiến độ món cho KHÁCH, và tiếng báo khi có món vừa xong.
 *
 * <p>Tách khỏi màn hình vì cả hai màn của khách (`SessionOrdersPage` cho cả bàn, `OrderTrackingPage`
 * cho một đơn) đều cần đúng những con số này, và trước đây mỗi màn tự đếm một kiểu.
 *
 * <p>Bản sinh đôi của `monVuaSanSang` bên app nằm ở `mobile-rn/src/core/orders/theoDoiDon.ts`. Hai
 * kho không dùng chung mã được, nên luật phải viết hai lần — và mỗi bên có phép kiểm ghim cùng một
 * hành vi, để lệch nhau thì thấy được.
 */

type MonToiThieu = { readonly orderItemId: string; readonly name: string; readonly status: string };

export type TienDoMon = {
  /** Món đã nằm trên bàn khách. */
  daLen: number;
  /** Bếp xong rồi, đang trên đường ra bàn. */
  dangMangRa: number;
  /** Không tính món đã huỷ — khách không chờ món đã huỷ. */
  tong: number;
};

/**
 * Đếm tiến độ theo MÓN, tách `Served` khỏi `Ready`.
 *
 * <p>Trước đây hai trạng thái này bị gộp làm một con số "món đã sẵn sàng". Ăn hết ba món, món thứ
 * tư đang được bưng ra, khách đọc "4/4 món đã sẵn sàng" — vô nghĩa, vì trên bàn mới có ba. Hai
 * trạng thái này là hai việc khác nhau với người đang ngồi ăn: một cái đã ở trước mặt, một cái thì
 * chưa.
 *
 * <p>Đếm theo DÒNG món chứ không theo số lượng: khách nhìn thấy "món Phở" đã ra hay chưa, không
 * nhìn thấy "2 suất phở đã ra 1".
 */
export function demTienDoMon(danhSach: readonly MonToiThieu[]): TienDoMon {
  const conSong = danhSach.filter((m) => m.status !== "Cancelled");
  return {
    daLen: conSong.filter((m) => m.status === "Served").length,
    dangMangRa: conSong.filter((m) => m.status === "Ready").length,
    tong: conSong.length,
  };
}

/**
 * Những món vừa chuyển sang "xong, đang mang ra" giữa hai lần hỏi máy chủ.
 *
 * <p>Báo TÊN MÓN chứ không báo "đơn có cập nhật": khách đang chờ một món cụ thể, và câu "có cập
 * nhật" không cho họ biết nên làm gì.
 *
 * <p>So theo `orderItemId` chứ không theo vị trí trong mảng — bếp huỷ một món thì mảng ngắn lại và
 * so theo vị trí sẽ báo nhầm gần hết danh sách.
 *
 * <p>CHỈ báo khi đã biết trạng thái cũ. Lần tải đầu chưa có gì để so, và dội một loạt tên món đang
 * sẵn sàng ngay lúc mở màn là báo thứ khách đã biết.
 */
export function monVuaSanSang(
  truoc: readonly MonToiThieu[],
  sau: readonly MonToiThieu[],
): string[] {
  const cu = new Map<string, string>();
  for (const m of truoc) cu.set(m.orderItemId, m.status);

  const ten: string[] = [];
  for (const m of sau) {
    const truocDo = cu.get(m.orderItemId);
    if (truocDo !== undefined && truocDo !== "Ready" && m.status === "Ready") {
      ten.push(m.name);
    }
  }
  return ten;
}
