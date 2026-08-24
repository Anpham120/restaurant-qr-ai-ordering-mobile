import { type GoiMang } from '../../mang/goiMang';
import { HttpOrderApi } from '../orderApi';

const DON_JSON = JSON.stringify({
  orders: [
    {
      orderId: 'ord_1',
      orderCode: 'DH1',
      status: 'Preparing',
      totalAmount: 120000,
      createdAt: '2026-08-20T12:00:00Z',
      items: [
        {
          orderItemId: 'oi_1',
          menuItemId: 'm1',
          name: 'Phở bò tái',
          quantity: 2,
          unitPrice: 60000,
          lineTotal: 120000,
          status: 'Pending',
          estimatedReadyMinutesLow: 15,
          estimatedReadyMinutesHigh: 25,
          kitchenBusy: false,
        },
      ],
    },
  ],
});

const loiJson = (code: string) =>
  JSON.stringify({ error: { code, message: 'in English', details: {} } });

function api(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpOrderApi('http://test', goi);
}

function daGui(ghiLai: jest.Mock) {
  const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string> };
}

describe('xem đơn của phiên bàn', () => {
  it('uỷ quyền bằng X-Table-Session-Token, KHÔNG bằng JWT', async () => {
    // Đơn thuộc về cái BÀN, không thuộc về tài khoản. Ai đang ngồi ở bàn đều xem được, kể cả
    // khách vãng lai đi cùng. Gửi kèm Authorization không làm gì, nhưng tạo ấn tượng sai rằng
    // đăng nhập là điều kiện để xem đơn.
    const ghiLai = jest.fn();
    await api(200, DON_JSON, ghiLai).donCuaPhien('ts_abc', 'tst');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/table-sessions/ts_abc/orders');
    expect(g.headers['X-Table-Session-Token']).toBe('tst');
    expect(g.headers).not.toHaveProperty('Authorization');
  });

  it('phân giải đơn và món, giữ cả ước lượng', async () => {
    const ds = await api(200, DON_JSON).donCuaPhien('ts', 'tst');

    expect(ds).toHaveLength(1);
    expect(ds[0]!.orderCode).toBe('DH1');
    const m = ds[0]!.items[0]!;
    expect(m.name).toBe('Phở bò tái');
    expect(m.menuItemId).toBe('m1');
    expect(m.estimatedReadyMinutesLow).toBe(15);
    expect(m.kitchenBusy).toBe(false);
  });

  it('ước lượng THIẾU thành null, không thành 0', async () => {
    // 0 phút nghĩa là "món sắp ra tới nơi" — trái hẳn với "chưa biết". Nếu đọc thiếu thành 0 thì
    // app hứa một điều backend cố ý không hứa.
    const than = JSON.stringify({
      orders: [
        {
          orderId: 'o',
          orderCode: 'DH2',
          status: 'Placed',
          totalAmount: 0,
          createdAt: '2026-08-20T12:00:00Z',
          items: [{ orderItemId: 'oi', menuItemId: 'm', name: 'X', quantity: 1 }],
        },
      ],
    });

    const m = (await api(200, than).donCuaPhien('ts', 'tst'))[0]!.items[0]!;
    expect(m.estimatedReadyMinutesLow).toBeNull();
    expect(m.estimatedReadyMinutesHigh).toBeNull();
    expect(m.kitchenBusy).toBe(false);
    expect(m.status).toBe('Pending');
  });

  it('phiên chưa có đơn nào là hợp lệ, không phải lỗi', async () => {
    expect(await api(200, '{"orders":[]}').donCuaPhien('ts', 'tst')).toEqual([]);
  });

  it('phiên HẾT HẠN có câu riêng, khác hẳn token sai', async () => {
    // 410 GONE. Khách không làm gì sai, chỉ là bàn đã đóng.
    const het = await api(410, loiJson('TABLE_SESSION_EXPIRED'))
      .donCuaPhien('ts', 'tst')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    const sai = await api(401, loiJson('TABLE_SESSION_TOKEN_INVALID'))
      .donCuaPhien('ts', 'tst')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(het?.message).not.toBe(sai?.message);
    expect(het?.message).toContain('đã kết thúc');
  });
});

describe('huỷ món', () => {
  it('gửi X-Order-Token, KHÔNG gửi token bàn', async () => {
    // Người đặt mới là người quyết định huỷ.
    const ghiLai = jest.fn();
    await api(200, '{}', ghiLai).huyMon('DH1', 'oi_1', 'otok');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/orders/DH1/items/oi_1/cancel');
    expect(g.method).toBe('POST');
    expect(g.headers['X-Order-Token']).toBe('otok');
    expect(g.headers).not.toHaveProperty('X-Table-Session-Token');
  });

  it('bếp đã nấu: nói ĐÚNG LÝ DO và chỉ ra lối đi tiếp', async () => {
    // Khách cần biết đây là giới hạn có thật chứ không phải app hỏng, và rằng nhân viên vẫn xử
    // lý được.
    const loi = await api(409, loiJson('ORDER_ITEM_CANCEL_NOT_ALLOWED'))
      .huyMon('DH1', 'oi_1', 'otok')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).toContain('Bếp đã bắt đầu nấu');
    expect(loi?.message).toContain('Báo nhân viên');
  });

  it('404 phủ được CẢ HAI nghĩa: không có đơn, hoặc sai token', async () => {
    // Backend cố ý trả ORDER_NOT_FOUND cho cả trường hợp sai token, để không lộ đơn nào tồn tại
    // (mã đơn tăng dần).
    const loi = await api(404, loiJson('ORDER_NOT_FOUND'))
      .huyMon('DH1', 'oi_1', 'sai')
      .then(
        () => null,
        (e: unknown) => e as Error,
      );

    expect(loi?.message).toContain('Không tìm thấy đơn này');
    expect(loi?.message).toContain('không có quyền');
  });

  it('mất mạng cho NETWORK_ERROR', async () => {
    const a = new HttpOrderApi('http://test', async () => {
      throw new Error('mạng chết');
    });
    await expect(a.huyMon('DH1', 'oi', 'tok')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
