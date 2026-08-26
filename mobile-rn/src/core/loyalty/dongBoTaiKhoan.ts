import { type TableSession } from '../tables/tableSession';
import { type LoyaltyApi } from './loyaltyApi';

/** Chỉ những gì hàm này cần, không phải cả repository — để phép kiểm không phải dựng nửa app. */
export interface MoLaiPhien {
  moPhien(qrToken: string, tableCode?: string | null): Promise<TableSession>;
}

export interface KetQuaDongBo {
  /** Số đã liên kết, đi kèm mọi đơn đặt sau đó; `null` khi chưa liên kết hoặc chưa đăng nhập. */
  readonly soDienThoai: string | null;
  /** Phiên bàn sau khi gắn tài khoản; `null` khi không có phiên nào để gắn. */
  readonly phienBan: TableSession | null;
}

/**
 * Hai việc phải xảy ra mỗi khi app biết khách là ai — dù biết vào lúc nào.
 *
 * 1. Đọc số điện thoại đã liên kết. Đó là thứ đi kèm đơn và là căn cứ DUY NHẤT để cộng điểm lúc
 *    thanh toán. Thiếu nó thì đơn đi ra rỗng và lần ghé đó không tích được điểm nào.
 * 2. Gắn phiên bàn vào tài khoản, bằng cách mở lại phiên với cùng mã QR — lần này kèm token đăng
 *    nhập. Backend chỉ gắn khi phiên chưa có chủ, nên gọi lại là an toàn, và nó trả về đúng phiên
 *    cũ chứ không mở phiên mới.
 *
 * Tách khỏi `App.tsx` vì đây là chỗ lỗi đã sống lâu nhất mà không ai thấy: việc (1) trước đây chỉ
 * chạy ở đúng MỘT nhánh — ngay sau khi mở bàn, và chỉ khi lúc đó đã đăng nhập. Đăng nhập sau
 * không nạp lại, khởi động lại app cũng không. Mà app KHÔNG cho đăng nhập trước khi vào bàn, nên
 * nhánh duy nhất ấy gần như không bao giờ chạy. Không phép kiểm nào chạm tới `App.tsx`, nên lỗi
 * nằm im qua nhiều lượt xây tính năng bên trên nó.
 *
 * Hỏng ở bước nào cũng KHÔNG ném ra ngoài: khách vẫn phải gọi món được. Mất tích điểm một lần
 * tệ hơn nhiều nếu đổi lấy một màn hình trắng.
 */
export async function dongBoTaiKhoan(
  loyaltyApi: LoyaltyApi,
  ban: MoLaiPhien,
  accessToken: string | null,
  phienBan: TableSession | null,
): Promise<KetQuaDongBo> {
  if (accessToken === null || accessToken.length === 0) {
    return { soDienThoai: null, phienBan };
  }

  let soDienThoai: string | null = null;
  try {
    const diem = await loyaltyApi.cuaToi(accessToken);
    soDienThoai = diem.linked ? diem.phoneNumber : null;
  } catch {
    soDienThoai = null;
  }

  if (phienBan === null) {
    return { soDienThoai, phienBan: null };
  }

  try {
    return { soDienThoai, phienBan: await ban.moPhien(phienBan.qrToken, phienBan.tableCode) };
  } catch {
    // Phiên cũ vẫn dùng được như khách vãng lai; chỉ mất phần gắn tài khoản.
    return { soDienThoai, phienBan };
  }
}
