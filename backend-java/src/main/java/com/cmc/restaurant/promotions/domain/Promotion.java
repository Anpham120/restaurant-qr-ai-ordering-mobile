package com.cmc.restaurant.promotions.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Locale;

/**
 * A discount code and the rules for applying it. Ported from {@code PromotionCalculator.cs} (.NET).
 *
 * <p>Money rules, so the three caps are stated explicitly and in order rather than left implicit:
 * a percentage discount is capped by {@code maxDiscountAmount} if one is set, and <em>every</em>
 * discount is finally capped by the subtotal itself. Without that last cap a fixed-amount voucher
 * larger than the bill would produce a negative total — the restaurant paying the customer to eat.
 */
public class Promotion {

	private final String id;
	private final String code;
	private final String name;
	private final PromotionType type;
	private final BigDecimal discountValue;
	private final BigDecimal minOrderAmount;
	private final BigDecimal maxDiscountAmount;
	private final OffsetDateTime startsAt;
	private final OffsetDateTime endsAt;
	private final boolean active;

	public Promotion(
			String id, String code, String name, PromotionType type, BigDecimal discountValue,
			BigDecimal minOrderAmount, BigDecimal maxDiscountAmount, OffsetDateTime startsAt,
			OffsetDateTime endsAt, boolean active) {
		this.id = id;
		this.code = code;
		this.name = name;
		this.type = type;
		this.discountValue = discountValue;
		this.minOrderAmount = minOrderAmount;
		this.maxDiscountAmount = maxDiscountAmount;
		this.startsAt = startsAt;
		this.endsAt = endsAt;
		this.active = active;
	}

	/** Result of applying a code: what comes off, and what is left to pay. */
	public record Discount(String promotionId, BigDecimal discountAmount, BigDecimal totalAmount) {
	}

	/**
	 * Validates the code against this order and returns the discount.
	 *
	 * @throws PromotionRuleViolation with the same error codes the .NET endpoint returned, so the
	 *     existing client keeps distinguishing "expired" from "minimum not met"
	 */
	/**
	 * Khuyến mãi có đang chạy tại thời điểm {@code now} không — dùng để LIỆT KÊ, không phải để áp.
	 *
	 * <p>Tách khỏi {@link #applyTo} vì hai câu hỏi khác nhau: hàm kia hỏi "mã này dùng được cho ĐƠN
	 * NÀY không" và cố ý trả ba mã lỗi riêng (INACTIVE / NOT_STARTED / EXPIRED) để khách biết vì
	 * sao; hàm này hỏi "có nên hiện mã này trong danh sách không". Gộp lại sẽ mất ba mã lỗi đó.
	 *
	 * <p>KHÔNG xét {@code minOrderAmount}: đó là điều kiện của từng đơn, không phải của khuyến mãi.
	 * Ẩn mã chỉ vì giỏ hiện tại chưa đủ tiền là giấu đi đúng thông tin khách cần để quyết định gọi
	 * thêm món. App hiện ngưỡng đó ra thay vì lọc mất.
	 *
	 * <p>Ba điều kiện dưới đây phải khớp đúng ba nhánh ném lỗi đầu {@link #applyTo}. Đó là bất biến
	 * có phép kiểm riêng: một mã đã liệt kê mà lúc áp lại bị từ chối là lỗi tệ nhất của màn hình
	 * khuyến mãi — khách thấy nó, gõ nó, và bị chối.
	 */
	public boolean isActiveAt(OffsetDateTime now) {
		if (!active) {
			return false;
		}
		if (startsAt != null && now.isBefore(startsAt)) {
			return false;
		}
		return endsAt == null || !now.isAfter(endsAt);
	}

