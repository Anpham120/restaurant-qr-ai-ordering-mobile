package com.cmc.restaurant.payments.domain;

/** A payment rule was broken. Carries the API's stable error code but knows nothing about HTTP —
 * same split as {@code OrderRuleViolation} (issue #61). */
public class PaymentRuleViolation extends RuntimeException {

	private final String code;

	public PaymentRuleViolation(String code, String message) {
		super(message);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
