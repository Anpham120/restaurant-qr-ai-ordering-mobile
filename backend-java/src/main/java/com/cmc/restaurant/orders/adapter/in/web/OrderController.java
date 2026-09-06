package com.cmc.restaurant.orders.adapter.in.web;

import com.cmc.restaurant.shared.RequestIdempotency;
import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.orders.application.OrderDtos;
import com.cmc.restaurant.orders.application.OrderService;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.shared.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.OffsetDateTime;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the dine-in subset of {@code OrderEndpoints.cs} (.NET) — see PR description for what
 * is deliberately out of scope (promotions, Table Invoice guards, realtime). */
@RestController
public class OrderController {

	private final OrderService orderService;

	public OrderController(OrderService orderService) {
		this.orderService = orderService;
	}

	@PostMapping("/api/orders")
	public ResponseEntity<OrderDtos.CreateOrderResponse> createOrder(
			@RequestBody OrderDtos.CreateOrderRequest request,
			HttpServletRequest httpRequest,
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		String idempotencyKey = RequestIdempotency.readValid(httpRequest);
		if (idempotencyKey == null) {
			boolean headerPresent = httpRequest.getHeader(RequestIdempotency.HEADER_NAME) != null;
			throw ApiException.badRequest(
					headerPresent ? "IDEMPOTENCY_KEY_INVALID" : "IDEMPOTENCY_KEY_REQUIRED",
					headerPresent
							? "Idempotency-Key must contain 1 to 100 letters, numbers, '.', '_', ':' or '-'."
							: "Idempotency-Key header is required.");
		}
		String fingerprint = RequestIdempotency.computeFingerprint(request);
		ActorContext actor = principal == null
				? ActorContext.CUSTOMER
				: new ActorContext(principal.userId(), principal.role());

		OrderDtos.CreateOrderResponse response = orderService.createOrder(request, idempotencyKey, fingerprint, actor);
		return ResponseEntity.status(HttpStatus.CREATED).body(response);
	}

	@GetMapping("/api/orders/{orderCode}")
	public OrderDtos.OrderResponse getOrder(
			@PathVariable String orderCode, HttpServletRequest request, Authentication authentication) {
		boolean isOperator = authentication != null && authentication.getAuthorities().stream()
				.anyMatch(a -> a.getAuthority().equals("ROLE_Kitchen") || a.getAuthority().equals("ROLE_Staff")
						|| a.getAuthority().equals("ROLE_CounterStaff") || a.getAuthority().equals("ROLE_Admin"));
		String token = request.getHeader("X-Order-Token");
		return orderService.getOrder(orderCode, token, isOperator);
	}

	/**
	 * Lịch sử đơn của chính khách, qua nhiều lần ghé (#33, §9.10 M3 mục 9).
	 *
	 * <p>Đặt TRƯỚC {@code GET /api/orders} có chủ ý về mặt đọc hiểu, nhưng không phụ thuộc thứ tự:
	 * {@code /api/orders/mine} là đường dẫn cố định nên Spring khớp nó trước {@code /api/orders}
	 * bất kể thứ tự khai báo.
	 *
	 * <p>Chỉ vai {@code Customer}: nhân viên đã có {@code GET /api/orders} mạnh hơn, và mỗi lối
	 * vào cùng một dữ liệu là một chỗ phải canh.
	 */
	@GetMapping("/api/orders/mine")
	@PreAuthorize("hasRole('Customer')")
	public OrderDtos.OrderListResponse listMyOrders(
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return orderService.listOrdersForMember(principal.userId());
	}

