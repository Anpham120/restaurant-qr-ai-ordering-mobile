package com.cmc.restaurant.promotions;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors {@code POST /api/promotions/validate} (.NET) — the route the customer app calls before
 * checkout to preview a discount. Admin CRUD stays out of scope, same as the rest of the admin
 * surface in this port. */
@RestController
public class PromotionController {

	private final PromotionService promotionService;

	public PromotionController(PromotionService promotionService) {
		this.promotionService = promotionService;
	}

	/**
	 * Danh sách khuyến mãi đang chạy — endpoint MỚI cho app di động (§9.5, §9.10 M1 mục 3).
	 *
	 * <p>Công khai, cùng mức với {@code POST /api/promotions/validate} đã có. Không có gì để giấu:
	 * mã khuyến mãi là thứ quán in lên tờ rơi, và khách vãng lai trên web cũng phải xem được —
	 * bắt đăng nhập mới thấy khuyến mãi sẽ biến app thành cửa duy nhất, điều không ai quyết định.
	 */
	@GetMapping("/api/promotions/active")
	public PromotionDtos.ActivePromotionListResponse listActive() {
		return promotionService.listActive();
	}

	@PostMapping("/api/promotions/validate")
	public PromotionDtos.ValidatePromotionResponse validate(
			@RequestBody(required = false) PromotionDtos.ValidatePromotionRequest request) {
		return promotionService.validate(request);
	}
}
