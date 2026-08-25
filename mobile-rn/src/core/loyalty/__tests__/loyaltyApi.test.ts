import { type GoiMang } from '../../mang/goiMang';
import { type MyLoyalty, type Reward, doiDuoc } from '../loyalty';
import { HttpLoyaltyApi } from '../loyaltyApi';

const CHUA_LIEN_KET = JSON.stringify({
  linked: false,
  phoneNumber: null,
  points: 0,
  availableRewards: [],
});

const DA_LIEN_KET = JSON.stringify({
  linked: true,
  phoneNumber: '0901234567',
  points: 320,
  availableRewards: [
    { rewardId: 'rw_1', name: 'Trà đào miễn phí', description: 'Một ly', pointsRequired: 200 },
  ],
});

const loiJson = (code: string) =>
  JSON.stringify({ error: { code, message: 'in English', details: {} } });

function api(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpLoyaltyApi('http://test', goi);
}

function daGui(ghiLai: jest.Mock) {
  const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method ?? 'GET',
    headers: (init.headers ?? {}) as Record<string, string>,
    body:
      init.body === undefined ? null : (JSON.parse(init.body as string) as Record<string, unknown>),
  };
}

describe('điểm của CHÍNH tôi', () => {
  it('gửi Bearer và KHÔNG gửi số điện thoại ở bất cứ đâu', async () => {
    // /api/loyalty/lookup nhận số điện thoại nhưng chỉ dành cho nhân viên: ai gọi được cũng đếm
    // được số nào là khách và tiêu bao nhiêu. App không có đường tới đó, và đó là chủ ý.
    const ghiLai = jest.fn();
    await api(200, DA_LIEN_KET, ghiLai).cuaToi('jwt.abc');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/loyalty/me');
    expect(g.url).not.toContain('phone');
    expect(g.url).not.toContain('lookup');
    expect(g.headers.Authorization).toBe('Bearer jwt.abc');
  });

  it('tài khoản chưa liên kết KHÔNG phải lỗi', async () => {
    // `linked: false` là trạng thái bình thường của mọi tài khoản mới. Ném lỗi ở đây biến một
    // lời mời liên kết thành một thông báo hỏng.
    const d = await api(200, CHUA_LIEN_KET).cuaToi('jwt');

    expect(d.linked).toBe(false);
    expect(d.points).toBe(0);
    expect(d.availableRewards).toEqual([]);
  });

  it('đã liên kết thì đọc được điểm và ưu đãi', async () => {
    const d = await api(200, DA_LIEN_KET).cuaToi('jwt');

    expect(d.linked).toBe(true);
    expect(d.phoneNumber).toBe('0901234567');
    expect(d.points).toBe(320);
    expect(d.availableRewards[0]!.name).toBe('Trà đào miễn phí');
    expect(d.availableRewards[0]!.pointsRequired).toBe(200);
  });
});

describe('nối số điện thoại', () => {
  it('gửi POST đúng đường dẫn với số đã cắt khoảng trắng', async () => {
    const ghiLai = jest.fn();
    await api(200, DA_LIEN_KET, ghiLai).noiSo('jwt', '  0901234567 ');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/loyalty/me/phone');
    expect(g.method).toBe('POST');
    expect(g.body).toEqual({ phone: '0901234567' });
  });

  it('số đã là thành viên: nói RÕ VIỆC CẦN LÀM, không chỉ nói đã tồn tại', async () => {
    // "Số đã tồn tại" khiến khách nghĩ mình gõ nhầm và gõ lại mãi; sự thật là họ đã là thành
    // viên và phải nhờ quầy nối hộ.
    const loi = await api(409, loiJson('LOYALTY_PHONE_ALREADY_MEMBER'))
      .noiSo('jwt', '0901234567')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).toContain('nhân viên tại quầy');
  });

  it('số đang gắn tài khoản khác', async () => {
    await expect(
      api(409, loiJson('LOYALTY_PHONE_TAKEN')).noiSo('jwt', '090'),
    ).rejects.toMatchObject({ code: 'LOYALTY_PHONE_TAKEN' });
  });

  it('số không hợp lệ gộp chung hai mã của backend', async () => {
    for (const ma of ['LOYALTY_PHONE_INVALID', 'LOYALTY_PHONE_REQUIRED']) {
      await expect(api(400, loiJson(ma)).noiSo('jwt', 'x')).rejects.toMatchObject({
        code: 'LOYALTY_PHONE_INVALID',
      });
    }
  });
});

