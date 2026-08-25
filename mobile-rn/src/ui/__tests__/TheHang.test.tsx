import { render, screen } from '@testing-library/react-native';

import { type MyLoyalty } from '../../core/loyalty/loyalty';
import { TheHang } from '../TheHang';

function mau(them: Partial<MyLoyalty>): MyLoyalty {
  return {
    linked: true,
    phoneNumber: '0901234567',
    points: 320,
    availableRewards: [],
    hang: 'BAC',
    tenHang: 'Bạc',
    chiTieu12Thang: 1_000_000,
    tenHangKeTiep: 'Vàng',
    conThieu: 4_000_000,
    ...them,
  };
}

describe('Thẻ hạng thành viên', () => {
  it('hiện hạng, điểm và số tiền còn thiếu', async () => {
    await render(<TheHang diem={mau({})} />);

    expect(screen.getByText('Bạc')).toBeTruthy();
    expect(screen.getByText('320')).toBeTruthy();
    expect(screen.getByText(/Chi thêm .* để lên hạng Vàng/)).toBeTruthy();
  });

  it('tiến độ tính từ conThieu, không từ ngưỡng chép sẵn trong app', async () => {
    // Cố ý lấy chặng Vàng -> Kim cương (ngưỡng 15 triệu) chứ không lấy chặng Bạc -> Vàng. Ngưỡng
    // của chặng đầu là 5 triệu, đúng bằng con số mà một bản cài sai sẽ chép cứng vào app — nên
    // dùng chặng đó thì phép kiểm này không thể đỏ.
    // Đã chi 6 triệu, còn thiếu 9 triệu -> ngưỡng 15 triệu -> đi được 40%.
    await render(
      <TheHang
        diem={mau({
          hang: 'VANG',
          tenHang: 'Vàng',
          chiTieu12Thang: 6_000_000,
          tenHangKeTiep: 'Kim cương',
          conThieu: 9_000_000,
        })}
      />,
    );

    expect(screen.getByLabelText('Tiến độ lên hạng: 40%')).toBeTruthy();
  });

  it('hạng cao nhất thì thanh đầy và không mời lên hạng nữa', async () => {
    await render(
      <TheHang
        diem={mau({
          hang: 'KIM_CUONG',
          tenHang: 'Kim cương',
          chiTieu12Thang: 20_000_000,
          tenHangKeTiep: null,
          conThieu: 0,
        })}
      />,
    );

    expect(screen.getByText('Bạn đang ở hạng cao nhất.')).toBeTruthy();
    expect(screen.getByLabelText('Tiến độ lên hạng: 100%')).toBeTruthy();
    expect(screen.queryByText(/để lên hạng/)).toBeNull();
  });

  it('thành viên mới chưa chi đồng nào thì thanh ở 0%, không phải NaN', async () => {
    // chiTieu12Thang = 0 và conThieu = 0 cùng lúc là trạng thái thật: một tài khoản vừa liên kết
    // số, backend chưa có hồ sơ tích điểm. Phép chia 0/0 ở đây cho NaN, và `width: "NaN%"` làm
    // thanh biến mất chứ không báo lỗi.
    await render(<TheHang diem={mau({ chiTieu12Thang: 0, conThieu: 0, tenHangKeTiep: 'Vàng' })} />);

    expect(screen.getByLabelText('Tiến độ lên hạng: 0%')).toBeTruthy();
  });
});
