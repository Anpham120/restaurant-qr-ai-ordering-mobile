import { type KhoAnToan, khoThietBi } from '../luuTruAnToan';

/**
 * Cất `X-Order-Token` của những đơn CHÍNH MÁY NÀY đã đặt.
 *
 * Vì sao phải cất: backend chỉ trả `customerAccessToken` **một lần duy nhất**, trong phản hồi tạo
 * đơn. Danh sách đơn của phiên bàn không kèm nó. Mất token là mất luôn quyền huỷ món của chính
 * mình (#11) và quyền xem đơn theo mã.
 *
 * Vì sao cất ở chỗ AN TOÀN: đây là chìa khoá năng lực — cầm nó là huỷ được món của đơn đó. Cùng
 * hạng với token phiên bàn, nên cùng chỗ cất.
 *
 * Đơn do MÁY KHÁC trong bàn đặt sẽ không có ở đây, và đó là đúng: người đặt mới là người quyết
 * định huỷ. App chỉ đơn giản không hiện nút huỷ cho những đơn đó.
 */
export class OrderTokenStore {
  private static readonly KHOA = 'order_tokens_v1';

  constructor(private readonly kho: KhoAnToan = khoThietBi) {}

  private async doc(): Promise<Record<string, string>> {
    const raw = await this.kho.doc(OrderTokenStore.KHOA);
    if (raw === null) return {};
    try {
      const o = JSON.parse(raw) as unknown;
      if (typeof o !== 'object' || o === null || Array.isArray(o))
        throw new Error('không phải bảng');
      const kq: Record<string, string> = {};
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) kq[k] = String(v);
      return kq;
    } catch {
      // Dữ liệu hỏng — xoá thay vì để app kẹt. Mất token nghĩa là mất quyền huỷ món, không mất
      // đơn: đơn vẫn hiện trong danh sách của bàn.
      await this.kho.xoa(OrderTokenStore.KHOA);
      return {};
    }
  }

  async luu(orderCode: string, token: string): Promise<void> {
    const tatCa = await this.doc();
    tatCa[orderCode] = token;
    await this.kho.ghi(OrderTokenStore.KHOA, JSON.stringify(tatCa));
  }

  async token(orderCode: string): Promise<string | null> {
    return (await this.doc())[orderCode] ?? null;
  }

  tatCa(): Promise<Record<string, string>> {
    return this.doc();
  }

  /** Xoá khi rời bàn: token của bàn cũ không dùng được nữa và không có lý do giữ. */
  xoaHet(): Promise<void> {
    return this.kho.xoa(OrderTokenStore.KHOA);
  }
}
