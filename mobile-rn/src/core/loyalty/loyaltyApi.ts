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
  /**
   * Nối số vào tài khoản bằng TOKEN OTP, không phải số trần.
   *
   * Đường xin mã sáu chữ số để nhân viên quầy nối hộ đã gỡ. Nó tồn tại vì bản trước gửi số trần,
   * nên máy chủ phải từ chối mọi số đã có hồ sơ điểm — và đúng như vậy: không có bước xác minh nào
   * thì gõ số người khác là cướp điểm của họ. Token OTP xác minh được, nên hết cần đường vòng.
   */
  noiSo(accessToken: string, phoneIdToken: string): Promise<MyLoyalty>;
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

  /**
   * Nối số vào tài khoản, xác minh bằng OTP.
   *
   * Gửi TOKEN chứ không gửi số. Bản trước gửi số trần, và vì thế máy chủ phải từ chối mọi số đã
   * có hồ sơ điểm — nhận một số chưa chứng minh nghĩa là cho người lạ gõ số của khách quen rồi
   * lấy điểm. Cái từ chối đó lại chặn đúng ca phổ biến nhất: khách ăn tại quán qua web, tích điểm
   * theo số, rồi mới tải app.
   *
   * Đường vòng cũ là nhờ nhân viên quầy nối hộ bằng mã sáu chữ số. Đã gỡ: token OTP chứng minh
   * đúng thứ cần chứng minh, còn mã sáu số chỉ chứng minh khách sở hữu TÀI KHOẢN.
   */
  async noiSo(accessToken: string, phoneIdToken: string): Promise<MyLoyalty> {
    return myLoyaltyTuJson(
      await this.goi(`${this.baseUrl}/api/loyalty/me/phone`, {
        method: 'POST',
        headers: { ...HEADER_JSON, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ phoneIdToken }),
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
    case 'PHONE_TOKEN_REQUIRED':
    case 'PHONE_TOKEN_INVALID':
      // Máy chủ không nhận được token OTP dùng được. Với khách, cách thoát là xin mã mới — không
      // phải gõ lại số, và chắc chắn không phải ra quầy.
      return new AuthException(
        'PHONE_TOKEN_INVALID',
        'Mã xác minh không dùng được. Xin mã mới rồi thử lại.',
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
