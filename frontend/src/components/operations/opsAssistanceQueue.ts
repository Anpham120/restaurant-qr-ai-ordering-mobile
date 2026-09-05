import type { OpsAssistanceAlert } from "./OpsAssistanceProvider";

/**
 * Hàng chờ điều phối: bàn nào đang gọi nhân viên mà quầy chưa cử người tới.
 *
 * <p><b>Nghiệp vụ.</b> Phục vụ bàn không cầm điện thoại — họ nhận lệnh qua bộ đàm. Nên quầy là
 * điểm ĐIỀU PHỐI: nhận yêu cầu của khách, bấm bộ đàm, cử người tới bàn. Màn hình không thay họ
 * làm việc đó; việc của nó là đảm bảo yêu cầu KHÔNG TRÔI MẤT trước khi có người bấm bộ đàm.
 *
 * <p>Đó là lý do hàng chờ này tồn tại song song với thông báo nổi sẵn có: thông báo đó tự tắt sau
 * 5 giây (`OpsToastProvider`), đủ cho một tin "đã có đơn mới" nhưng quá ngắn cho một việc phải
 * làm — người ở quầy đang đếm tiền cho khách khác thì 5 giây trôi qua trước khi họ ngẩng lên.
 *
 * <p>Tách khỏi provider để kiểm được: sai ở đây không nổ ra thành lỗi, nó chỉ làm một bàn ngồi
 * chờ mà không ai tới.
 */

/** Thêm một yêu cầu vào đầu hàng chờ, bỏ trùng và cắt bớt. */
export function themYeuCau(
  hangCho: readonly OpsAssistanceAlert[],
  moi: OpsAssistanceAlert,
  toiDa = 5,
): OpsAssistanceAlert[] {
  // Bỏ trùng theo `id` (mã bàn + thời điểm): kết nối thời gian thực nối lại sẽ phát lại sự kiện,
  // và hai dòng y hệt khiến người ở quầy tưởng có hai bàn đang gọi.
  return [moi, ...hangCho.filter((x) => x.id !== moi.id)].slice(0, toiDa);
}

/** Bỏ một yêu cầu khi quầy đã cử người tới. */
export function daDieuPhoi(
  hangCho: readonly OpsAssistanceAlert[],
  id: string,
): OpsAssistanceAlert[] {
  return hangCho.filter((x) => x.id !== id);
}

/**
 * Yêu cầu đã chờ bao nhiêu phút.
 *
 * <p>Con số này mới là thứ quyết định thứ tự điều phối khi có nhiều bàn cùng gọi — bàn chờ 6 phút
 * phải được ưu tiên hơn bàn vừa bấm, và người ở quầy không tự tính được trong lúc bận.
 */
export function phutDaCho(requestedAt: string, bayGio: number = Date.now()): number {
  const luc = Date.parse(requestedAt);
  if (Number.isNaN(luc)) return 0;
  return Math.max(0, Math.floor((bayGio - luc) / 60000));
}
