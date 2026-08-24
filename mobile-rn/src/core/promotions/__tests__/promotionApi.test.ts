import { type GoiMang } from '../../mang/goiMang';
import { HttpPromotionApi } from '../promotionApi';

function api(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpPromotionApi('http://test', goi);
}

describe('HttpPromotionApi', () => {
  it('KHÔNG gửi Authorization — mã khuyến mãi là thứ quán in lên tờ rơi', async () => {
    const ghiLai = jest.fn();
    await api(200, '{"items":[]}', ghiLai).dangChay();

    const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('http://test/api/promotions/active');
    expect((init?.headers ?? {}) as Record<string, string>).not.toHaveProperty('Authorization');
  });

  it('phân giải danh sách kèm cờ flash sale', async () => {
    const ds = await api(
      200,
      JSON.stringify({
        items: [
          {
            code: 'FLASH20',
            name: 'Giờ vàng',
            type: 'Percentage',
            discountValue: 20,
            maxDiscountAmount: 50000,
            isFlashSale: true,
          },
        ],
      }),
    ).dangChay();

    expect(ds[0]!.code).toBe('FLASH20');
    expect(ds[0]!.isFlashSale).toBe(true);
    expect(ds[0]!.maxDiscountAmount).toBe(50000);
  });

  it('chưa có khuyến mãi nào là hợp lệ, không phải lỗi', async () => {
    expect(await api(200, '{"items":[]}').dangChay()).toEqual([]);
    expect(await api(200, '{}').dangChay()).toEqual([]);
  });

  it('502 cho câu đọc được', async () => {
    await expect(api(502, '<html>502</html>').dangChay()).rejects.toMatchObject({
      code: 'SERVER_ERROR',
    });
  });

  it('mất mạng cho NETWORK_ERROR', async () => {
    const a = new HttpPromotionApi('http://test', async () => {
      throw new Error('mạng chết');
    });
    await expect(a.dangChay()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
