import { type GoiMang } from '../../mang/goiMang';
import { HttpCartApi } from '../cartApi';

const GIO_JSON = JSON.stringify({
  tableSessionId: 'ts_abc',
  items: [
    {
      menuItemId: 'm1',
      name: 'Phở bò tái',
      price: 60000,
      quantity: 2,
      lineTotal: 120000,
      isAvailable: true,
    },
  ],
  itemCount: 2,
  subtotal: 120000,
});

const loiJson = (code: string) =>
  JSON.stringify({ error: { code, message: 'in English', details: {} } });

function cartApi(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpCartApi('http://test', goi);
}

function daGui(ghiLai: jest.Mock) {
  const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return {
    url,
    method: init.method ?? 'GET',
    headers: (init.headers ?? {}) as Record<string, string>,
    body: init.body === undefined ? null : (JSON.parse(init.body as string) as unknown),
  };
}

describe('giỏ hàng gửi DELTA', () => {
  it('gửi đúng thân {menuItemId, delta} và token bàn', async () => {
    const ghiLai = jest.fn();
    await cartApi(200, GIO_JSON, ghiLai).doiSoLuong('ts_abc', 'tst', 'm1', 1);

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/table-sessions/ts_abc/cart/items');
    expect(g.body).toEqual({ menuItemId: 'm1', delta: 1 });
    expect(g.headers['X-Table-Session-Token']).toBe('tst');
  });

  it('KHÔNG tự gửi lại khi lỗi mạng — delta không idempotent', async () => {
    // Gửi +1 hai lần thì khách có hai phần, không phải một. Khi một lời gọi hỏng mà không rõ máy
    // chủ đã nhận hay chưa, việc đúng là đọc lại giỏ chứ không đoán rồi gửi thêm delta.
    let soLan = 0;
    const api = new HttpCartApi('http://test', async () => {
      soLan++;
      throw new Error('mất mạng');
    });

    await expect(api.doiSoLuong('ts', 'tst', 'm1', 1)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(soLan).toBe(1);
  });

  it('bớt món gửi delta âm', async () => {
    const ghiLai = jest.fn();
    await cartApi(200, GIO_JSON, ghiLai).doiSoLuong('ts_abc', 'tst', 'm1', -1);

    expect(daGui(ghiLai).body).toEqual({ menuItemId: 'm1', delta: -1 });
  });

  it('xoá hết dùng DELETE', async () => {
    const ghiLai = jest.fn();
    await cartApi(
      200,
      '{"tableSessionId":"ts_abc","items":[],"itemCount":0,"subtotal":0}',
      ghiLai,
    ).xoaHet('ts_abc', 'tst');

    expect(daGui(ghiLai).method).toBe('DELETE');
  });

  it('đọc giỏ dùng GET và vẫn gửi token bàn', async () => {
    const ghiLai = jest.fn();
    await cartApi(200, GIO_JSON, ghiLai).gio('ts_abc', 'tst');

    const g = daGui(ghiLai);
    expect(g.method).toBe('GET');
    expect(g.url).toBe('http://test/api/table-sessions/ts_abc/cart');
    expect(g.headers['X-Table-Session-Token']).toBe('tst');
  });

  it('sessionId được escape trước khi ghép vào đường dẫn', async () => {
    // Ca này KHÔNG có ở bản Flutter: `Uri.parse` của Dart nuốt chuỗi thô, còn ở đây sessionId đi
    // thẳng vào một template literal. Một id chứa `/` hay `?` sẽ đổi hẳn đường dẫn hoặc biến
    // phần sau thành query — và lỗi trả về sẽ nói về endpoint không tồn tại, không nói về id.
    const ghiLai = jest.fn();
    await cartApi(200, GIO_JSON, ghiLai).gio('ts/../../admin', 'tst');

    expect(daGui(ghiLai).url).toBe('http://test/api/table-sessions/ts%2F..%2F..%2Fadmin/cart');
  });
});

describe('dịch lỗi giỏ hàng', () => {
  it('đang chờ thanh toán: câu thông báo nói rõ VẪN BỚT ĐƯỢC món', async () => {
    // Backend cố ý chỉ chặn THÊM món, vẫn cho bớt — nếu không thì khách lỡ thêm nhầm sẽ kẹt phải
    // trả tiền cho nó. Câu chung chung "giỏ đã khoá" làm mất đúng thông tin đó.
    const loi = await cartApi(400, loiJson('TABLE_INVOICE_PAYMENT_PENDING'))
      .doiSoLuong('ts', 'tst', 'm1', 1)
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).toContain('bớt được');
  });

  it('món vừa hết cho câu riêng', async () => {
    await expect(
      cartApi(400, loiJson('MENU_ITEM_UNAVAILABLE')).doiSoLuong('ts', 'tst', 'm1', 1),
    ).rejects.toMatchObject({ code: 'MENU_ITEM_UNAVAILABLE' });
  });

  it('phiên bàn hết hạn thì bảo quét lại mã QR', async () => {
    const loi = await cartApi(401, loiJson('TABLE_SESSION_EXPIRED'))
      .gio('ts', 'tst')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).toContain('Quét lại mã QR');
    expect(loi?.message).not.toContain('in English');
  });

  it('502 HTML vẫn cho câu đọc được', async () => {
    await expect(cartApi(502, '<html>502</html>').gio('ts', 'tst')).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    });
  });
});
