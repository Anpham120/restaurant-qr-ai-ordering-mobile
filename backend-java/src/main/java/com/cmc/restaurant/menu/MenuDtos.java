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

	/**
	 * @param prepMinutes phút từ lúc bếp nhận món tới lúc món sẵn sàng; {@code null} = chưa khai.
	 *     Có mặt cả ở thực đơn công khai — đây là con số vô hại và là thứ duy nhất giải thích được
	 *     vì sao món này ước lượng lâu hơn món kia.
	 */
	public record MenuItemResponse(
			String id, String name, String description, BigDecimal price, String categoryId,
			String categoryName, String imageUrl, boolean isAvailable, List<String> tags,
			Integer prepMinutes, List<MenuOptionGroup> optionGroups) {
	}

	public record CategoryRequest(String name, int displayOrder, Boolean isActive) {
	}

	/**
	 * @param prepMinutes phút từ lúc nhận món tới lúc món sẵn sàng.
	 *     <p>Khi SỬA món, {@code null} nghĩa là GIỮ NGUYÊN giá trị đang có, không phải xoá. Đây là
	 *     điểm khác với mọi trường khác của bản ghi này, và là chủ ý: {@code PUT} thay toàn bộ bản
	 *     ghi, nên nếu {@code null} là xoá thì bất kỳ ai sửa TÊN món bằng một client cũ — hay bằng
	 *     curl — cũng xoá luôn con số bếp đã khai, im lặng, và mọi ước lượng của món đó biến mất.
	 *     <p>Chưa có đường XOÁ giá trị. Sửa sai thì đặt số khác; "không còn biết nữa" là ca chưa gặp.
	 */
	public record MenuItemRequest(
			String categoryId, String name, String description, BigDecimal price, String imageUrl,
			Boolean isAvailable, List<String> tags, Integer prepMinutes, List<MenuOptionGroup> optionGroups) {
		public MenuItemRequest(String categoryId, String name, String description, BigDecimal price, String imageUrl,
				Boolean isAvailable, List<String> tags, Integer prepMinutes) {
			this(categoryId, name, description, price, imageUrl, isAvailable, tags, prepMinutes, null);
		}
	}

	public record ToggleAvailabilityRequest(boolean isAvailable) {
	}
}
