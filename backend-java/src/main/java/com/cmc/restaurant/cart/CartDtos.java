package com.cmc.restaurant.cart;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors {@code CartContracts} (.NET) so the existing customer web app needs no change. */
public final class CartDtos {

	private CartDtos() {
	}

	public record UpdateCartItemRequest(String menuItemId, int delta, String note) {
	}

	public record CartItemResponse(
			String id, String menuItemId, String name, String description, BigDecimal price,
			String categoryId, String categoryName, String imageUrl, boolean isAvailable,
			int quantity, String note, BigDecimal lineTotal, OffsetDateTime updatedAt) {
	}

	public record CartResponse(
			String tableSessionId, List<CartItemResponse> items, int itemCount, BigDecimal subtotal,
			OffsetDateTime updatedAt) {
	}
}
