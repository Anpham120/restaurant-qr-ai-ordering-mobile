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
  async dangKy(): Promise<AuthSession> {
    return this.dangNhap();
  }
  async dangNhapGoogle(): Promise<AuthSession> {
    return this.dangNhap();
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
  dangKy(): Promise<AuthSession> {
    return this.cho;
  }
  dangNhapGoogle(): Promise<AuthSession> {
    return this.cho;
  }
  hoanThanh(s: AuthSession) {
    this.xong(s);
  }
}

// Tiêu đề màn hình và nhãn nút cùng là "Đăng nhập", nên tìm theo chữ sẽ khớp hai phần tử. Bản
// Flutter không gặp chuyện này vì nó tìm theo KIỂU widget. Tìm theo vai trò là bản tương đương
// gần nhất, và nó còn chốt luôn việc nút thật sự khai mình là nút cho trình đọc màn hình.
//
// Tên khớp CẢ hai trạng thái của nút gửi, để phép kiểm trạng thái "đang gửi" vẫn thấy nó.
function nutDangNhap() {
  return screen.getByRole('button', { name: /^(Đăng nhập|Đang đăng nhập…)$/ });
}

class ApiGhiLaiToken implements AuthApi {
  tokenDaNhan: string | null = null;
  constructor(private readonly ketQua: AuthSession) {}
  async dangNhap(): Promise<AuthSession> {
    return this.ketQua;
  }
  async dangKy(): Promise<AuthSession> {
    return this.ketQua;
  }
  async dangNhapGoogle(idToken: string): Promise<AuthSession> {
    this.tokenDaNhan = idToken;
    return this.ketQua;
  }
}

function repoVoi(api: AuthApi) {
  return new AuthRepository(api, new StoreGiaLap());
}

