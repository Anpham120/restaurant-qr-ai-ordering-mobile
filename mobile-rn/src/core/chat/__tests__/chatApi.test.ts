import { type GoiMang } from '../../mang/goiMang';
import { HttpChatApi } from '../chatApi';

const PHIEN = JSON.stringify({
  chatSessionId: 'cs_1',
  accessToken: 'ctok',
  reused: false,
  messages: [],
});

const LUOT = JSON.stringify({
  userMessage: { id: 'u1', role: 'user', content: 'Món nào ít cay?' },
  message: { id: 'a1', role: 'assistant', content: 'Gỏi cuốn tôm thịt nhé.' },
});

const loiJson = (code: string) =>
  JSON.stringify({ error: { code, message: 'in English', details: {} } });

function api(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpChatApi('http://test', goi);
}

function daGui(ghiLai: jest.Mock) {
  const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
    coSignal: init.signal !== undefined && init.signal !== null,
  };
}

describe('mở phiên chat', () => {
  it('gửi tableSessionId và tableCode', async () => {
    const ghiLai = jest.fn();
    await api(200, PHIEN, ghiLai).moPhien('ts_abc', 'T01');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/chat/sessions');
    expect(g.body).toEqual({ tableSessionId: 'ts_abc', tableCode: 'T01' });
  });

  it('đọc được cờ reused', async () => {
    const p = await api(200, JSON.stringify({ chatSessionId: 'cs_1', reused: true })).moPhien(
      'ts',
      'T01',
    );
    expect(p.reused).toBe(true);
  });
});

describe('gửi câu hỏi', () => {
  it('khai charset=utf-8 và gửi token phiên chat', async () => {
    // Thiếu charset thì một câu hỏi tiếng Việt có dấu bị đọc sai byte và backend trả 400
    // "Invalid UTF-8 middle byte" — đã gặp thật khi đo bằng curl.
    const ghiLai = jest.fn();
    await api(200, LUOT, ghiLai).gui('cs_1', 'ctok', 'Món nào ít cay?');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/chat/sessions/cs_1/messages');
    expect(g.headers['Content-Type']).toContain('charset=utf-8');
    expect(g.headers['X-Chat-Session-Token']).toBe('ctok');
  });

  it('cắt khoảng trắng quanh câu hỏi', async () => {
    const ghiLai = jest.fn();
    await api(200, LUOT, ghiLai).gui('cs_1', 'ctok', '  Món nào ít cay?  ');

    expect(daGui(ghiLai).body).toEqual({ content: 'Món nào ít cay?' });
  });

  it('LUÔN kèm tín hiệu huỷ để không treo vô hạn', async () => {
    // `fetch` của React Native không có tuỳ chọn hết giờ, khác `package:http` của Dart. Thiếu
    // AbortController thì dịch vụ AI chết sẽ treo màn hình cho tới khi TCP bỏ cuộc.
    const ghiLai = jest.fn();
    await api(200, LUOT, ghiLai).gui('cs_1', 'ctok', 'x');

    expect(daGui(ghiLai).coSignal).toBe(true);
  });
});

describe('dịch lỗi trợ lý', () => {
  const hoi = (status: number, body: string) => api(status, body).gui('cs', 'ctok', 'x');

  it('hỏi nhanh quá: nói "chờ một chút", KHÔNG gọi là lỗi', async () => {
    // Khách không làm gì sai, chỉ hỏi nhanh quá.
    const loi = await hoi(429, loiJson('CHAT_RATE_LIMITED')).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi?.message).toContain('Chờ một chút');
    expect(loi?.message).not.toContain('lỗi');
  });

  it('trợ lý chết thì CHỈ RA LỐI ĐI TIẾP, không chỉ báo hỏng', async () => {
    // Trợ lý chết KHÔNG phải app chết: khách vẫn xem thực đơn và gọi nhân viên được.
    const loi = await hoi(503, loiJson('AI_PROVIDER_UNAVAILABLE')).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi?.message).toContain('thực đơn');
    expect(loi?.message).toContain('nhân viên');
  });

  it('câu quá dài có câu riêng, khác hẳn câu rỗng', async () => {
    const dai = await hoi(400, loiJson('CHAT_MESSAGE_TOO_LONG')).then(
      () => null,
      (e: unknown) => e as Error,
    );
    const rong = await hoi(400, loiJson('CHAT_MESSAGE_EMPTY')).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(dai?.message).not.toBe(rong?.message);
  });

  it('token sai và không tìm thấy phiên gộp thành một câu', async () => {
    // Backend cố ý không phân biệt, để không lộ phiên nào tồn tại.
    for (const ma of ['CHAT_SESSION_TOKEN_INVALID', 'CHAT_SESSION_NOT_FOUND']) {
      await expect(hoi(404, loiJson(ma))).rejects.toMatchObject({ code: 'CHAT_SESSION_NOT_FOUND' });
    }
  });

  it('502 HTML vẫn cho câu đọc được', async () => {
    await expect(hoi(502, '<html>502</html>')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('mất mạng nói về TRỢ LÝ, không nói chung chung về máy chủ', async () => {
    const a = new HttpChatApi('http://test', async () => {
      throw new Error('mạng chết');
    });
    const loi = await a.gui('cs', 'ctok', 'x').then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi?.message).toContain('trợ lý');
  });
});
