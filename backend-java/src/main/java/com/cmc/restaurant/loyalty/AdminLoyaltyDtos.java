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

	public record LoyaltyRewardRequest(
			String name, String description, int pointsRequired, Boolean isActive) {
	}

	public record LoyaltyRewardResponse(
			String rewardId, String name, String description, int pointsRequired, boolean isActive,
			OffsetDateTime createdAt, OffsetDateTime updatedAt) {
	}
}
