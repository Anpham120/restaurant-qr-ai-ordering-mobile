package com.cmc.restaurant.promotions;

import com.cmc.restaurant.promotions.domain.Promotion;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Mirrors {@code PromotionCalculator.TryApplyAsync} (.NET). The rules live in {@link Promotion};
 * this only looks the code up. */
@Service
public class PromotionService {

	private final PromotionRepository promotionRepository;

	public PromotionService(PromotionRepository promotionRepository) {
		this.promotionRepository = promotionRepository;
	}

	public PromotionDtos.ValidatePromotionResponse validate(PromotionDtos.ValidatePromotionRequest request) {
		BigDecimal subtotal = request == null || request.subtotalAmount() == null
				? BigDecimal.ZERO : request.subtotalAmount();
		PromotionEntity entity = requireByCode(request == null ? null : request.code());
		Promotion.Discount discount = entity.toDomain().applyTo(subtotal, OffsetDateTime.now());

		return new PromotionDtos.ValidatePromotionResponse(
				entity.getCode(), entity.getName(), entity.getDescription(), entity.isFlashSale(),
				subtotal, discount.discountAmount(), discount.totalAmount());
	}

	/**
	 * Applies a code during checkout. Returns empty when no code was supplied — an order without a
	 * promotion is normal, so that must not be an error; only a code that was given and is unusable
	 * throws.
	 */
	public Optional<Promotion.Discount> tryApply(String promotionCode, BigDecimal subtotal, OffsetDateTime now) {
		if (Promotion.normalizeCode(promotionCode) == null) {
			return Optional.empty();
		}
		return Optional.of(requireByCode(promotionCode).toDomain().applyTo(subtotal, now));
	}

	private PromotionEntity requireByCode(String promotionCode) {
		String normalized = Promotion.normalizeCode(promotionCode);
		if (normalized == null) {
			throw ApiException.badRequest("PROMOTION_CODE_REQUIRED", "Promotion code is required.");
		}
		return promotionRepository.findByCode(normalized)
				.orElseThrow(() -> ApiException.notFound("PROMOTION_NOT_FOUND", "Promotion code was not found."));
	}
}
