import { fireEvent, render, screen } from '@testing-library/react-native';

import { type AuthApi, AuthException } from '../../core/auth/authApi';
import { AuthRepository } from '../../core/auth/authRepository';
import { type AuthSession } from '../../core/auth/authSession';
import { type TokenStore } from '../../core/auth/tokenStore';
import { LoginScreen } from '../LoginScreen';

const PHIEN_HOP_LE: AuthSession = {
  accessToken: 'jwt',
  expiresAt: '2030-01-01T00:00:00.000Z',
  user: { userId: 'u1', fullName: 'Nguyễn Văn A', email: 'a@example.com', role: 'Customer' },
};

class StoreGiaLap implements TokenStore {
  private dang: AuthSession | null = null;
  async doc() {
    return this.dang;
  }
  async luu(s: AuthSession) {
    this.dang = s;
  }
  async xoa() {
    this.dang = null;
  }
}

class ApiGiaLap implements AuthApi {
  constructor(private readonly ketQua: AuthSession | AuthException) {}
  async dangNhap(): Promise<AuthSession> {
    if (this.ketQua instanceof AuthException) throw this.ketQua;
    return this.ketQua;
  }
}

/**
 * Giả lập KHÔNG BAO GIỜ tự trả lời — người kiểm quyết định lúc nào lời gọi kết thúc.
 *
 * Cần thứ này để nhìn thấy trạng thái "đang gửi". Bản giả lập thường trả về ngay trong cùng một
 * microtask, nên tới lúc test đọc giao diện thì việc đã xong và trạng thái đang-gửi chưa từng
 * tồn tại — tức phép kiểm đang soi một khoảnh khắc mà chính nó xoá mất.
 */
class ApiTreo implements AuthApi {
  private xong!: (s: AuthSession) => void;
  private readonly cho = new Promise<AuthSession>((res) => {
    this.xong = res;
  });
  dangNhap(): Promise<AuthSession> {
    return this.cho;
  }
  hoanThanh(s: AuthSession) {
    this.xong(s);
  }
}

// Tiêu đề màn hình và nhãn nút cùng là "Đăng nhập", nên tìm theo chữ sẽ khớp hai phần tử. Bản
// Flutter không gặp chuyện này vì nó tìm theo KIỂU widget. Tìm theo vai trò là bản tương đương
// gần nhất, và nó còn chốt luôn việc nút thật sự khai mình là nút cho trình đọc màn hình.
function nutDangNhap() {
  return screen.getByRole('button');
}

function repoVoi(api: AuthApi) {
  return new AuthRepository(api, new StoreGiaLap());
}

describe('màn hình đăng nhập', () => {
  it('sai mật khẩu thì hiện câu tiếng Việt và KHÔNG cho vào app', async () => {
    const xong = jest.fn();
    const repo = repoVoi(
      new ApiGiaLap(new AuthException('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.')),
    );
    await render(<LoginScreen repository={repo} onDangNhapXong={xong} />);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@example.com');
    await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'sai');
    await fireEvent.press(nutDangNhap());

    await screen.findByText('Email hoặc mật khẩu không đúng.');
    expect(xong).not.toHaveBeenCalled();
  });

  it('đăng nhập đúng thì báo phiên ra ngoài', async () => {
    const xong = jest.fn();
    await render(
      <LoginScreen repository={repoVoi(new ApiGiaLap(PHIEN_HOP_LE))} onDangNhapXong={xong} />,
    );

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@example.com');
    await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'matkhau12345');
    await fireEvent.press(nutDangNhap());

    expect(xong).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'jwt' }));
  });

  it('ô mật khẩu che ký tự và không đưa vào từ điển bàn phím', async () => {
    // Ba thuộc tính này dễ bị tắt lúc gỡ lỗi rồi quên bật lại. Bàn phím di động lưu từ đã gõ để
    // gợi ý, nên mật khẩu nằm trong từ điển cá nhân và bật lên ở ô nhập của app khác.
    await render(
      <LoginScreen repository={repoVoi(new ApiGiaLap(PHIEN_HOP_LE))} onDangNhapXong={jest.fn()} />,
    );

    const o = screen.getByLabelText('Mật khẩu');
    expect(o.props.secureTextEntry).toBe(true);
    expect(o.props.autoCorrect).toBe(false);
    expect(o.props.autoCapitalize).toBe('none');
  });

  it('đang gửi thì khoá nút, không cho bấm hai lần', async () => {
    // Bấm hai lần lúc mạng chậm tạo hai lượt đăng nhập song song; lượt về sau ghi đè phiên của
    // lượt trước. Vô hại ở màn này nhưng là thói quen sai khi sang màn tạo đơn.
    const api = new ApiTreo();
    await render(<LoginScreen repository={repoVoi(api)} onDangNhapXong={jest.fn()} />);

    // KHÔNG await lời bấm này. `fireEvent` chờ act() chạy hết, mà API ở đây cố tình treo, nên
    // await sẽ treo theo tới lúc test hết giờ. Bản Flutter tránh được vì `tap` rồi `pump()`
    // không chờ việc xong. Đây đúng là khoảnh khắc cần soi: giữa lúc lời gọi còn đang bay.
    void fireEvent.press(nutDangNhap());

    await screen.findByText('Đang đăng nhập…');
    expect(nutDangNhap().props.accessibilityState?.disabled).toBe(true);

    api.hoanThanh(PHIEN_HOP_LE);
  });
});
