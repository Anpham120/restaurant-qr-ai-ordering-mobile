import { type GoiMang } from '../../mang/goiMang';
import { type MonHayGoi, HttpFavouriteApi, locThoiQuen, moTaThoiQuen } from '../favouriteApi';

const HAY_GOI = JSON.stringify({
  items: [
    { menuItemId: 'm1', name: 'Phở bò tái', timesOrdered: 5, totalQuantity: 7 },
    { menuItemId: 'm2', name: 'Gỏi cuốn', timesOrdered: 3, totalQuantity: 4 },
  ],
});

function api(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpFavouriteApi('http://test', goi);
}

function mon(timesOrdered: number, name = 'X'): MonHayGoi {
  return { menuItemId: name, name, timesOrdered, totalQuantity: timesOrdered };
}

describe('món hay gọi', () => {
  it('uỷ quyền bằng JWT, không tham số định danh nào', async () => {
    const ghiLai = jest.fn();
    await api(200, HAY_GOI, ghiLai).monHayGoi('jwt.abc');

    const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://test/api/orders/mine/favourites');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt.abc');
  });

  it('giữ NGUYÊN thứ tự máy chủ trả về', async () => {
    // Backend đã xếp theo số LẦN gọi. Xếp lại ở client là hai nơi cùng quyết định một chuyện.
    const ds = await api(200, HAY_GOI).monHayGoi('jwt');

    expect(ds.map((m) => m.name)).toEqual(['Phở bò tái', 'Gỏi cuốn']);
  });

  it('chưa có lịch sử là hợp lệ, không phải lỗi', async () => {
    expect(await api(200, '{"items":[]}').monHayGoi('jwt')).toEqual([]);
  });

  it('401 nói phiên hết hạn', async () => {
    await expect(api(401, '{}').monHayGoi('jwt')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('thế nào là thói quen', () => {
  it('gọi MỘT lần thì chưa phải "hay gọi"', () => {
    // Đó chỉ là một lần thử. Hiện "1 lần" dưới nhãn "Món tôi hay gọi" vừa vô nghĩa vừa khiến
    // danh sách đầy những món khách ăn thử rồi thôi.
    expect(moTaThoiQuen(mon(1))).toBeNull();
    expect(moTaThoiQuen(mon(0))).toBeNull();
  });

  it('gọi từ hai lần trở lên mới hiện', () => {
    expect(moTaThoiQuen(mon(2))).toBe('Đã gọi 2 lần');
    expect(moTaThoiQuen(mon(5))).toBe('Đã gọi 5 lần');
  });

  it('lọc bỏ món chỉ gọi một lần, giữ nguyên thứ tự còn lại', () => {
    const ds = [mon(5, 'A'), mon(1, 'B'), mon(3, 'C')];

    expect(locThoiQuen(ds).map((m) => m.name)).toEqual(['A', 'C']);
  });

  it('mọi món đều mới thì danh sách rỗng, không phải lỗi', () => {
    expect(locThoiQuen([mon(1, 'A'), mon(1, 'B')])).toEqual([]);
  });

  it('KHÔNG xếp hạng theo tổng số phần', () => {
    // Tám phần chè trong đúng một bữa liên hoan không phải là thói quen. Backend xếp theo số LẦN
    // gọi, và hàm lọc cũng phải đọc đúng trường đó.
    const nhieuPhanMotLan: MonHayGoi = {
      menuItemId: 'm9',
      name: 'Chè liên hoan',
      timesOrdered: 1,
      totalQuantity: 8,
    };

    expect(locThoiQuen([nhieuPhanMotLan])).toEqual([]);
    expect(moTaThoiQuen(nhieuPhanMotLan)).toBeNull();
  });
});
