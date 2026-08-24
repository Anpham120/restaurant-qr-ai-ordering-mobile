/** Dữ liệu để khách quét chuyển khoản. `null` khi phương thức không phải VietQR. */
export interface VietQr {
  readonly amount: number;
  /**
   * Nội dung chuyển khoản.
   *
   * KHÔNG được để khách sửa. Webhook Casso đối soát bằng đúng chuỗi này (#3); sửa một ký tự là
   * tiền về mà hệ thống không nhận ra, và hoá đơn nằm chờ cho tới khi có người xử lý tay.
   */
  readonly transferContent: string;
  readonly quickLink: string | null;
  readonly qrImageDataUri: string | null;
}

export interface InvoiceLine {
  readonly name: string;
  readonly quantity: number;
  readonly lineTotal: number;
}

export interface Invoice {
  readonly invoiceCode: string;
  /** `NotRequested` · `Pending` · `Paid` · `Cancelled`. */
  readonly status: string;
  /** `Unselected` · `COD` · `VietQR`. */
  readonly method: string;
  readonly subtotalAmount: number;
  readonly discountAmount: number;
  readonly totalAmount: number;
  readonly items: readonly InvoiceLine[];
  readonly vietQr: VietQr | null;
}

function chuoi(v: unknown, macDinh = ''): string {
  return typeof v === 'string' ? v : macDinh;
}

function so(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

export function vietQrTuJson(json: unknown): VietQr {
  const o = json as Record<string, unknown>;
  return {
    amount: so(o.amount),
    transferContent: chuoi(o.transferContent),
    quickLink: typeof o.quickLink === 'string' ? o.quickLink : null,
    qrImageDataUri: typeof o.qrImageDataUri === 'string' ? o.qrImageDataUri : null,
  };
}

export function invoiceLineTuJson(json: unknown): InvoiceLine {
  const o = json as Record<string, unknown>;
  return { name: chuoi(o.name), quantity: so(o.quantity), lineTotal: so(o.lineTotal) };
}

export function invoiceTuJson(json: unknown): Invoice {
  const o = json as Record<string, unknown>;
  return {
    invoiceCode: chuoi(o.invoiceCode),
    status: chuoi(o.status, 'NotRequested'),
    method: chuoi(o.method, 'Unselected'),
    subtotalAmount: so(o.subtotalAmount),
    discountAmount: so(o.discountAmount),
    totalAmount: so(o.totalAmount),
    items: Array.isArray(o.items) ? o.items.map(invoiceLineTuJson) : [],
    vietQr: o.vietQr === null || o.vietQr === undefined ? null : vietQrTuJson(o.vietQr),
  };
}

/**
 * Nhãn tiếng Việt cho trạng thái hoá đơn.
 *
 * `Pending` ở đây nghĩa là ĐÃ YÊU CẦU và đang chờ tiền/xác nhận — khác hẳn `Pending` của một MÓN
 * (chờ nấu). Ba nghĩa của cùng một chữ trong cùng một hệ thống là lý do mỗi cấp có hàm nhãn riêng
 * thay vì một hàm dùng chung.
 */
export function nhanTrangThaiHoaDon(status: string): string {
  switch (status) {
    case 'NotRequested':
      return 'Chưa yêu cầu thanh toán';
    case 'Pending':
      return 'Đang chờ xác nhận';
    case 'Paid':
      return 'Đã thanh toán';
    case 'Cancelled':
      return 'Yêu cầu đã huỷ';
    default:
      return status;
  }
}

/**
 * Câu nói cho khách biết CHUYỆN GÌ ĐANG XẢY RA sau khi bấm thanh toán.
 *
 * Khách KHÔNG tự xác nhận được — đo thật: `POST .../payment/confirm` bằng token bàn trả 401, vì
 * endpoint đó chỉ dành cho nhân viên quầy. Nên sau khi yêu cầu, việc duy nhất app làm được là nói
 * đúng ai sẽ xác nhận và bằng cách nào. Một nút "Tôi đã trả" ở đây sẽ không làm gì, và khách bấm
 * rồi tưởng xong.
 */
export function huongDanChoXacNhan(method: string): string {
  switch (method) {
    case 'COD':
      return 'Mời bạn trả tiền mặt tại quầy. Nhân viên xác nhận xong thì hoá đơn tự cập nhật.';
    case 'VietQR':
      return (
        'Quét mã và chuyển đúng số tiền, GIỮ NGUYÊN nội dung chuyển khoản. ' +
        'Hệ thống tự nhận khi tiền về.'
      );
    default:
      return 'Chọn cách thanh toán để tiếp tục.';
  }
}
