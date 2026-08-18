package com.cmc.restaurant.promotions;

import java.math.BigDecimal;

/** Mirrors the customer-facing part of {@code PromotionContracts} (.NET). */
public final class PromotionDtos {

	private PromotionDtos() {
	}

	public record ValidatePromotionRequest(String code, BigDecimal subtotalAmount) {
	}

	public record ValidatePromotionResponse(
			String code, String name, String description, boolean isFlashSale,
			BigDecimal subtotalAmount, BigDecimal discountAmount, BigDecimal totalAmount) {
	}
}
