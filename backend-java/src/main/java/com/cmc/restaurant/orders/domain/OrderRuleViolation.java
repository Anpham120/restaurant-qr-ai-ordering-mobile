package com.cmc.restaurant.orders.domain;

/**
 * A domain rule was broken. Carries the stable error code the API contract uses (e.g.
 * {@code ORDER_STATUS_TRANSITION_INVALID}) but deliberately knows nothing about HTTP — mapping a
 * code to a status belongs to the web adapter, not to the rule that was violated.
 *
 * <p>This is what lets the aggregate be tested without Spring on the classpath.
 */
public class OrderRuleViolation extends RuntimeException {

	private final String code;

	public OrderRuleViolation(String code, String message) {
		super(message);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
