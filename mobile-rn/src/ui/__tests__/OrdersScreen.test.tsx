import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { khoTrongBoNho } from '../../core/luuTruAnToan';
import { type CustomerOrder, type OrderItem } from '../../core/orders/order';
import { type OrderApi } from '../../core/orders/orderApi';
import { OrderTokenStore } from '../../core/orders/orderTokenStore';
import { type TableSession } from '../../core/tables/tableSession';
import { OrdersScreen } from '../OrdersScreen';

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

function mon(tuyChon: Partial<OrderItem> = {}): OrderItem {
  return {
    orderItemId: 'oi_1',
    menuItemId: 'm1',
    name: 'Phở bò tái',
    quantity: 2,
    unitPrice: 60000,
    lineTotal: 120000,
    status: 'Pending',
    estimatedReadyMinutesLow: null,
    estimatedReadyMinutesHigh: null,
    kitchenBusy: false,
    ...tuyChon,
  };
}

function don(items: OrderItem[], tuyChon: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    orderId: 'ord_1',
    orderCode: 'DH1',
    status: 'Preparing',
    totalAmount: items.reduce((s, i) => s + i.lineTotal, 0),
    createdAt: '2026-08-20T12:00:00.000Z',
    items,
    ...tuyChon,
  };
}

function apiVoi(ds: CustomerOrder[], huyMon: OrderApi['huyMon'] = jest.fn()): OrderApi {
  return { donCuaPhien: async () => ds, huyMon };
}

async function khoCoToken(orderCode = 'DH1') {
  const s = new OrderTokenStore(khoTrongBoNho());
  await s.luu(orderCode, 'otok');
  return s;
}

const dongY = jest.fn().mockResolvedValue(true);
const tuChoi = jest.fn().mockResolvedValue(false);

describe('hiện đơn của bàn', () => {
  it('hiện mã đơn, trạng thái đơn, trạng thái món và tổng tiền', async () => {
    await render(
      <OrdersScreen
        api={apiVoi([don([mon()])])}
        phienBan={PHIEN}
        tokenStore={new OrderTokenStore(khoTrongBoNho())}
      />,
    );

    await screen.findByText('DH1');
    // Đơn đang Preparing → "Đang nấu"; món đang Pending → "Đã gửi bếp, chờ tới lượt". Hai nhãn
    // khác nhau cho hai cấp khác nhau, và đó chính là chỗ dễ nói sai với khách nhất.
    //
    // Nhãn MÓN đổi ở lượt đồng bộ chữ giữa app và web: "Chờ nấu" là lời của BẾP, không phải lời
    // nói với người đang ngồi đợi. Ca này đỏ từ lượt đó mà không ai thấy — lần chạy hôm ấy chỉ
    // gọi `src/core/orders`, không chạm tới `src/ui`.
    expect(screen.getByText('Đang nấu')).toBeTruthy();
    expect(screen.getByText('Đã gửi bếp, chờ tới lượt')).toBeTruthy();
    expect(screen.getByText('2 x Phở bò tái')).toBeTruthy();
    expect(screen.getByText('Tổng 120.000đ')).toBeTruthy();
  });

  it('bàn chưa có đơn thì nói rõ, không để trắng', async () => {
    await render(
      <OrdersScreen
        api={apiVoi([])}
        phienBan={PHIEN}
        tokenStore={new OrderTokenStore(khoTrongBoNho())}
      />,
    );

    await screen.findByText('Bàn chưa có đơn nào.');
  });
});

describe('ước lượng thời gian', () => {
  it('KHÔNG có ước lượng thì không hiện dòng nào — app không bịa', async () => {
    await render(
      <OrdersScreen
        api={apiVoi([don([mon()])])}
        phienBan={PHIEN}
        tokenStore={new OrderTokenStore(khoTrongBoNho())}
      />,
    );

    await screen.findByText('2 x Phở bò tái');
    expect(screen.queryByText(/Dự kiến/)).toBeNull();
  });

  it('có ước lượng thì hiện dạng khoảng', async () => {
    await render(
      <OrdersScreen
        api={apiVoi([don([mon({ estimatedReadyMinutesLow: 15, estimatedReadyMinutesHigh: 25 })])])}
        phienBan={PHIEN}
        tokenStore={new OrderTokenStore(khoTrongBoNho())}
      />,
    );

    await screen.findByText('Dự kiến 15–25 phút');
  });

  it('bếp đông thì nói VÌ SAO lâu, ngay dưới con số', async () => {
    // Con số nhảy gấp đôi mà không giải thích trông như app tính sai.
    await render(
      <OrdersScreen
        api={apiVoi([
          don([
            mon({ estimatedReadyMinutesLow: 42, estimatedReadyMinutesHigh: 57, kitchenBusy: true }),
          ]),
        ])}
        phienBan={PHIEN}
        tokenStore={new OrderTokenStore(khoTrongBoNho())}
      />,
    );

    await screen.findByText('Dự kiến 42–57 phút');
    expect(screen.getByText(/Bếp đang đông/)).toBeTruthy();
  });

  it('bếp đông nhưng CHƯA có ước lượng thì không nói gì', async () => {
    // Báo "bếp đang đông" mà không kèm con số là gieo lo lắng mà không cho khách thứ gì để quyết
    // định.
    await render(
      <OrdersScreen
        api={apiVoi([don([mon({ kitchenBusy: true })])])}
        phienBan={PHIEN}
        tokenStore={new OrderTokenStore(khoTrongBoNho())}
      />,
    );

    await screen.findByText('2 x Phở bò tái');
    expect(screen.queryByText(/Bếp đang đông/)).toBeNull();
  });
});

