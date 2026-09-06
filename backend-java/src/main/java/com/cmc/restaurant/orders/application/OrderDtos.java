package com.cmc.restaurant.orders.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Orders.OrderContracts} (.NET) — the subset this
 * issue's scope covers (dine-in only; promotion fields omitted, see PR description). */
public final class OrderDtos {

	private OrderDtos() {
	}

	public record CreateOrderItemRequest(String menuItemId, int quantity, List<String> optionIds, String note) {
		public CreateOrderItemRequest(String menuItemId, int quantity) {
			this(menuItemId, quantity, List.of(), null);
		}
	}

	public record DeliveryDetails(
			String recipientName, String phoneNumber, String address, String note, Double latitude, Double longitude) {
		public DeliveryDetails(String recipientName, String phoneNumber, String address, String note) {
			this(recipientName, phoneNumber, address, note, null, null);
		}
	}

	public record CreateOrderRequest(
			String orderType, String tableCode, String qrToken, String tableSessionId,
			List<CreateOrderItemRequest> items, String customerPhoneNumber, String promotionCode,
			DeliveryDetails deliveryDetails, BigDecimal expectedTotalAmount) {
		public CreateOrderRequest(String orderType, String tableCode, String qrToken, String tableSessionId,
				List<CreateOrderItemRequest> items, String customerPhoneNumber, String promotionCode,
				DeliveryDetails deliveryDetails) {
			this(orderType, tableCode, qrToken, tableSessionId, items, customerPhoneNumber, promotionCode, deliveryDetails, null);
		}
	}

	public record UpdateOrderStatusRequest(String status) {
	}

	public record UpdateOrderItemStatusRequest(String status) {
	}

	/** {@code estimatedReadyMinutesLow}/{@code High} are null when the item is no longer waiting
	 * (Ready/Served/Cancelled) or the menu item doesn't have enough history yet — hạn chế #10. */
	/**
	 * @param kitchenBusy hàng đợi đang quyết định thời gian, không phải bản thân món.
	 *
	 *     <p>Cần một cờ RIÊNG chứ không chỉ một con số lớn hơn: một ước lượng nhảy từ 8 phút lên
	 *     25 phút mà không nói vì sao trông như app tính sai. Nói "bếp đang đông" biến con số đó
	 *     thành thông tin khách dùng được — họ chọn đợi, đổi món, hay gọi nhân viên.
	 */
	public record OrderItemResponse(
			String orderItemId, String menuItemId, String name, BigDecimal unitPrice, int quantity,
			String status, BigDecimal lineTotal, OffsetDateTime updatedAt,
			Integer estimatedReadyMinutesLow, Integer estimatedReadyMinutesHigh,
			boolean kitchenBusy, String note) {
	}

	public record OrderStatusEventResponse(
			String status, String source, String changedByRole, String note, OffsetDateTime createdAt) {
	}

	public record OrderResponse(
			String orderId, String orderCode, String orderType, String tableCode, String tableSessionId,
			String status, String paymentStatus, String paymentMethod, BigDecimal subtotalAmount,
			BigDecimal discountAmount, BigDecimal deliveryFee, BigDecimal totalAmount,
			String fulfillmentStatus, DeliveryDetails deliveryDetails, String courierId, boolean codAccepted,
			OffsetDateTime createdAt, OffsetDateTime updatedAt,
			List<OrderItemResponse> items, List<OrderStatusEventResponse> events) {
	}

	public record CreateOrderResponse(
			String orderId, String orderCode, String orderType, String tableCode, String tableSessionId,
			String status, String paymentStatus, String paymentMethod, BigDecimal subtotalAmount,
			BigDecimal discountAmount, BigDecimal deliveryFee, BigDecimal totalAmount,
			String fulfillmentStatus, DeliveryDetails deliveryDetails, String courierId, boolean codAccepted,
			OffsetDateTime createdAt, OffsetDateTime updatedAt,
			List<OrderItemResponse> items, List<OrderStatusEventResponse> events, String customerAccessToken) {
	}

	/**
	 * Một món khách hay gọi (#35, §9.8).
	 *
	 * <p>Trả CẢ {@code timesOrdered} lẫn {@code totalQuantity}: hai con số nói hai chuyện khác
	 * nhau — "gọi bao nhiêu lần" là thói quen, "tổng bao nhiêu phần" có thể chỉ là một bữa đông
	 * người. App hiện số lần, nhưng số lượng vẫn có ích khi cần giải thích thứ tự.
	 */
	public record FavouriteItemResponse(
			String menuItemId, String name, long timesOrdered, long totalQuantity) {
	}

	public record FavouriteItemListResponse(List<FavouriteItemResponse> items) {
	}

	public record OrderListResponse(List<OrderResponse> orders, int total) {
	}
}
