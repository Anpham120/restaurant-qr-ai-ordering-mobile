package com.cmc.restaurant.menu;

import com.cmc.restaurant.menu.MenuDtos.MenuItemRequest;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.stereotype.Service;

/** Mirrors the admin CRUD half of {@code RestaurantQrAiOrdering.Api.Menu.MenuEndpoints} (.NET). */
@Service
public class MenuItemService {

	private final MenuItemRepository menuItemRepository;
	private final CategoryRepository categoryRepository;

	public MenuItemService(MenuItemRepository menuItemRepository, CategoryRepository categoryRepository) {
		this.menuItemRepository = menuItemRepository;
		this.categoryRepository = categoryRepository;
	}

	public MenuItemEntity create(MenuItemRequest request) {
		validate(request);

		MenuItemEntity item = new MenuItemEntity(
				createUniqueId(),
				request.categoryId().trim(),
				request.name().trim(),
				request.description() == null ? "" : request.description().trim(),
				request.price(),
				normalizeOptional(request.imageUrl()),
				request.isAvailable() == null || request.isAvailable(),
				normalizeTags(request.tags()),
				OffsetDateTime.now());

		return menuItemRepository.save(item);
	}

	public MenuItemEntity update(String menuItemId, MenuItemRequest request) {
		validate(request);

		MenuItemEntity item = menuItemRepository.findById(menuItemId)
				.orElseThrow(() -> ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found."));

		item.setCategoryId(request.categoryId().trim());
		item.setName(request.name().trim());
		item.setDescription(request.description() == null ? "" : request.description().trim());
		item.setPrice(request.price());
		item.setImageUrl(normalizeOptional(request.imageUrl()));
		item.setAvailable(request.isAvailable() == null || request.isAvailable());
		item.setTags(normalizeTags(request.tags()));
		item.setUpdatedAt(OffsetDateTime.now());

		return menuItemRepository.save(item);
	}

	public MenuItemEntity toggleAvailability(String menuItemId, boolean available) {
		MenuItemEntity item = menuItemRepository.findById(menuItemId)
				.orElseThrow(() -> ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found."));

		item.setAvailable(available);
		item.setUpdatedAt(OffsetDateTime.now());

		return menuItemRepository.save(item);
	}

	public void delete(String menuItemId) {
		MenuItemEntity item = menuItemRepository.findById(menuItemId)
				.orElseThrow(() -> ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found."));

		menuItemRepository.delete(item);
	}

	public MenuItemEntity getOrThrow(String menuItemId) {
		return menuItemRepository.findById(menuItemId)
				.orElseThrow(() -> ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found."));
	}

	private void validate(MenuItemRequest request) {
		if (request == null || isBlank(request.categoryId())) {
			throw ApiException.badRequest("CATEGORY_REQUIRED", "Category is required.");
		}

		boolean categoryActive = categoryRepository.findById(request.categoryId().trim())
				.map(CategoryEntity::isActive)
				.orElse(false);
		if (!categoryActive) {
			throw ApiException.badRequest("CATEGORY_INVALID", "Category must exist and be active.");
		}

		if (isBlank(request.name())) {
			throw ApiException.badRequest("MENU_ITEM_NAME_REQUIRED", "Menu item name is required.");
		}

		if (request.price() == null || request.price().compareTo(BigDecimal.ZERO) <= 0) {
			throw ApiException.badRequest("MENU_ITEM_PRICE_INVALID", "Menu item price must be greater than zero.");
		}
	}

	private String createUniqueId() {
		int lastNumber = menuItemRepository.findAll().stream()
				.map(MenuItemEntity::getId)
				.filter(id -> id.startsWith("m_"))
				.map(id -> {
					try {
						return Integer.parseInt(id.substring(2));
					} catch (NumberFormatException e) {
						return 0;
					}
				})
				.max(Integer::compareTo)
				.orElse(0);

		return "m_%03d".formatted(lastNumber + 1);
	}

	private static String normalizeOptional(String value) {
		return isBlank(value) ? null : value.trim();
	}

	/** Case-insensitive dedup that keeps the first occurrence's casing, matching the .NET
	 * {@code Distinct(StringComparer.OrdinalIgnoreCase)} behavior. */
	private static List<String> normalizeTags(List<String> tags) {
		if (tags == null) {
			return List.of();
		}
		java.util.Set<String> seenLowercase = new java.util.HashSet<>();
		List<String> result = new java.util.ArrayList<>();
		for (String tag : tags) {
			if (isBlank(tag)) {
				continue;
			}
			String trimmed = tag.trim();
			if (seenLowercase.add(trimmed.toLowerCase(java.util.Locale.ROOT))) {
				result.add(trimmed);
			}
		}
		return List.copyOf(result);
	}

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}
}
