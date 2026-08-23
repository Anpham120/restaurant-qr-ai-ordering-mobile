import { type KhoAnToan, khoThietBi } from '../luuTruAnToan';
import { type AuthSession, authSessionTuJson } from './authSession';

/**
 * Nơi cất phiên đăng nhập.
 *
 * Tách thành interface để phần quyết định (hết hạn thì xoá, đăng xuất thì xoá) kiểm được mà không
 * cần thiết bị thật: kho an toàn chạy qua tầng native, trong `jest` nó không có Keychain/Keystore
 * nào để nói chuyện.
 */
export interface TokenStore {
  luu(session: AuthSession): Promise<void>;
  doc(): Promise<AuthSession | null>;
  xoa(): Promise<void>;
}

export class SecureTokenStore implements TokenStore {
  private static readonly KHOA = 'auth_session_v1';

  constructor(private readonly kho: KhoAnToan = khoThietBi) {}

  luu(session: AuthSession): Promise<void> {
    return this.kho.ghi(SecureTokenStore.KHOA, JSON.stringify(session));
  }

  async doc(): Promise<AuthSession | null> {
    const raw = await this.kho.doc(SecureTokenStore.KHOA);
    if (raw === null) return null;
    try {
      return authSessionTuJson(JSON.parse(raw));
    } catch {
      // Dữ liệu hỏng hoặc từ phiên bản cũ. Xoá thay vì để app kẹt ở màn hình trắng mỗi lần mở:
      // người dùng không có cách nào tự dọn Keychain.
      await this.xoa();
      return null;
    }
  }

  xoa(): Promise<void> {
    return this.kho.xoa(SecureTokenStore.KHOA);
  }
}
