import { HEADER_JSON, type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type AuthSession, authSessionTuJson } from './authSession';

/** Lỗi đăng nhập đã dịch sang câu người dùng đọc được, kèm mã ổn định để mã nguồn phân nhánh. */
export class AuthException extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthException';
  }
}

export interface AuthApi {
  dangNhap(email: string, password: string): Promise<AuthSession>;
  /**
   * Tạo tài khoản rồi đăng nhập luôn.
   *
   * Backend trả 201 kèm hồ sơ chứ KHÔNG kèm phiên, nên phải gọi tiếp `/login`. Gộp hai lượt vào
   * một hàm vì với khách đó là một hành động: bắt họ tự đăng nhập lại ngay sau khi vừa tạo tài
   * khoản là bắt gõ mật khẩu hai lần cho cùng một việc.
   */
  dangKy(hoTen: string, email: string, password: string): Promise<AuthSession>;
}

/** Gọi `/api/auth` của backend Java. */
export class HttpAuthApi implements AuthApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async dangKy(hoTen: string, email: string, password: string): Promise<AuthSession> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: HEADER_JSON,
        body: JSON.stringify({ fullName: hoTen.trim(), email: email.trim(), password }),
      });
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    if (res.status !== 201) throw dichLoiDangKy(res.status, await res.text());

    // Đăng nhập bằng chính chuỗi khách vừa gõ, không dùng bản đã cắt khoảng trắng của email ở
    // trên: nếu backend chuẩn hoá email khác cách app cắt, lượt đăng nhập này phải hỏng ngay ở
    // đây chứ không im lặng cho ra một phiên của tài khoản khác.
    return this.dangNhap(email, password);
  }

  async dangNhap(email: string, password: string): Promise<AuthSession> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: HEADER_JSON,
        body: JSON.stringify({ email, password }),
      });
    } catch {
      // Mất mạng trong quán là chuyện thường. Phân biệt rõ với sai mật khẩu: bảo khách kiểm tra
      // lại mật khẩu trong khi thực ra rớt wifi là cách nhanh nhất khiến họ đổi mật khẩu vô ích.
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    const than = await res.text();
    if (res.status === 200) {
      return authSessionTuJson(JSON.parse(than));
    }
    throw dichLoi(res.status, than);
  }
}

/**
 * Dịch lỗi theo **mã**, không hiển thị `message` của máy chủ.
 *
 * Chuỗi đó bằng tiếng Anh và viết cho lập trình viên ("Email or password is incorrect."). Mã là
 * phần backend cam kết giữ ổn định; câu chữ thì không.
 */
/**
 * Lỗi đăng ký. Tách khỏi {@link dichLoi} vì cùng một mã nói hai chuyện khác nhau ở hai màn hình:
 * `EMAIL_INVALID` lúc đăng nhập là "gõ nhầm email", lúc đăng ký là "email này không dùng được".
 */
function dichLoiDangKy(status: number, than: string): AuthException {
  switch (maLoi(than)) {
    case 'EMAIL_ALREADY_REGISTERED':
      // Nói rõ việc cần làm tiếp. "Email đã tồn tại" khiến khách gõ lại mãi một email họ vốn đã
      // có tài khoản.
      return new AuthException(
        'EMAIL_ALREADY_REGISTERED',
        'Email này đã có tài khoản. Đăng nhập thay vì tạo mới nhé.',
      );
    case 'PASSWORD_TOO_SHORT':
      return new AuthException('PASSWORD_TOO_SHORT', 'Mật khẩu phải có ít nhất 8 ký tự.');
    case 'EMAIL_INVALID':
      return new AuthException('EMAIL_INVALID', 'Email không hợp lệ.');
  }

  const chung = loiChungHttp(status, maLoi(than), 'Tạo tài khoản không thành công');
  return new AuthException(chung.code, chung.message);
}

function dichLoi(status: number, than: string): AuthException {
  switch (maLoi(than)) {
    case 'INVALID_CREDENTIALS':
      return new AuthException('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
    case 'EMAIL_INVALID':
      return new AuthException('EMAIL_INVALID', 'Email không hợp lệ.');
    case 'PASSWORD_REQUIRED':
      return new AuthException('PASSWORD_REQUIRED', 'Chưa nhập mật khẩu.');
  }

  const chung = loiChungHttp(status, maLoi(than), 'Đăng nhập không thành công');
  return new AuthException(chung.code, chung.message);
}
