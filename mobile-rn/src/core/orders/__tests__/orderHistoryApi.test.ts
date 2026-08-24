import { type GoiMang } from '../../mang/goiMang';
import { type OrderItem } from '../order';
import { HttpOrderHistoryApi, datLaiDon, thatBaiHoanToan, tronVen } from '../orderHistoryApi';

const LICH_SU = JSON.stringify({
  orders: [
    {
      orderId: 'o1',
      orderCode: 'DH1',
      status: 'Completed',
      totalAmount: 120000,
      createdAt: '2026-08-01T12:00:00Z',
      items: [],
    },
    {
      orderId: 'o2',
      orderCode: 'DH2',
      status: 'Completed',
      totalAmount: 90000,
      createdAt: '2026-08-15T12:00:00Z',
      items: [],
    },
  ],
});

function api(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpOrderHistoryApi('http://test', goi);
}

function mon(tuyChon: Partial<OrderItem> = {}): OrderItem {
  return {
    orderItemId: 'oi',
    menuItemId: 'm1',
    name: 'Phở bò',
    quantity: 2,
    unitPrice: 60000,
    lineTotal: 120000,
    status: 'Served',
    estimatedReadyMinutesLow: null,
    estimatedReadyMinutesHigh: null,
    kitchenBusy: false,
    ...tuyChon,
  };
}

describe('lịch sử đơn của tài khoản', () => {
  it('uỷ quyền bằng JWT, KHÔNG bằng token bàn', async () => {
    // Đây là dữ liệu của TÀI KHOẢN, không phải của một cái bàn.
    const ghiLai = jest.fn();
    await api(200, LICH_SU, ghiLai).lichSuCuaToi('jwt.abc');

    const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt.abc');
    expect(headers).not.toHaveProperty('X-Table-Session-Token');
    // KHÔNG có tham số định danh nào — memberId do backend lấy từ JWT.
    expect(url).toBe('http://test/api/orders/mine');
  });

  it('đọc được đơn từ NHIỀU LẦN GHÉ — đó là cả điểm của tính năng', async () => {
    const ds = await api(200, LICH_SU).lichSuCuaToi('jwt');

    expect(ds).toHaveLength(2);
    expect(ds.map((d) => d.orderCode)).toEqual(['DH1', 'DH2']);
  });

  it('chưa có lịch sử là hợp lệ, không phải lỗi', async () => {
    expect(await api(200, '{"orders":[]}').lichSuCuaToi('jwt')).toEqual([]);
  });

  it('401/403 nói phiên hết hạn, không nói "không có quyền"', async () => {
    for (const ma of [401, 403]) {
      const loi = await api(ma, '{}')
        .lichSuCuaToi('jwt')
        .then(
          () => null,
          (e: unknown) => e as Error,
        );
      expect(loi?.message).toContain('Đăng nhập lại');
      expect(loi?.message).not.toContain('quyền');
    }
  });
});

describe('đặt lại đơn cũ', () => {
  it('món hỏng KHÔNG chặn những món còn lại', async () => {
    // Thực đơn đổi giữa hai lần ghé là chuyện bình thường. Dừng ở món đầu tiên hỏng nghĩa là
    // khách mất luôn những món vẫn còn — trong khi họ chỉ muốn gọi lại bữa cũ.
    const them = jest.fn(async (id: string) => {
      if (id === 'm2') throw new Error('ngừng bán');
    });

    const kq = await datLaiDon(
      [
        mon({ menuItemId: 'm1', name: 'Phở bò' }),
        mon({ menuItemId: 'm2', name: 'Chè cũ' }),
        mon({ menuItemId: 'm3', name: 'Gỏi cuốn' }),
      ],
      them,
      () => 'Món đã ngừng bán',
    );

    expect(kq.daThem).toEqual(['Phở bò', 'Gỏi cuốn']);
    expect(kq.khongThem).toEqual({ 'Chè cũ': 'Món đã ngừng bán' });
  });

  it('báo CẢ HAI danh sách — không im lặng bỏ món', async () => {
    // Báo "đã thêm vào giỏ" rồi im lặng bỏ ba món là nói dối với khách; họ sẽ chỉ phát hiện lúc
    // nhìn hoá đơn.
    const kq = await datLaiDon(
      [mon({ menuItemId: 'm1', name: 'A' })],
      async () => {
        throw new Error('hết');
      },
      () => 'Hôm nay hết',
    );

    expect(tronVen(kq)).toBe(false);
    expect(thatBaiHoanToan(kq)).toBe(true);
  });

  it('BỎ QUA món đã huỷ ở đơn cũ', async () => {
    // Khách đã chủ động bỏ nó.
    const them = jest.fn();

    const kq = await datLaiDon(
      [
        mon({ menuItemId: 'm1', name: 'A' }),
        mon({ menuItemId: 'm2', name: 'B', status: 'Cancelled' }),
      ],
      them,
      () => 'x',
    );

    expect(them).toHaveBeenCalledTimes(1);
    expect(kq.daThem).toEqual(['A']);
  });

  it('giữ nguyên SỐ LƯỢNG của đơn cũ', async () => {
    const them = jest.fn();

    await datLaiDon([mon({ quantity: 3 })], them, () => 'x');

    expect(them).toHaveBeenCalledWith('m1', 3);
  });

  it('thêm TUẦN TỰ, không song song', async () => {
    // Giỏ hàng dùng DELTA và các lời gọi cùng sửa một giỏ. Gửi song song là tự tạo tranh chấp
    // trên đúng thứ không idempotent.
    let dangChay = 0;
    let toiDaCungLuc = 0;
    const them = async () => {
      dangChay++;
      toiDaCungLuc = Math.max(toiDaCungLuc, dangChay);
      await new Promise((r) => setTimeout(r, 5));
      dangChay--;
    };

    await datLaiDon(
      [mon({ menuItemId: 'm1' }), mon({ menuItemId: 'm2' }), mon({ menuItemId: 'm3' })],
      them,
      () => 'x',
    );

    expect(toiDaCungLuc).toBe(1);
  });

  it('đơn toàn món đã huỷ thì không gọi gì và coi như trọn vẹn', async () => {
    const them = jest.fn();

    const kq = await datLaiDon([mon({ status: 'Cancelled' })], them, () => 'x');

    expect(them).not.toHaveBeenCalled();
    expect(tronVen(kq)).toBe(true);
    expect(kq.daThem).toEqual([]);
  });
});
