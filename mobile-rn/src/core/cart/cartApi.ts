import { AuthException } from '../auth/authApi';
import { HEADER_JSON, type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type Cart, cartTuJson } from './cart';

export interface CartApi {
  gio(sessionId: string, tableSessionToken: string): Promise<Cart>;
  /**
   * Cộng/trừ số lượng một món.
   *
   * Backend nhận DELTA chứ không nhận số lượng tuyệt đối — xem ghi chú ở `HttpCartApi`.
   */
  doiSoLuong(
    sessionId: string,
    tableSessionToken: string,
    menuItemId: string,
    delta: number,
  ): Promise<Cart>;
  xoaHet(sessionId: string, tableSessionToken: string): Promise<Cart>;
}

/**
 * Gọi `/api/table-sessions/{id}/cart`.
 *
 * **Giỏ hàng nhận DELTA, không nhận số lượng tuyệt đối** (`{menuItemId, delta}`). Hệ quả phải
 * nhớ: lời gọi này KHÔNG idempotent. Gửi `+1` hai lần thì khách có hai phần, không phải một.
 *
 * Nên lớp này **không tự gửi lại** khi lỗi mạng, và cũng không có chỗ nào để bật lại. Khi một lời
 * gọi hỏng mà không rõ máy chủ đã nhận hay chưa, việc đúng là ĐỌC LẠI giỏ (`GET`) và hiện sự
 * thật, chứ không đoán rồi gửi thêm một delta nữa.
 *
 * Khác hẳn `POST /api/orders`: chỗ đó có `Idempotency-Key` nên gửi lại được an toàn.
 */
export class HttpCartApi implements CartApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  gio(sessionId: string, tableSessionToken: string): Promise<Cart> {
    return this.goi(this.duongDan(sessionId), {
      headers: { 'X-Table-Session-Token': tableSessionToken },
    });
  }

  doiSoLuong(
    sessionId: string,
    tableSessionToken: string,
    menuItemId: string,
    delta: number,
  ): Promise<Cart> {
    return this.goi(`${this.duongDan(sessionId)}/items`, {
      method: 'POST',
      headers: { ...HEADER_JSON, 'X-Table-Session-Token': tableSessionToken },
      body: JSON.stringify({ menuItemId, delta }),
    });
  }

  xoaHet(sessionId: string, tableSessionToken: string): Promise<Cart> {
    return this.goi(this.duongDan(sessionId), {
      method: 'DELETE',
      headers: { 'X-Table-Session-Token': tableSessionToken },
    });
  }

  private duongDan(sessionId: string): string {
    return `${this.baseUrl}/api/table-sessions/${encodeURIComponent(sessionId)}/cart`;
  }

  private async goi(url: string, init: RequestInit): Promise<Cart> {
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
    if (res.status === 200) return cartTuJson(JSON.parse(than));
    throw dichLoi(res.status, than);
  }
}

function dichLoi(status: number, than: string): AuthException {
  const code = maLoi(than);
  switch (code) {
    case 'MENU_ITEM_UNAVAILABLE':
      return new AuthException('MENU_ITEM_UNAVAILABLE', 'Món này vừa hết. Chọn món khác nhé.');
    case 'CART_ITEM_QUANTITY_INVALID':
      return new AuthException(
        'CART_ITEM_QUANTITY_INVALID',
        'Số lượng vượt quá mức cho phép cho một món.',
      );
    case 'TABLE_INVOICE_PAYMENT_PENDING':
      // Backend cố ý vẫn cho BỚT món khi đang chờ thanh toán, chỉ chặn thêm. Câu này phải nói
      // đúng điều đó, không nói chung chung là "giỏ đã khoá".
      return new AuthException(
        'TABLE_INVOICE_PAYMENT_PENDING',
        'Bàn đang chờ thanh toán nên không thêm món được. Vẫn bớt được món đã chọn.',
      );
    case 'TABLE_SESSION_SETTLED':
      return new AuthException(
        'TABLE_SESSION_SETTLED',
        'Bàn đã thanh toán xong. Quét lại mã QR để mở bàn mới.',
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
  }

  const chung = loiChungHttp(status, code, 'Không cập nhật được giỏ');
  return new AuthException(chung.code, chung.message);
}
