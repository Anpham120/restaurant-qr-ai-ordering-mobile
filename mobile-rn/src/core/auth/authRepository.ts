import { type AuthApi } from './authApi';
import { type AuthSession, conHieuLuc } from './authSession';
import { type TokenStore } from './tokenStore';

/** Ghép lời gọi mạng với chỗ cất token, và giữ toàn bộ luật về vòng đời phiên ở một nơi. */
export class AuthRepository {
  constructor(
    private readonly api: AuthApi,
    private readonly store: TokenStore,
    /** Tiêm được để kiểm chuyện hết hạn mà không phải chờ thật. */
    private readonly bayGio: () => Date = () => new Date(),
  ) {}

  async dangNhap(dinhDanh: string, password: string): Promise<AuthSession> {
    // `trim()` vì bàn phím di động tự chèn dấu cách sau khi gợi ý email, và backend so khớp
    // nguyên văn — một dấu cách vô hình thành "sai mật khẩu" không giải thích được.
    const session = await this.api.dangNhap(dinhDanh.trim(), password);
    await this.store.luu(session);
    return session;
  }

  /**
   * Đăng nhập bằng Google rồi cất phiên, y như hai đường kia.
   *
   * Không `trim()` gì cả: token do thư viện Google trả về, không phải thứ khách gõ tay.
   */
  async dangNhapGoogle(idToken: string): Promise<AuthSession> {
    const session = await this.api.dangNhapGoogle(idToken);
    await this.store.luu(session);
    return session;
  }

  /**
   * Tạo tài khoản bằng số điện thoại đã xác minh OTP, rồi cất phiên y như đăng nhập.
   *
   * Cùng một `trim()` cho số: khách vừa tạo tài khoản mà không đăng nhập được vì một dấu cách
   * vô hình là cách tệ nhất để mở đầu. KHÔNG `trim()` token — nó do Firebase trả về, không phải
   * thứ khách gõ tay, và cắt xén một chuỗi ký là làm hỏng chữ ký.
   */
  async dangKy(
    hoTen: string,
    phoneIdToken: string,
    soDienThoai: string,
    password: string,
  ): Promise<AuthSession> {
    const session = await this.api.dangKy(
      hoTen.trim(),
      phoneIdToken,
      soDienThoai.trim(),
      password,
    );
    await this.store.luu(session);
    return session;
  }

  /**
   * Khôi phục phiên lúc mở app.
   *
   * Token hết hạn thì **XOÁ khỏi máy** rồi mới trả `null`. Chỉ trả `null` mà để nguyên là giữ lại
   * một chuỗi bí mật vô dụng: không đăng nhập được nữa nhưng vẫn đọc được nếu máy rơi vào tay
   * người khác. Không có lý do gì để giữ.
   */
  async khoiPhuc(): Promise<AuthSession | null> {
    const session = await this.store.doc();
    if (session === null) return null;
    if (!conHieuLuc(session, this.bayGio())) {
      await this.store.xoa();
      return null;
    }
    return session;
  }

  dangXuat(): Promise<void> {
    return this.store.xoa();
  }
}
