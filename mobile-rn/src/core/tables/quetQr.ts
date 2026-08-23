/** Thứ đọc được từ một mã QR đặt trên bàn. */
export interface MaQrBan {
  /**
   * Token bắt buộc để mở phiên. Máy chủ đòi nó và **không bao giờ trả nó về**
   * (`GET /api/tables/qr/{token}` cố ý chỉ trả tableCode và displayName), nên mã QR là nguồn duy
   * nhất có nó.
   */
  readonly qrToken: string;
  /** Mã bàn, nếu QR có. Không bắt buộc: máy chủ tự tra ra bàn từ token. */
  readonly tableCode: string | null;
}

const DANG_TOKEN = /^[A-Za-z0-9._:-]{4,100}$/;

/**
 * Phân tích nội dung quét được từ camera.
 *
 * Mã QR trên bàn do web sinh ra, mã hoá một ĐƯỜNG DẪN chứ không phải token trần —
 * `AdminTableService.buildCustomerPath` dựng nó thành:
 *
 *     https://order.cmcrestaurant.app/table/T01?qr=cmc-table-t01-qr
 *
 * Nên bộ quét không thể lấy nguyên chuỗi quét được làm token: làm thế sẽ gửi cả URL lên máy chủ
 * và nhận `QR_NOT_FOUND` cho một mã QR hoàn toàn hợp lệ.
 *
 * Vẫn nhận **token trần** (`cmc-table-t01-qr`) vì hai lý do thật: ô nhập tay trong app dùng đúng
 * dạng đó, và một quán có thể in mã cũ chỉ chứa token.
 *
 * Trả `null` khi không tìm được token — màn hình quét sẽ tiếp tục quét thay vì gửi rác lên máy
 * chủ.
 */
export function phanTichQrBan(quetDuoc: string | null | undefined): MaQrBan | null {
  const s = quetDuoc?.trim() ?? '';
  if (s.length === 0) return null;

  let uri: URL | null = null;
  try {
    uri = new URL(s);
  } catch {
    uri = null;
  }
  const laUrl = uri !== null && (uri.protocol === 'http:' || uri.protocol === 'https:');

  if (laUrl && uri !== null) {
    const token = uri.searchParams.get('qr')?.trim() ?? '';
    if (token.length === 0) {
      // URL không kèm ?qr= thì thiếu đúng thứ bắt buộc. Trả null thay vì đoán, vì đoán ở đây
      // nghĩa là gửi một token sai lên máy chủ và nhận lỗi khó hiểu.
      return null;
    }
    // Đường dẫn dạng /table/{maBan}. Lấy đoạn ngay sau "table" thay vì đoạn cuối: một ngày nào đó
    // đường dẫn dài thêm thì đoạn cuối không còn là mã bàn.
    let maBan: string | null = null;
    const doan = uri.pathname.split('/').filter((d) => d.length > 0);
    const i = doan.indexOf('table');
    const ke = i >= 0 ? doan[i + 1] : undefined;
    if (ke !== undefined && ke.trim().length > 0) {
      maBan = decodeURIComponent(ke).trim();
    }
    return { qrToken: token, tableCode: maBan };
  }

  // Không phải URL. Chỉ nhận khi trông như một token: không khoảng trắng, không xuống dòng. Không
  // lọc thì mọi mã QR khác trên đời (danh thiếp, wifi, link ví điện tử) đều được gửi lên máy chủ
  // như một token.
  if (DANG_TOKEN.test(s)) {
    return { qrToken: s, tableCode: null };
  }
  return null;
}
