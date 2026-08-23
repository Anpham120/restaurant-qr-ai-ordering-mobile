import { AuthException } from '../auth/authApi';
import { HEADER_JSON, type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type TableSession, tableSessionTuJson } from './tableSession';

export interface MoPhienTuyChon {
  readonly tableCode?: string | null;
  /** JWT của khách nếu đã đăng nhập; bỏ trống nếu là khách vãng lai. */
  readonly accessToken?: string | null;
}

export interface TableSessionApi {
  moPhien(qrToken: string, tuyChon?: MoPhienTuyChon): Promise<TableSession>;
}

export class HttpTableSessionApi implements TableSessionApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async moPhien(qrToken: string, tuyChon: MoPhienTuyChon = {}): Promise<TableSession> {
    const { tableCode, accessToken } = tuyChon;
    const headers: Record<string, string> = { ...HEADER_JSON };
    // GỬI TOKEN KHI CÓ. Đây là toàn bộ cơ chế gắn phiên vào tài khoản (§9.4): endpoint này ẩn
    // danh, backend chỉ đọc `Authorization` NẾU có và gắn `MemberId` khi vai là Customer. Không
    // gửi thì app chạy đúng như web — và mất sạch lớp tính năng độc quyền của app.
    if (accessToken != null && accessToken.length > 0) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const than: Record<string, string> = { qrToken };
    if (tableCode != null && tableCode.length > 0) than.tableCode = tableCode;

    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/table-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(than),
      });
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    const thanTraVe = await res.text();
    if (res.status === 200) {
      // Backend KHÔNG trả lại qrToken. Nhét chính cái vừa gửi vào đây để phiên cất xuống máy có
      // đủ thứ cần cho việc đặt món sau này — xem ghi chú ở `TableSession.qrToken`.
      return tableSessionTuJson({ ...(JSON.parse(thanTraVe) as object), qrToken });
    }
    throw dichLoi(res.status, thanTraVe);
  }
}

/** Dịch theo MÃ, không hiển thị câu tiếng Anh của máy chủ — cùng lý do đã ghi ở `authApi`. */
function dichLoi(status: number, than: string): AuthException {
  const code = maLoi(than);
  switch (code) {
    case 'QR_NOT_FOUND':
      return new AuthException('QR_NOT_FOUND', 'Mã QR không đúng hoặc bàn đã ngừng phục vụ.');
    case 'QR_TOKEN_INVALID':
      return new AuthException('QR_TOKEN_INVALID', 'Chưa có mã QR của bàn.');
    case 'QR_TABLE_MISMATCH':
      return new AuthException(
        'QR_TABLE_MISMATCH',
        'Mã QR này không thuộc bàn vừa chọn. Quét lại đúng bàn.',
      );
    case 'TABLE_CODE_INVALID':
      return new AuthException('TABLE_CODE_INVALID', 'Mã bàn phải có dạng T01.');
  }

  const chung = loiChungHttp(status, code, 'Không mở được phiên bàn');
  return new AuthException(chung.code, chung.message);
}