describe('đổi điểm (#34)', () => {
  const KET_QUA = JSON.stringify({
    redemptionId: 'rd_1',
    rewardName: 'Trà đào miễn phí',
    pointsSpent: 200,
    soDuMoi: { linked: true, phoneNumber: '0901234567', points: 120, availableRewards: [] },
  });

  it('LUÔN gửi Idempotency-Key — ở đây nó tiêu điểm THẬT của khách', async () => {
    // Bấm hai lần lúc mạng chập chờn mà không có khoá là mất điểm thật, không phải mất một dòng
    // dữ liệu.
    const ghiLai = jest.fn();
    await api(200, KET_QUA, ghiLai).doiDiem('jwt', 'rw_1', 'rdm.k1');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/loyalty/me/redeem');
    expect(g.headers['Idempotency-Key']).toBe('rdm.k1');
    expect(g.body).toEqual({ rewardId: 'rw_1' });
  });

  it('đọc SỐ DƯ MỚI từ phản hồi, không phải số dư cũ', async () => {
    // Backend trả kèm số dư sau khi đổi để app không phải gọi thêm một lượt. Gọi lượt hai tạo ra
    // khoảng thời gian màn hình còn hiện số dư CŨ — đúng lúc khách đang nhìn xem điểm đã trừ chưa.
    const kq = await api(200, KET_QUA).doiDiem('jwt', 'rw_1', 'k');

    expect(kq.pointsSpent).toBe(200);
    expect(kq.soDuMoi.points).toBe(120);
  });

  it('phản hồi thiếu soDuMoi cũng không nổ', async () => {
    const kq = await api(200, '{"redemptionId":"rd_1"}').doiDiem('jwt', 'rw_1', 'k');

    expect(kq.soDuMoi.points).toBe(0);
    expect(kq.soDuMoi.linked).toBe(false);
  });

  it('không đủ điểm: câu ngắn gọn, không đổ lỗi', async () => {
    // Backend cố ý KHÔNG phân biệt "không đủ điểm" với "thua tranh chấp" — với khách hai thứ nói
    // cùng một điều.
    await expect(
      api(409, loiJson('LOYALTY_NOT_ENOUGH_POINTS')).doiDiem('jwt', 'rw_1', 'k'),
    ).rejects.toMatchObject({ code: 'LOYALTY_NOT_ENOUGH_POINTS' });
  });

  it('chưa liên kết SĐT: chỉ ra VIỆC CẦN LÀM', async () => {
    const loi = await api(409, loiJson('LOYALTY_NOT_LINKED'))
      .doiDiem('jwt', 'rw_1', 'k')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).toContain('Liên kết số điện thoại');
  });

  it('ưu đãi đã ngừng có câu riêng, không nhập chung với "không đủ điểm"', async () => {
    const ngung = await api(409, loiJson('LOYALTY_REWARD_INACTIVE'))
      .doiDiem('jwt', 'rw_1', 'k')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    const thieu = await api(409, loiJson('LOYALTY_NOT_ENOUGH_POINTS'))
      .doiDiem('jwt', 'rw_1', 'k')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(ngung?.message).not.toBe(thieu?.message);
  });

  it('không rò câu tiếng Anh của máy chủ', async () => {
    const loi = await api(409, loiJson('LOYALTY_NOT_ENOUGH_POINTS'))
      .doiDiem('jwt', 'rw_1', 'k')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).not.toContain('in English');
  });
});

describe('lỗi chung', () => {
  it('403 nói phiên hết hạn, không nói "không có quyền"', async () => {
    // Khách không làm gì sai và không có gì để "xin quyền". Việc cần làm là đăng nhập lại.
    const loi = await api(403, '{}')
      .cuaToi('jwt')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).toContain('Đăng nhập lại');
    expect(loi?.message).not.toContain('quyền');
  });

  it('502 HTML của nginx vẫn cho câu đọc được', async () => {
    await expect(api(502, '<html>502</html>').cuaToi('jwt')).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    });
  });
});

describe('đổi được hay chưa', () => {
  const uuDai: Reward = {
    rewardId: 'rw_1',
    name: 'X',
    description: null,
    pointsRequired: 200,
    loai: 'FREE_ITEM',
    soTienGiam: null,
    hangToiThieu: 'BAC',
  };
  const bac = (them: Partial<MyLoyalty>): MyLoyalty => ({
    linked: true,
    phoneNumber: '090',
    points: 0,
    availableRewards: [],
    hang: 'BAC',
    tenHang: 'Bạc',
    chiTieu12Thang: 0,
    tenHangKeTiep: 'Vàng',
    conThieu: 5_000_000,
    phieuChuaDung: [],
    ...them,
  });

  it('đủ điểm VÀ đã liên kết thì đổi được', () => {
    expect(doiDuoc(bac({ points: 200 }), uuDai)).toBe(true);
  });

  it('chưa liên kết thì KHÔNG đổi được, dù thừa điểm', () => {
    // Bật nút rồi để backend trả LOYALTY_NOT_LINKED là bắt khách chạm vào một lời từ chối lẽ ra
    // thấy trước được.
    expect(doiDuoc(bac({ linked: false, phoneNumber: null, points: 9999 }), uuDai)).toBe(false);
  });

  it('thiếu đúng một điểm cũng không đổi được', () => {
    expect(doiDuoc(bac({ points: 199 }), uuDai)).toBe(false);
  });

  it('đủ điểm nhưng CHƯA đủ hạng thì không đổi được', () => {
    // Backend lọc ưu đãi trên hạng khỏi danh sách, nhưng danh sách có thể cũ hơn hạng vừa tụt sau
    // kỳ xét hạng hằng tháng. Nút phải khoá theo dữ liệu đang cầm, không theo giả định.
    const chiVang: Reward = { ...uuDai, hangToiThieu: 'VANG' };
    expect(doiDuoc(bac({ points: 9999 }), chiVang)).toBe(false);
    expect(doiDuoc(bac({ points: 9999, hang: 'VANG' }), chiVang)).toBe(true);
  });
});
