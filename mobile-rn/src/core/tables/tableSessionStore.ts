import { type KhoAnToan, khoThietBi } from '../luuTruAnToan';
import { type TableSession, tableSessionTuJson } from './tableSession';

export interface TableSessionStore {
  luu(phien: TableSession): Promise<void>;
  doc(): Promise<TableSession | null>;
  xoa(): Promise<void>;
}

/**
 * Cất phiên bàn ở Keychain/Keystore, cùng cấu hình với phiên đăng nhập.
 *
 * Vì sao cũng phải là chỗ cất an toàn, dù phiên bàn "chỉ" là một cái bàn: `tableSessionToken` là
 * một chìa khoá năng lực — cầm nó là xem được đơn và hoá đơn của bàn đó. Đặt nó vào kho thường
 * trong khi JWT nằm ở Keychain là khoá cửa trước rồi để ngỏ cửa sau.
 */
export class SecureTableSessionStore implements TableSessionStore {
  private static readonly KHOA = 'table_session_v1';

  constructor(private readonly kho: KhoAnToan = khoThietBi) {}

  luu(phien: TableSession): Promise<void> {
    return this.kho.ghi(SecureTableSessionStore.KHOA, JSON.stringify(phien));
  }

  async doc(): Promise<TableSession | null> {
    const raw = await this.kho.doc(SecureTableSessionStore.KHOA);
    if (raw === null) return null;
    try {
      return tableSessionTuJson(JSON.parse(raw));
    } catch {
      // Dữ liệu hỏng hoặc từ phiên bản cũ — xoá thay vì để app kẹt mỗi lần mở.
      await this.xoa();
      return null;
    }
  }

  xoa(): Promise<void> {
    return this.kho.xoa(SecureTableSessionStore.KHOA);
  }
}
