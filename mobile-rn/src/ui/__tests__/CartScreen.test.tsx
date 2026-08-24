import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type Cart, type CartItem } from '../../core/cart/cart';
import { type CartApi } from '../../core/cart/cartApi';
import { type CreateOrderApi, type TaoDonYeuCau } from '../../core/orders/createOrderApi';
import { type TableSession } from '../../core/tables/tableSession';
import { CartScreen } from '../CartScreen';

const PHIEN: TableSession = {
  sessionId: 'ts_abc',
  tableCode: 'T01',
  tableDisplayName: 'Ban 01',
  status: 'Open',
  expiresAt: '2030-01-01T00:00:00.000Z',
  isExpired: false,
  tableSessionToken: 'tst',
  resumeState: 'FreshStart',
  qrToken: 'qr',
};

function mon(menuItemId: string, ten: string, quantity: number, isAvailable = true): CartItem {
  return {
    menuItemId,
    name: ten,
    price: 60000,
    quantity,
    lineTotal: 60000 * quantity,
    isAvailable,
    imageUrl: null,
    note: null,
  };
}

function gio(items: CartItem[]): Cart {
  return {
    tableSessionId: 'ts_abc',
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: items.reduce((s, i) => s + i.lineTotal, 0),
  };
}

/** Giỏ giả lập giữ trạng thái thật, để delta cộng dồn đúng như backend. */
class CartApiGiaLap implements CartApi {
  soLanGoiDelta = 0;
  deltaDaNhan: number[] = [];

  constructor(private hienTai: Cart) {}

  async gio() {
    return this.hienTai;
  }

