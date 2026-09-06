package com.cmc.restaurant.menu;

import com.cmc.restaurant.menu.MenuDtos.CategoryRequest;
import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Categories.CategoryEndpoints} (.NET). */
@Service
public class CategoryService {

	private final CategoryRepository categoryRepository;
	private final MenuItemRepository menuItemRepository;

	public CategoryService(CategoryRepository categoryRepository, MenuItemRepository menuItemRepository) {
		this.categoryRepository = categoryRepository;
		this.menuItemRepository = menuItemRepository;
	}

	public CategoryEntity create(CategoryRequest request) {
		validate(request);

		CategoryEntity category = new CategoryEntity(
				createUniqueId(request.name()),
				request.name().trim(),
				request.displayOrder(),
				request.isActive() == null || request.isActive(),
				OffsetDateTime.now());

		return categoryRepository.save(category);
	}

	public CategoryEntity update(String categoryId, CategoryRequest request) {
		validate(request);

		CategoryEntity category = categoryRepository.findById(categoryId)
				.orElseThrow(() -> ApiException.notFound("CATEGORY_NOT_FOUND", "Category was not found."));

		category.setName(request.name().trim());
		category.setDisplayOrder(request.displayOrder());
		category.setActive(request.isActive() == null || request.isActive());
		category.setUpdatedAt(OffsetDateTime.now());

		return categoryRepository.save(category);
	}

	public void delete(String categoryId) {
		CategoryEntity category = categoryRepository.findById(categoryId)
				.orElseThrow(() -> ApiException.notFound("CATEGORY_NOT_FOUND", "Category was not found."));

		boolean hasMenuItems = !menuItemRepository.findByCategoryIdInOrderByNameAsc(java.util.List.of(categoryId))
				.isEmpty();
		if (hasMenuItems) {
			throw ApiException.conflict("CATEGORY_HAS_MENU_ITEMS", "Category has menu items and cannot be deleted.");
		}

		categoryRepository.delete(category);
	}

	private void validate(CategoryRequest request) {
		if (request == null || isBlank(request.name())) {
			throw ApiException.badRequest("CATEGORY_NAME_REQUIRED", "Category name is required.");
		}
	}

	private String createUniqueId(String name) {
		StringBuilder slugBuilder = new StringBuilder();
		for (char character : name.trim().toLowerCase(java.util.Locale.ROOT).toCharArray()) {
			slugBuilder.append(Character.isLetterOrDigit(character) ? character : '_');
		}
		String slug = java.util.Arrays.stream(slugBuilder.toString().split("_+"))
				.filter(part -> !part.isEmpty())
				.reduce((a, b) -> a + "_" + b)
				.orElse("category");

		String baseId = "shop_" + slug.substring(0, Math.min(slug.length(), 35));
		String id = baseId;
		int index = 2;
		while (categoryRepository.existsById(id)) {
			id = baseId + "_" + index;
			index++;
		}
		return id;
	}

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}
}
