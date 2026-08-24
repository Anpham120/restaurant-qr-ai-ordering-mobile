import { tienVnd } from '../tien';

/**
 * Một khuyến mãi đang chạy.
 *
 * Ánh xạ `PromotionDtos.ActivePromotionResponse` của backend Java.
 */
export interface Promotion {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  /** `Percentage` hoặc `FixedAmount` — nguyên văn tên hằng của backend. */
  readonly type: string;
  readonly discountValue: number;
  /**
   * Ngưỡng tiền tối thiểu của ĐƠN, không phải điều kiện để khuyến mãi được liệt kê.
   *
   * Backend cố ý vẫn trả mã dù giỏ hiện tại chưa đủ tiền: giấu nó đi là giấu đúng thông tin khách
   * cần để quyết định gọi thêm món.
   */
  readonly minOrderAmount: number | null;
  readonly maxDiscountAmount: number | null;
  readonly isFlashSale: boolean;
  /** `null` nghĩa là không có hạn kết thúc — KHÔNG phải "đã hết hạn". */
  readonly endsAt: string | null;
}

function soHoacNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export function promotionTuJson(json: unknown): Promotion {
  const o = json as Record<string, unknown>;
  let endsAt: string | null = null;
  if (typeof o.endsAt === 'string') {
    const d = new Date(o.endsAt);
    // Hạn không đọc được thì coi như KHÔNG có hạn, chứ không phải đã hết hạn: hết hạn sẽ ẩn mất
    // một khuyến mãi có thật vì một lỗi định dạng ở chỗ khác.
    endsAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return {
    code: o.code as string,
    name: o.name as string,
    description: typeof o.description === 'string' ? o.description : null,
    type: o.type as string,
    discountValue: typeof o.discountValue === 'number' ? o.discountValue : 0,
    minOrderAmount: soHoacNull(o.minOrderAmount),
    maxDiscountAmount: soHoacNull(o.maxDiscountAmount),
    isFlashSale: typeof o.isFlashSale === 'boolean' ? o.isFlashSale : false,
    endsAt,
  };
}

/**
 * Mô tả mức giảm bằng câu người đọc được.
 *
 * Tách khỏi component để kiểm được: đây là chỗ dễ sai nhất của màn hình — nhầm phần trăm với số
 * tiền, hoặc quên trần giảm, đều dẫn tới việc hứa với khách một con số không đúng.
 */
export function moTaMucGiam(p: Promotion): string {
  const giam =
    p.type === 'Percentage'
      ? // KHÔNG cần hàm cắt '.0' như bản Flutter: `num` của Dart in 15.0 thành "15.0", còn
        // `String(15)` của JavaScript cho "15". Chép nguyên hàm đó sang sẽ là một hàm rỗng có
        // hai nhánh giống hệt nhau.
        `Giảm ${p.discountValue}%`
      : `Giảm ${tienVnd(p.discountValue)}`;
  // Trần giảm chỉ có nghĩa với phần trăm. Với số tiền cố định nó không bao giờ ràng buộc, và nêu
  // ra sẽ khiến khách tưởng có thêm một giới hạn nữa.
  if (p.type === 'Percentage' && p.maxDiscountAmount !== null) {
    return `${giam}, tối đa ${tienVnd(p.maxDiscountAmount)}`;
  }
  return giam;
}

/** Điều kiện tối thiểu, hoặc `null` nếu không có. */
export function moTaDieuKien(p: Promotion): string | null {
  if (p.minOrderAmount === null || p.minOrderAmount === 0) return null;
  return `Đơn từ ${tienVnd(p.minOrderAmount)}`;
}
