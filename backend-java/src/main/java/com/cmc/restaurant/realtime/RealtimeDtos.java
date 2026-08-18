package com.cmc.restaurant.realtime;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Event payloads ported from {@code OrderRealtimeContracts.cs} (.NET). Field names and the
 * {@code order.created}-style event names are kept identical so an existing client only has to
 * change transport, not parsing. Only events whose source module is already ported are here — see
 * PR description for the ones deliberately left out. */
public final class RealtimeDtos {

	private RealtimeDtos() {
	}

	/** Mirrors {@code OrderRealtimeEvents} (.NET) — the string put in the STOMP {@code event}
	 * header, matching what SignalR used as the method name. */
	public static final class EventNames {
		public static final String ORDER_CREATED = "order.created";
		public static final String ORDER_STATUS_CHANGED = "order.statusChanged";
		public static final String ORDER_ITEM_STATUS_CHANGED = "order.itemStatusChanged";
		public static final String PAYMENT_REQUESTED = "payment.requested";

		private EventNames() {
		}
	}

	public record OrderCreatedEvent(
			String orderId, String orderCode, String orderType, String tableCode, String status,
			OffsetDateTime createdAt) {
	}

	public record OrderStatusChangedEvent(
			String orderId, String orderCode, String status, OffsetDateTime updatedAt) {
	}

	public record OrderItemStatusChangedEvent(
			String orderId, String orderCode, String orderItemId, String menuItemName, String status,
			OffsetDateTime updatedAt) {
	}

	public record PaymentRequestedEvent(
			String orderId, String orderCode, String method, String status, BigDecimal amount,
			OffsetDateTime updatedAt, String tableCode) {
	}
}
