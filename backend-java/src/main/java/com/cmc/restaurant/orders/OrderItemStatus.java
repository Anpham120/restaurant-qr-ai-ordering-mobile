package com.cmc.restaurant.orders;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.OrderItemStatus} (.NET). Enum since issue #60 — see
 * {@link OrderStatus} for why. Names match the database strings exactly. */
public enum OrderItemStatus {
	Pending,
	Preparing,
	Ready,
	Served,
	Cancelled;

	/** Parses the value a client sent. Returns empty instead of throwing {@code
	 * IllegalArgumentException} so the caller can answer {@code 400 ORDER_ITEM_STATUS_INVALID}
	 * rather than a 500. */
	public static java.util.Optional<OrderItemStatus> parse(String value) {
		if (value == null) {
			return java.util.Optional.empty();
		}
		for (OrderItemStatus candidate : values()) {
			if (candidate.name().equals(value.trim())) {
				return java.util.Optional.of(candidate);
			}
		}
		return java.util.Optional.empty();
	}
}
