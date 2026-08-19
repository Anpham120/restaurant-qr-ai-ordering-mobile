package com.cmc.restaurant.promotions.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Locale;

/**
 * A discount code and the rules for applying it. Ported from {@code PromotionCalculator.cs} (.NET).
 *
 * <p>Money rules, so the three caps are stated explicitly and in order rather than left implicit:
 * a percentage discount is capped by {@code maxDiscountAmount} if one is set, and <em>every</em>
 * discount is finally capped by the subtotal itself. Without that last cap a fixed-amount voucher
 * larger than the bill would produce a negative total — the restaurant paying the customer to eat.
 */
public class Promotion {

	private final String id;
	private final String code;
	private final String name;
	private final PromotionType type;
	private final BigDecimal discountValue;
	private final BigDecimal minOrderAmount;
	private final BigDecimal maxDiscountAmount;
	private final OffsetDateTime startsAt;
	private final OffsetDateTime endsAt;
	private final boolean active;

	public Promotion(
			String id, String code, String name, PromotionType type, BigDecimal discountValue,
			BigDecimal minOrderAmount, BigDecimal maxDiscountAmount, OffsetDateTime startsAt,
			OffsetDateTime endsAt, boolean active) {
		this.id = id;
		this.code = code;
		this.name = name;
		this.type = type;
		this.discountValue = discountValue;
		this.minOrderAmount = minOrderAmount;
		this.maxDiscountAmount = maxDiscountAmount;
		this.startsAt = startsAt;
		this.endsAt = endsAt;
		this.active = active;
	}

	/** Result of applying a code: what comes off, and what is left to pay. */
	public record Discount(String promotionId, BigDecimal discountAmount, BigDecimal totalAmount) {
	}

	/**
	 * Validates the code against this order and returns the discount.
	 *
	 * @throws PromotionRuleViolation with the same error codes the .NET endpoint returned, so the
	 *     existing client keeps distinguishing "expired" from "minimum not met"
	 */
	public Discount applyTo(BigDecimal subtotal, OffsetDateTime now) {
		if (!active) {
			throw new PromotionRuleViolation("PROMOTION_INACTIVE", "Promotion is not active.");
		}
		if (startsAt != null && now.isBefore(startsAt)) {
			throw new PromotionRuleViolation("PROMOTION_NOT_STARTED", "Promotion has not started yet.");
		}
		if (endsAt != null && now.isAfter(endsAt)) {
			throw new PromotionRuleViolation("PROMOTION_EXPIRED", "Promotion has expired.");
		}
		if (minOrderAmount != null && subtotal.compareTo(minOrderAmount) < 0) {
			throw new PromotionRuleViolation("PROMOTION_MIN_ORDER_NOT_MET",
					"Order subtotal must be at least "
							+ minOrderAmount.setScale(0, RoundingMode.DOWN).toPlainString() + " VND.");
		}

		BigDecimal discount = switch (type) {
			// HALF_UP matches .NET's MidpointRounding.AwayFromZero, which rounds a half-dong in the
			// customer's favour. Java's default for BigDecimal division would throw instead.
			case Percentage -> subtotal.multiply(discountValue)
					.divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
			case FixedAmount -> discountValue;
		};

		if (maxDiscountAmount != null) {
			discount = discount.min(maxDiscountAmount);
		}
		// Final cap: a discount can never exceed the bill.
		discount = discount.min(subtotal);

		return new Discount(id, discount, subtotal.subtract(discount).max(BigDecimal.ZERO));
	}

	/** Codes are matched case-insensitively; stored and compared upper-case. */
	public static String normalizeCode(String promotionCode) {
		if (promotionCode == null || promotionCode.isBlank()) {
			return null;
		}
		return promotionCode.trim().toUpperCase(Locale.ROOT);
	}

	public String id() {
		return id;
	}

	public String code() {
		return code;
	}

	public String name() {
		return name;
	}

	public PromotionType type() {
		return type;
	}

	public BigDecimal discountValue() {
		return discountValue;
	}
}
