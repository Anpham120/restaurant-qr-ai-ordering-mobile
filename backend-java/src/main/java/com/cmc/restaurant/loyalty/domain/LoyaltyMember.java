package com.cmc.restaurant.loyalty.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;

/**
 * A loyalty account, keyed by phone number. Ported from {@code LoyaltyService.cs} (.NET).
 *
 * <p>Points are earned, never edited by the customer, so the only mutation here is
 * {@link #accrue}. The earning rate is a constant rather than configuration because changing it
 * retroactively would make historical balances unexplainable — a customer who earned 12 points on a
 * 120.000đ bill must still be able to see why.
 */
public class LoyaltyMember {

	/** One point per 10.000đ spent. */
	public static final BigDecimal VND_PER_POINT = BigDecimal.valueOf(10_000);

	private final String id;
	private final String phoneNumber;
	private String fullName;
	private int points;
	private BigDecimal lifetimeSpend;
	private OffsetDateTime updatedAt;

	public LoyaltyMember(
			String id, String phoneNumber, String fullName, int points, BigDecimal lifetimeSpend,
			OffsetDateTime updatedAt) {
		this.id = id;
		this.phoneNumber = phoneNumber;
		this.fullName = fullName;
		this.points = points;
		this.lifetimeSpend = lifetimeSpend;
		this.updatedAt = updatedAt;
	}

	/**
	 * Points earned by one bill. Rounded DOWN: a 19.999đ bill earns 1 point, not 2. Rounding up
	 * would let repeated small orders earn more than one large order of the same total, which is
	 * the opposite of what a loyalty scheme is for.
	 */
	public static int pointsFor(BigDecimal totalAmount) {
		if (totalAmount == null || totalAmount.signum() <= 0) {
			return 0;
		}
		return totalAmount.divide(VND_PER_POINT, 0, RoundingMode.DOWN).intValue();
	}

	/** Adds the points for one settled bill. Returns how many were added, so the caller can tell
	 * "nothing to add" from "added zero". */
	public int accrue(BigDecimal totalAmount, OffsetDateTime now) {
		int earned = pointsFor(totalAmount);
		if (earned <= 0) {
			return 0;
		}
		points += earned;
		lifetimeSpend = lifetimeSpend.add(totalAmount);
		updatedAt = now;
		return earned;
	}

	/** A reward is redeemable when it is active and the member has enough points. */
	public boolean canRedeem(int pointsRequired) {
		return points >= pointsRequired;
	}

	public String id() {
		return id;
	}

	public String phoneNumber() {
		return phoneNumber;
	}

	public String fullName() {
		return fullName;
	}

	public int points() {
		return points;
	}

	public BigDecimal lifetimeSpend() {
		return lifetimeSpend;
	}

	public OffsetDateTime updatedAt() {
		return updatedAt;
	}
}
