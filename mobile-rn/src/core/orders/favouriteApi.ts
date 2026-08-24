import { AuthException } from '../auth/authApi';
import { type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';

/** Một món khách hay gọi (#35, §9.8). */
export interface MonHayGoi {
  readonly menuItemId: string;
  readonly name: string;
  /** Số LẦN gọi — con số quyết định thứ tự. */
  readonly timesOrdered: number;
  /**
   * Tổng số phần. Có ích để giải thích, không dùng để xếp hạng: tám phần chè trong đúng một bữa
   * liên hoan không phải là thói quen.
   */
  readonly totalQuantity: number;
}

export function monHayGoiTuJson(json: unknown): MonHayGoi {
  const o = json as Record<string, unknown>;
  return {
    menuItemId: o.menuItemId as string,
    name: typeof o.name === 'string' ? o.name : '',
    timesOrdered: typeof o.timesOrdered === 'number' ? Math.trunc(o.timesOrdered) : 0,
    totalQuantity: typeof o.totalQuantity === 'number' ? Math.trunc(o.totalQuantity) : 0,
  };
}

export interface FavouriteApi {
  monHayGoi(accessToken: string): Promise<readonly MonHayGoi[]>;
}

/**
 * Gọi `GET /api/orders/mine/favourites`.
 *
 * §9.8 nói rõ phần này **không cần cơ chế mới**: chỉ là truy vấn lịch sử `Order` theo `MemberId`,
 * thứ đã có từ #26/#33.
 *
 * Phần CÒN LẠI của §9.8 — hồ sơ AI bền vững qua bảng `CustomerProfileFact` — **chưa tồn tại**, và
 * §9.8 giao nó cho backend + AI-service chứ không cho môn Lập trình di động.
 */
export class HttpFavouriteApi implements FavouriteApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async monHayGoi(accessToken: string): Promise<readonly MonHayGoi[]> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/orders/mine/favourites`, {
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
      return Array.isArray(body.items) ? body.items.map(monHayGoiTuJson) : [];
    }
    if (res.status === 401 || res.status === 403) {
      throw new AuthException(
        'UNAUTHORIZED',
        'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem món hay gọi.',
      );
    }
    const chung = loiChungHttp(res.status, maLoi(than), 'Không tải được món hay gọi');
    throw new AuthException(chung.code, chung.message);
  }
}

/**
 * Câu mô tả thói quen, hoặc `null` nếu chưa đủ căn cứ để nói.
 *
 * Gọi **một lần** thì chưa phải "hay gọi" — đó chỉ là một lần thử. Hiện "1 lần" dưới nhãn "Món
 * tôi hay gọi" vừa vô nghĩa vừa khiến danh sách đầy những món khách ăn thử rồi thôi.
 */
export function moTaThoiQuen(m: MonHayGoi): string | null {
  if (m.timesOrdered < 2) return null;
  return `Đã gọi ${m.timesOrdered} lần`;
}

/** Lọc ra những món thật sự là thói quen. */
export function locThoiQuen(tatCa: readonly MonHayGoi[]): readonly MonHayGoi[] {
  return tatCa.filter((m) => m.timesOrdered >= 2);
}
