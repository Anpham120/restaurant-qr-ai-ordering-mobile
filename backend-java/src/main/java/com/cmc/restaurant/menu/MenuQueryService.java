package com.cmc.restaurant.menu;

import com.cmc.restaurant.menu.MenuDtos.MenuCategoryResponse;
import com.cmc.restaurant.menu.MenuDtos.MenuItemResponse;
import com.cmc.restaurant.menu.MenuDtos.MenuResponse;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Mirrors the {@code GET /api/menu} handler in {@code MenuEndpoints.cs} (.NET). */
@Service
public class MenuQueryService {

	private final CategoryRepository categoryRepository;
	private final MenuItemRepository menuItemRepository;

	public MenuQueryService(CategoryRepository categoryRepository, MenuItemRepository menuItemRepository) {
		this.categoryRepository = categoryRepository;
		this.menuItemRepository = menuItemRepository;
	}

	public MenuResponse getPublicMenu() {
		List<CategoryEntity> activeCategories = categoryRepository.findByActiveTrueOrderByDisplayOrderAscNameAsc();
		Map<String, CategoryEntity> categoryLookup = new LinkedHashMap<>();
		for (CategoryEntity category : activeCategories) {
			categoryLookup.put(category.getId(), category);
		}

		List<String> activeCategoryIds = activeCategories.stream().map(CategoryEntity::getId).toList();
		List<MenuItemEntity> availableItems = menuItemRepository.findByCategoryIdInAndAvailableTrue(activeCategoryIds);

		List<MenuItemResponse> sortedItems = availableItems.stream()
				.sorted(Comparator
						.<MenuItemEntity>comparingInt(item -> categoryLookup.get(item.getCategoryId()).getDisplayOrder())
						.thenComparing(item -> item.getName().toLowerCase(java.util.Locale.ROOT)))
				.map(item -> toResponse(item, categoryLookup.get(item.getCategoryId()).getName()))
				.toList();

		List<MenuCategoryResponse> sortedCategories = activeCategories.stream()
				.map(category -> new MenuCategoryResponse(category.getId(), category.getName()))
				.toList();

		return new MenuResponse(sortedCategories, sortedItems);
	}

	static MenuItemResponse toResponse(MenuItemEntity item, String categoryName) {
		return new MenuItemResponse(
				item.getId(), item.getName(), item.getDescription(), item.getPrice(), item.getCategoryId(),
				categoryName, item.getImageUrl(), item.isAvailable(), item.getTags());
	}
}
