package com.cmc.restaurant.orders.domain;

import java.util.Optional;

/** How an order reaches the customer. Names are persisted verbatim. */
public enum OrderType {
	DineIn,
	Pickup,
	Delivery;

	public static Optional<OrderType> parse(String value) {
		if (value == null) {
			return Optional.empty();
		}
		for (OrderType candidate : values()) {
			if (candidate.name().equalsIgnoreCase(value.trim())) {
				return Optional.of(candidate);
			}
		}
		return Optional.empty();
	}

	public boolean requiresPrepayment() {
		return this == Pickup || this == Delivery;
	}
}
