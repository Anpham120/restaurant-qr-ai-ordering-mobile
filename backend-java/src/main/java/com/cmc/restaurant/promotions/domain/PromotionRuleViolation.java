package com.cmc.restaurant.promotions.domain;

/** A promotion could not be applied. The .NET original already carried an error code on its
 * exception ({@code PromotionInvalidException.ErrorCode}), so this is the same idea with the
 * project's domain-violation shape. */
public class PromotionRuleViolation extends RuntimeException {

	private final String code;

	public PromotionRuleViolation(String code, String message) {
		super(message);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
