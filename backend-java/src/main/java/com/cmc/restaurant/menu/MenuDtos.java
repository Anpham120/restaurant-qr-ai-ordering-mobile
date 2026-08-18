package com.cmc.restaurant.menu;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Menu.MenuContracts} (.NET) field-for-field. */
public final class MenuDtos {

	private MenuDtos() {
	}

	public record MenuResponse(List<MenuCategoryResponse> categories, List<MenuItemResponse> items) {
	}

	public record MenuCategoryResponse(String categoryId, String name) {
	}

	public record AdminCategoryResponse(
			String categoryId, String name, int displayOrder, boolean isActive,
			OffsetDateTime createdAt, OffsetDateTime updatedAt) {
	}

	public record MenuItemResponse(
			String id, String name, String description, BigDecimal price, String categoryId,
			String categoryName, String imageUrl, boolean isAvailable, List<String> tags) {
	}

	public record CategoryRequest(String name, int displayOrder, Boolean isActive) {
	}

	public record MenuItemRequest(
			String categoryId, String name, String description, BigDecimal price, String imageUrl,
			Boolean isAvailable, List<String> tags) {
	}

	public record ToggleAvailabilityRequest(boolean isAvailable) {
	}
}
