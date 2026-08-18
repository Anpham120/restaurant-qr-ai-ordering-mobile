package com.cmc.restaurant.orders.domain;

import java.time.OffsetDateTime;

/** One entry of the order's audit trail. {@code source} distinguishes a real status transition
 * ("Status") from a payment event recorded against the order ("Payment") — same meaning as
 * {@code OrderStatusChangeSource} in .NET. */
public record StatusChange(
		OrderStatus fromStatus, OrderStatus toStatus, String source, Actor actor, String note,
		OffsetDateTime occurredAt) {

	public static final String SOURCE_STATUS = "Status";
	public static final String SOURCE_PAYMENT = "Payment";
}