	public Discount applyTo(BigDecimal subtotal, OffsetDateTime now) {
		if (!active) {
			throw new PromotionRuleViolation("PROMOTION_INACTIVE", "Promotion is not active.");
		}
		if (startsAt != null && now.isBefore(startsAt)) {
			throw new PromotionRuleViolation("PROMOTION_NOT_STARTED", "Promotion has not started yet.");
		}
		if (endsAt != null && now.isAfter(endsAt)) {
			throw new PromotionRuleViolation("PROMOTION_EXPIRED", "Promotion has expired.");
		}
		if (minOrderAmount != null && subtotal.compareTo(minOrderAmount) < 0) {
			throw new PromotionRuleViolation("PROMOTION_MIN_ORDER_NOT_MET",
					"Order subtotal must be at least "
							+ minOrderAmount.setScale(0, RoundingMode.DOWN).toPlainString() + " VND.");
		}

		BigDecimal discount = switch (type) {
			// HALF_UP matches .NET's MidpointRounding.AwayFromZero, which rounds a half-dong in the
			// customer's favour. Java's default for BigDecimal division would throw instead.
			case Percentage -> subtotal.multiply(discountValue)
					.divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
			case FixedAmount -> discountValue;
		};

		if (maxDiscountAmount != null) {
			discount = discount.min(maxDiscountAmount);
		}
		// Final cap: a discount can never exceed the bill.
		discount = discount.min(subtotal);

		return new Discount(id, discount, subtotal.subtract(discount).max(BigDecimal.ZERO));
	}

	/** Codes are matched case-insensitively; stored and compared upper-case. */
	public static String normalizeCode(String promotionCode) {
		if (promotionCode == null || promotionCode.isBlank()) {
			return null;
		}
		return promotionCode.trim().toUpperCase(Locale.ROOT);
	}

	public String id() {
		return id;
	}

	public String code() {
		return code;
	}

	public String name() {
		return name;
	}

	public PromotionType type() {
		return type;
	}

	public BigDecimal discountValue() {
		return discountValue;
	}

	/**
	 * Luật về một ĐỊNH NGHĨA khuyến mãi hợp lệ — quản trị viên tạo hoặc sửa mã (#93).
	 *
	 * <p>Khác hẳn {@link #applyTo}: hàm kia hỏi "mã này dùng được cho đơn này không", hàm này hỏi
	 * "bản thân định nghĩa có hợp lệ không". Hai câu hỏi khác nhau nên tách riêng, nhưng cùng nằm ở
	 * domain vì cùng là luật về khuyến mãi — để ở controller thì đường tạo mã thứ hai sau này sẽ bỏ
	 * qua được chúng.
	 *
	 * <p>Mã lỗi giữ nguyên chuỗi của bản .NET; {@code GlobalExceptionHandler} dịch
	 * {@link PromotionRuleViolation} thành HTTP 400, đúng như {@code ApiResults.BadRequest}.
	 */
	public static void validateDefinition(
			String code, String name, PromotionType type, BigDecimal discountValue,
			OffsetDateTime startsAt, OffsetDateTime endsAt) {
		if (code == null || code.isBlank()) {
			throw new PromotionRuleViolation("PROMOTION_CODE_REQUIRED", "Promotion code is required.");
		}
		if (name == null || name.isBlank()) {
			throw new PromotionRuleViolation("PROMOTION_NAME_REQUIRED", "Promotion name is required.");
		}
		if (type == null) {
			throw new PromotionRuleViolation("PROMOTION_TYPE_INVALID", "Promotion type is invalid.");
		}
		if (discountValue == null || discountValue.signum() <= 0) {
			throw new PromotionRuleViolation("PROMOTION_DISCOUNT_INVALID",
					"Discount value must be greater than zero.");
		}
		// Chỉ so khi CẢ HAI mốc cùng có. Khuyến mãi để trống một đầu là hợp lệ: "từ ngày X trở đi"
		// và "tới hết ngày Y" đều là cách dùng thật.
		if (startsAt != null && endsAt != null && startsAt.isAfter(endsAt)) {
			throw new PromotionRuleViolation("PROMOTION_DATE_RANGE_INVALID",
					"Promotion start date must be before end date.");
		}
	}
}
