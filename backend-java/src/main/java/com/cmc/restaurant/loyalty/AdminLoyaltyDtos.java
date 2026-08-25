package com.cmc.restaurant.loyalty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Hợp đồng của 9 endpoint quản trị điểm thưởng (#94). */
public final class AdminLoyaltyDtos {

	private AdminLoyaltyDtos() {
	}

	public record LoyaltyMemberRequest(String phoneNumber, String fullName, int points) {
	}

	public record LoyaltyMemberResponse(
			String memberId, String phoneNumber, String fullName, int points, BigDecimal lifetimeSpend,
			OffsetDateTime createdAt, OffsetDateTime updatedAt) {
	}

	/**
	 * @param rewardType     FREE_ITEM hoặc DISCOUNT
	 * @param menuItemId     món tặng — bắt buộc với FREE_ITEM, phải bỏ trống với DISCOUNT
	 * @param discountAmount số tiền giảm — bắt buộc với DISCOUNT, phải bỏ trống với FREE_ITEM
	 * @param minTier        hạng tối thiểu; bỏ trống nghĩa là mọi hạng
	 */
	public record LoyaltyRewardRequest(
			String name, String description, int pointsRequired, Boolean isActive,
			String rewardType, String menuItemId, BigDecimal discountAmount, String minTier) {
	}

	public record LoyaltyRewardResponse(
			String rewardId, String name, String description, int pointsRequired, boolean isActive,
			OffsetDateTime createdAt, OffsetDateTime updatedAt,
			String rewardType, String menuItemId, BigDecimal discountAmount, String minTier) {
	}
}
