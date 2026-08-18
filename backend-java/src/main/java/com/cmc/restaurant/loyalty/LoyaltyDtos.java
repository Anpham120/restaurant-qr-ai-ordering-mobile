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

	public record LookupResponse(
			String phoneNumber, int points, BigDecimal lifetimeSpend, List<RewardResponse> availableRewards) {
	}
}
