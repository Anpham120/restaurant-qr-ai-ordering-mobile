import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type Promotion } from '../../core/promotions/promotion';
import { type PromotionApi } from '../../core/promotions/promotionApi';
import { PromotionsScreen } from '../PromotionsScreen';

function km(tuyChon: Partial<Promotion> = {}): Promotion {
  return {
    code: 'GIAM10',
    name: 'Giảm 10% cuối tuần',
    description: null,
    type: 'Percentage',
    discountValue: 10,
    minOrderAmount: null,
    maxDiscountAmount: null,
    isFlashSale: false,
    endsAt: null,
    ...tuyChon,
  };
}

const apiVoi = (ds: Promotion[]): PromotionApi => ({ dangChay: async () => ds });

describe('màn hình khuyến mãi', () => {
  it('hiện tên, MÃ và mức giảm', async () => {
    // Mã là thứ khách phải gõ lại lúc đặt, nên nó phải hiện rõ chứ không nằm trong mô tả.
    await render(<PromotionsScreen api={apiVoi([km()])} />);

    await screen.findByText('Giảm 10% cuối tuần');
    expect(screen.getByText('GIAM10')).toBeTruthy();
    expect(screen.getByText('Giảm 10%')).toBeTruthy();
  });

  it('hiện điều kiện tối thiểu DÙ giỏ chưa đủ tiền', async () => {
    // Backend cố ý vẫn trả mã trong tình huống đó. Giấu ngưỡng là giấu đúng thông tin khách cần
    // để quyết định gọi thêm món.
    await render(<PromotionsScreen api={apiVoi([km({ minOrderAmount: 200000 })])} />);

    await screen.findByText('Đơn từ 200.000đ');
  });

  it('gắn nhãn FLASH cho khuyến mãi giờ vàng', async () => {
    await render(<PromotionsScreen api={apiVoi([km({ isFlashSale: true })])} />);

    await screen.findByText('FLASH');
  });

  it('khuyến mãi thường KHÔNG có nhãn FLASH', async () => {
    await render(<PromotionsScreen api={apiVoi([km()])} />);

    await screen.findByText('GIAM10');
    expect(screen.queryByText('FLASH')).toBeNull();
  });

  it('chưa có khuyến mãi nào thì nói rõ, không để trống', async () => {
    await render(<PromotionsScreen api={apiVoi([])} />);

    await screen.findByText('Hiện chưa có khuyến mãi nào đang chạy.');
  });

  it('lỗi mạng thì hiện câu lỗi kèm nút thử lại', async () => {
    let lan = 0;
    const api: PromotionApi = {
      dangChay: async () => {
        lan++;
        if (lan === 1) throw new AuthException('NETWORK_ERROR', 'Không kết nối được máy chủ.');
        return [km()];
      },
    };
    await render(<PromotionsScreen api={api} />);

    await screen.findByText('Không kết nối được máy chủ.');
    await fireEvent.press(screen.getByText('Thử lại'));

    await screen.findByText('GIAM10');
  });
});
