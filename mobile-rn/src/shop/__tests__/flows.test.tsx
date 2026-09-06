import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CartScreen } from '../CartScreen';
import { CourierScreen } from '../CourierScreen';
import { MenuScreen } from '../MenuScreen';
import { ShopApi } from '../client';
import type { Menu, Order, Session, ShopConfig } from '../types';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));
const menu: Menu = {
  categories: [{ categoryId: 'tea', name: 'Trà' }],
  items: [
    {
      id: 'milk-tea',
      name: 'Trà sữa Mây',
      description: 'Trà thơm, sữa dịu.',
      price: 30000,
      categoryId: 'tea',
      categoryName: 'Trà',
      isAvailable: true,
      tags: [],
      prepMinutes: 5,
      optionGroups: [
        {
          id: 'size',
          name: 'Kích cỡ',
          minSelections: 1,
          maxSelections: 1,
          options: [
            { id: 'm', name: 'Vừa', price: 0, isAvailable: true },
            { id: 'l', name: 'Lớn', price: 5000, isAvailable: true },
          ],
        },
      ],
    },
  ],
};
const config: ShopConfig = {
  name: 'Mây',
  address: '12 Lê Lợi',
  phone: '0901234567',
  deliveryFee: 0,
  minimumOrder: 0,
  estimatedMinutesLow: 25,
  estimatedMinutesHigh: 40,
  shippingFreeRadiusKm: 5,
  shippingPerKm: 4000,
  allowCod: true,
};
const order: Order = {
  orderId: 'id',
  orderCode: 'MAY-1',
  orderType: 'Delivery',
  status: 'Ready',
  paymentStatus: 'Unpaid',
  paymentMethod: 'COD',
  subtotalAmount: 30000,
  discountAmount: 0,
  deliveryFee: 4000,
  totalAmount: 34000,
  fulfillmentStatus: 'OutForDelivery',
  deliveryDetails: {
    recipientName: 'An',
    phoneNumber: '0901234567',
    address: '12 Lê Lợi, phường Bến Thành',
    note: '',
  },
  items: [{ name: 'Trà sữa Mây', quantity: 1, unitPrice: 30000 }],
};

test('customer chooses required configuration before a product can enter the cart', async () => {
  const onAdd = jest.fn();
  await render(
    <MenuScreen
      menu={menu}
      config={config}
      origin="https://example.com"
      onAdd={onAdd}
      loading={false}
      error=""
      onRefresh={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByLabelText('Chọn Trà sữa Mây'));
  await fireEvent.press(screen.getByText(/Thêm vào giỏ/));
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText(/Vui lòng chọn ít nhất/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Vừa'));
  await fireEvent.press(screen.getByText(/Thêm vào giỏ/));
  expect(onAdd).toHaveBeenCalledWith(menu.items[0], ['m'], 1, '');
});

test('pickup checkout validates contact and reuses its idempotency key after a failed request', async () => {
  const api = new ShopApi('https://example.com');
  const create = jest
    .spyOn(api, 'createOrder')
    .mockRejectedValueOnce(new Error('Mất mạng'))
    .mockResolvedValue({ ...order, orderType: 'Pickup', customerAccessToken: 'token' });
  const onCreated = jest.fn().mockResolvedValue(undefined);
  await render(
    <CartScreen
      cart={[{ key: 'a', product: menu.items[0]!, optionIds: ['m'], quantity: 1, note: '' }]}
      onChange={jest.fn()}
      onMenu={jest.fn()}
      api={api}
      config={config}
      menu={menu}
      onCreated={onCreated}
    />,
  );
  await fireEvent.press(screen.getByText('Tiếp tục · Thông tin nhận hàng'));
  await fireEvent.press(screen.getByText('Nhận tại quầy'));
  await fireEvent.press(screen.getByText('Đặt đơn tại Mây'));
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText('Nhập tên người nhận.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Tên người nhận *'), 'An');
  await fireEvent.changeText(screen.getByLabelText('Số điện thoại *'), '0901234567');
  await fireEvent.press(screen.getByText('Tiền mặt tại quầy'));
  await fireEvent.press(screen.getByText('Đặt đơn tại Mây'));
  await screen.findByText('Mất mạng');
  await fireEvent.press(screen.getByText('Đặt đơn tại Mây'));
  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ orderCode: 'MAY-1' }), 'COD'),
  );
  expect(create.mock.calls[0]?.[1]).toBe(create.mock.calls[1]?.[1]);
  expect(create.mock.calls[1]?.[0]).toMatchObject({
    orderType: 'Pickup',
    items: [{ menuItemId: 'milk-tea', optionIds: ['m'], quantity: 1 }],
  });
});

test('changing delivery address invalidates the server shipping quote', async () => {
  const api = new ShopApi('https://example.com');
  jest.spyOn(api, 'quote').mockResolvedValue({ distanceKm: 6, deliveryFee: 4000 });
  const create = jest.spyOn(api, 'createOrder');
  await render(
    <CartScreen
      cart={[{ key: 'a', product: menu.items[0]!, optionIds: ['m'], quantity: 1, note: '' }]}
      onChange={jest.fn()}
      onMenu={jest.fn()}
      api={api}
      config={config}
      menu={menu}
      onCreated={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByText('Tiếp tục · Thông tin nhận hàng'));
  await fireEvent.changeText(screen.getByLabelText('Tên người nhận *'), 'An');
  await fireEvent.changeText(screen.getByLabelText('Số điện thoại *'), '0901234567');
  await fireEvent.changeText(screen.getByLabelText('Địa chỉ nhận hàng *'), '12 Lê Lợi, Bến Thành');
  await fireEvent.changeText(screen.getByLabelText('Vĩ độ *'), '10.77');
  await fireEvent.changeText(screen.getByLabelText('Kinh độ *'), '106.70');
  await fireEvent.press(screen.getByText('Xác nhận điểm & tính phí'));
  await screen.findByText(/6.0 km/);
  await fireEvent.changeText(screen.getByLabelText('Địa chỉ nhận hàng *'), '99 Lê Lợi, Bến Thành');
  await fireEvent.press(screen.getByText('Đặt đơn tại Mây'));
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText('Xác nhận điểm giao để quán tính phí trước khi đặt.')).toBeTruthy();
});

test('courier must enter the exact cash collected before confirming delivery', async () => {
  const api = new ShopApi('https://example.com', 'staff-token');
  jest.spyOn(api, 'deliveries').mockResolvedValue({ orders: [order], total: 1 });
  const patch = jest
    .spyOn(api, 'deliveryStatus')
    .mockResolvedValue({ ...order, fulfillmentStatus: 'Delivered', paymentStatus: 'Paid' });
  const session: Session = {
    accessToken: 'staff-token',
    expiresAt: '2099-01-01',
    user: { userId: 'courier', fullName: 'Minh An', email: 'an@example.com', role: 'Courier' },
  };
  await render(<CourierScreen api={api} session={session} onAccount={jest.fn()} />);
  await fireEvent.press(await screen.findByText('Đang giao (1)'));
  await fireEvent.press(screen.getByText('Chi tiết chuyến giao'));
  await fireEvent.press(screen.getByText('Đã giao đủ món'));
  await fireEvent.changeText(screen.getByLabelText('Số tiền mặt đã thu (đ) *'), '30000');
  await fireEvent.press(screen.getByText('Xác nhận hoàn tất giao hàng'));
  expect(patch).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Số tiền mặt đã thu (đ) *'), '34000');
  await fireEvent.press(screen.getByText('Xác nhận hoàn tất giao hàng'));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('MAY-1', 'Delivered', '', 34000));
});
