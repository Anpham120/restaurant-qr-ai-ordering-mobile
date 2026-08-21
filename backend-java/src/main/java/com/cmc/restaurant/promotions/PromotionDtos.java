package com.cmc.restaurant.promotions;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Mirrors the customer-facing part of {@code PromotionContracts} (.NET). */
public final class PromotionDtos {

	private PromotionDtos() {
	}

	/**
	 * Một khuyến mãi đang chạy, cho màn hình danh sách của app (§9.10 M1 mục 3).
	 *
	 * <p>CÓ trả {@code code}: cả mục đích của màn hình là để khách dùng được mã.
	 *
	 * <p>CÓ trả {@code minOrderAmount} kể cả khi null: khách cần biết ngưỡng để quyết định gọi thêm
	 * món. Lọc mất những mã chưa đủ điều kiện sẽ giấu đi đúng thông tin đó.
	 *
	 * <p>KHÔNG trả {@code id}: khách không dùng tới, và mọi trường thừa là một trường phải giữ
	 * tương thích về sau.
	 */
	public record ActivePromotionResponse(
			String code, String name, String description, String type, BigDecimal discountValue,
			BigDecimal minOrderAmount, BigDecimal maxDiscountAmount, boolean isFlashSale,
			OffsetDateTime endsAt) {
	}

	/** Bọc trong đối tượng chứ không trả mảng trần — mảng JSON ở gốc phản hồi khoá cứng hình dạng,
	 * thêm một trường (ví dụ tổng số) về sau sẽ thành thay đổi phá vỡ. */
	public record ActivePromotionListResponse(java.util.List<ActivePromotionResponse> items) {
	}

	public record ValidatePromotionRequest(String code, BigDecimal subtotalAmount) {
	}

	public record ValidatePromotionResponse(
			String code, String name, String description, boolean isFlashSale,
			BigDecimal subtotalAmount, BigDecimal discountAmount, BigDecimal totalAmount) {
	}
}
