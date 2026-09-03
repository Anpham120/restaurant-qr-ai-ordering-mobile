import { AuthException } from '../auth/authApi';
import { HEADER_JSON, type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import {
  type KetQuaDoiDiem,
  type MyLoyalty,
  ketQuaDoiDiemTuJson,
  myLoyaltyTuJson,
} from './loyalty';

export interface LoyaltyApi {
  cuaToi(accessToken: string): Promise<MyLoyalty>;
  noiSo(accessToken: string, phone: string): Promise<MyLoyalty>;
  /**
   * Xin mã sáu chữ số để đọc cho nhân viên ở quầy.
   *
   * Đường vòng duy nhất khi số đã có hồ sơ tích điểm từ trước — tự nối trong app bị từ chối, và
   * đúng như vậy: không có bước xác minh nào thì gõ số người khác là cướp điểm của họ.
   */
  xinMaNoiSo(accessToken: string): Promise<{ ma: string; hetHan: string }>;
  /**
   * Đổi điểm lấy ưu đãi (#34).
   *
   * `khoaIdempotency` BẮT BUỘC: bấm hai lần lúc mạng chập chờn ở đây tiêu điểm THẬT của khách.
   */
  doiDiem(
    accessToken: string,
    rewardId: string,
    khoaIdempotency: string,
    maDon?: string,
  ): Promise<KetQuaDoiDiem>;
}

/**
 * Gọi `/api/loyalty/me` — điểm của CHÍNH tài khoản đang đăng nhập.
 *
 * KHÔNG có hàm nào nhận số điện thoại rồi trả điểm của số đó. `/api/loyalty/lookup` tồn tại nhưng
 * chỉ dành cho nhân viên có chủ ý: ai gọi được cũng đếm được số nào là khách và tiêu bao nhiêu.
 * App không có đường tới đó, và đó là chủ ý chứ không phải thiếu sót.
 */
export class HttpLoyaltyApi implements LoyaltyApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async cuaToi(accessToken: string): Promise<MyLoyalty> {
    return myLoyaltyTuJson(
      await this.goi(`${this.baseUrl}/api/loyalty/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
  }

  async xinMaNoiSo(accessToken: string): Promise<{ ma: string; hetHan: string }> {
    const o = (await this.goi(`${this.baseUrl}/api/loyalty/me/link-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })) as Record<string, unknown>;
    return {
      ma: typeof o.code === 'string' ? o.code : '',
      hetHan: typeof o.expiresAt === 'string' ? o.expiresAt : '',
    };
  }

  async noiSo(accessToken: string, phone: string): Promise<MyLoyalty> {
    return myLoyaltyTuJson(
      await this.goi(`${this.baseUrl}/api/loyalty/me/phone`, {
        method: 'POST',
        headers: { ...HEADER_JSON, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ phone: phone.trim() }),
      }),
    );
  }

  async doiDiem(
    accessToken: string,
    rewardId: string,
    khoaIdempotency: string,
    maDon?: string,
  ): Promise<KetQuaDoiDiem> {
    return ketQuaDoiDiemTuJson(
      await this.goi(`${this.baseUrl}/api/loyalty/me/redeem`, {
        method: 'POST',
        headers: {
          ...HEADER_JSON,
          Authorization: `Bearer ${accessToken}`,
          'Idempotency-Key': khoaIdempotency,
        },
        // Tên trường là `orderCode`, KHÔNG phải `orderId` — hợp đồng của backend đọc `orderCode`
        // (`LoyaltyDtos.RedeemRequest`). Gửi sai tên thì Jackson bỏ qua mà không báo gì: request
        // vẫn 200, điểm vẫn bị trừ, và món KHÔNG được gắn vào đơn nên bếp không bao giờ biết —
        // trong khi màn hình vừa hứa với khách là bếp sẽ làm ngay.
        //
        // Bỏ hẳn khoá khi không có đơn, thay vì gửi `undefined`. JSON.stringify bỏ qua
        // `undefined` nên hai cách ra cùng một chuỗi, nhưng viết rõ thì đọc không phải kiểm lại.
        body: JSON.stringify(maDon === undefined ? { rewardId } : { rewardId, orderCode: maDon }),
      }),
    );
  }

  private async goi(url: string, init: RequestInit): Promise<unknown> {
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
    if (res.status === 200) return JSON.parse(than);
    throw dichLoi(res.status, than);
  }
}

