import { type GoiMang } from '../../mang/goiMang';
import { moTaPhienBan } from '../tableSession';
import { HttpTableSessionApi } from '../tableSessionApi';

const PHIEN_JSON = JSON.stringify({
  sessionId: 'ts_abc',
  orderType: 'DineIn',
  status: 'Open',
  tableCode: 'T01',
  tableDisplayName: 'Ban 01',
  openedAt: '2026-08-20T12:00:00Z',
  expiresAt: '2026-08-20T16:00:00.123Z',
  closedAt: null,
  isExpired: false,
  tableSessionToken: 'tst_bi_mat',
  resumeState: 'FreshStart',
});

const loiJson = (code: string) =>
  JSON.stringify({ error: { code, message: 'in English', details: {} } });

function apiTraVe(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpTableSessionApi('http://test', goi);
}

function daGui(ghiLai: jest.Mock) {
  const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return {
    url,
    headers: (init.headers ?? {}) as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

describe('gắn tài khoản vào phiên bàn (§9.4)', () => {
  it('CÓ gửi Authorization khi khách đã đăng nhập', async () => {
    // Đây là toàn bộ cơ chế gắn `MemberId`. Quên header này thì app chạy đúng như web và mất sạch
    // lớp tính năng độc quyền — mà không có gì đỏ, vì phiên vẫn mở thành công.
    const ghiLai = jest.fn();
    await apiTraVe(200, PHIEN_JSON, ghiLai).moPhien('cmc-table-t01-qr', {
      tableCode: 'T01',
      accessToken: 'jwt.cua.khach',
    });

    expect(daGui(ghiLai).headers.Authorization).toBe('Bearer jwt.cua.khach');
  });

  it('KHÔNG gửi Authorization khi là khách vãng lai', async () => {
    // App phải dùng được khi chưa đăng nhập, đúng như web. Gửi header rỗng hoặc "Bearer null" sẽ
    // khiến backend từ chối và biến app thành bắt buộc đăng nhập.
    const ghiLai = jest.fn();
    await apiTraVe(200, PHIEN_JSON, ghiLai).moPhien('cmc-table-t01-qr');

    expect(daGui(ghiLai).headers).not.toHaveProperty('Authorization');
  });

  it('accessToken là chuỗi rỗng cũng KHÔNG gửi header', async () => {
    // Ca này KHÔNG có ở bản Flutter: Dart kiểm `!= null` nên chuỗi rỗng sẽ lọt và tạo ra
    // "Bearer " — một header hợp lệ về cú pháp mà backend từ chối. Ở JavaScript chuỗi rỗng còn
    // dễ lọt hơn vì nó falsy nhưng không phải null.
    const ghiLai = jest.fn();
    await apiTraVe(200, PHIEN_JSON, ghiLai).moPhien('tok', { accessToken: '' });

    expect(daGui(ghiLai).headers).not.toHaveProperty('Authorization');
  });

  it('gửi đúng đường dẫn và thân JSON', async () => {
    const ghiLai = jest.fn();
    await apiTraVe(200, PHIEN_JSON, ghiLai).moPhien('cmc-table-t01-qr', { tableCode: 'T01' });

    expect(daGui(ghiLai).url).toBe('http://test/api/table-sessions');
    expect(daGui(ghiLai).body).toEqual({ qrToken: 'cmc-table-t01-qr', tableCode: 'T01' });
  });

  it('bỏ hẳn tableCode khi không có, không gửi chuỗi rỗng', async () => {
    // Backend coi tableCode rỗng khác với thiếu: chuỗi rỗng đi vào nhánh kiểm định dạng và trả
    // TABLE_CODE_INVALID.
    const ghiLai = jest.fn();
    await apiTraVe(200, PHIEN_JSON, ghiLai).moPhien('cmc-table-t01-qr');

    expect(daGui(ghiLai).body).toEqual({ qrToken: 'cmc-table-t01-qr' });
  });
});

describe('phân giải phản hồi', () => {
  it('giữ hạn ở UTC và điền lại qrToken mà backend không trả về', async () => {
    const phien = await apiTraVe(200, PHIEN_JSON).moPhien('cmc-table-t01-qr');

    expect(phien.sessionId).toBe('ts_abc');
    expect(phien.tableCode).toBe('T01');
    expect(phien.resumeState).toBe('FreshStart');
    expect(phien.expiresAt).toBe('2026-08-20T16:00:00.123Z');
    // Không có trong phản hồi. Thiếu nó thì POST /api/orders trả 400 DINE_IN_TABLE_REQUIRED —
    // lỗi chỉ lộ ra khi gọi API thật, không lộ ra ở màn hình vào bàn.
    expect(phien.qrToken).toBe('cmc-table-t01-qr');
  });

  it('mô tả phiên KHÔNG chứa tableSessionToken', async () => {
    // Token phiên bàn là chìa khoá năng lực: cầm nó là xem được đơn và hoá đơn của bàn.
    const phien = await apiTraVe(200, PHIEN_JSON).moPhien('cmc-table-t01-qr');

    expect(moTaPhienBan(phien)).not.toContain('tst_bi_mat');
    expect(moTaPhienBan(phien)).toContain('T01');
  });
});

describe('dịch lỗi theo mã', () => {
  it('QR sai cho câu tiếng Việt', async () => {
    const loi = await apiTraVe(404, loiJson('QR_NOT_FOUND'))
      .moPhien('sai')
      .then(
        () => null,
        (e: unknown) => e as Error & { code: string },
      );

    expect(loi?.code).toBe('QR_NOT_FOUND');
    expect(loi?.message).not.toContain('in English');
  });

  it('QR không thuộc bàn vừa chọn', async () => {
    await expect(
      apiTraVe(400, loiJson('QR_TABLE_MISMATCH')).moPhien('x', { tableCode: 'T99' }),
    ).rejects.toMatchObject({ code: 'QR_TABLE_MISMATCH' });
  });

  it('502 HTML của nginx vẫn cho câu đọc được', async () => {
    await expect(apiTraVe(502, '<html>502</html>').moPhien('x')).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    });
  });
});
