import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type FavouriteApi } from '../../core/orders/favouriteApi';
import { type CustomerOrder, type OrderItem } from '../../core/orders/order';
import { type OrderHistoryApi } from '../../core/orders/orderHistoryApi';
import { HistoryScreen, moTaKetQuaDatLai } from '../HistoryScreen';

function mon(menuItemId: string, ten: string, tuyChon: Partial<OrderItem> = {}): OrderItem {
  return {
    orderItemId: `oi-${menuItemId}`,
    menuItemId,
    name: ten,
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

function don(items: OrderItem[], tuyChon: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    orderId: 'o1',
    orderCode: 'DH1',
    status: 'Completed',
    totalAmount: items.reduce((s, i) => s + i.lineTotal, 0),
    createdAt: '2026-08-15T12:00:00.000Z',
    items,
    ...tuyChon,
  };
}

const khongCoHayGoi: FavouriteApi = { monHayGoi: async () => [] };

describe('câu báo sau khi đặt lại', () => {
  it('trọn vẹn thì nói số món đã thêm', () => {
    expect(moTaKetQuaDatLai({ daThem: ['A', 'B'], khongThem: {} })).toBe('Đã thêm 2 món vào giỏ');
  });

  it('hỏng hết thì nói RÕ món nào', () => {
    expect(moTaKetQuaDatLai({ daThem: [], khongThem: { A: 'x', B: 'y' } })).toBe(
      'Không thêm được món nào: A, B',
    );
  });

  it('thêm được MỘT PHẦN thì nói cả hai vế', () => {
    // Nhánh này hay bị gộp vào "đã thêm vào giỏ". Khách chỉ phát hiện lúc nhìn hoá đơn.
    expect(moTaKetQuaDatLai({ daThem: ['A'], khongThem: { B: 'ngừng bán' } })).toBe(
      'Đã thêm 1 món. Không còn: B',
    );
  });
});

describe('lịch sử đơn', () => {
  it('hiện mã đơn, ngày, trạng thái và các món', async () => {
    await render(
      <HistoryScreen
        accessToken="jwt"
        favouriteApi={khongCoHayGoi}
        historyApi={{ lichSuCuaToi: async () => [don([mon('m1', 'Phở bò tái')])] }}
      />,
    );

    await screen.findByText('DH1');
    expect(screen.getByText('15/08/2026')).toBeTruthy();
    expect(screen.getByText('Đã thanh toán')).toBeTruthy();
    expect(screen.getByText('2 x Phở bò tái')).toBeTruthy();
  });

  it('chưa có đơn nào thì GIẢI THÍCH vì sao, không chỉ nói trống', async () => {
    // Đơn đặt lúc chưa đăng nhập không hiện ở đây, và khách cần biết điều đó.
    await render(
      <HistoryScreen
        accessToken="jwt"
        favouriteApi={khongCoHayGoi}
        historyApi={{ lichSuCuaToi: async () => [] }}
      />,
    );

    const s = await screen.findByText(/Chưa có đơn nào/);
    expect(s.props.children.join('')).toContain('đã đăng nhập');
  });

  it('chưa vào bàn thì KHÔNG có nút đặt lại', async () => {
    // Không có giỏ để thêm vào. Nút bấm được nhưng không làm gì là cách chắc chắn để khách bấm mãi.
    await render(
      <HistoryScreen
        accessToken="jwt"
        favouriteApi={khongCoHayGoi}
        historyApi={{ lichSuCuaToi: async () => [don([mon('m1', 'Phở bò tái')])] }}
      />,
    );

    await screen.findByText('DH1');
    expect(screen.queryByLabelText('Đặt lại DH1')).toBeNull();
  });
});

describe('đặt lại đơn cũ', () => {
  const lichSu: OrderHistoryApi = {
    lichSuCuaToi: async () => [don([mon('m1', 'Phở bò tái'), mon('m2', 'Chè cũ')])],
  };

  it('thêm được hết thì báo số món', async () => {
    const baoTin = jest.fn();
    await render(
      <HistoryScreen
        accessToken="jwt"
        favouriteApi={khongCoHayGoi}
        historyApi={lichSu}
        onBaoTin={baoTin}
        themVaoGio={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    await fireEvent.press(await screen.findByLabelText('Đặt lại DH1'));

    expect(baoTin).toHaveBeenCalledWith('Đã thêm 2 món vào giỏ');
  });

  it('một món ngừng bán thì vẫn thêm món còn lại VÀ nói ra món thiếu', async () => {
    const baoTin = jest.fn();
    const them = jest.fn(async (id: string) => {
      if (id === 'm2') throw new AuthException('MENU_ITEM_UNAVAILABLE', 'Món này vừa hết.');
    });
    await render(
      <HistoryScreen
        accessToken="jwt"
        favouriteApi={khongCoHayGoi}
        historyApi={lichSu}
        onBaoTin={baoTin}
        themVaoGio={them}
      />,
    );

    await fireEvent.press(await screen.findByLabelText('Đặt lại DH1'));

    expect(them).toHaveBeenCalledTimes(2);
    expect(baoTin).toHaveBeenCalledWith('Đã thêm 1 món. Không còn: Chè cũ');
  });
});

describe('món hay gọi', () => {
  const coHayGoi: FavouriteApi = {
    monHayGoi: async () => [
      { menuItemId: 'm1', name: 'Phở bò tái', timesOrdered: 5, totalQuantity: 7 },
      { menuItemId: 'm9', name: 'Món ăn thử', timesOrdered: 1, totalQuantity: 1 },
    ],
  };

  it('chỉ hiện món gọi từ HAI lần trở lên', async () => {
    await render(
      <HistoryScreen
        accessToken="jwt"
        favouriteApi={coHayGoi}
        historyApi={{ lichSuCuaToi: async () => [] }}
      />,
    );

    await screen.findByText('Phở bò tái');
    expect(screen.getByText('Đã gọi 5 lần')).toBeTruthy();
    expect(screen.queryByText('Món ăn thử')).toBeNull();
  });

  it('món hay gọi HỎNG thì KHÔNG làm mất lịch sử đơn', async () => {
    // Đây là phần phụ. Khách vào màn này để xem đơn cũ; để một lỗi ở khối gợi ý xoá mất thứ chính
    // là đổi ưu tiên ngược.
    await render(
      <HistoryScreen
        accessToken="jwt"
        favouriteApi={{
          monHayGoi: async () => {
            throw new AuthException('SERVER_ERROR', 'Máy chủ đang lỗi.');
          },
        }}
        historyApi={{ lichSuCuaToi: async () => [don([mon('m1', 'Phở bò tái')])] }}
      />,
    );

    await screen.findByText('DH1');
    expect(screen.queryByText('Món bạn hay gọi')).toBeNull();
  });
});
