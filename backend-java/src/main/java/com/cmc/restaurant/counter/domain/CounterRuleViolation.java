package com.cmc.restaurant.counter.domain;

/** A counter-shift rule was broken. Code-only, like the other domain violations. */
public class CounterRuleViolation extends RuntimeException {

	private final String code;

	public CounterRuleViolation(String code, String message) {
		super(message);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
