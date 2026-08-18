package com.cmc.restaurant.payments.domain;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.PaymentStatus} (.NET). Enum for the same reason the
 * order statuses became enums in issue #60 — names match the database strings exactly, so
 * {@code @Enumerated(STRING)} round-trips the existing column with no migration. */
public enum PaymentStatus {
	NotRequested,
	Pending,
	Confirmed,
	/** Set by the counter's end-of-shift reconciliation, not by this module. Treated exactly like
	 * {@code Confirmed} everywhere here: money has arrived. */
	Paid,
	Failed,
	Refunded
}
