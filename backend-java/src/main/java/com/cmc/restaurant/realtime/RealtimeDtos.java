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
		public static final String ASSISTANCE_REQUESTED = "assistance.requested";
		public static final String TABLE_INVOICE_PAYMENT_CONFIRMED = "tableInvoice.paymentConfirmed";
		public static final String MENU_AVAILABILITY_CHANGED = "menu.availabilityChanged";

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

	/** Mirrors {@code MenuAvailabilityChangedEvent} (.NET) — bếp bật/tắt một món (#92). */
	public record MenuAvailabilityChangedEvent(
			String menuItemId, String name, boolean isAvailable, OffsetDateTime updatedAt) {
	}

	/** Mirrors {@code AssistanceRequestedEvent} (.NET) — khách bấm gọi nhân viên (#96). */
	public record AssistanceRequestedEvent(
			String tableCode, String tableSessionId, String note, OffsetDateTime requestedAt) {
	}

	/**
	 * Hoá đơn bàn vừa được tất toán (#96).
	 *
	 * <p>Mang nguyên bản hoá đơn chứ không chỉ mã: màn quầy cần hiện ngay số tiền và danh sách món
	 * mà không phải gọi thêm một vòng HTTP.
	 *
	 * <p>Kiểu {@code Object} vì hoá đơn là DTO của module Tables, và {@code realtime} không được
	 * phụ thuộc ngược vào Tables chỉ để khai một kiểu — sự kiện chỉ chuyển tiếp nguyên khối cho
	 * client. Đây là đánh đổi có ý thức: mất kiểm tra kiểu tại chỗ này, đổi lấy việc không tạo một
	 * vòng phụ thuộc giữa hai module.
	 */
	public record TableInvoicePaymentConfirmedEvent(Object invoice, OffsetDateTime confirmedAt) {
	}
}
