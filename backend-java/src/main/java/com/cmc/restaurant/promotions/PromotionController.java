package com.cmc.restaurant.promotions;

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

	@PostMapping("/api/promotions/validate")
	public PromotionDtos.ValidatePromotionResponse validate(
			@RequestBody(required = false) PromotionDtos.ValidatePromotionRequest request) {
		return promotionService.validate(request);
	}
}
