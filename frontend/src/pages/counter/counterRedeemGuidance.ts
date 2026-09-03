import type { LoyaltyCounterRedeem, LoyaltyReward } from "@cmc/shared-types";

/**
 * Quầy đổi thưởng HỘ khách chỉ dùng web — phần luật, tách khỏi màn hình để kiểm được.
 *
 * <p>Khách quét QR dùng web thì KHÔNG đăng nhập, nên hệ thống không biết họ là ai và họ không tự
 * đổi được. Nhưng điểm của họ vẫn tích vì màn thanh toán bắt điền số điện thoại. Không có đường
 * này thì cả nhóm khách đó kiếm được điểm mà vĩnh viễn không tiêu được — một chương trình tích
 * điểm hỏng về nghiệp vụ, không phải thiếu một màn hình.
 */

export type HuongDan = {
  /** Câu nhân viên đọc/làm ngay sau khi bấm. */
  cauChinh: string;
  /** Mã cần đọc to cho khách, hoặc `null` khi không có gì để đọc. */
  maDocChoKhach: string | null;
  /** Việc còn phải làm bằng tay, hoặc `null`. */
  vieccConLai: string | null;
};

/**
 * Sau khi đổi xong, nhân viên phải làm gì.
 *
 * <p>Ba kết cục và chúng KHÁC NHAU ở việc phải làm tiếp, nên một câu "đổi thành công" chung chung
 * là vô dụng ở quầy.
 *
 * <p>Ca nguy hiểm là ca thứ ba: tặng món mà chưa gắn vào đơn nào thì KHÔNG có mã để đọc, cũng
 * KHÔNG có món nào vào bếp. Màn hình im lặng ở đó sẽ khiến nhân viên tưởng hỏng và bấm lại — lần
 * bấm thứ hai sinh khoá mới, nên chặn trùng không cứu được, và khách mất điểm THẬT lần nữa.
 */
export function huongDanSauKhiDoi(kq: LoyaltyCounterRedeem): HuongDan {
  if (kq.code) {
    return {
      cauChinh: `Đọc mã này cho khách. Khách tự nhập ở màn thanh toán.`,
      maDocChoKhach: kq.code,
      vieccConLai: null,
    };
  }
  if (kq.orderCode) {
    return {
      cauChinh: `Món đã vào đơn ${kq.orderCode}, bếp đang làm. Không cần đọc mã.`,
      maDocChoKhach: null,
      vieccConLai: null,
    };
  }
  return {
    cauChinh: "Đã trừ điểm, nhưng CHƯA gắn vào đơn nào.",
    maDocChoKhach: null,
    vieccConLai: `Phiếu "${kq.rewardName}" nằm ở mục phiếu chưa phát bên dưới. Phát món rồi bấm "Đã phát".`,
  };
}

/**
 * Có cần hỏi mã đơn trước khi đổi không.
 *
 * <p>Chỉ ưu đãi TẶNG MÓN mới gắn được vào đơn để bếp làm ngay. Hỏi mã đơn cho ưu đãi giảm tiền là
 * bắt nhân viên gõ một thứ máy chủ sẽ bỏ qua.
 */
export function canHoiMaDon(reward: Pick<LoyaltyReward, "rewardType">): boolean {
  return reward.rewardType === "FREE_ITEM";
}

/**
 * Câu cảnh báo trước khi bấm, hoặc {@code null} khi không có gì đáng cảnh báo.
 *
 * <p>Đổi hộ tiêu điểm THẬT của khách và người bấm không phải người mất điểm. Nói rõ số điểm sẽ trừ
 * và số dư còn lại trước khi bấm là cách rẻ nhất để không phải hoàn điểm sau.
 */
export function canhBaoTruocKhiDoi(diemHienCo: number, reward: LoyaltyReward): string {
  const conLai = diemHienCo - reward.pointsRequired;
  return `Trừ ${reward.pointsRequired} điểm của khách cho "${reward.name}". Còn lại ${conLai} điểm.`;
}

/**
 * Khoá chống bấm trùng cho MỘT lần bấm đổi.
 *
 * <p>Máy chủ BẮT BUỘC có khoá này. Lý do nặng hơn ở quầy so với trong app: bấm hai lần lúc mạng
 * chập chờn tiêu điểm THẬT của khách, và người bấm không phải người mất điểm.
 *
 * <p>Sinh MỚI cho mỗi lần bấm, không dùng lại: dùng lại một khoá cũ sẽ khiến lần đổi thứ hai —
 * một lần đổi khách thật sự muốn — bị máy chủ trả về kết quả của lần trước.
 */
export function khoaChongTrung(): string {
  const duoi = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `counter-redeem-${duoi}`;
}
