package com.cmc.restaurant.menu;

import com.cmc.restaurant.menu.MenuDtos.MenuItemResponse;
import com.cmc.restaurant.menu.MenuDtos.ToggleAvailabilityRequest;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ApiException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mirrors hai endpoint {@code /api/kitchen/menu-items} trong {@code Menu/MenuEndpoints.cs} (#92).
 *
 * <p>Vì sao bếp cần endpoint riêng thay vì dùng lại hai cái đã có — chú thích trong bản .NET nói
 * thẳng: {@code GET /api/menu} <b>giấu</b> món đã tắt, còn {@code /api/admin/menu-items} chỉ Admin
 * vào được. Bếp cần thấy CẢ món đã tắt thì mới bật lại được, nhưng không được cấp quyền CRUD thực
 * đơn đầy đủ.
 *
 * <p>Một bất đối xứng CÓ THẬT trong bản .NET và được giữ nguyên ở đây: chỉ đường bếp mới bắn sự
 * kiện realtime và xoá cache của dịch vụ AI. Đường admin ({@code PATCH /api/admin/menu-items/*})
 * chỉ ghi cơ sở dữ liệu. Có thể coi đó là thiếu sót của bản .NET, nhưng M11 là port cho THAY THẾ
 * được — sửa hành vi ở đây sẽ làm hai bản khác nhau và phá luôn cơ sở để so khớp.
 */
@RestController
@RequestMapping("/api/kitchen/menu-items")
@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'Admin')")
public class KitchenMenuController {

	private final MenuItemRepository menuItemRepository;
	private final CategoryRepository categoryRepository;
	private final MenuItemService menuItemService;
	private final OrderRealtimeNotifier realtimeNotifier;

	public KitchenMenuController(
			MenuItemRepository menuItemRepository, CategoryRepository categoryRepository,
			MenuItemService menuItemService, OrderRealtimeNotifier realtimeNotifier) {
		this.menuItemRepository = menuItemRepository;
		this.categoryRepository = categoryRepository;
		this.menuItemService = menuItemService;
		this.realtimeNotifier = realtimeNotifier;
	}

	/**
	 * Món thuộc các danh mục ĐANG BẬT, sắp theo tên, gồm cả món đã tắt.
	 *
	 * <p>Lọc theo danh mục đang bật chứ không trả toàn bộ bảng: một danh mục bị tắt nghĩa là cả
	 * nhóm món đó tạm không phục vụ, nên đưa chúng lên màn hình bếp chỉ gây nhiễu.
	 */
	@GetMapping
	public List<MenuItemResponse> list() {
		List<CategoryEntity> activeCategories = categoryRepository.findByActiveTrueOrderByDisplayOrderAscNameAsc();
		Map<String, String> categoryNames = activeCategories.stream()
				.collect(Collectors.toMap(CategoryEntity::getId, CategoryEntity::getName));

		return menuItemRepository
				.findByCategoryIdInOrderByNameAsc(activeCategories.stream().map(CategoryEntity::getId).toList())
				.stream()
				.map(item -> MenuQueryService.toResponse(item, categoryNames.getOrDefault(item.getCategoryId(), "")))
				.toList();
	}

	@PatchMapping("/{menuItemId}/availability")
	public MenuItemResponse toggleAvailability(
			@PathVariable String menuItemId,
			@RequestBody(required = false) ToggleAvailabilityRequest request) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}

		MenuItemEntity item = menuItemService.toggleAvailability(menuItemId, request.isAvailable());

		realtimeNotifier.menuAvailabilityChanged(new RealtimeDtos.MenuAvailabilityChangedEvent(
				item.getId(), item.getName(), item.isAvailable(), item.getUpdatedAt()));

		// Sau khi đã ghi và đã bắn realtime: nếu dịch vụ AI chết thì bếp vẫn tắt được món.

		return MenuQueryService.toResponse(
				item,
				categoryRepository.findById(item.getCategoryId()).map(CategoryEntity::getName).orElse(""));
	}
}
