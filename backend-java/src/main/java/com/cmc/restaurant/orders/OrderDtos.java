package com.cmc.restaurant.orders;

import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Orders.OrderContracts} (.NET) — the subset this
 * issue's scope covers (dine-in only; promotion fields omitted, see PR description). */
public final class OrderDtos {

	private OrderDtos() {
	}

	public record CreateOrderItemRequest(String menuItemId, int quantity) {
	}

	public record CreateOrderRequest(
			String orderType, String tableCode, String qrToken, String tableSessionId,
			List<CreateOrderItemRequest> items, String customerPhoneNumber, String promotionCode) {
	}

	public record UpdateOrderStatusRequest(String status) {
	}

	public record UpdateOrderItemStatusRequest(String status) {
	}

	/** {@code estimatedReadyMinutesLow}/{@code High} are null when the item is no longer waiting
	 * (Ready/Served/Cancelled) or the menu item doesn't have enough history yet — hạn chế #10. */
	public record OrderItemResponse(
			String orderItemId, String menuItemId, String name, BigDecimal unitPrice, int quantity,
			String status, BigDecimal lineTotal, OffsetDateTime updatedAt,
			Integer estimatedReadyMinutesLow, Integer estimatedReadyMinutesHigh) {
	}

	public record OrderStatusEventResponse(
			String status, String source, String changedByRole, String note, OffsetDateTime createdAt) {
	}

	public record OrderResponse(
			String orderId, String orderCode, String orderType, String tableCode, String tableSessionId,
			String status, String paymentStatus, String paymentMethod, BigDecimal subtotalAmount,
			BigDecimal discountAmount, BigDecimal totalAmount, OffsetDateTime createdAt, OffsetDateTime updatedAt,
			List<OrderItemResponse> items, List<OrderStatusEventResponse> events) {
	}

	public record CreateOrderResponse(
			String orderId, String orderCode, String orderType, String tableCode, String tableSessionId,
			String status, String paymentStatus, String paymentMethod, BigDecimal subtotalAmount,
			BigDecimal discountAmount, BigDecimal totalAmount, OffsetDateTime createdAt, OffsetDateTime updatedAt,
			List<OrderItemResponse> items, List<OrderStatusEventResponse> events, String customerAccessToken) {
	}

	public record OrderListResponse(List<OrderResponse> orders, int total) {
	}
}
