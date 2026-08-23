import { type AuthRepository } from '../auth/authRepository';
import { type TableSession, conHieuLuc } from './tableSession';
import { type TableSessionApi } from './tableSessionApi';
import { type TableSessionStore } from './tableSessionStore';

/** Mở phiên bàn, tự đính token của khách nếu đang đăng nhập. */
export class TableSessionRepository {
  constructor(
    private readonly api: TableSessionApi,
    private readonly store: TableSessionStore,
    private readonly auth: AuthRepository,
    private readonly bayGio: () => Date = () => new Date(),
  ) {}

  /**
   * Mở hoặc tiếp tục phiên cho mã QR đã quét.
   *
   * Token của khách lấy qua `AuthRepository.khoiPhuc` chứ không cache riêng: hàm đó đã mang sẵn
   * luật "hết hạn thì xoá". Giữ một bản sao token ở đây sẽ tạo ra một đường vòng lặng lẽ dùng
   * token đã chết.
   *
   * Chưa đăng nhập thì vẫn mở phiên bình thường — app phải dùng được cho khách vãng lai, đúng như
   * web. Chỉ khác: phiên đó không gắn tài khoản nào.
   */
  async moPhien(qrToken: string, tableCode?: string | null): Promise<TableSession> {
    const phienDangNhap = await this.auth.khoiPhuc();
    const phien = await this.api.moPhien(qrToken.trim(), {
      tableCode: tableCode?.trim() ?? null,
      accessToken: phienDangNhap?.accessToken ?? null,
    });
    await this.store.luu(phien);
    return phien;
  }

  /**
   * Khôi phục phiên bàn lúc mở lại app.
   *
   * Hết hạn thì XOÁ rồi mới trả `null` — cùng luật với phiên đăng nhập. `tableSessionToken` là
   * một chìa khoá năng lực: nó cho phép xem đơn và hoá đơn của bàn, nên giữ lại bản đã chết chỉ
   * còn là rủi ro.
   */
  async khoiPhuc(): Promise<TableSession | null> {
    const phien = await this.store.doc();
    if (phien === null) return null;
    if (!conHieuLuc(phien, this.bayGio())) {
      await this.store.xoa();
      return null;
    }
    return phien;
  }

  roiBan(): Promise<void> {
    return this.store.xoa();
  }
}
