import { AuthException } from '../../auth/authApi';
import { type GoiMang } from '../../mang/goiMang';
import { HttpMenuApi } from '../menuApi';

function apiTraVe(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpMenuApi('http://test', goi);
}

describe('HttpMenuApi', () => {
  it('KHÔNG gửi Authorization lẫn token phiên bàn', async () => {
    // Thực đơn xem được mà không cần đang ở bàn — đó là khác biệt thật giữa app và web QR.
    const ghiLai = jest.fn();
    await apiTraVe(200, '{"categories":[],"items":[]}', ghiLai).thucDon();

    const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('http://test/api/menu');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers).not.toHaveProperty('Authorization');
    expect(headers).not.toHaveProperty('X-Table-Session-Token');
  });

  it('phân giải đúng hình dạng PHẲNG mà backend trả về', async () => {
    // categories và items là hai danh sách tách rời, không lồng nhau.
    const data = await apiTraVe(
      200,
      JSON.stringify({
        categories: [{ categoryId: 'cat_appetizer', name: 'Khai vị' }],
        items: [
          {
            id: 'm_004',
            name: 'Bánh cuốn Thanh Trì',
            description: 'Bánh cuốn mỏng mịn',
            price: 55000,
            categoryId: 'cat_appetizer',
            categoryName: 'Khai vị',
            imageUrl: '/menu-images/04-banh-cuon-thanh-tri.webp',
            isAvailable: true,
            tags: ['region:hanoi', 'spice:none'],
          },
        ],
      }),
    ).thucDon();

    expect(data.categories[0]!.name).toBe('Khai vị');
    expect(data.items[0]!.name).toBe('Bánh cuốn Thanh Trì');
    expect(data.items[0]!.tags).toContain('region:hanoi');
  });

  it('đọc đúng tiếng Việt có dấu', async () => {
    const data = await apiTraVe(
      200,
      JSON.stringify({
        categories: [],
        items: [{ id: 'm1', name: 'Phở bò tái', price: 60000, isAvailable: true }],
      }),
    ).thucDon();

    expect(data.items[0]!.name).toBe('Phở bò tái');
  });

  it('thiếu trường không bắt buộc thì có mặc định, không phải undefined', async () => {
    // Màn hình đọc thẳng các trường này. `undefined` lọt vào chỗ mong đợi mảng sẽ làm hỏng lượt
    // dựng giao diện với một lỗi không nhắc gì tới thực đơn.
    const data = await apiTraVe(
      200,
      JSON.stringify({ items: [{ id: 'm1', name: 'X', price: 1 }] }),
    ).thucDon();

    const m = data.items[0]!;
    expect(m.tags).toEqual([]);
    expect(m.isAvailable).toBe(true);
    expect(m.imageUrl).toBeNull();
    expect(m.categoryId).toBe('');
  });

  it('502 cho câu đọc được', async () => {
    await expect(apiTraVe(502, '<html>502</html>').thucDon()).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    });
  });

  it('mất mạng cho mã NETWORK_ERROR', async () => {
    const api = new HttpMenuApi('http://test', async () => {
      throw new Error('mạng chết');
    });
    await expect(api.thucDon()).rejects.toBeInstanceOf(AuthException);
    await expect(api.thucDon()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
