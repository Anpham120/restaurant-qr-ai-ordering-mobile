import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type MenuItem } from '../../core/menu/menu';
import { type MenuApi, type MenuData } from '../../core/menu/menuApi';
import { MenuScreen } from '../MenuScreen';

const BASE_ANH = 'http://10.0.2.2:8080';

function mon(id: string, ten: string, tuyChon: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    name: ten,
    description: null,
    price: 50000,
    categoryId: 'c1',
    categoryName: 'Khai vị',
    imageUrl: null,
    isAvailable: true,
    tags: [],
    ...tuyChon,
  };
}

function apiVoi(data: Partial<MenuData>): MenuApi {
  return {
    thucDon: async () => ({ categories: data.categories ?? [], items: data.items ?? [] }),
  };
}

const API_MAU = apiVoi({
  categories: [
    { categoryId: 'c1', name: 'Khai vị' },
    { categoryId: 'c2', name: 'Món chính' },
  ],
  items: [
    mon('m1', 'Gỏi cuốn tôm thịt'),
    mon('m2', 'Phở bò tái', { categoryId: 'c2', price: 60000 }),
    mon('m3', 'Đậu hũ chiên sả', { isAvailable: false }),
  ],
});

describe('màn hình thực đơn', () => {
  it('hiện món theo từng danh mục, đúng thứ tự máy chủ trả về', async () => {
    await render(<MenuScreen api={API_MAU} imageBaseUrl={BASE_ANH} />);

    await screen.findByText('Khai vị');
    expect(screen.getByText('Món chính')).toBeTruthy();
    expect(screen.getByText('Phở bò tái')).toBeTruthy();
  });

  it('hiện giá theo định dạng tiền Việt', async () => {
    await render(<MenuScreen api={API_MAU} imageBaseUrl={BASE_ANH} />);

    await screen.findByText('60.000đ');
  });

  it('GIỮ món đang hết và gắn nhãn Hết hàng', async () => {
    // Khách cần biết quán CÓ món đó. Lọc đi thì họ tưởng quán không bán.
    await render(
      <MenuScreen
        api={apiVoi({
          categories: [{ categoryId: 'c1', name: 'Khai vị' }],
          items: [mon('m3', 'Đậu hũ chiên sả', { isAvailable: false, imageUrl: '/a.webp' })],
        })}
        imageBaseUrl={BASE_ANH}
      />,
    );

    await screen.findByText('Đậu hũ chiên sả');
    expect(screen.getByText('Hết hàng')).toBeTruthy();
  });

  it('tìm không dấu vẫn ra món có dấu', async () => {
    await render(<MenuScreen api={API_MAU} imageBaseUrl={BASE_ANH} />);
    await screen.findByText('Phở bò tái');

    await fireEvent.changeText(screen.getByLabelText('Tìm món'), 'pho');

    expect(screen.getByText('Phở bò tái')).toBeTruthy();
    expect(screen.queryByText('Gỏi cuốn tôm thịt')).toBeNull();
  });

  it('không khớp gì thì nói rõ đã tìm từ khoá nào', async () => {
    // "Không có kết quả" trơ trọi khiến khách tưởng thực đơn trống. Nhắc lại từ khoá cho họ biết
    // là do tìm, và biết mình đã gõ gì.
    await render(<MenuScreen api={API_MAU} imageBaseUrl={BASE_ANH} />);
    await screen.findByText('Phở bò tái');

    await fireEvent.changeText(screen.getByLabelText('Tìm món'), 'pizza');

    expect(screen.getByText('Không có món nào khớp "pizza".')).toBeTruthy();
  });

  it('thực đơn trống nói khác với không tìm thấy', async () => {
    await render(<MenuScreen api={apiVoi({})} imageBaseUrl={BASE_ANH} />);

    await screen.findByText('Thực đơn đang trống.');
  });
});

