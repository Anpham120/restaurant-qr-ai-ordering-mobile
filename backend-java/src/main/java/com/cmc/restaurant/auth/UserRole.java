package com.cmc.restaurant.auth;

import java.util.List;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Users.UserRole} in the .NET backend. */
public final class UserRole {

	public static final String CUSTOMER = "Customer";
	public static final String STAFF = "Staff";
	public static final String COUNTER_STAFF = "CounterStaff";
	public static final String KITCHEN = "Kitchen";
	public static final String ADMIN = "Admin";

	public static final List<String> ALL = List.of(CUSTOMER, STAFF, COUNTER_STAFF, KITCHEN, ADMIN);

	private UserRole() {
	}
}
