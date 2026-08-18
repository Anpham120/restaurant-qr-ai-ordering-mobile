package com.cmc.restaurant.orders;

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

	@GetMapping("/api/orders")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'Admin')")
	public OrderDtos.OrderListResponse listOrders(
			@RequestParam(required = false) String status,
			@RequestParam(required = false) String tableCode,
			@RequestParam(required = false) OffsetDateTime updatedSince) {
		String normalizedTableCode = tableCode == null ? null : tableCode.trim().toUpperCase(java.util.Locale.ROOT);
		return orderService.listOrders(status, normalizedTableCode, updatedSince);
	}

	@PatchMapping("/api/orders/{orderCode}/status")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'Admin')")
	public OrderDtos.OrderResponse updateOrderStatus(
			@PathVariable String orderCode,
			@RequestBody OrderDtos.UpdateOrderStatusRequest request,
			Authentication authentication) {
		boolean kitchenOnly = hasRole(authentication, "Kitchen") && !hasRole(authentication, "Staff")
				&& !hasRole(authentication, "Admin");
		if (kitchenOnly && !"Served".equals(request.status())) {
			throw new ApiException(HttpStatus.FORBIDDEN, "KITCHEN_ORDER_STATUS_FORBIDDEN",
					"Kitchen can only mark a Ready order as Served.");
		}
		return orderService.updateOrderStatus(orderCode, request.status(), ActorContext.fromAuthentication(authentication));
	}

	@PatchMapping("/api/orders/{orderCode}/items/{orderItemId}/status")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'Admin')")
	public OrderDtos.OrderResponse updateOrderItemStatus(
			@PathVariable String orderCode,
			@PathVariable String orderItemId,
			@RequestBody OrderDtos.UpdateOrderItemStatusRequest request,
			Authentication authentication) {
		return orderService.updateOrderItemStatus(
				orderCode, orderItemId, request.status(), ActorContext.fromAuthentication(authentication));
	}

	private static boolean hasRole(Authentication authentication, String role) {
		return authentication != null
				&& authentication.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
	}
}
