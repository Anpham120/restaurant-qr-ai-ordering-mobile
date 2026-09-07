package com.cmc.restaurant.menu;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ShopController {
	private final CategoryRepository categories;
	private final MenuItemRepository items;
	private final ShopConfig config;

	public ShopController(CategoryRepository categories, MenuItemRepository items, ShopConfig config) {
		this.categories = categories;
		this.items = items;
		this.config = config;
	}

	@GetMapping("/api/shop/config")
	public ShopConfig.Response config() {
		return config.response();
	}

	@org.springframework.web.bind.annotation.PutMapping("/api/shop/config")
	@org.springframework.security.access.prepost.PreAuthorize("hasRole('Admin')")
	public ShopConfig.Response updateConfig(@org.springframework.web.bind.annotation.RequestBody ShopConfig.Response request) {
		return config.update(request);
	}

	@GetMapping("/api/shop/menu")
	@Transactional(readOnly = true)
	public MenuResponse menu() {
		List<CategoryResponse> active = categories.findByActiveTrueOrderByDisplayOrderAscNameAsc().stream()
				.filter(category -> category.getId().startsWith("shop_"))
				.map(category -> new CategoryResponse(category.getId(), category.getName())).toList();
		Map<String, String> names = active.stream().collect(Collectors.toMap(CategoryResponse::categoryId,
				CategoryResponse::name));
		List<ItemResponse> menuItems = active.isEmpty() ? List.of()
				: items.findByCategoryIdInOrderByNameAsc(active.stream().map(CategoryResponse::categoryId).toList())
				.stream().map(item -> new ItemResponse(item.getId(), item.getName(), item.getDescription(),
						item.getPrice(), item.getCategoryId(), names.get(item.getCategoryId()), item.getImageUrl(),
						item.isAvailable(), item.getTags(), item.getPrepMinutes(), item.getOptionGroups())).toList();
		return new MenuResponse(active, menuItems);
	}

	public record CategoryResponse(String categoryId, String name) {
	}
	public record ItemResponse(String id, String name, String description, BigDecimal price, String categoryId,
			String categoryName, String imageUrl, boolean isAvailable, List<String> tags, Integer prepMinutes,
			List<MenuOptionGroup> optionGroups) {
	}
	public record MenuResponse(List<CategoryResponse> categories, List<ItemResponse> items) {
	}
}
