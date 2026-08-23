import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ServerSettingsScreen } from '../ServerSettingsScreen';

// `render` của @testing-library/react-native v14 là BẤT ĐỒNG BỘ — nó trả Promise, và `screen`
// chỉ được nối sau khi Promise đó xong. Quên `await` thì mọi truy vấn ném "render function has
// not been called", một thông báo dẫn người đọc đi tìm sai chỗ: nó nghe như chưa gọi render, chứ
// không nói rằng đã gọi nhưng chưa chờ.
//
// `fireEvent` cũng vậy. Quên `await` ở đó thì React báo "overlapping act() calls" và trạng
// thái chưa kịp cập nhật khi câu `expect` chạy — test đỏ với giá trị cũ, dễ bị đọc nhầm thành
// lỗi của màn hình.

const TRONG = { apiBaseUrl: '', imageBaseUrl: '' };

describe('màn hình máy chủ', () => {
  it('gõ địa chỉ API thì ô ảnh tự đi theo, đổi sang cổng 8080', async () => {
    await render(<ServerSettingsScreen hienTai={TRONG} onLuu={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText('Địa chỉ API'), '192.168.1.5');

    expect(screen.getByLabelText('Địa chỉ ảnh món').props.value).toBe('http://192.168.1.5:8080');
  });

  it('người dùng tự sửa ô ảnh rồi thì ô ảnh KHÔNG bị ghi đè nữa', async () => {
    // Ca dễ hỏng nhất của màn hình này. Thiếu nó, ai đó "đơn giản hoá" bằng cách luôn suy ô ảnh
    // từ ô API, và người triển khai khác cổng sẽ không bao giờ đặt được địa chỉ ảnh riêng.
    await render(<ServerSettingsScreen hienTai={TRONG} onLuu={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText('Địa chỉ ảnh món'), 'http://anh.rieng:9000');
    await fireEvent.changeText(screen.getByLabelText('Địa chỉ API'), '192.168.1.9');

    expect(screen.getByLabelText('Địa chỉ ảnh món').props.value).toBe('http://anh.rieng:9000');
  });

  it('lưu thì chuẩn hoá cả hai địa chỉ trước khi trả ra', async () => {
    const onLuu = jest.fn().mockResolvedValue(undefined);
    await render(<ServerSettingsScreen hienTai={TRONG} onLuu={onLuu} />);

    await fireEvent.changeText(screen.getByLabelText('Địa chỉ API'), '192.168.1.5');
    await fireEvent.press(screen.getByText('Lưu'));

    await waitFor(() =>
      expect(onLuu).toHaveBeenCalledWith({
        apiBaseUrl: 'http://192.168.1.5:8081',
        imageBaseUrl: 'http://192.168.1.5:8080',
      }),
    );
  });

  it('địa chỉ không hiểu được thì KHÔNG lưu, và nói ra', async () => {
    const onLuu = jest.fn();
    await render(<ServerSettingsScreen hienTai={TRONG} onLuu={onLuu} />);

    await fireEvent.changeText(screen.getByLabelText('Địa chỉ API'), 'http://a:8081/api/menu');
    await fireEvent.press(screen.getByText('Lưu'));

    await screen.findByText('Địa chỉ không hợp lệ.');
    expect(onLuu).not.toHaveBeenCalled();
  });

  it('kiểm tra kết nối gọi đúng /api/health và báo khi máy chủ trả lời', async () => {
    const goiMang = jest.fn().mockResolvedValue({ status: 200 });
    await render(<ServerSettingsScreen hienTai={TRONG} onLuu={jest.fn()} goiMang={goiMang} />);

    await fireEvent.changeText(screen.getByLabelText('Địa chỉ API'), '192.168.1.5');
    await fireEvent.press(screen.getByText('Kiểm tra kết nối'));

    await screen.findByText('Kết nối được. Máy chủ trả lời.');
    expect(goiMang).toHaveBeenCalledWith('http://192.168.1.5:8081/api/health', expect.anything());
  });

  it('mã khác 200 thì nói ra mã đó, không nói "kết nối được"', async () => {
    // 200 và "gọi tới nơi" là hai chuyện khác nhau. Một proxy trả 404 vẫn là gọi tới nơi, nhưng
    // app sẽ không dùng được máy chủ đó.
    await render(
      <ServerSettingsScreen
        hienTai={TRONG}
        onLuu={jest.fn()}
        goiMang={jest.fn().mockResolvedValue({ status: 404 })}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Địa chỉ API'), '192.168.1.5');
    await fireEvent.press(screen.getByText('Kiểm tra kết nối'));

    await screen.findByText('Máy chủ trả mã 404. Kiểm tra lại cổng.');
  });

  it('gọi hỏng thì kể ra cả ba nguyên nhân thật', async () => {
    await render(
      <ServerSettingsScreen
        hienTai={TRONG}
        onLuu={jest.fn()}
        goiMang={jest.fn().mockRejectedValue(new Error('mạng'))}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Địa chỉ API'), '192.168.1.5');
    await fireEvent.press(screen.getByText('Kiểm tra kết nối'));

    const loi = await screen.findByText(/Không gọi được/);
    expect(loi.props.children).toContain('wifi');
    expect(loi.props.children).toContain('IP');
    expect(loi.props.children).toContain('backend');
  });
});