	/**
	 * Món khách hay gọi (#35, §9.8) — "Món tôi hay gọi" ở app.
	 *
	 * <p>§9.8 nói rõ phần này không cần cơ chế mới, chỉ là truy vấn lịch sử theo {@code MemberId}.
	 * Phần CÒN LẠI của §9.8 (hồ sơ AI bền vững qua bảng {@code CustomerProfileFact}) là việc của
	 * backend + AI-service và CHƯA có — xem ghi chú ở {@code mobile/README.md}.
	 */
	@GetMapping("/api/orders/mine/favourites")
	@PreAuthorize("hasRole('Customer')")
	public OrderDtos.FavouriteItemListResponse listMyFavourites(
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return orderService.listFavouriteItemsForMember(principal.userId());
	}

	@GetMapping("/api/orders")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'CounterStaff', 'Admin')")
	public OrderDtos.OrderListResponse listOrders(
			@RequestParam(required = false) String status,
			@RequestParam(required = false) String tableCode,
			@RequestParam(required = false) OffsetDateTime updatedSince) {
		// A filter the client cannot express is better rejected than silently ignored: before this,
		// ?status=Plced simply returned every order.
		OrderStatus parsedStatus = null;
		if (status != null && !status.isBlank()) {
			parsedStatus = OrderStatus.parse(status).orElseThrow(
					() -> ApiException.badRequest("ORDER_STATUS_INVALID", "Order status is invalid."));
		}
		String normalizedTableCode = tableCode == null ? null : tableCode.trim().toUpperCase(java.util.Locale.ROOT);
		return orderService.listOrders(parsedStatus, normalizedTableCode, updatedSince);
	}

	@PatchMapping("/api/orders/{orderCode}/status")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'CounterStaff', 'Admin')")
	public OrderDtos.OrderResponse updateOrderStatus(
			@PathVariable String orderCode,
			@RequestBody OrderDtos.UpdateOrderStatusRequest request,
			Authentication authentication) {
		// The edge is where a client string becomes a domain value; past this point the service and
		// the state machine only ever see OrderStatus, so an invalid value cannot travel inwards.
		OrderStatus status = OrderStatus.parse(request.status())
				.orElseThrow(() -> ApiException.badRequest("ORDER_STATUS_INVALID", "Order status is invalid."));

		boolean kitchenOnly = hasRole(authentication, "Kitchen") && !hasRole(authentication, "Staff")
				&& !hasRole(authentication, "Admin");
		if (kitchenOnly && status != OrderStatus.Served) {
			throw new ApiException(HttpStatus.FORBIDDEN, "KITCHEN_ORDER_STATUS_FORBIDDEN",
					"Kitchen can only mark a Ready order as Served.");
		}
		return orderService.updateOrderStatus(orderCode, status, ActorContext.fromAuthentication(authentication));
	}

	@PatchMapping("/api/orders/{orderCode}/items/{orderItemId}/status")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'CounterStaff', 'Admin')")
	public OrderDtos.OrderResponse updateOrderItemStatus(
			@PathVariable String orderCode,
			@PathVariable String orderItemId,
			@RequestBody OrderDtos.UpdateOrderItemStatusRequest request,
			Authentication authentication) {
		OrderItemStatus status = OrderItemStatus.parse(request.status())
				.orElseThrow(() -> ApiException.badRequest(
						"ORDER_ITEM_STATUS_INVALID", "Order item status is invalid."));
		return orderService.updateOrderItemStatus(
				orderCode, orderItemId, status, ActorContext.fromAuthentication(authentication));
	}

	/** Hạn chế #11 — customer self-cancel, gated by the per-order {@code X-Order-Token} capability
	 * token instead of a staff role (see PR description). */
	@PostMapping("/api/orders/{orderCode}/items/{orderItemId}/cancel")
	public OrderDtos.OrderResponse cancelOrderItem(
			@PathVariable String orderCode, @PathVariable String orderItemId, HttpServletRequest request) {
		return orderService.cancelOrderItemAsCustomer(orderCode, orderItemId, request.getHeader("X-Order-Token"));
	}

	private static boolean hasRole(Authentication authentication, String role) {
		return authentication != null
				&& authentication.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
	}
}
