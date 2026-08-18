package com.cmc.restaurant.payments.domain;

import java.util.Optional;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.PaymentMethod} (.NET). */
public enum PaymentMethod {
	Unselected,
	COD,
	VietQR;

	/** Only COD and VietQR may be requested by a customer; {@code Unselected} is the initial state,
	 * not something anyone can ask for. Returns empty so the caller answers 400 rather than 500. */
	public static Optional<PaymentMethod> parseRequestable(String value) {
		if (COD.name().equals(value) || VietQR.name().equals(value)) {
			return Optional.of(valueOf(value));
		}
		return Optional.empty();
	}
}
