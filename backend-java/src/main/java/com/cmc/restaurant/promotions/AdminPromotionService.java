package com.cmc.restaurant.promotions;

import com.cmc.restaurant.promotions.domain.Promotion;
import com.cmc.restaurant.promotions.domain.PromotionType;
import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Mirrors nhóm {@code /api/admin/promotions} trong {@code PromotionEndpoints.cs} (.NET) — #93. */
@Service
public class AdminPromotionService {

	private final PromotionRepository promotionRepository;

	public AdminPromotionService(PromotionRepository promotionRepository) {
		this.promotionRepository = promotionRepository;
	}

	@Transactional(readOnly = true)
	public List<PromotionEntity> list() {
		return promotionRepository.findAllByOrderByFlashSaleDescCodeAsc();
	}

	@Transactional(readOnly = true)
	public PromotionEntity get(String promotionId) {
		return promotionRepository.findById(promotionId)
				.orElseThrow(() -> ApiException.notFound("PROMOTION_NOT_FOUND", "Promotion was not found."));
	}

	@Transactional
	public PromotionEntity create(AdminPromotionDtos.PromotionRequest request) {
		Parsed parsed = validate(request);

		if (promotionRepository.existsByCode(parsed.code())) {
			throw ApiException.conflict("PROMOTION_CODE_EXISTS", "Promotion code already exists.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		PromotionEntity promotion = new PromotionEntity(
				"promo_" + UUID.randomUUID().toString().replace("-", ""), now);
		write(promotion, request, parsed, now);
		return promotionRepository.save(promotion);
	}

	@Transactional
	public PromotionEntity update(String promotionId, AdminPromotionDtos.PromotionRequest request) {
		Parsed parsed = validate(request);

		PromotionEntity promotion = promotionRepository.findById(promotionId)
				.orElseThrow(() -> ApiException.notFound("PROMOTION_NOT_FOUND", "Promotion was not found."));

		// `AndIdNot` là điểm mấu chốt: sửa mà giữ nguyên mã của chính nó thì KHÔNG phải trùng.
		if (promotionRepository.existsByCodeAndIdNot(parsed.code(), promotionId)) {
			throw ApiException.conflict("PROMOTION_CODE_EXISTS", "Promotion code already exists.");
		}

		write(promotion, request, parsed, OffsetDateTime.now());
		return promotionRepository.save(promotion);
	}

	@Transactional
	public void delete(String promotionId) {
		PromotionEntity promotion = promotionRepository.findById(promotionId)
				.orElseThrow(() -> ApiException.notFound("PROMOTION_NOT_FOUND", "Promotion was not found."));
		promotionRepository.delete(promotion);
	}

	// --- helper ---------------------------------------------------------------------------------

	private record Parsed(String code, PromotionType type) {
	}

	/**
	 * Kiểm tra và chuẩn hoá dữ liệu vào.
	 *
	 * <p>Thứ tự quan trọng: chuẩn hoá mã và phân giải loại TRƯỚC, rồi mới để
	 * {@link Promotion#validateDefinition} phán. Nhờ vậy một chuỗi loại không hợp lệ trả về
	 * {@code PROMOTION_TYPE_INVALID} thay vì ném {@code IllegalArgumentException} của
	 * {@code Enum.valueOf} — tức 400 có mã lỗi thay vì 500.
	 */
	private static Parsed validate(AdminPromotionDtos.PromotionRequest request) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		String code = Promotion.normalizeCode(request.code());
		PromotionType type = parseType(request.type());

		Promotion.validateDefinition(
				code, request.name(), type, request.discountValue(), request.startsAt(), request.endsAt());
		return new Parsed(code, type);
	}

	private static PromotionType parseType(String raw) {
		if (raw == null) {
			return null;
		}
		for (PromotionType candidate : PromotionType.values()) {
			if (candidate.name().equals(raw.trim())) {
				return candidate;
			}
		}
		return null;
	}

	private static void write(
			PromotionEntity promotion, AdminPromotionDtos.PromotionRequest request, Parsed parsed,
			OffsetDateTime now) {
		promotion.applyDefinition(
				parsed.code(),
				request.name().trim(),
				normalizeOptional(request.description()),
				parsed.type(),
				request.discountValue(),
				request.minOrderAmount(),
				request.maxDiscountAmount(),
				Boolean.TRUE.equals(request.isFlashSale()),
				request.startsAt(),
				request.endsAt(),
				Boolean.TRUE.equals(request.isActive()),
				now);
	}

	/** Chuỗi rỗng và chuỗi toàn khoảng trắng đều thành null — mirror {@code NormalizeOptional}. */
	private static String normalizeOptional(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}

	public static AdminPromotionDtos.PromotionResponse toResponse(PromotionEntity promotion) {
		return new AdminPromotionDtos.PromotionResponse(
				promotion.getId(), promotion.getCode(), promotion.getName(), promotion.getDescription(),
				promotion.getType().name(), promotion.getDiscountValue(), promotion.getMinOrderAmount(),
				promotion.getMaxDiscountAmount(), promotion.isFlashSale(), promotion.getStartsAt(),
				promotion.getEndsAt(), promotion.isActive(), promotion.getCreatedAt(),
				promotion.getUpdatedAt());
	}
}
