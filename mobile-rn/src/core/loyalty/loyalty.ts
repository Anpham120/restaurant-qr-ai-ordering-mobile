/**
 * Một phiếu khách đã đổi và CHƯA dùng.
 *
 * Không có trường "đã dùng": danh sách này chỉ chứa phiếu còn dùng được. Phiếu đã phát biến khỏi
 * danh sách hẳn, vì với khách nó không còn là thứ dùng được nữa — giữ lại chỉ tạo ra một cái thẻ
 * trông như bấm được.
 */
export interface Voucher {
  readonly redemptionId: string;
  readonly rewardName: string;
  readonly pointsSpent: number;
  readonly redeemedAt: string;
}

/** Ba hạng thành viên. Tên hằng khớp `MemberTier` phía backend. */
export type Hang = 'BAC' | 'VANG' | 'KIM_CUONG';

/** Ưu đãi tặng món hay giảm tiền — app vẽ hai kiểu thẻ khác nhau. */
export type LoaiUuDai = 'FREE_ITEM' | 'DISCOUNT';

/** Một ưu đãi trong danh mục. */
export interface Reward {
  readonly rewardId: string;
  readonly name: string;
  readonly description: string | null;
  readonly pointsRequired: number;
  readonly loai: LoaiUuDai;
  /** Số tiền giảm; `null` với ưu đãi tặng món. */
  readonly soTienGiam: number | null;
  readonly hangToiThieu: Hang;
}

/**
 * Điểm thưởng của chính tài khoản đang đăng nhập.
 *
 * Ánh xạ `LoyaltyDtos.MyLoyaltyResponse`. Backend cố ý KHÔNG trả tổng chi tiêu — màn hình không
 * dùng tới, và trường nào không cần thì không gửi.
 */
export interface MyLoyalty {
  /**
   * Tài khoản đã nối số điện thoại chưa.
   *
   * `false` là trạng thái BÌNH THƯỜNG của mọi tài khoản mới, không phải lỗi. Màn hình hiện lời
   * mời liên kết chứ không hiện thông báo hỏng.
   */
  readonly linked: boolean;
  readonly phoneNumber: string | null;
  readonly points: number;
  readonly availableRewards: readonly Reward[];
  readonly hang: Hang;
  /** Tên hiển thị tiếng Việt của hạng, do backend đặt để app và web không lệch chữ. */
  readonly tenHang: string;
  readonly chiTieu12Thang: number;
  /** Hạng kế tiếp; `null` khi đã ở hạng cao nhất. */
  readonly tenHangKeTiep: string | null;
  /** Còn phải chi bao nhiêu nữa mới lên hạng; 0 khi đã cao nhất. */
  readonly conThieu: number;
  /** Phiếu đã đổi mà chưa dùng — thứ khách chìa ra ở quầy. */
  readonly phieuChuaDung: readonly Voucher[];
}

/** Kết quả một lần đổi điểm (#34). */
export interface KetQuaDoiDiem {
  readonly redemptionId: string;
  readonly rewardName: string;
  readonly pointsSpent: number;
  /**
   * Số dư SAU khi đổi, do backend trả kèm.
   *
   * Không bắt app gọi thêm một lượt: sau khi tiêu điểm, con số khách muốn thấy ngay là số dư còn
   * lại, và một lượt gọi thứ hai tạo ra khoảng thời gian màn hình còn hiện số dư CŨ.
   */
  readonly soDuMoi: MyLoyalty;
}

export function rewardTuJson(json: unknown): Reward {
  const o = json as Record<string, unknown>;
  return {
    rewardId: o.rewardId as string,
    name: o.name as string,
    description: typeof o.description === 'string' ? o.description : null,
    pointsRequired: typeof o.pointsRequired === 'number' ? o.pointsRequired : 0,
    loai: o.rewardType === 'DISCOUNT' ? 'DISCOUNT' : 'FREE_ITEM',
    soTienGiam: typeof o.discountAmount === 'number' ? o.discountAmount : null,
    hangToiThieu: doiHang(o.minTier),
  };
}