function dichLoi(status: number, than: string): AuthException {
  const code = maLoi(than);
  switch (code) {
    case 'LOYALTY_PHONE_ALREADY_MEMBER':
      // Câu này phải nói RÕ việc cần làm tiếp. "Số đã tồn tại" khiến khách nghĩ mình gõ nhầm và
      // gõ lại mãi; sự thật là họ đã là thành viên và phải nhờ quầy nối hộ.
      return new AuthException(
        'LOYALTY_PHONE_ALREADY_MEMBER',
        'Số này đã có tài khoản tích điểm. Nhờ nhân viên tại quầy nối vào tài khoản của bạn.',
      );
    case 'LOYALTY_PHONE_TAKEN':
      return new AuthException('LOYALTY_PHONE_TAKEN', 'Số này đang gắn với một tài khoản khác.');
    case 'LOYALTY_NOT_ENOUGH_POINTS':
      // Backend cố ý KHÔNG phân biệt "không đủ điểm" với "thua tranh chấp" — với khách hai thứ
      // nói cùng một điều. Số dư trên màn hình được đọc lại sau đó mới là con số thật.
      return new AuthException('LOYALTY_NOT_ENOUGH_POINTS', 'Chưa đủ điểm cho ưu đãi này.');
    case 'LOYALTY_NOT_LINKED':
      return new AuthException(
        'LOYALTY_NOT_LINKED',
        'Liên kết số điện thoại trước khi đổi ưu đãi nhé.',
      );
    case 'LOYALTY_TIER_TOO_LOW':
      // Giữ nguyên câu của backend: nó có tên hạng cụ thể ("dành cho hạng Vàng trở lên"), còn app
      // ở đây không biết ưu đãi vừa bấm cần hạng nào.
      return new AuthException(
        'LOYALTY_TIER_TOO_LOW',
        'Ưu đãi này dành cho hạng cao hơn hạng hiện tại của bạn.',
      );
    case 'LOYALTY_ORDER_REQUIRED':
      return new AuthException(
        'LOYALTY_ORDER_REQUIRED',
        'Ưu đãi giảm tiền cần áp vào một đơn đang mở. Mở đơn rồi đổi lại nhé.',
      );
    case 'LOYALTY_DISCOUNT_OVER_CAP':
      return new AuthException(
        'LOYALTY_DISCOUNT_OVER_CAP',
        'Mỗi hoá đơn chỉ được giảm tối đa 30% giá trị, không quá 200.000đ.',
      );
    case 'LOYALTY_ORDER_CLOSED':
      return new AuthException(
        'LOYALTY_ORDER_CLOSED',
        'Đơn này đã kết thúc, không áp ưu đãi được.',
      );
    case 'LOYALTY_REWARD_INACTIVE':
      return new AuthException('LOYALTY_REWARD_INACTIVE', 'Ưu đãi này đã ngừng áp dụng.');
    case 'LOYALTY_REWARD_NOT_FOUND':
      return new AuthException('LOYALTY_REWARD_NOT_FOUND', 'Không tìm thấy ưu đãi này.');
    case 'LOYALTY_PHONE_INVALID':
    case 'LOYALTY_PHONE_REQUIRED':
      return new AuthException('LOYALTY_PHONE_INVALID', 'Số điện thoại không hợp lệ.');
  }

  if (status === 401 || status === 403) {
    return new AuthException(
      'UNAUTHORIZED',
      'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem điểm.',
    );
  }
  const chung = loiChungHttp(status, code, 'Không tải được điểm thưởng');
  return new AuthException(chung.code, chung.message);
}
