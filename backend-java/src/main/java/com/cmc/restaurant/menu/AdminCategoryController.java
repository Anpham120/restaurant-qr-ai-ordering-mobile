package com.cmc.restaurant.menu;

import com.cmc.restaurant.menu.MenuDtos.AdminCategoryResponse;
import com.cmc.restaurant.menu.MenuDtos.CategoryRequest;
import com.cmc.restaurant.shared.ApiException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Categories.CategoryEndpoints} (.NET), Admin-only. */
@RestController
@RequestMapping("/api/admin/categories")
@PreAuthorize("hasRole('Admin')")
public class AdminCategoryController {

	private final CategoryRepository categoryRepository;
	private final CategoryService categoryService;

	public AdminCategoryController(CategoryRepository categoryRepository, CategoryService categoryService) {
		this.categoryRepository = categoryRepository;
		this.categoryService = categoryService;
	}

	@GetMapping
	public List<AdminCategoryResponse> list() {
		return categoryRepository.findAllByOrderByDisplayOrderAscNameAsc().stream()
				.map(AdminCategoryController::toResponse)
				.toList();
	}

	@GetMapping("/{categoryId}")
	public AdminCategoryResponse get(@PathVariable String categoryId) {
		return categoryRepository.findById(categoryId)
				.map(AdminCategoryController::toResponse)
				.orElseThrow(() -> ApiException.notFound("CATEGORY_NOT_FOUND", "Category was not found."));
	}

	@PostMapping
	public ResponseEntity<AdminCategoryResponse> create(@RequestBody CategoryRequest request) {
		CategoryEntity created = categoryService.create(request);
		return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(created));
	}

	@PutMapping("/{categoryId}")
	public AdminCategoryResponse update(@PathVariable String categoryId, @RequestBody CategoryRequest request) {
		return toResponse(categoryService.update(categoryId, request));
	}

	@DeleteMapping("/{categoryId}")
	public ResponseEntity<Void> delete(@PathVariable String categoryId) {
		categoryService.delete(categoryId);
		return ResponseEntity.noContent().build();
	}

	private static AdminCategoryResponse toResponse(CategoryEntity category) {
		return new AdminCategoryResponse(
				category.getId(), category.getName(), category.getDisplayOrder(), category.isActive(),
				category.getCreatedAt(), category.getUpdatedAt());
	}
}
