package com.cmc.restaurant.orders;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.OrderItemStatus} (.NET). */
public final class OrderItemStatus {
	public static final String PENDING = "Pending";
	public static final String PREPARING = "Preparing";
	public static final String READY = "Ready";
	public static final String SERVED = "Served";
	public static final String CANCELLED = "Cancelled";

	private OrderItemStatus() {
	}
}
