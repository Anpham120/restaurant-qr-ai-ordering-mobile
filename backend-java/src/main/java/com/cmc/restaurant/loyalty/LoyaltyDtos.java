package com.cmc.restaurant.loyalty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors {@code LoyaltyContracts} (.NET). */
public final class LoyaltyDtos {

	private LoyaltyDtos() {
	}

	public record RewardResponse(
			String rewardId, String name, String description, int pointsRequired, boolean isActive,
			OffsetDateTime createdAt, OffsetDateTime updatedAt) {
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
	public record MyLoyaltyResponse(
			boolean linked, String phoneNumber, int points, List<RewardResponse> availableRewards) {
	}

	/** Số điện thoại khách muốn nối vào tài khoản. */
	public record LinkPhoneRequest(String phone) {
	}

	public record LookupResponse(
			String phoneNumber, int points, BigDecimal lifetimeSpend, List<RewardResponse> availableRewards) {
	}
}