describe('màn hình đăng nhập', () => {
  it('sai mật khẩu thì hiện câu tiếng Việt và KHÔNG cho vào app', async () => {
    const xong = jest.fn();
    const repo = repoVoi(
      new ApiGiaLap(
        new AuthException('INVALID_CREDENTIALS', 'Số điện thoại, email hoặc mật khẩu không đúng.'),
      ),
    );
    await render(<LoginScreen repository={repo} onDangNhapXong={xong} />);

    await fireEvent.changeText(screen.getByLabelText('Số điện thoại hoặc email'), '0901234567');
    await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'sai');
    await fireEvent.press(nutDangNhap());

    await screen.findByText('Số điện thoại, email hoặc mật khẩu không đúng.');
    expect(xong).not.toHaveBeenCalled();
  });

  it('đăng nhập đúng thì báo phiên ra ngoài', async () => {
    const xong = jest.fn();
    await render(
      <LoginScreen repository={repoVoi(new ApiGiaLap(PHIEN_HOP_LE))} onDangNhapXong={xong} />,
    );

    await fireEvent.changeText(screen.getByLabelText('Số điện thoại hoặc email'), '0901234567');
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

describe('KHÔNG còn đường tạo tài khoản bằng email', () => {
  // Trước đây màn này có nút "Chưa có tài khoản? Tạo mới" mở ra form họ tên + email + mật khẩu.
  // Backend đã bỏ hẳn đường đó: `/api/auth/register` chỉ nhận `phoneIdToken`, nên nút cũ gửi lên
  // và nhận về 400 PHONE_TOKEN_REQUIRED MỌI lần — không ca nào chạy được.
  //
  // Ba phép kiểm cũ ở đây kiểm rất kỹ một luồng đã chết, và chúng xanh suốt vì chúng chỉ nói
  // chuyện với một AuthApi giả lập. Xoá đi, giữ lại một ca canh chiều ngược lại: form đó mà quay
  // về thì phải có người cố ý mang nó về, chứ không phải lẫn vào trong một lần sửa khác.
  it('không có ô họ tên và không có nút chuyển sang đăng ký', async () => {
    await render(
      <LoginScreen repository={repoVoi(new ApiGiaLap(PHIEN_HOP_LE))} onDangNhapXong={jest.fn()} />,
    );

    expect(screen.queryByLabelText('Họ tên')).toBeNull();
    expect(screen.queryByText('Chưa có tài khoản? Tạo mới')).toBeNull();
  });
});

describe('đăng nhập bằng Google', () => {
  const PHIEN: AuthSession = {
    accessToken: 'jwt-google',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    user: { userId: 'usr_1', fullName: 'An Phạm', email: 'an@gmail.com', role: 'Customer' },
  };

  function nutGoogle() {
    return screen.getByLabelText('Tiếp tục với Google');
  }

  it('KHÔNG hiện nút khi máy chủ chưa bật Google', async () => {
    // Nút bấm không ra gì tệ hơn không có nút: khách bấm, không thấy phản ứng, kết luận app hỏng.
    await render(
      <LoginScreen repository={repoVoi(new ApiGiaLap(PHIEN))} onDangNhapXong={jest.fn()} />,
    );

    expect(screen.queryByLabelText('Tiếp tục với Google')).toBeNull();
  });

  it('lấy được token thì vào app', async () => {
    const xong = jest.fn();
    await render(
      <LoginScreen
        layTokenGoogle={async () => 'id-token-tu-google'}
        onDangNhapXong={xong}
        repository={repoVoi(new ApiGiaLap(PHIEN))}
      />,
    );

    await fireEvent.press(nutGoogle());

    expect(xong).toHaveBeenCalledWith(PHIEN);
  });

  it('gửi ĐÚNG token nhận từ Google, không phải chuỗi nào khác', async () => {
    const api = new ApiGhiLaiToken(PHIEN);
    await render(
      <LoginScreen
        layTokenGoogle={async () => 'id-token-tu-google'}
        onDangNhapXong={jest.fn()}
        repository={repoVoi(api)}
      />,
    );

    await fireEvent.press(nutGoogle());

    expect(api.tokenDaNhan).toBe('id-token-tu-google');
  });

  it('khách bấm huỷ thì KHÔNG báo lỗi và KHÔNG vào app', async () => {
    // Huỷ là đổi ý, không phải hỏng. Hiện câu đỏ ở đây là phạt khách vì đã đổi ý.
    const xong = jest.fn();
    await render(
      <LoginScreen
        layTokenGoogle={async () => null}
        onDangNhapXong={xong}
        repository={repoVoi(new ApiGiaLap(PHIEN))}
      />,
    );

    await fireEvent.press(nutGoogle());

    expect(xong).not.toHaveBeenCalled();
    expect(screen.queryByText(/không thành công|không hợp lệ|lỗi/i)).toBeNull();
  });

  it('máy chủ chưa cấu hình thì nói rõ là lỗi máy chủ, không bảo khách thử lại', async () => {
    const api = new ApiGiaLap(
      new AuthException(
        'GOOGLE_NOT_CONFIGURED',
        'Đăng nhập Google chưa được bật trên máy chủ này.',
      ),
    );
    await render(
      <LoginScreen
        layTokenGoogle={async () => 'id-token-tu-google'}
        onDangNhapXong={jest.fn()}
        repository={repoVoi(api)}
      />,
    );

    await fireEvent.press(nutGoogle());

    expect(screen.getByText('Đăng nhập Google chưa được bật trên máy chủ này.')).toBeTruthy();
  });

  it('nói TRƯỚC rằng Google không tự mang điểm cũ sang', async () => {
    // Không nói thì khách đăng nhập xong thấy 0 điểm và tưởng hệ thống nuốt mất điểm của mình.
    await render(
      <LoginScreen
        layTokenGoogle={async () => 'x'}
        onDangNhapXong={jest.fn()}
        repository={repoVoi(new ApiGiaLap(PHIEN))}
      />,
    );

    expect(screen.getByText(/liên kết số điện thoại/)).toBeTruthy();
  });
});
