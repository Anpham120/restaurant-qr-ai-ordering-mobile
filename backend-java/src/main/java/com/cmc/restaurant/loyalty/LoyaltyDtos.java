package com.cmc.restaurant.loyalty;

import com.fasterxml.jackson.annotation.JsonAlias;
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
	/**
	 * @param orderCode mã đơn đang mở, {@code null} khi khách đổi ở nhà để dành
	 */
	public record RedeemRequest(
			String rewardId,
			/*
			 * `@JsonAlias("orderId")` là để CỨU những bản app đã cài trên máy khách.
			 *
			 * LỖI CÓ THẬT. App gửi tên `orderId` (`mobile-rn/src/core/loyalty/loyaltyApi.ts`) trong
			 * khi hợp đồng đọc `orderCode`. Jackson bỏ qua trường lạ mà không báo gì, nên request
			 * vẫn 200, điểm vẫn bị trừ, và chỉ có MỘT nhánh nghiệp vụ lặng lẽ không chạy:
			 *
			 *     coDon = false  ->  ganMonVaoDon = false  ->  món KHÔNG vào đơn  ->  BẾP KHÔNG BIẾT
			 *
			 * Trong khi ngay trước đó app đã hứa với khách: "Món sẽ được thêm vào đơn ORD-1001 và
			 * bếp làm ngay." Khách mất điểm, ngồi chờ một món không ai nấu.
			 *
			 * App đã sửa để gửi `orderCode`. Nhưng bản cũ vẫn nằm trên điện thoại khách và không
			 * tự cập nhật, nên bỏ alias này đi là làm hỏng lại đúng những người đang dùng.
			 */
			@JsonAlias("orderId") String orderCode) {
	}

	/**
	 * Quầy đổi thưởng hộ khách chỉ dùng web.
	 *
	 * @param phone     số điện thoại khách đọc ở quầy — đây là DANH TÍNH duy nhất của họ, vì họ
	 *                  quét QR dùng web mà không đăng nhập
	 * @param orderCode mã đơn đang mở, chỉ cần với ưu đãi TẶNG MÓN để bếp làm ngay
	 */
	public record CounterRedeemRequest(String phone, String rewardId, String orderCode) {
	}

	/**
	 * @param code       mã để nhân viên ĐỌC CHO KHÁCH nhập ở màn thanh toán; {@code null} với ưu
	 *                   đãi tặng món, vì món đã vào đơn rồi
	 * @param orderCode  đơn đã được thêm món tặng, {@code null} khi không gắn vào đơn nào
	 * @param soDuMoi    điểm còn lại, để quầy đọc lại cho khách ngay
	 */
	public record CounterRedeemResponse(
			String redemptionId, String rewardName, int pointsSpent, String code, String orderCode,
			int soDuMoi) {
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
	 * Token Firebase chứng minh khách sở hữu SỐ, không phải số trần.
	 *
	 * <p>Bản trước nhận số trần và vì thế phải TỪ CHỐI mọi số đã có hồ sơ điểm — nhận một số chưa
	 * chứng minh nghĩa là cho người lạ gõ số của khách quen rồi lấy điểm. Cái từ chối đó lại chặn
	 * đúng ca phổ biến nhất: khách ăn ở quán qua web, tích điểm theo số, rồi mới tải app.
	 *
	 * <p>Có OTP thì hết phải chọn giữa hai cái dở: token chứng minh đúng thứ cần chứng minh, nên
	 * số đã có hồ sơ nối được luôn và an toàn hơn cả nối tại quầy.
	 */
	public record LinkPhoneRequest(String phoneIdToken) {
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
