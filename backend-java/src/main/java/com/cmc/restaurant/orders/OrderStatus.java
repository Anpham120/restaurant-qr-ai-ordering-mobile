package com.cmc.restaurant.orders;

/**
 * Mirrors {@code RestaurantQrAiOrdering.Enums.OrderStatus} (.NET).
 *
 * <p>Was a class of {@code static final String} until issue #60. That version lost the type safety
 * the .NET original already had as a real {@code enum}, and skipped what Java offers on top
 * ({@code @Enumerated(EnumType.STRING)}) — so it was worse than both sides at once. The concrete
 * cost: {@code canTransitionOrder(String, String)} accepted its two arguments in either order and
 * the compiler said nothing.
 *
 * <p>Names match the database strings exactly, so {@code @Enumerated(STRING)} round-trips the
 * existing column with no migration.
 */
public enum OrderStatus {
	Draft,
	Placed,
	Confirmed,
	Preparing,
	Ready,
	Served,
	Completed,
	Cancelled;

	/** Parses the value a client sent. Returns empty instead of throwing {@code
	 * IllegalArgumentException} so the caller can answer {@code 400 ORDER_STATUS_INVALID}
	 * rather than a 500. */
	public static java.util.Optional<OrderStatus> parse(String value) {
		if (value == null) {
			return java.util.Optional.empty();
		}
		for (OrderStatus candidate : values()) {
			if (candidate.name().equals(value.trim())) {
				return java.util.Optional.of(candidate);
			}
		}
		return java.util.Optional.empty();
	}
}
