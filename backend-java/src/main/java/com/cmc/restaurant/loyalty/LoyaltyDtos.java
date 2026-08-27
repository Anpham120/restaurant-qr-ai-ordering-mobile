package com.cmc.restaurant.loyalty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors {@code LoyaltyContracts} (.NET). */
public final class LoyaltyDtos {

	private LoyaltyDtos() {
	}

	/**
	 * @param rewardType     FREE_ITEM hoặc DISCOUNT — app vẽ hai kiểu thẻ khác nhau
	 * @param discountAmount số tiền giảm, {@code null} với ưu đãi tặng món
	 * @param minTier        hạng tối thiểu, để app giải thích vì sao một ưu đãi bị khoá
	 */
	public record RewardResponse(
			String rewardId, String name, String description, int pointsRequired, boolean isActive,
			OffsetDateTime createdAt, OffsetDateTime updatedAt,
			String rewardType, String menuItemId, BigDecimal discountAmount, String minTier) {
	}

	/**
	 * Điểm của CHÍNH tài khoản đang đăng nhập (#27).
	 *
	 * <p>KHÔNG trả {@code lifetimeSpend}. Màn hình app không dùng tới, và tổng chi tiêu là thông
	 * tin nhạy hơn số điểm — trường nào không cần thì không gửi.
	 *
	 * <p>{@code linked=false} nghĩa là tài khoản chưa nối số điện thoại nào; đó là trạng thái bình
	 * thường của mọi tài khoản mới, không phải lỗi.
	 */
	/**
	 * @param tier             tên hằng của hạng, để app đối chiếu
	 * @param tierName         tên hiển thị tiếng Việt
	 * @param spend12m         chi tiêu 12 tháng — cơ sở xếp hạng
	 * @param nextTierName     hạng kế tiếp, {@code null} khi đã cao nhất
	 * @param amountToNextTier còn phải chi bao nhiêu nữa; 0 khi đã cao nhất
	 */
	/**
	 * @param linked     tài khoản đã nối một số điện thoại chưa
	 * @param hasProfile số đó đã có HỒ SƠ TÍCH ĐIỂM chưa — khác hẳn {@code linked}
	 *
	 *                   <p>Nối số chỉ ghi số vào tài khoản. Hồ sơ tích điểm sinh ra ở lần thanh
	 *                   toán ĐẦU TIÊN có kèm số đó, và hoá đơn phải đủ lớn để ra ít nhất một điểm.
	 *                   Gộp hai thứ làm một khiến màn hình hiện "hạng Bạc" cho người chưa từng có
	 *                   hồ sơ nào — khách tưởng đã ghi danh xong rồi đi ăn mà quên đọc số ở quầy.
	 */
	public record MyLoyaltyResponse(
			boolean linked, boolean hasProfile, String phoneNumber, int points,
			List<RewardResponse> availableRewards,
			String tier, String tierName, BigDecimal spend12m,
			String nextTierName, BigDecimal amountToNextTier,
			List<VoucherResponse> pendingVouchers) {
	}

	/** Ưu đãi khách muốn đổi. */
	/**
	 * @param orderCode mã đơn để trừ tiền vào — BẮT BUỘC với ưu đãi {@code DISCOUNT}, bỏ trống với
	 *                  ưu đãi tặng món vì phiếu tặng món không gắn với hoá đơn nào
	 */
	public record RedeemRequest(String rewardId, String orderCode) {
	}

	/**
	 * Kết quả một lần đổi điểm.
	 *
	 * <p>Trả kèm {@code soDuMoi} chứ không bắt app gọi thêm một lượt: sau khi tiêu điểm, con số
	 * khách muốn thấy ngay là số dư còn lại. Bắt gọi lần hai tạo ra một khoảng thời gian mà màn
	 * hình còn hiện số dư CŨ.
	 */
	/**
	 * @param code mã khách đọc ở quầy hoặc gõ vào ô giảm giá; {@code null} với ưu đãi tặng món
	 *             (món đó đã vào đơn rồi, không có gì để cầm đi)
	 */
	public record RedeemResponse(
			String redemptionId, String rewardId, String rewardName, int pointsSpent,
			OffsetDateTime redeemedAt, String code, MyLoyaltyResponse soDuMoi) {
	}

	/**
	 * Mã khách đọc cho nhân viên ở quầy.
	 *
	 * @param expiresAt để app đếm ngược — một mã hết hạn im lặng trông hệt như một mã sai
	 */
	public record LinkCodeResponse(String code, OffsetDateTime expiresAt) {
	}

	/** Nhân viên nối số cho khách: mã khách đọc + số cần nối. */
	public record StaffLinkRequest(String code, String phone) {
	}

	/** Số điện thoại khách muốn nối vào tài khoản. */
	public record LinkPhoneRequest(String phone) {
	}

	/**
	 * @param lifetimeSpend chi tiêu trọn đời — CHỈ để báo cáo, không dùng xếp hạng
	 * @param spend12m      chi tiêu 12 tháng gần nhất — cơ sở xếp hạng
	 */
	/**
	 * Một phiếu khách đã đổi.
	 *
	 * @param honouredAt {@code null} nghĩa là còn dùng được
	 */
	public record VoucherResponse(
			String redemptionId, String rewardName, int pointsSpent, OffsetDateTime redeemedAt,
			OffsetDateTime honouredAt, String code) {
	}

	public record LookupResponse(
			String phoneNumber, boolean hasProfile, int points, BigDecimal lifetimeSpend,
			BigDecimal spend12m,
			String tier, String tierName,
			List<RewardResponse> availableRewards, List<VoucherResponse> pendingVouchers) {
	}
}
