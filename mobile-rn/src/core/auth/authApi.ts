import { HEADER_JSON, type GoiMang, goiMangThat, maLoi } from '../mang/goiMang';
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
}

/** Gọi `/api/auth` của backend Java. */
export class HttpAuthApi implements AuthApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

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
function dichLoi(status: number, than: string): AuthException {
  switch (maLoi(than)) {
    case 'INVALID_CREDENTIALS':
      return new AuthException('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
    case 'EMAIL_INVALID':
      return new AuthException('EMAIL_INVALID', 'Email không hợp lệ.');
    case 'PASSWORD_REQUIRED':
      return new AuthException('PASSWORD_REQUIRED', 'Chưa nhập mật khẩu.');
  }

  if (status >= 500) {
    return new AuthException('SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
  }
  return new AuthException(maLoi(than) ?? 'UNKNOWN', `Đăng nhập không thành công (mã ${status}).`);
}
