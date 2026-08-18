package com.cmc.restaurant.promotions.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionTest {

	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-18T12:00:00Z");

	private static Promotion percentage(int percent, BigDecimal maxDiscount, BigDecimal minOrder) {
		return new Promotion("p1", "SALE", "Sale", PromotionType.Percentage,
				BigDecimal.valueOf(percent), minOrder, maxDiscount, null, null, true);
	}

	private static Promotion fixedAmount(String value) {
		return new Promotion("p2", "FIX", "Fixed", PromotionType.FixedAmount,
				new BigDecimal(value), null, null, null, null, true);
	}

	private static String codeOf(Throwable t) {
		return ((PromotionRuleViolation) t).code();
	}

	// --- tính tiền ------------------------------------------------------------------------------

	@Test
	@DisplayName("Giảm 10% của 200.000 = 20.000")
	void percentageDiscount() {
		Promotion.Discount d = percentage(10, null, null).applyTo(new BigDecimal("200000"), NOW);

		assertThat(d.discountAmount()).isEqualByComparingTo("20000");
		assertThat(d.totalAmount()).isEqualByComparingTo("180000");
	}

	@Test
	@DisplayName("Nửa đồng làm tròn LÊN — nghiêng về phía khách, khớp AwayFromZero của .NET")
	void halfDongRoundsInCustomersFavour() {
		// 15% của 55.000 = 8.250 -> làm tròn 0 chữ số thập phân
		Promotion.Discount d = percentage(15, null, null).applyTo(new BigDecimal("55000"), NOW);

		assertThat(d.discountAmount()).isEqualByComparingTo("8250");
	}

	@Test
	@DisplayName("Trần giảm giá chặn phần trăm")
	void maxDiscountCapsPercentage() {
		Promotion.Discount d = percentage(50, new BigDecimal("30000"), null)
				.applyTo(new BigDecimal("200000"), NOW);

		assertThat(d.discountAmount()).isEqualByComparingTo("30000");
	}

	@Test
	@DisplayName("Voucher lớn hơn hoá đơn: tổng về 0, KHÔNG âm")
	void discountNeverExceedsSubtotal() {
		Promotion.Discount d = fixedAmount("500000").applyTo(new BigDecimal("120000"), NOW);

		assertThat(d.discountAmount()).isEqualByComparingTo("120000");
		assertThat(d.totalAmount()).isEqualByComparingTo("0");
	}

	// --- điều kiện áp dụng ----------------------------------------------------------------------

	@Test
	@DisplayName("Mã đã tắt")
	void inactivePromotion() {
		Promotion off = new Promotion("p", "X", "X", PromotionType.FixedAmount,
				new BigDecimal("10000"), null, null, null, null, false);

		assertThatThrownBy(() -> off.applyTo(new BigDecimal("100000"), NOW))
				.extracting(PromotionTest::codeOf).isEqualTo("PROMOTION_INACTIVE");
	}

	@Test
	@DisplayName("Chưa tới ngày bắt đầu / đã quá hạn")
	void validityWindow() {
		Promotion notYet = new Promotion("p", "X", "X", PromotionType.FixedAmount,
				new BigDecimal("10000"), null, null, NOW.plusDays(1), null, true);
		Promotion expired = new Promotion("p", "X", "X", PromotionType.FixedAmount,
				new BigDecimal("10000"), null, null, null, NOW.minusDays(1), true);

		assertThatThrownBy(() -> notYet.applyTo(new BigDecimal("100000"), NOW))
				.extracting(PromotionTest::codeOf).isEqualTo("PROMOTION_NOT_STARTED");
		assertThatThrownBy(() -> expired.applyTo(new BigDecimal("100000"), NOW))
				.extracting(PromotionTest::codeOf).isEqualTo("PROMOTION_EXPIRED");
	}

	@Test
	@DisplayName("Chưa đạt giá trị đơn tối thiểu")
	void minimumOrderAmount() {
		Promotion p = percentage(10, null, new BigDecimal("200000"));

		assertThatThrownBy(() -> p.applyTo(new BigDecimal("150000"), NOW))
				.extracting(PromotionTest::codeOf).isEqualTo("PROMOTION_MIN_ORDER_NOT_MET");
		assertThat(p.applyTo(new BigDecimal("200000"), NOW).discountAmount())
				.as("đúng bằng ngưỡng thì hợp lệ").isEqualByComparingTo("20000");
	}

	@Test
	@DisplayName("Mã không phân biệt hoa thường")
	void codeIsCaseInsensitive() {
		assertThat(Promotion.normalizeCode(" sale10 ")).isEqualTo("SALE10");
		assertThat(Promotion.normalizeCode("  ")).isNull();
		assertThat(Promotion.normalizeCode(null)).isNull();
	}
}
