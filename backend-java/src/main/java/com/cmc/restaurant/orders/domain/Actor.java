package com.cmc.restaurant.orders.domain;

/** Who caused a change, for the audit trail. Pure value object — the web adapter builds it from the
 * authenticated principal, the domain only records it. */
public record Actor(String userId, String role) {

	public static final Actor CUSTOMER = new Actor(null, "Customer");
	public static final Actor SYSTEM = new Actor(null, "System");
}
