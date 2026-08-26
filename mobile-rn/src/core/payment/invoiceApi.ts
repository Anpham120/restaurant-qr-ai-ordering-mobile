import { AuthException } from '../auth/authApi';
import { HEADER_JSON, type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type Invoice, invoiceTuJson } from './invoice';

export interface InvoiceApi {
  hoaDon(sessionId: string, tableSessionToken: string): Promise<Invoice>;
  /**
   * Yêu cầu thanh toán. `method` là `COD` hoặc `VietQR`.
   *
   * KHÔNG phải xác nhận đã trả tiền — khách không có quyền đó.
   */
  /**
   * @param maKhuyenMai mã của quán, ai cũng dùng được
   * @param maDoiDiem   mã khách đổi bằng điểm
   *
   * Hai mã cộng dồn, và tổng bị cắt theo trần của hoá đơn ở phía máy chủ. App không tự tính lại —
   * trần là luật nghiệp vụ và nó sống ở backend.
   */
  yeuCauThanhToan(
    sessionId: string,
    tableSessionToken: string,
    method: string,
    khoaIdempotency: string,
    soDienThoai?: string | null,
    maKhuyenMai?: string | null,
    maDoiDiem?: string | null,
  ): Promise<Invoice>;
}

/** Cắt khoảng trắng và gạch nối, viết hoa — cùng luật với `MaUuDai.chuanHoa` bên máy chủ. */
function chuanHoaMa(ma?: string | null): string {
  return (ma ?? '').trim().toUpperCase().replace(/[-s]/g, '');
}

export class HttpInvoiceApi implements InvoiceApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  private goc(sessionId: string): string {
    return `${this.baseUrl}/api/table-sessions/${encodeURIComponent(sessionId)}/invoice`;
  }

  async hoaDon(sessionId: string, tableSessionToken: string): Promise<Invoice> {
    return invoiceTuJson(
      await this.gui(this.goc(sessionId), {
        headers: { 'X-Table-Session-Token': tableSessionToken },
      }),
    );
  }

  async yeuCauThanhToan(
    sessionId: string,
    tableSessionToken: string,
    method: string,
    khoaIdempotency: string,
    soDienThoai?: string | null,
    maKhuyenMai?: string | null,
    maDoiDiem?: string | null,
  ): Promise<Invoice> {
    const than: Record<string, string> = { method };
    // Số điện thoại đi kèm hoá đơn là thứ quyết định đơn này có được tích điểm hay không (§9.7).
    // Chỉ gửi khi thật sự có.
    if (soDienThoai != null && soDienThoai.length > 0) than.customerPhoneNumber = soDienThoai;
    // Chuẩn hoá GIỐNG HỆT phía máy chủ: khách đọc mã theo cụm nên hay gõ kèm gạch nối hoặc khoảng
    // trắng, và từ chối vì một dấu gạch là bắt họ sửa thứ đáng lẽ hệ thống tự hiểu.
    const km = chuanHoaMa(maKhuyenMai);
    if (km.length > 0) than.promotionCode = km;
    const dd = chuanHoaMa(maDoiDiem);
    if (dd.length > 0) than.loyaltyCode = dd;

    const res = await this.gui(`${this.goc(sessionId)}/payment-request`, {
      method: 'POST',
      headers: {
        ...HEADER_JSON,
        'X-Table-Session-Token': tableSessionToken,
        // Bắt buộc, giống POST /api/orders. Thiếu là 400 IDEMPOTENCY_KEY_REQUIRED.
        'Idempotency-Key': khoaIdempotency,
      },
      body: JSON.stringify(than),
    });
    // Phản hồi bọc hoá đơn trong khoá `invoice`, khác với GET trả thẳng hoá đơn.
    const boc = res.invoice;
    return invoiceTuJson(typeof boc === 'object' && boc !== null ? boc : res);
  }

  private async gui(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(url, init);
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }
    const than = await res.text();
    if (res.status === 200 || res.status === 201) {
      return JSON.parse(than) as Record<string, unknown>;
    }
    throw dichLoi(res.status, than);
  }
}

function dichLoi(status: number, than: string): AuthException {
  const code = maLoi(than);
  switch (code) {
    case 'VIETQR_CONFIG_MISSING':
      // Quán chưa cấu hình ngân hàng. Đây KHÔNG phải lỗi của khách, và câu thông báo phải chỉ ra
      // lối thoát có thật thay vì bảo họ thử lại — thử lại sẽ hỏng y hệt.
      return new AuthException(
        'VIETQR_CONFIG_MISSING',
        'Chuyển khoản đang tạm ngưng. Chọn trả tiền mặt tại quầy giúp nhé.',
      );
    case 'TABLE_INVOICE_PAYMENT_PENDING':
      return new AuthException(
        'TABLE_INVOICE_PAYMENT_PENDING',
        'Bàn đã yêu cầu thanh toán rồi. Chờ nhân viên xác nhận nhé.',
      );
    case 'TABLE_INVOICE_EMPTY':
      return new AuthException('TABLE_INVOICE_EMPTY', 'Bàn chưa có món nào để thanh toán.');
    case 'PAYMENT_METHOD_INVALID':
      return new AuthException('PAYMENT_METHOD_INVALID', 'Cách thanh toán không hợp lệ.');
    case 'TABLE_SESSION_EXPIRED':
      return new AuthException(
        'TABLE_SESSION_EXPIRED',
        'Phiên bàn đã kết thúc. Quét lại mã QR để vào bàn mới.',
      );
    case 'TABLE_SESSION_TOKEN_INVALID':
      return new AuthException(
        'TABLE_SESSION_TOKEN_INVALID',
        'Phiên bàn không còn hợp lệ. Quét lại mã QR của bàn.',
      );
  }

  const chung = loiChungHttp(status, code, 'Không gửi được yêu cầu thanh toán');
  return new AuthException(chung.code, chung.message);
}