  async doiSoLuong(_s: string, _t: string, menuItemId: string, delta: number) {
    this.soLanGoiDelta++;
    this.deltaDaNhan.push(delta);
    this.hienTai = gio(
      this.hienTai.items
        .map((i) =>
          i.menuItemId === menuItemId
            ? mon(i.menuItemId, i.name, i.quantity + delta, i.isAvailable)
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
    return this.hienTai;
  }

  async xoaHet() {
    this.hienTai = gio([]);
    return this.hienTai;
  }
}

class DonApiGiaLap implements CreateOrderApi {
  khoaDaNhan: string[] = [];

  async taoDon(yc: TaoDonYeuCau) {
    this.khoaDaNhan.push(yc.khoaIdempotency);
    return {
      orderId: 'ord_1',
      orderCode: 'DH1',
      status: 'Placed',
      totalAmount: yc.gio.subtotal,
      customerAccessToken: 'tok',
    };
  }
}

function dungMan(
  cartApi: CartApi,
  donApi: CreateOrderApi = new DonApiGiaLap(),
  soDienThoai: string | null = null,
  onDatXong = jest.fn(),
) {
  return render(
    <CartScreen
      cartApi={cartApi}
      createOrderApi={donApi}
      onDatXong={onDatXong}
      phienBan={PHIEN}
      soDienThoai={soDienThoai}
    />,
  );
}

describe('hiện giỏ', () => {
  it('hiện tên, giá, số lượng và tổng tiền', async () => {
    await dungMan(new CartApiGiaLap(gio([mon('m1', 'Phở bò', 2)])));

    await screen.findByText('Phở bò');
    expect(screen.getByText('Tổng 120.000đ')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('giỏ trống thì chỉ đường sang thực đơn, và KHÔNG có nút đặt món', async () => {
    await dungMan(new CartApiGiaLap(gio([])));

    await screen.findByText('Giỏ đang trống. Chọn món ở tab Thực đơn.');
    expect(screen.queryByLabelText('Đặt món')).toBeNull();
  });

  it('có số điện thoại liên kết thì nói rõ tích điểm cho số nào', async () => {
    await dungMan(
      new CartApiGiaLap(gio([mon('m1', 'Phở bò', 1)])),
      new DonApiGiaLap(),
      '0901234567',
    );

    await screen.findByText('Tích điểm cho 0901234567');
  });
});

describe('cộng trừ món gửi DELTA', () => {
  it('bấm + gửi delta 1, bấm − gửi delta -1', async () => {
    const api = new CartApiGiaLap(gio([mon('m1', 'Phở bò', 2)]));
    await dungMan(api);
    await screen.findByText('Phở bò');

    await fireEvent.press(screen.getByLabelText('Thêm Phở bò'));
    await fireEvent.press(screen.getByLabelText('Bớt Phở bò'));

    expect(api.deltaDaNhan).toEqual([1, -1]);
  });

  it('KHÔNG cập nhật lạc quan — số lượng chỉ đổi sau khi máy chủ trả về', async () => {
    // Giỏ nhận delta, nên đoán sai làm con số lệch hẳn với máy chủ và khách sẽ bấm thêm để
    // "sửa" — làm lệch thêm.
    const api = new CartApiGiaLap(gio([mon('m1', 'Phở bò', 2)]));
    await dungMan(api);
    await screen.findByText('Phở bò');

    await fireEvent.press(screen.getByLabelText('Thêm Phở bò'));

    expect(screen.getByText('3')).toBeTruthy();
    expect(api.soLanGoiDelta).toBe(1);
  });

  it('món ĐÃ HẾT thì khoá nút tăng, vẫn cho bớt', async () => {
    // Backend sẽ từ chối tăng món hết, và một nút bấm được nhưng không làm gì là cách chắc chắn
    // để khách bấm mãi. Bớt thì vẫn phải cho, nếu không họ kẹt với món không mua được.
    await dungMan(new CartApiGiaLap(gio([mon('m1', 'Gỏi cuốn', 1, false)])));
    await screen.findByText('Gỏi cuốn');

    expect(screen.getByLabelText('Thêm Gỏi cuốn').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('Bớt Gỏi cuốn').props.accessibilityState?.disabled).toBe(false);
  });

  it('lỗi mạng khi đổi số lượng thì ĐỌC LẠI giỏ, không gửi lại delta', async () => {
    // Gửi lại +1 sau khi không rõ máy chủ đã nhận hay chưa là cách tạo ra hai phần.
    let soLanDoc = 0;
    const api: CartApi = {
      gio: async () => {
        soLanDoc++;
        return gio([mon('m1', 'Phở bò', 2)]);
      },
      doiSoLuong: async () => {
        throw new AuthException('NETWORK_ERROR', 'Không kết nối được máy chủ.');
      },
      xoaHet: async () => gio([]),
    };
    await dungMan(api);
    await screen.findByText('Phở bò');

    await fireEvent.press(screen.getByLabelText('Thêm Phở bò'));

    await screen.findByText('Không kết nối được máy chủ.');
    expect(soLanDoc).toBe(2);
  });
});

describe('đặt món', () => {
  it('đặt xong thì báo đơn ra ngoài và đọc lại giỏ', async () => {
    const xong = jest.fn();
    const api = new CartApiGiaLap(gio([mon('m1', 'Phở bò', 2)]));
    await dungMan(api, new DonApiGiaLap(), null, xong);
    await screen.findByText('Phở bò');

    await fireEvent.press(screen.getByLabelText('Đặt món'));

    expect(xong).toHaveBeenCalledWith(expect.objectContaining({ orderCode: 'DH1' }));
  });

  it('CÙNG giỏ thì hai lần đặt dùng CÙNG một khoá idempotency', async () => {
    // Đây là toàn bộ lý do KhoaDatDon tồn tại. Nếu màn hình tạo khoá mới mỗi lượt dựng thì bấm
    // lại sau lỗi mạng sẽ tạo đơn thứ hai — đúng thứ Idempotency-Key sinh ra để chặn.
    const donApi = new DonApiGiaLap();
    // API luôn ném để lần bấm đầu KHÔNG gọi quen(), mô phỏng lỗi mạng rồi bấm lại.
    const nemLoi: CreateOrderApi = {
      taoDon: async (yc) => {
        donApi.khoaDaNhan.push(yc.khoaIdempotency);
        throw new AuthException('NETWORK_ERROR', 'Không kết nối được máy chủ.');
      },
    };
    await dungMan(new CartApiGiaLap(gio([mon('m1', 'Phở bò', 2)])), nemLoi);
    await screen.findByText('Phở bò');

    await fireEvent.press(screen.getByLabelText('Đặt món'));
    await fireEvent.press(screen.getByLabelText('Đặt món'));

    expect(donApi.khoaDaNhan).toHaveLength(2);
    expect(donApi.khoaDaNhan[0]).toBe(donApi.khoaDaNhan[1]);
  });

  it('giỏ ĐỔI giữa hai lần bấm thì khoá ĐỔI theo', async () => {
    // Giữ nguyên khoá sau khi giỏ đổi thì backend trả 409 IDEMPOTENCY_KEY_REUSED, và khách nhận
    // một câu lỗi họ không gây ra.
    const khoaDaNhan: string[] = [];
    const donApi: CreateOrderApi = {
      taoDon: async (yc) => {
        khoaDaNhan.push(yc.khoaIdempotency);
        throw new AuthException('NETWORK_ERROR', 'Không kết nối được máy chủ.');
      },
    };
    const cartApi = new CartApiGiaLap(gio([mon('m1', 'Phở bò', 2)]));
    await dungMan(cartApi, donApi);
    await screen.findByText('Phở bò');

    await fireEvent.press(screen.getByLabelText('Đặt món'));
    await fireEvent.press(screen.getByLabelText('Thêm Phở bò'));
    await fireEvent.press(screen.getByLabelText('Đặt món'));

    expect(khoaDaNhan).toHaveLength(2);
    expect(khoaDaNhan[0]).not.toBe(khoaDaNhan[1]);
  });

  it('còn món HẾT thì khoá nút đặt và nói rõ phải làm gì', async () => {
    // Chặn ở đây thay vì để backend từ chối cả đơn: một lời từ chối sau khi khách đã bấm "Đặt
    // món" tệ hơn nhiều so với chỉ ra ngay trong giỏ.
    await dungMan(
      new CartApiGiaLap(gio([mon('m1', 'Phở bò', 1), mon('m2', 'Gỏi cuốn', 1, false)])),
    );
    await screen.findByText('Phở bò');

    expect(screen.getByText('Có món vừa hết. Bỏ món đó ra rồi đặt lại.')).toBeTruthy();
    expect(screen.getByLabelText('Đặt món').props.accessibilityState?.disabled).toBe(true);
  });

  it('lỗi 409 thì GIỮ câu báo lỗi sau khi đọc lại giỏ', async () => {
    // Bản Flutter xoá lỗi ở đầu mỗi lần đọc lại, nên câu báo loé lên rồi biến mất và khách chỉ
    // thấy giỏ không đổi. Chính cái họ vừa bấm mới là thứ cần giải thích.
    const donApi: CreateOrderApi = {
      taoDon: async () => {
        throw new AuthException(
          'IDEMPOTENCY_KEY_REUSED',
          'Giỏ vừa thay đổi. Mở lại giỏ và đặt lại giúp nhé.',
        );
      },
    };
    await dungMan(new CartApiGiaLap(gio([mon('m1', 'Phở bò', 1)])), donApi);
    await screen.findByText('Phở bò');

    await fireEvent.press(screen.getByLabelText('Đặt món'));

    await screen.findByText('Giỏ vừa thay đổi. Mở lại giỏ và đặt lại giúp nhé.');
  });
});
