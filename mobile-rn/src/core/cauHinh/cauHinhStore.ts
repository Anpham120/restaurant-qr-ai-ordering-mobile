import { type KhoAnToan, khoThietBi } from '../luuTruAnToan';
import { type CauHinhMayChu, cauHinhTuJson } from './cauHinh';

/**
 * Cất địa chỉ máy chủ giữa các lần mở app.
 *
 * Dùng kho an toàn dù địa chỉ máy chủ KHÔNG phải bí mật: kéo thêm `AsyncStorage` vào chỉ để lưu
 * hai chuỗi là thêm một phụ thuộc phải nâng cấp và kiểm mãi về sau. Ghi rõ ở đây để người sau
 * không tưởng địa chỉ này cần bảo vệ.
 */
export class CauHinhStore {
  private static readonly KHOA = 'cau_hinh_may_chu_v1';

  constructor(private readonly kho: KhoAnToan = khoThietBi) {}

  async doc(): Promise<CauHinhMayChu | null> {
    const raw = await this.kho.doc(CauHinhStore.KHOA);
    if (raw === null) return null;
    try {
      return cauHinhTuJson(JSON.parse(raw));
    } catch {
      await this.xoa();
      return null;
    }
  }

  luu(cauHinh: CauHinhMayChu): Promise<void> {
    return this.kho.ghi(CauHinhStore.KHOA, JSON.stringify(cauHinh));
  }

  xoa(): Promise<void> {
    return this.kho.xoa(CauHinhStore.KHOA);
  }
}
