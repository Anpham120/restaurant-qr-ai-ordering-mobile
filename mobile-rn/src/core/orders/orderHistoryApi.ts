import { AuthException } from '../auth/authApi';
import { type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type CustomerOrder, type OrderItem, customerOrderTuJson } from './order';

export interface OrderHistoryApi {
  lichSuCuaToi(accessToken: string): Promise<readonly CustomerOrder[]>;
}

/**
 * Gọi `GET /api/orders/mine` — lịch sử đơn qua nhiều lần ghé (#33).
 *
 * Uỷ quyền bằng **JWT của khách**, không phải token bàn: đây là dữ liệu của TÀI KHOẢN, không phải
 * của một cái bàn. Ngược hẳn với `GET /api/table-sessions/{id}/orders`.
 *
 * **Không có tham số định danh nào.** `memberId` do backend lấy từ JWT — cùng luật với
 * `/api/loyalty/me`. Đo thật: thêm `?memberId=` của người khác vẫn trả 0 đơn.
 */
export class HttpOrderHistoryApi implements OrderHistoryApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async lichSuCuaToi(accessToken: string): Promise<readonly CustomerOrder[]> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/orders/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    const than = await res.text();
    if (res.status === 200) {
      const body = JSON.parse(than) as Record<string, unknown>;
      return Array.isArray(body.orders) ? body.orders.map(customerOrderTuJson) : [];
    }
    if (res.status === 401 || res.status === 403) {
      throw new AuthException(
        'UNAUTHORIZED',
        'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem lịch sử.',
      );
    }
    const chung = loiChungHttp(res.status, maLoi(than), 'Không tải được lịch sử');
    throw new AuthException(chung.code, chung.message);
  }
}

/** Kết quả một lần "đặt lại món cũ". */
export interface KetQuaDatLai {
  readonly daThem: readonly string[];
  /** Món không thêm được, kèm lý do — thường là món đã ngừng bán. */
  readonly khongThem: Readonly<Record<string, string>>;
}

export function tronVen(kq: KetQuaDatLai): boolean {
  return Object.keys(kq.khongThem).length === 0;
}

export function thatBaiHoanToan(kq: KetQuaDatLai): boolean {
  return kq.daThem.length === 0 && Object.keys(kq.khongThem).length > 0;
}

/**
 * Thêm lại toàn bộ món của một đơn cũ vào giỏ hiện tại (#33).
 *
 * **Từng món một, và không dừng lại khi một món hỏng.** Thực đơn đổi giữa hai lần ghé là chuyện
 * bình thường: món cũ có thể đã ngừng bán, hoặc hôm nay hết. Dừng ở món đầu tiên hỏng nghĩa là
 * khách mất luôn những món vẫn còn — trong khi họ chỉ muốn gọi lại bữa cũ.
 *
 * Trả về CẢ HAI danh sách. Báo "đã thêm vào giỏ" rồi im lặng bỏ ba món là nói dối với khách; họ
 * sẽ chỉ phát hiện lúc nhìn hoá đơn.
 *
 * Không dùng `Promise.all`: các lời gọi giỏ hàng dùng DELTA và cùng sửa một giỏ, nên gửi song
 * song là tự tạo tranh chấp trên đúng thứ không idempotent.
 */
export async function datLaiDon(
  mon: readonly OrderItem[],
  themVaoGio: (menuItemId: string, quantity: number) => Promise<void>,
  moTaLoi: (loi: unknown) => string,
): Promise<KetQuaDatLai> {
  const daThem: string[] = [];
  const khongThem: Record<string, string> = {};

  for (const m of mon) {
    // Món đã huỷ ở đơn cũ thì không đặt lại: khách đã chủ động bỏ nó.
    if (m.status === 'Cancelled') continue;
    try {
      await themVaoGio(m.menuItemId, m.quantity);
      daThem.push(m.name);
    } catch (loi) {
      khongThem[m.name] = moTaLoi(loi);
    }
  }
  return { daThem, khongThem };
}
