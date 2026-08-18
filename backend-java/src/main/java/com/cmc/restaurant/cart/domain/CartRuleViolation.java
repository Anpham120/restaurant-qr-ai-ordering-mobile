package com.cmc.restaurant.cart.domain;

/** A cart rule was broken. Same code-only contract as the Order and Payment violations. */
public class CartRuleViolation extends RuntimeException {

	private final String code;

	public CartRuleViolation(String code, String message) {
		super(message);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
