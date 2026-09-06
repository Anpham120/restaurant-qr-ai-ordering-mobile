package com.cmc.restaurant.orders.adapter.in.web;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.orders.application.DeliveryService;
import com.cmc.restaurant.orders.application.OrderDtos;
import com.cmc.restaurant.shared.ActorContext;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DeliveryController {
	private final DeliveryService delivery;

	public DeliveryController(DeliveryService delivery) {
		this.delivery = delivery;
	}

	@GetMapping("/api/delivery/orders")
	@PreAuthorize("hasRole('Courier')")
	public OrderDtos.OrderListResponse assigned(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return delivery.assignedOrders(principal.userId());
	}

	@PatchMapping("/api/delivery/orders/{orderCode}/status")
	@PreAuthorize("hasRole('Courier')")
	public OrderDtos.OrderResponse update(@PathVariable String orderCode,
			@RequestBody DeliveryService.UpdateRequest request, Authentication authentication) {
		return delivery.update(orderCode, request, ActorContext.fromAuthentication(authentication));
	}

	@GetMapping("/api/delivery/couriers")
	@PreAuthorize("hasAnyRole('CounterStaff', 'Admin')")
	public DeliveryService.CourierList couriers() {
		return delivery.couriers();
	}

	@PostMapping("/api/orders/{orderCode}/dispatch")
	@PreAuthorize("hasAnyRole('CounterStaff', 'Admin')")
	public OrderDtos.OrderResponse dispatch(@PathVariable String orderCode,
			@RequestBody DeliveryService.DispatchRequest request, Authentication authentication) {
		return delivery.dispatch(orderCode, request.courierId(), ActorContext.fromAuthentication(authentication));
	}

	@PostMapping("/api/orders/{orderCode}/accept-cod")
	@PreAuthorize("hasAnyRole('CounterStaff', 'Admin')")
	public OrderDtos.OrderResponse acceptCod(@PathVariable String orderCode, Authentication authentication) {
		return delivery.acceptCod(orderCode, ActorContext.fromAuthentication(authentication));
	}
}