/**
 * Đọc tên hạng phòng thủ.
 *
 * Một giá trị lạ — do backend thêm hạng mới mà app chưa cập nhật — phải rơi về hạng THẤP NHẤT ở
 * phía khách. Đoán cao lên sẽ vẽ cho khách một quyền lợi họ không có.
 */
function doiHang(v: unknown): Hang {
  return v === 'VANG' || v === 'KIM_CUONG' ? v : 'BAC';
}

export function myLoyaltyTuJson(json: unknown): MyLoyalty {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    linked: typeof o.linked === 'boolean' ? o.linked : false,
    phoneNumber: typeof o.phoneNumber === 'string' ? o.phoneNumber : null,
    points: typeof o.points === 'number' ? o.points : 0,
    availableRewards: Array.isArray(o.availableRewards) ? o.availableRewards.map(rewardTuJson) : [],
    hang: doiHang(o.tier),
    tenHang: typeof o.tierName === 'string' ? o.tierName : 'Bạc',
    chiTieu12Thang: typeof o.spend12m === 'number' ? o.spend12m : 0,
    tenHangKeTiep: typeof o.nextTierName === 'string' ? o.nextTierName : null,
    conThieu: typeof o.amountToNextTier === 'number' ? o.amountToNextTier : 0,
    phieuChuaDung: Array.isArray(o.pendingVouchers) ? o.pendingVouchers.map(voucherTuJson) : [],
  };
}

export function voucherTuJson(json: unknown): Voucher {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    redemptionId: typeof o.redemptionId === 'string' ? o.redemptionId : '',
    rewardName: typeof o.rewardName === 'string' ? o.rewardName : '',
    pointsSpent: typeof o.pointsSpent === 'number' ? o.pointsSpent : 0,
    redeemedAt: typeof o.redeemedAt === 'string' ? o.redeemedAt : '',
  };
}

export function ketQuaDoiDiemTuJson(json: unknown): KetQuaDoiDiem {
  const o = json as Record<string, unknown>;
  return {
    redemptionId: typeof o.redemptionId === 'string' ? o.redemptionId : '',
    rewardName: typeof o.rewardName === 'string' ? o.rewardName : '',
    pointsSpent: typeof o.pointsSpent === 'number' ? o.pointsSpent : 0,
    soDuMoi: myLoyaltyTuJson(o.soDuMoi),
  };
}

/**
 * Khách đổi được ưu đãi này chưa.
 *
 * Tách thành hàm thuần vì đây là chỗ màn hình quyết định bật hay khoá nút, và cả hai điều kiện
 * đều bắt buộc: chưa liên kết số thì backend trả `LOYALTY_NOT_LINKED`, chưa đủ điểm thì trả
 * `LOYALTY_NOT_ENOUGH_POINTS`. Bật nút rồi để backend từ chối là bắt khách chạm vào một lời từ
 * chối lẽ ra thấy trước được.
 */
export function doiDuoc(diem: MyLoyalty, uuDai: Reward): boolean {
  return (
    diem.linked && diem.points >= uuDai.pointsRequired && datHang(diem.hang, uuDai.hangToiThieu)
  );
}

/** Thứ tự ba hạng, từ thấp lên cao. Là nguồn duy nhất cho mọi phép so hạng ở app. */
const THU_TU_HANG: readonly Hang[] = ['BAC', 'VANG', 'KIM_CUONG'];

/** Hạng `cua` có đạt mức `can` không. */
export function datHang(cua: Hang, can: Hang): boolean {
  return THU_TU_HANG.indexOf(cua) >= THU_TU_HANG.indexOf(can);
}

/**
 * Phần đã đi được tới hạng kế tiếp, từ 0 đến 1.
 *
 * Tính từ `conThieu` chứ không từ ngưỡng cứng ghi trong app: ngưỡng là luật nghiệp vụ và nó nằm ở
 * backend. Chép ngưỡng sang đây sẽ tạo ra hai bản luật, và bản ở app là bản không ai nhớ sửa.
 */
export function tienDoLenHang(diem: MyLoyalty): number {
  if (diem.tenHangKeTiep === null) return 1;
  const nguong = diem.chiTieu12Thang + diem.conThieu;
  if (nguong <= 0) return 0;
  return Math.min(1, Math.max(0, diem.chiTieu12Thang / nguong));
}
