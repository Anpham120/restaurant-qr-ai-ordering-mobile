import { AuthException } from '../auth/authApi';
import { type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type CustomerOrder, customerOrderTuJson } from './order';

export interface OrderApi {
  donCuaPhien(sessionId: string, tableSessionToken: string): Promise<readonly CustomerOrder[]>;
  /**
   * Khách tự huỷ một món của mình (hạn chế #11).
   *
   * Uỷ quyền bằng `X-Order-Token` của ĐÚNG đơn đó, không phải token bàn: người đặt mới là người
   * quyết định huỷ.
   */
  huyMon(orderCode: string, orderItemId: string, orderToken: string): Promise<void>;
}

/**
 * Gọi `GET /api/table-sessions/{id}/orders` — xem đơn CHỈ ĐỌC (§9.10 M1 mục 4).
 *
 * Uỷ quyền bằng `X-Table-Session-Token`, KHÔNG bằng JWT của khách. Đó là chủ ý của backend: đơn
 * thuộc về cái BÀN, không thuộc về tài khoản. Ai đang ngồi ở bàn đều xem được, kể cả khách vãng
 * lai đi cùng — đúng như hành vi ở web.
 *
 * Gửi kèm `Authorization` sẽ không làm gì cả, nhưng tạo ấn tượng sai rằng đăng nhập là điều kiện
 * để xem đơn.
 */
export class HttpOrderApi implements OrderApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async donCuaPhien(
    sessionId: string,
    tableSessionToken: string,
  ): Promise<readonly CustomerOrder[]> {
    const res = await this.goi(
      `${this.baseUrl}/api/table-sessions/${encodeURIComponent(sessionId)}/orders`,
      { headers: { 'X-Table-Session-Token': tableSessionToken } },
    );
    const body = JSON.parse(res) as Record<string, unknown>;
    return Array.isArray(body.orders) ? body.orders.map(customerOrderTuJson) : [];
  }

  async huyMon(orderCode: string, orderItemId: string, orderToken: string): Promise<void> {
    await this.goi(
      `${this.baseUrl}/api/orders/${encodeURIComponent(orderCode)}/items/${encodeURIComponent(orderItemId)}/cancel`,
      { method: 'POST', headers: { 'X-Order-Token': orderToken } },
    );
  }

  /** Trả THÂN phản hồi khi 200; ném `AuthException` đã dịch trong mọi trường hợp khác. */
  private async goi(url: string, init: RequestInit): Promise<string> {
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
    if (res.status === 200) return than;
    throw dichLoi(res.status, than);
  }
}

function dichLoi(status: number, than: string): AuthException {
  const code = maLoi(than);
  switch (code) {
    case 'TABLE_SESSION_TOKEN_INVALID':
      return new AuthException(
        'TABLE_SESSION_TOKEN_INVALID',
        'Phiên bàn không còn hợp lệ. Quét lại mã QR của bàn.',
      );
    case 'TABLE_SESSION_EXPIRED':
      // 410 GONE. Câu này phải khác hẳn "token sai": khách không làm gì sai, chỉ là bàn đã đóng.
      return new AuthException(
        'TABLE_SESSION_EXPIRED',
        'Phiên bàn đã kết thúc. Quét lại mã QR để vào bàn mới.',
      );
    case 'TABLE_SESSION_NOT_FOUND':
      return new AuthException('TABLE_SESSION_NOT_FOUND', 'Không tìm thấy phiên bàn này.');
    case 'ORDER_ITEM_CANCEL_NOT_ALLOWED':
      // Bếp đã bắt đầu nấu. Nói đúng lý do thay vì "không huỷ được": khách cần biết đây là giới
      // hạn có thật chứ không phải app hỏng, và rằng nhân viên vẫn xử lý được.
      return new AuthException(
        'ORDER_ITEM_CANCEL_NOT_ALLOWED',
        'Bếp đã bắt đầu nấu món này nên không tự huỷ được. Báo nhân viên giúp nhé.',
      );
    case 'ORDER_NOT_FOUND':
      // Backend cố ý trả ORDER_NOT_FOUND cho cả trường hợp SAI TOKEN, để không lộ đơn nào tồn tại
      // (mã đơn tăng dần). Nên câu này phải phủ được cả hai nghĩa.
      return new AuthException(
        'ORDER_NOT_FOUND',
        'Không tìm thấy đơn này, hoặc máy bạn không có quyền huỷ nó.',
      );
  }

  const chung = loiChungHttp(status, code, 'Không tải được đơn');
  return new AuthException(chung.code, chung.message);
}
