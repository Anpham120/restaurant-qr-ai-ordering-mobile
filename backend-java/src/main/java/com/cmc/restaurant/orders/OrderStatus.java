package com.cmc.restaurant.orders;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.OrderStatus} (.NET). */
public final class OrderStatus {
	public static final String DRAFT = "Draft";
	public static final String PLACED = "Placed";
	public static final String CONFIRMED = "Confirmed";
	public static final String PREPARING = "Preparing";
	public static final String READY = "Ready";
	public static final String SERVED = "Served";
	public static final String COMPLETED = "Completed";
	public static final String CANCELLED = "Cancelled";

	private OrderStatus() {
	}
}