describe('thêm vào giỏ', () => {
  it('không truyền onThemVaoGio thì KHÔNG có nút thêm', async () => {
    // Màn hình này cũng dùng để xem trước khi chưa vào bàn. Hiện nút thêm lúc đó là hứa một việc
    // không làm được.
    await render(<MenuScreen api={API_MAU} imageBaseUrl={BASE_ANH} />);
    await screen.findByText('Phở bò tái');

    expect(screen.queryByLabelText('Thêm Phở bò tái')).toBeNull();
  });

  it('bấm thêm thì gọi đúng menuItemId và báo tin', async () => {
    const them = jest.fn().mockResolvedValue(undefined);
    const baoTin = jest.fn();
    await render(
      <MenuScreen api={API_MAU} imageBaseUrl={BASE_ANH} onBaoTin={baoTin} onThemVaoGio={them} />,
    );
    await screen.findByText('Phở bò tái');

    await fireEvent.press(screen.getByLabelText('Thêm Phở bò tái'));

    expect(them).toHaveBeenCalledWith('m2');
    expect(baoTin).toHaveBeenCalledWith('Đã thêm Phở bò tái vào giỏ');
  });

  it('món HẾT thì nút thêm bị khoá', async () => {
    await render(
      <MenuScreen
        api={apiVoi({
          categories: [{ categoryId: 'c1', name: 'Khai vị' }],
          items: [mon('m3', 'Đậu hũ chiên sả', { isAvailable: false })],
        })}
        imageBaseUrl={BASE_ANH}
        onThemVaoGio={jest.fn()}
      />,
    );
    await screen.findByText('Đậu hũ chiên sả');

    const nut = screen.getByLabelText('Thêm Đậu hũ chiên sả');
    expect(nut.props.accessibilityState?.disabled).toBe(true);
  });

  it('thêm hỏng thì báo câu lỗi ra ngoài, không im lặng', async () => {
    const baoTin = jest.fn();
    await render(
      <MenuScreen
        api={API_MAU}
        imageBaseUrl={BASE_ANH}
        onBaoTin={baoTin}
        onThemVaoGio={jest.fn().mockRejectedValue(new AuthException('X', 'Giỏ đầy rồi.'))}
      />,
    );
    await screen.findByText('Phở bò tái');

    await fireEvent.press(screen.getByLabelText('Thêm Phở bò tái'));

    expect(baoTin).toHaveBeenCalledWith('Giỏ đầy rồi.');
  });
});

describe('lỗi tải thực đơn', () => {
  it('hiện câu lỗi kèm nút thử lại, và thử lại thì gọi API lần nữa', async () => {
    let lanGoi = 0;
    const api: MenuApi = {
      thucDon: async () => {
        lanGoi++;
        if (lanGoi === 1) throw new AuthException('NETWORK_ERROR', 'Không kết nối được máy chủ.');
        return {
          categories: [{ categoryId: 'c1', name: 'Khai vị' }],
          items: [mon('m1', 'Gỏi cuốn')],
        };
      },
    };
    await render(<MenuScreen api={api} imageBaseUrl={BASE_ANH} />);

    await screen.findByText('Không kết nối được máy chủ.');
    await fireEvent.press(screen.getByText('Thử lại'));

    await screen.findByText('Gỏi cuốn');
    expect(lanGoi).toBe(2);
  });

  it('lỗi KHÔNG phải AuthException thì nổi lên, không nuốt', async () => {
    // Nuốt hết mọi lỗi biến một lỗi lập trình thành câu "Không tải được" vô nghĩa, và không ai
    // biết là có lỗi. `catch` của JavaScript bắt tất cả nên phải kiểm lại kiểu bằng tay.
    const api: MenuApi = {
      thucDon: async () => {
        throw new TypeError('đọc thuộc tính của undefined');
      },
    };

    await expect(render(<MenuScreen api={api} imageBaseUrl={BASE_ANH} />)).rejects.toThrow(
      TypeError,
    );
  });
});
