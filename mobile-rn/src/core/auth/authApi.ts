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
  /**
   * Một ô nhập cho cả hai loại người dùng: khách gõ số điện thoại, nhân viên gõ email.
   *
   * Backend đọc trường `identifier`, KHÔNG đọc `email` — xem `AuthDtos.LoginRequest`. Gửi sai tên
   * thì Jackson để null và request chết ở 400 IDENTIFIER_REQUIRED trước cả bước kiểm mật khẩu.
   */
  dangNhap(dinhDanh: string, password: string): Promise<AuthSession>;
  /**
   * Đăng nhập bằng Google. Lần đầu thì backend tạo tài khoản luôn, không có bước đăng ký riêng.
   *
   * KHÔNG thay thế bước nối số điện thoại: Google chứng minh khách sở hữu một tài khoản Google,
   * nó không nói gì về số điện thoại, nên luật của màn Điểm thưởng giữ nguyên.
   */
  dangNhapGoogle(idToken: string): Promise<AuthSession>;
  /**
   * Tạo tài khoản bằng số điện thoại ĐÃ xác minh OTP, rồi đăng nhập luôn.
   *
   * Backend trả 201 kèm hồ sơ chứ KHÔNG kèm phiên, nên phải gọi tiếp `/login`. Gộp hai lượt vào
   * một hàm vì với khách đó là một hành động: bắt họ tự đăng nhập lại ngay sau khi vừa tạo tài
   * khoản là bắt gõ mật khẩu hai lần cho cùng một việc.
   *
   * KHÔNG có đường tạo tài khoản bằng email nữa. Backend chỉ nhận `phoneIdToken`, và số điện
   * thoại lấy TỪ token chứ không lấy từ thân request — điểm thưởng tính theo số, nên nhận một số
   * chưa xác minh nghĩa là cho người lạ chiếm hồ sơ điểm của khách quen.
   *
   * @param soDienThoai số vừa xác minh, dùng để đăng nhập ngay sau đó. Backend không trả số về
   *     trong phản hồi 201, và tài khoản tạo kiểu này không có email để đăng nhập thay.
   */
  dangKy(
    hoTen: string,
    phoneIdToken: string,
    soDienThoai: string,
    password: string,
  ): Promise<AuthSession>;
}

/** Gọi `/api/auth` của backend Java. */
export class HttpAuthApi implements AuthApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async dangKy(
    hoTen: string,
    phoneIdToken: string,
    soDienThoai: string,
    password: string,
  ): Promise<AuthSession> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: HEADER_JSON,
        body: JSON.stringify({ fullName: hoTen.trim(), phoneIdToken, password }),
      });
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    if (res.status !== 201) throw dichLoiDangKy(res.status, await res.text());

    return this.dangNhap(soDienThoai, password);
  }

  async dangNhapGoogle(idToken: string): Promise<AuthSession> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: HEADER_JSON,
        body: JSON.stringify({ idToken }),
      });
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }

    const than = await res.text();
    if (res.status === 200) {
      return authSessionTuJson(JSON.parse(than));
    }
    throw dichLoiGoogle(res.status, than);
  }

  async dangNhap(dinhDanh: string, password: string): Promise<AuthSession> {
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: HEADER_JSON,
        body: JSON.stringify({ identifier: dinhDanh, password }),
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
 * Lỗi đăng ký bằng số điện thoại.
 *
 * Ba mã cuối KHÔNG phải lỗi của khách và họ không tự sửa được. Bảo "thử lại" khi máy chủ chưa
 * cấu hình Firebase là bắt người ta ngồi bấm mãi một nút không bao giờ chạy.
 */
function dichLoiDangKy(status: number, than: string): AuthException {
  switch (maLoi(than)) {
    case 'PHONE_ALREADY_REGISTERED':
      // Nói rõ việc cần làm tiếp. "Số đã tồn tại" khiến khách gõ lại mãi một số họ vốn đã có
      // tài khoản.
      return new AuthException(
        'PHONE_ALREADY_REGISTERED',
        'Số này đã có tài khoản. Đăng nhập thay vì tạo mới nhé.',
      );
    case 'PASSWORD_TOO_SHORT':
      return new AuthException('PASSWORD_TOO_SHORT', 'Mật khẩu phải có ít nhất 8 ký tự.');
    case 'FULL_NAME_REQUIRED':
      return new AuthException('FULL_NAME_REQUIRED', 'Chưa nhập họ tên.');
    case 'PHONE_TOKEN_REQUIRED':
    case 'PHONE_TOKEN_INVALID':
      // Token OTP hết hạn hoặc sai. Cách thoát duy nhất là xin mã mới, nên nói đúng thế.
      return new AuthException(
        'PHONE_TOKEN_INVALID',
        'Mã xác minh đã hết hạn. Nhận mã mới rồi thử lại.',
      );
    case 'PHONE_VERIFY_NOT_CONFIGURED':
      return new AuthException(
        'PHONE_VERIFY_NOT_CONFIGURED',
        'Máy chủ này chưa bật đăng ký bằng số điện thoại.',
      );
    case 'PHONE_VERIFY_UNREACHABLE':
      return new AuthException(
        'PHONE_VERIFY_UNREACHABLE',
        'Máy chủ không liên hệ được dịch vụ xác minh. Thử lại sau ít phút.',
      );
  }

  const chung = loiChungHttp(status, maLoi(than), 'Tạo tài khoản không thành công');
  return new AuthException(chung.code, chung.message);
}

/**
 * Lỗi đăng nhập Google.
 *
 * Tách riêng vì hai ca ở đây khách KHÔNG tự sửa được, và nói sai thì họ sẽ ngồi thử lại mãi:
 * máy chủ chưa cấu hình client ID, và không liên hệ được Google. Câu chữ phải chỉ đúng ai cần
 * làm gì tiếp.
 */
function dichLoiGoogle(status: number, than: string): AuthException {
  switch (maLoi(than)) {
    case 'GOOGLE_NOT_CONFIGURED':
      // Lỗi của người dựng máy chủ, không phải của khách. Đừng bảo họ thử lại.
      return new AuthException(
        'GOOGLE_NOT_CONFIGURED',
        'Đăng nhập Google chưa được bật trên máy chủ này.',
      );
    case 'GOOGLE_UNREACHABLE':
      return new AuthException(
        'GOOGLE_UNREACHABLE',
        'Máy chủ không liên hệ được Google. Thử lại sau ít phút.',
      );
    case 'GOOGLE_TOKEN_INVALID':
    case 'GOOGLE_TOKEN_REQUIRED':
      return new AuthException(
        'GOOGLE_TOKEN_INVALID',
        'Đăng nhập Google không thành công. Thử lại.',
      );
  }

  const chung = loiChungHttp(status, maLoi(than), 'Đăng nhập Google không thành công');
  return new AuthException(chung.code, chung.message);
}

function dichLoi(status: number, than: string): AuthException {
  switch (maLoi(than)) {
    case 'INVALID_CREDENTIALS':
      return new AuthException(
        'INVALID_CREDENTIALS',
        'Số điện thoại, email hoặc mật khẩu không đúng.',
      );
    case 'IDENTIFIER_REQUIRED':
      return new AuthException('IDENTIFIER_REQUIRED', 'Chưa nhập số điện thoại hoặc email.');
    case 'PASSWORD_REQUIRED':
      return new AuthException('PASSWORD_REQUIRED', 'Chưa nhập mật khẩu.');
  }

  const chung = loiChungHttp(status, maLoi(than), 'Đăng nhập không thành công');
  return new AuthException(chung.code, chung.message);
}
