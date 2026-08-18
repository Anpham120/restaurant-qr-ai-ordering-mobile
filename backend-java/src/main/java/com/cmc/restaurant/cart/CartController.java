package com.cmc.restaurant.cart;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the three cart routes of {@code CartEndpoints.cs} (.NET). All gated by the table-session
 * capability token, like the rest of the anonymous QR flow. */
@RestController
public class CartController {

	private static final String TOKEN_HEADER = "X-Table-Session-Token";

	private final CartService cartService;

	public CartController(CartService cartService) {
		this.cartService = cartService;
	}

	@GetMapping("/api/table-sessions/{tableSessionId}/cart")
	public CartDtos.CartResponse getCart(@PathVariable String tableSessionId, HttpServletRequest request) {
		return cartService.getCart(tableSessionId, request.getHeader(TOKEN_HEADER));
	}

	@PostMapping("/api/table-sessions/{tableSessionId}/cart/items")
	public CartDtos.CartResponse updateItem(
			@PathVariable String tableSessionId,
			@RequestBody(required = false) CartDtos.UpdateCartItemRequest body,
			HttpServletRequest request) {
		return cartService.updateItem(tableSessionId, body, request.getHeader(TOKEN_HEADER));
	}

	@DeleteMapping("/api/table-sessions/{tableSessionId}/cart")
	public CartDtos.CartResponse clear(@PathVariable String tableSessionId, HttpServletRequest request) {
		return cartService.clear(tableSessionId, request.getHeader(TOKEN_HEADER));
	}
}
