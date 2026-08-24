import { type Cart } from '../../cart/cart';
import { type GoiMang } from '../../mang/goiMang';
import { type TableSession } from '../../tables/tableSession';
import { HttpCreateOrderApi } from '../createOrderApi';

const DON_JSON = JSON.stringify({
  orderId: 'ord_1',
  orderCode: 'DH1',
  status: 'Placed',
  totalAmount: 120000,
  customerAccessToken: 'tok',
});

const loiJson = (code: string) =>
  JSON.stringify({ error: { code, message: 'in English', details: {} } });

function phienMau(): TableSession {
  return {
    sessionId: 'ts_abc',
    tableCode: 'T01',
    tableDisplayName: 'Ban 01',
    status: 'Open',
    expiresAt: '2030-01-01T00:00:00.000Z',
    isExpired: false,
    tableSessionToken: 'tst',
    resumeState: 'FreshStart',
    qrToken: 'cmc-table-t01-qr',
  };
}

function gioMau(): Cart {
  return {
    tableSessionId: 'ts_abc',
    items: [
      {
        menuItemId: 'm1',
        name: 'Phở bò',
        price: 60000,
        quantity: 2,
        lineTotal: 120000,
        isAvailable: true,
        imageUrl: null,
        note: null,
      },
    ],
    itemCount: 2,
    subtotal: 120000,
  };
}

function donApi(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpCreateOrderApi('http://test', goi);
}

function daGui(ghiLai: jest.Mock) {
  const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

describe('tạo đơn', () => {
  it('LUÔN gửi Idempotency-Key — backend bắt buộc', async () => {
    const ghiLai = jest.fn();
    await donApi(201, DON_JSON, ghiLai).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'ord.abc123',
    });

    expect(daGui(ghiLai).headers['Idempotency-Key']).toBe('ord.abc123');
    expect(daGui(ghiLai).headers['X-Table-Session-Token']).toBe('tst');
  });

  it('gửi items dạng {menuItemId, quantity} — KHÔNG phải delta', async () => {
    // Giỏ dùng delta, đơn dùng số lượng tuyệt đối. Nhầm hai chỗ này là đặt sai số phần.
    const ghiLai = jest.fn();
    await donApi(201, DON_JSON, ghiLai).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'k',
    });

    const b = daGui(ghiLai).body;
    expect(b.items).toEqual([{ menuItemId: 'm1', quantity: 2 }]);
    expect(b.tableSessionId).toBe('ts_abc');
    expect(b.orderType).toBe('DineIn');
  });

  it('gửi CẢ tableCode LẪN qrToken — đơn tại bàn đòi cả hai', async () => {
    // Đo trên backend đang chạy: thiếu tableCode → 400 DINE_IN_TABLE_REQUIRED, thiếu qrToken →
    // 400 QR_TOKEN_INVALID. Chỉ gửi tableSessionId là không đủ, dù nó đã xác định đúng một bàn.
    const ghiLai = jest.fn();
    await donApi(201, DON_JSON, ghiLai).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'k',
    });

    const b = daGui(ghiLai).body;
    expect(b.tableCode).toBe('T01');
    expect(b.qrToken).toBe('cmc-table-t01-qr');
  });

  it('TỰ ĐIỀN số điện thoại khi có — §9.7 gọi đây là tính năng lõi', async () => {
    const ghiLai = jest.fn();
    await donApi(201, DON_JSON, ghiLai).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'k',
      soDienThoai: '0901234567',
    });

    expect(daGui(ghiLai).body.customerPhoneNumber).toBe('0901234567');
  });

  it('KHÔNG gửi khoá số điện thoại khi chưa liên kết', async () => {
    // Gửi chuỗi rỗng khác hẳn không gửi: backend sẽ coi đó là một số và tạo hồ sơ tích điểm rác.
    const ghiLai = jest.fn();
    await donApi(201, DON_JSON, ghiLai).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'k',
    });

    expect(daGui(ghiLai).body).not.toHaveProperty('customerPhoneNumber');
  });

  it('số điện thoại rỗng cũng KHÔNG gửi khoá', async () => {
    const ghiLai = jest.fn();
    await donApi(201, DON_JSON, ghiLai).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'k',
      soDienThoai: '',
    });

    expect(daGui(ghiLai).body).not.toHaveProperty('customerPhoneNumber');
  });

  it('nhận cả 201 lẫn 200 cho lần gửi lại theo khoá cũ', async () => {
    // Gửi lại sau lỗi mạng: backend nhận ra khoá cũ và trả lại đơn đã tạo thay vì tạo đơn thứ
    // hai. ĐO THẬT: nó trả 201, không phải 200 như đoán lúc đầu — cùng mã đơn cả hai lần
    // (ORD-1016), và bảng orders chỉ có một dòng.
    const don = await donApi(200, DON_JSON).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'k',
    });

    expect(don.orderCode).toBe('DH1');
    expect(don.customerAccessToken).toBe('tok');
  });
});

describe('dịch lỗi khi đặt đơn', () => {
  const dat = (status: number, body: string) =>
    donApi(status, body).taoDon({
      phienBan: phienMau(),
      gio: gioMau(),
      khoaIdempotency: 'k',
    });

  it('409 khoá dùng lại: câu thông báo KHÔNG đổ lỗi cho khách', async () => {
    // Xảy ra khi giỏ đổi mà khoá không đổi — lỗi của app, không phải của khách.
    const loi = await dat(409, loiJson('IDEMPOTENCY_KEY_REUSED')).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi?.message).toContain('đặt lại');
    expect(loi?.message).not.toContain('in English');
  });

  it('món vừa hết lúc đặt cho câu bảo xem lại giỏ', async () => {
    const loi = await dat(400, loiJson('MENU_ITEM_UNAVAILABLE')).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi?.message).toContain('Xem lại giỏ');
  });

  it('phiên bàn hết hạn bảo quét lại mã QR', async () => {
    await expect(dat(401, loiJson('TABLE_SESSION_EXPIRED'))).rejects.toMatchObject({
      code: 'TABLE_SESSION_EXPIRED',
    });
  });

  it('502 HTML vẫn cho câu đọc được', async () => {
    await expect(dat(502, '<html>502</html>')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('mất mạng cho NETWORK_ERROR, và KHÔNG tự gửi lại', async () => {
    // Gửi lại là việc của người dùng bấm, và lúc đó KhoaDatDon giữ nguyên khoá nên an toàn. Tự
    // gửi lại ở đây sẽ che mất chuyện mạng hỏng.
    let soLan = 0;
    const api = new HttpCreateOrderApi('http://test', async () => {
      soLan++;
      throw new Error('mất mạng');
    });

    await expect(
      api.taoDon({ phienBan: phienMau(), gio: gioMau(), khoaIdempotency: 'k' }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(soLan).toBe(1);
  });
});
