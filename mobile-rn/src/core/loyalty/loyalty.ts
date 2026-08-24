/** Một ưu đãi khách đủ điểm để đổi. */
export interface Reward {
  readonly rewardId: string;
  readonly name: string;
  readonly description: string | null;
  readonly pointsRequired: number;
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
  };
}

export function myLoyaltyTuJson(json: unknown): MyLoyalty {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    linked: typeof o.linked === 'boolean' ? o.linked : false,
    phoneNumber: typeof o.phoneNumber === 'string' ? o.phoneNumber : null,
    points: typeof o.points === 'number' ? o.points : 0,
    availableRewards: Array.isArray(o.availableRewards) ? o.availableRewards.map(rewardTuJson) : [],
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
  return diem.linked && diem.points >= uuDai.pointsRequired;
}
