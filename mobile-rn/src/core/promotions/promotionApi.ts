import { AuthException } from '../auth/authApi';
import { type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type Promotion, promotionTuJson } from './promotion';

export interface PromotionApi {
  dangChay(): Promise<readonly Promotion[]>;
}

/** Gọi `GET /api/promotions/active` — endpoint mới thêm cho app (§9.5, §9.10 M1 mục 3). */
export class HttpPromotionApi implements PromotionApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async dangChay(): Promise<readonly Promotion[]> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      // KHÔNG gửi Authorization. Endpoint công khai, và khuyến mãi phải xem được cả khi chưa đăng
      // nhập — mã khuyến mãi là thứ quán in lên tờ rơi.
      res = await this.goiMang(`${this.baseUrl}/api/promotions/active`);
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    const than = await res.text();
    if (res.status === 200) {
      const body = JSON.parse(than) as Record<string, unknown>;
      return Array.isArray(body.items) ? body.items.map(promotionTuJson) : [];
    }

    const chung = loiChungHttp(res.status, maLoi(than), 'Không tải được khuyến mãi');
    throw new AuthException(chung.code, chung.message);
  }
}
