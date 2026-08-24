import { AuthException } from '../auth/authApi';
import { type Cart } from '../cart/cart';
import { HEADER_JSON, type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type TableSession } from '../tables/tableSession';

/** Đơn vừa tạo, kèm chìa khoá để xem lại nó về sau. */
export interface CreatedOrder {
  readonly orderId: string;
  readonly orderCode: string;
  readonly status: string;
  readonly totalAmount: number;
  /**
   * `X-Order-Token` — chìa khoá năng lực để xem lại đơn này qua `GET /api/orders/{code}`.
   *
   * Backend chỉ trả nó ĐÚNG MỘT LẦN, lúc tạo. Mất là mất luôn đường xem đơn theo mã, nên phải cất
   * chứ không chỉ hiện lên màn hình.
   */
  readonly customerAccessToken: string;
}

export function createdOrderTuJson(json: unknown): CreatedOrder {
  const o = json as Record<string, unknown>;
  return {
    orderId: o.orderId as string,
    orderCode: typeof o.orderCode === 'string' ? o.orderCode : '',
    status: typeof o.status === 'string' ? o.status : 'Placed',
    totalAmount: typeof o.totalAmount === 'number' ? o.totalAmount : 0,
    customerAccessToken: typeof o.customerAccessToken === 'string' ? o.customerAccessToken : '',
  };
}

export interface TaoDonYeuCau {
  readonly phienBan: TableSession;
  readonly gio: Cart;
  readonly khoaIdempotency: string;
  readonly soDienThoai?: string | null;
  readonly maKhuyenMai?: string | null;
}

export interface CreateOrderApi {
  taoDon(yeuCau: TaoDonYeuCau): Promise<CreatedOrder>;
}

export class HttpCreateOrderApi implements CreateOrderApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async taoDon(yc: TaoDonYeuCau): Promise<CreatedOrder> {
    const { phienBan, gio, khoaIdempotency, soDienThoai, maKhuyenMai } = yc;

    const than: Record<string, unknown> = {
      orderType: 'DineIn',
      tableSessionId: phienBan.sessionId,
      // Đơn tại bàn đòi CẢ HAI, đo trên backend đang chạy: thiếu tableCode →
      // 400 DINE_IN_TABLE_REQUIRED, thiếu qrToken → 400 QR_TOKEN_INVALID. Chỉ gửi tableSessionId
      // là không đủ, dù nó đã xác định đúng một cái bàn.
      tableCode: phienBan.tableCode,
      qrToken: phienBan.qrToken,
      items: gio.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
    };
    // TỰ ĐIỀN SỐ ĐIỆN THOẠI — §9.7 gọi đây là tính năng lõi của app, không phải điểm thưởng.
    // Khách gõ tay dễ sai, không kiểm định dạng, không tra trùng; app đã có số đã liên kết nên bỏ
    // hẳn bước gõ. Chỉ gửi khi thật sự có, không gửi chuỗi rỗng.
    if (soDienThoai != null && soDienThoai.length > 0) than.customerPhoneNumber = soDienThoai;
    if (maKhuyenMai != null && maKhuyenMai.length > 0) than.promotionCode = maKhuyenMai;

    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          ...HEADER_JSON,
          'X-Table-Session-Token': phienBan.tableSessionToken,
          // BẮT BUỘC. Backend trả 400 IDEMPOTENCY_KEY_REQUIRED nếu thiếu.
          'Idempotency-Key': khoaIdempotency,
        },
        body: JSON.stringify(than),
      });
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    const thanTraVe = await res.text();
    // Đo trên backend đang chạy: lần gửi lại với CÙNG khoá và CÙNG nội dung cũng trả 201 kèm đúng
    // mã đơn cũ (ORD-1016 cả hai lần, và bảng orders chỉ có 1 dòng). Vẫn nhận cả 200 vì "trả lại
    // thứ đã có" là 200 theo lẽ thường và không có gì bảo đảm điều này không đổi.
    if (res.status === 201 || res.status === 200) {
      return createdOrderTuJson(JSON.parse(thanTraVe));
    }
    throw dichLoi(res.status, thanTraVe);
  }
}

function dichLoi(status: number, than: string): AuthException {
  const code = maLoi(than);
  switch (code) {
    case 'MENU_ITEM_UNAVAILABLE':
      return new AuthException(
        'MENU_ITEM_UNAVAILABLE',
        'Có món trong giỏ vừa hết. Xem lại giỏ rồi đặt lại.',
      );
    case 'ORDER_ITEMS_REQUIRED':
      return new AuthException('ORDER_ITEMS_REQUIRED', 'Giỏ đang trống.');
    case 'ORDER_ITEMS_TOO_MANY':
      return new AuthException(
        'ORDER_ITEMS_TOO_MANY',
        'Đơn có quá nhiều món. Tách thành hai đơn nhé.',
      );
    case 'IDEMPOTENCY_KEY_REUSED':
      // Xảy ra khi giỏ đổi mà khoá không đổi. Đó là lỗi của app chứ không phải của khách, nên câu
      // thông báo phải bảo họ làm lại chứ không đổ tại họ.
      return new AuthException(
        'IDEMPOTENCY_KEY_REUSED',
        'Giỏ vừa thay đổi. Mở lại giỏ và đặt lại giúp nhé.',
      );
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
    case 'TABLE_SESSION_CONFLICT':
      return new AuthException(
        'TABLE_SESSION_CONFLICT',
        'Bàn vừa có thay đổi. Mở lại giỏ rồi đặt lại.',
      );
  }

  const chung = loiChungHttp(status, code, 'Không đặt được đơn');
  return new AuthException(chung.code, chung.message);
}
