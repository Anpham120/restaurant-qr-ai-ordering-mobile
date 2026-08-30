import { fireEvent, render, screen } from '@testing-library/react-native';

import { type AuthApi, AuthException } from '../../core/auth/authApi';
import { AuthRepository } from '../../core/auth/authRepository';
import { type AuthSession } from '../../core/auth/authSession';
import { type GuiMaOtp } from '../../core/auth/phoneOtp';
import { type TokenStore } from '../../core/auth/tokenStore';
import { DangKySoDienThoai } from '../DangKySoDienThoai';

const PHIEN: AuthSession = {
  accessToken: 'jwt',
  expiresAt: '2030-01-01T00:00:00.000Z',
  user: { userId: 'u1', fullName: 'Nguyễn Văn A', email: null, role: 'Customer' },
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

/** Ghi lại ĐÚNG bốn tham số màn hình đưa xuống — đó là thứ dễ lắp nhầm thứ tự nhất. */
class ApiGhiLai implements AuthApi {
  nhan: { hoTen?: string; token?: string; so?: string; matKhau?: string } = {};

  constructor(private readonly ketQua: AuthSession | AuthException) {}

  async dangKy(hoTen: string, phoneIdToken: string, so: string, matKhau: string) {
    this.nhan = { hoTen, token: phoneIdToken, so, matKhau };
    if (this.ketQua instanceof AuthException) throw this.ketQua;
    return this.ketQua;
  }
  async dangNhap(): Promise<AuthSession> {
    if (this.ketQua instanceof AuthException) throw this.ketQua;
    return this.ketQua;
  }
  async dangNhapGoogle(): Promise<AuthSession> {
    throw new Error('không dùng');
  }
}

function otpGia(token = 'tok-firebase'): GuiMaOtp {
  return async () => ({ xacNhan: async () => token });
}

function dung(api: AuthApi, guiMaOtp: GuiMaOtp, onXong = jest.fn()) {
  return {
    onXong,
    cay: (
      <DangKySoDienThoai
        guiMaOtp={guiMaOtp}
        onDangKyXong={onXong}
        onQuayLai={jest.fn()}
        repository={new AuthRepository(api, new StoreGiaLap())}
      />
    ),
  };
}

async function dienBuocMot(so = '0901234567', matKhau = 'MatKhau#123') {
  await fireEvent.changeText(screen.getByLabelText('Họ tên'), '  Nguyễn Văn A  ');
  await fireEvent.changeText(screen.getByLabelText('Số điện thoại'), so);
  await fireEvent.changeText(screen.getByLabelText('Mật khẩu'), matKhau);
  await fireEvent.press(screen.getByRole('button', { name: /Nhận mã xác minh/ }));
}

describe('tạo tài khoản bằng số điện thoại', () => {
  it('đi hết hai bước thì gọi dangKy với ĐÚNG bốn tham số', async () => {
    // Bốn tham số cùng kiểu chuỗi, nên lắp nhầm thứ tự vẫn biên dịch được: token đi vào ô số điện
    // thoại, mật khẩu đi vào ô token. Backend sẽ trả PHONE_TOKEN_INVALID và câu lỗi đổ cho
    // Firebase, trong khi lỗi nằm ở một dòng gọi hàm.
    const api = new ApiGhiLai(PHIEN);
    const { cay, onXong } = dung(api, otpGia('tok-abc'));
    await render(cay);

    await dienBuocMot();
    await fireEvent.changeText(screen.getByLabelText('Mã xác minh'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: /^Tạo tài khoản$/ }));

    expect(api.nhan.token).toBe('tok-abc');
    expect(api.nhan.so).toBe('0901234567');
    expect(api.nhan.matKhau).toBe('MatKhau#123');
    // Bàn phím di động chèn dấu cách sau khi gợi ý; họ tên phải tới backend đã cắt sạch.
    expect(api.nhan.hoTen).toBe('Nguyễn Văn A');
    expect(onXong).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'jwt' }));
  });

  it('số sai định dạng thì KHÔNG gửi mã, báo tại chỗ', async () => {
    // Để Firebase từ chối thì khách đợi một vòng mạng để nhận câu tiếng Anh nói "invalid phone
    // number" — nghe như số của họ sai, trong khi thường là app quên đổi sang dạng +84.
    let daGoi = false;
    const otp: GuiMaOtp = async () => {
      daGoi = true;
      return { xacNhan: async () => 'x' };
    };
    await render(dung(new ApiGhiLai(PHIEN), otp).cay);

    await dienBuocMot('123');

    expect(daGoi).toBe(false);
    expect(screen.getByText(/Số điện thoại không hợp lệ/)).toBeTruthy();
    // Vẫn ở bước một: ô nhập mã chưa được hiện ra.
    expect(screen.queryByLabelText('Mã xác minh')).toBeNull();
  });

  it('mật khẩu ngắn thì chặn TRƯỚC khi tốn một tin nhắn', async () => {
    // Để backend trả PASSWORD_TOO_SHORT thì khách đã tiêu mất một mã OTP cho một lỗi thấy được
    // ngay từ đầu.
    let daGoi = false;
    const otp: GuiMaOtp = async () => {
      daGoi = true;
      return { xacNhan: async () => 'x' };
    };
    await render(dung(new ApiGhiLai(PHIEN), otp).cay);

    await dienBuocMot('0901234567', 'ngan');

    expect(daGoi).toBe(false);
    expect(screen.getByText('Mật khẩu phải có ít nhất 8 ký tự.')).toBeTruthy();
  });

  it('lỗi của máy chủ hiện nguyên câu đã dịch, không thay bằng câu "mã sai"', async () => {
    // "Số này đã có tài khoản. Đăng nhập thay vì tạo mới nhé." là lời khuyên cụ thể. Thay nó bằng
    // "mã xác minh không đúng" khiến khách xin mã mới mãi cho một việc không bao giờ chạy.
    const api = new ApiGhiLai(
      new AuthException('PHONE_ALREADY_REGISTERED', 'Số này đã có tài khoản. Đăng nhập thay vì tạo mới nhé.'),
    );
    await render(dung(api, otpGia()).cay);

    await dienBuocMot();
    await fireEvent.changeText(screen.getByLabelText('Mã xác minh'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: /^Tạo tài khoản$/ }));

    expect(screen.getByText('Số này đã có tài khoản. Đăng nhập thay vì tạo mới nhé.')).toBeTruthy();
  });

  it('mã sai thì báo mã sai, và VẪN Ở bước nhập mã để thử lại', async () => {
    const otp: GuiMaOtp = async () => ({
      xacNhan: async () => {
        throw new Error('auth/invalid-verification-code');
      },
    });
    await render(dung(new ApiGhiLai(PHIEN), otp).cay);

    await dienBuocMot();
    await fireEvent.changeText(screen.getByLabelText('Mã xác minh'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: /^Tạo tài khoản$/ }));

    expect(screen.getByText(/Mã xác minh không đúng hoặc đã hết hạn/)).toBeTruthy();
    // Đá về bước một ở đây nghĩa là bắt khách gõ lại toàn bộ form vì gõ nhầm một chữ số.
    expect(screen.getByLabelText('Mã xác minh')).toBeTruthy();
  });

  it('ô mật khẩu che ký tự và không đưa vào từ điển bàn phím', async () => {
    await render(dung(new ApiGhiLai(PHIEN), otpGia()).cay);

    const o = screen.getByLabelText('Mật khẩu');
    expect(o.props.secureTextEntry).toBe(true);
    expect(o.props.autoCorrect).toBe(false);
    expect(o.props.autoCapitalize).toBe('none');
  });
});
