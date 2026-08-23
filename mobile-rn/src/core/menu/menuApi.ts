import { AuthException } from '../auth/authApi';
import { type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type MenuCategory, type MenuItem, menuCategoryTuJson, menuItemTuJson } from './menu';

export interface MenuData {
  readonly categories: readonly MenuCategory[];
  readonly items: readonly MenuItem[];
}

export interface MenuApi {
  thucDon(): Promise<MenuData>;
}

/**
 * Gọi `GET /api/menu` — công khai, KHÔNG cần đang ở bàn (§9.10 M1 mục 4).
 *
 * Đây là điểm khác biệt thật giữa app và web QR: web chỉ mở được thực đơn sau khi quét mã bàn,
 * còn app cho xem trước ở nhà. Không gửi cả `Authorization` lẫn `X-Table-Session-Token` — thêm
 * vào sẽ tạo ấn tượng sai rằng thực đơn phụ thuộc phiên.
 */
export class HttpMenuApi implements MenuApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async thucDon(): Promise<MenuData> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/menu`);
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    const than = await res.text();
    if (res.status === 200) {
      const body = JSON.parse(than) as Record<string, unknown>;
      return {
        categories: Array.isArray(body.categories) ? body.categories.map(menuCategoryTuJson) : [],
        items: Array.isArray(body.items) ? body.items.map(menuItemTuJson) : [],
      };
    }

    const chung = loiChungHttp(res.status, maLoi(than), 'Không tải được thực đơn');
    throw new AuthException(chung.code, chung.message);
  }
}
