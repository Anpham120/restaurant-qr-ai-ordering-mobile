package com.cmc.restaurant.menu;

import com.cmc.restaurant.menu.MenuDtos.MenuItemRequest;
import com.cmc.restaurant.menu.MenuDtos.MenuItemResponse;
import com.cmc.restaurant.menu.MenuDtos.ToggleAvailabilityRequest;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the admin half of {@code RestaurantQrAiOrdering.Api.Menu.MenuEndpoints} (.NET), Admin-only. */
@RestController
@RequestMapping("/api/admin/menu-items")
@PreAuthorize("hasRole('Admin')")
public class AdminMenuItemController {

	private final MenuItemRepository menuItemRepository;
	private final CategoryRepository categoryRepository;
	private final MenuItemService menuItemService;

	public AdminMenuItemController(
			MenuItemRepository menuItemRepository, CategoryRepository categoryRepository, MenuItemService menuItemService) {
		this.menuItemRepository = menuItemRepository;
		this.categoryRepository = categoryRepository;
		this.menuItemService = menuItemService;
	}

	/**
	 * Đọc danh mục MỘT LẦN vào map thay vì tra theo từng món.
	 *
	 * <p>Bản trước gọi {@code toResponse} cho từng món, và mỗi lượt tra danh mục chạy trong một
	 * giao dịch RIÊNG (phương thức này không có {@code @Transactional}, nên mỗi lời gọi repository
	 * tự mở một cái). Đo trên cơ sở dữ liệu thật với 91 món:
	 *
	 * <pre>
	 *   trước:  274 câu SQL  =  1 (danh sách) + 91 × (BEGIN + SELECT + COMMIT)
	 *   sau:      2 câu SQL  =  1 (danh sách) + 1 (toàn bộ danh mục)
	 * </pre>
	 *
	 * <p>Số danh mục là 13 và bị chặn bởi nghiệp vụ (thực đơn nhà hàng), nên nạp hết vào bộ nhớ ở
	 * đây là an toàn — khác với việc nạp hết MÓN, thứ có thể phình.
	 */
	@GetMapping
	public List<MenuItemResponse> list() {
		Map<String, String> tenDanhMuc = categoryRepository.findAll().stream()
				.collect(Collectors.toMap(CategoryEntity::getId, CategoryEntity::getName));
		return menuItemRepository.findAllByOrderByNameAsc().stream()
				.map(item -> MenuQueryService.toResponse(
						item, tenDanhMuc.getOrDefault(item.getCategoryId(), "")))
				.toList();
	}

	@GetMapping("/{menuItemId}")
	public MenuItemResponse get(@PathVariable String menuItemId) {
		return toResponse(menuItemService.getOrThrow(menuItemId));
	}

	@PostMapping
	public ResponseEntity<MenuItemResponse> create(@RequestBody MenuItemRequest request) {
		MenuItemEntity created = menuItemService.create(request);
		return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(created));
	}

	@PutMapping("/{menuItemId}")
	public MenuItemResponse update(@PathVariable String menuItemId, @RequestBody MenuItemRequest request) {
		return toResponse(menuItemService.update(menuItemId, request));
	}

	@PatchMapping("/{menuItemId}/availability")
	public MenuItemResponse toggleAvailability(
			@PathVariable String menuItemId, @RequestBody ToggleAvailabilityRequest request) {
		return toResponse(menuItemService.toggleAvailability(menuItemId, request.isAvailable()));
	}

	@DeleteMapping("/{menuItemId}")
	public ResponseEntity<Void> delete(@PathVariable String menuItemId) {
		menuItemService.delete(menuItemId);
		return ResponseEntity.noContent().build();
	}

	private MenuItemResponse toResponse(MenuItemEntity item) {
		String categoryName = categoryRepository.findById(item.getCategoryId())
				.map(CategoryEntity::getName)
				.orElse("");
		return MenuQueryService.toResponse(item, categoryName);
	}
}