describe('huỷ món (hạn chế #11)', () => {
  it('món Pending + CÓ token của đơn thì hiện nút huỷ', async () => {
    await render(
      <OrdersScreen
        api={apiVoi([don([mon()])])}
        phienBan={PHIEN}
        tokenStore={await khoCoToken()}
      />,
    );

    expect(await screen.findByLabelText('Huỷ Phở bò tái')).toBeTruthy();
  });

  it('KHÔNG có token của đơn thì KHÔNG có nút huỷ, dù món đang Pending', async () => {
    // Đơn do máy khác trong bàn đặt. Người đặt mới là người quyết định huỷ.
    await render(
      <OrdersScreen
        api={apiVoi([don([mon()])])}
        phienBan={PHIEN}
        tokenStore={new OrderTokenStore(khoTrongBoNho())}
      />,
    );

    await screen.findByText('2 x Phở bò tái');
    expect(screen.queryByLabelText('Huỷ Phở bò tái')).toBeNull();
  });

  it('món ĐANG NẤU thì KHÔNG có nút huỷ, dù có token', async () => {
    // Backend chặt hơn đường của nhân viên có chủ ý: tới lúc đó bếp đã dùng nguyên liệu.
    await render(
      <OrdersScreen
        api={apiVoi([don([mon({ status: 'Preparing' })])])}
        phienBan={PHIEN}
        tokenStore={await khoCoToken()}
      />,
    );

    await screen.findByText('2 x Phở bò tái');
    expect(screen.queryByLabelText('Huỷ Phở bò tái')).toBeNull();
  });

  it('hộp thoại nói RÕ món nào và bao nhiêu phần', async () => {
    // Ở màn hình có nhiều dòng giống nhau, một hộp thoại chỉ hỏi "bạn có chắc không" là chỗ dễ
    // bấm nhầm nhất.
    const hoi = jest.fn().mockResolvedValue(false);
    await render(
      <OrdersScreen
        api={apiVoi([don([mon()])])}
        hoiXacNhan={hoi}
        phienBan={PHIEN}
        tokenStore={await khoCoToken()}
      />,
    );

    await fireEvent.press(await screen.findByLabelText('Huỷ Phở bò tái'));

    expect(hoi).toHaveBeenCalledWith('Huỷ món này?', '2 x Phở bò tái sẽ bị bỏ khỏi đơn DH1.');
  });

  it('từ chối ở hộp thoại thì KHÔNG gọi API', async () => {
    const huyMon = jest.fn();
    await render(
      <OrdersScreen
        api={apiVoi([don([mon()])], huyMon)}
        hoiXacNhan={tuChoi}
        phienBan={PHIEN}
        tokenStore={await khoCoToken()}
      />,
    );

    await fireEvent.press(await screen.findByLabelText('Huỷ Phở bò tái'));

    expect(huyMon).not.toHaveBeenCalled();
  });

  it('đồng ý thì gửi ĐÚNG token của đơn đó', async () => {
    const huyMon = jest.fn().mockResolvedValue(undefined);
    await render(
      <OrdersScreen
        api={apiVoi([don([mon()])], huyMon)}
        hoiXacNhan={dongY}
        phienBan={PHIEN}
        tokenStore={await khoCoToken()}
      />,
    );

    await fireEvent.press(await screen.findByLabelText('Huỷ Phở bò tái'));

    expect(huyMon).toHaveBeenCalledWith('DH1', 'oi_1', 'otok');
  });

  it('bếp đã nấu mất: giữ câu báo lỗi VÀ đọc lại để trạng thái khớp thực tế', async () => {
    let soLanDoc = 0;
    const api: OrderApi = {
      donCuaPhien: async () => {
        soLanDoc++;
        return [don([mon({ status: soLanDoc === 1 ? 'Pending' : 'Preparing' })])];
      },
      huyMon: async () => {
        throw new AuthException(
          'ORDER_ITEM_CANCEL_NOT_ALLOWED',
          'Bếp đã bắt đầu nấu món này nên không tự huỷ được. Báo nhân viên giúp nhé.',
        );
      },
    };
    await render(
      <OrdersScreen
        api={api}
        hoiXacNhan={dongY}
        phienBan={PHIEN}
        tokenStore={await khoCoToken()}
      />,
    );

    await fireEvent.press(await screen.findByLabelText('Huỷ Phở bò tái'));

    await screen.findByText(/Bếp đã bắt đầu nấu/);
    expect(soLanDoc).toBe(2);
  });
});
