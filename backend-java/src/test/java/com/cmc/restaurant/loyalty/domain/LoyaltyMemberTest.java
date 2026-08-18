package com.cmc.restaurant.loyalty.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LoyaltyMemberTest {

	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-18T12:00:00Z");

	private static LoyaltyMember member(int points, String lifetimeSpend) {
		return new LoyaltyMember("loy_1", "0901234567", "Khách", points, new BigDecimal(lifetimeSpend), NOW);
	}

	// --- tính điểm ------------------------------------------------------------------------------

	@Test
	@DisplayName("1 điểm cho mỗi 10.000đ")
	void onePointPerTenThousand() {
		assertThat(LoyaltyMember.pointsFor(new BigDecimal("120000"))).isEqualTo(12);
	}

	@Test
	@DisplayName("Làm tròn XUỐNG: 19.999đ được 1 điểm, không phải 2")
	void roundsDown() {
		assertThat(LoyaltyMember.pointsFor(new BigDecimal("19999"))).isEqualTo(1);
		assertThat(LoyaltyMember.pointsFor(new BigDecimal("9999"))).isZero();
	}

	@Test
	@DisplayName("Chia nhỏ đơn KHÔNG lợi hơn gộp — hệ quả của việc làm tròn xuống")
	void splittingBillsIsNotRewarded() {
		int oneBigOrder = LoyaltyMember.pointsFor(new BigDecimal("59000"));
		int fiveSmallOrders = 5 * LoyaltyMember.pointsFor(new BigDecimal("11800"));

		assertThat(oneBigOrder).isEqualTo(5);
		assertThat(fiveSmallOrders).as("chia nhỏ chỉ được 5 điểm, không hơn").isEqualTo(5);
	}

	@Test
	@DisplayName("Hoá đơn 0 hoặc âm không sinh điểm")
	void nonPositiveEarnsNothing() {
		assertThat(LoyaltyMember.pointsFor(BigDecimal.ZERO)).isZero();
		assertThat(LoyaltyMember.pointsFor(new BigDecimal("-50000"))).isZero();
		assertThat(LoyaltyMember.pointsFor(null)).isZero();
	}

	// --- cộng điểm ------------------------------------------------------------------------------

	@Test
	@DisplayName("Cộng điểm và cộng dồn tổng chi tiêu")
	void accrueAddsPointsAndSpend() {
		LoyaltyMember m = member(5, "50000");

		assertThat(m.accrue(new BigDecimal("120000"), NOW)).isEqualTo(12);
		assertThat(m.points()).isEqualTo(17);
		assertThat(m.lifetimeSpend()).isEqualByComparingTo("170000");
	}

	@Test
	@DisplayName("Hoá đơn quá nhỏ: không cộng gì, KHÔNG đụng tới lifetimeSpend")
	void tinyBillLeavesAccountUntouched() {
		LoyaltyMember m = member(5, "50000");

		assertThat(m.accrue(new BigDecimal("9999"), NOW)).isZero();
		assertThat(m.points()).isEqualTo(5);
		assertThat(m.lifetimeSpend()).as("không cộng điểm thì cũng không cộng chi tiêu")
				.isEqualByComparingTo("50000");
	}

	@Test
	@DisplayName("Đủ điểm mới đổi được ưu đãi")
	void redemptionThreshold() {
		LoyaltyMember m = member(50, "500000");

		assertThat(m.canRedeem(50)).as("đúng bằng ngưỡng thì được").isTrue();
		assertThat(m.canRedeem(51)).isFalse();
	}

	// --- số điện thoại --------------------------------------------------------------------------

	@Test
	@DisplayName("Cùng một số gõ khác kiểu phải ra cùng một khoá")
	void phoneNormalisationKeepsOneAccount() {
		String canonical = PhoneNumber.normalize("0901234567");

		assertThat(PhoneNumber.normalize("0901 234 567")).isEqualTo(canonical);
		assertThat(PhoneNumber.normalize("0901-234-567")).isEqualTo(canonical);
		assertThat(PhoneNumber.normalize(" 0901.234.567 ")).isEqualTo(canonical);
	}

	@Test
	@DisplayName("Không có chữ số nào -> null, không tạo tài khoản rác")
	void blankPhoneIsRejected() {
		assertThat(PhoneNumber.normalize("   ")).isNull();
		assertThat(PhoneNumber.normalize("abc")).isNull();
		assertThat(PhoneNumber.normalize(null)).isNull();
	}
}
