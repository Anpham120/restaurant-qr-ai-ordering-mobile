package com.cmc.restaurant.counter.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CounterShiftTest {

	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-18T12:00:00Z");

	private static CounterShift openShift(String float_) {
		return CounterShift.open("cs_1", "u_1", new BigDecimal(float_), NOW);
	}

	private static String codeOf(Throwable t) {
		return ((CounterRuleViolation) t).code();
	}

	// --- mở ca ---------------------------------------------------------------------------------

	@Test
	@DisplayName("Mở ca: tiền kỳ vọng bắt đầu bằng đúng tiền quỹ đầu ca")
	void expectedStartsAtOpeningFloat() {
		CounterShift shift = openShift("500000");

		assertThat(shift.expectedCashTotal()).isEqualByComparingTo("500000");
		assertThat(shift.isOpen()).isTrue();
	}

	@Test
	@DisplayName("Quỹ đầu ca âm bị chặn")
	void negativeOpeningFloatRejected() {
		assertThatThrownBy(() -> CounterShift.open("cs", "u", new BigDecimal("-1"), NOW))
				.extracting(CounterShiftTest::codeOf).isEqualTo("COUNTER_SHIFT_OPEN_INVALID");
	}

	// --- lệch quỹ ------------------------------------------------------------------------------

	@Test
	@DisplayName("Đếm ĐÚNG bằng kỳ vọng -> lệch 0")
	void balancedDrawer() {
		CounterShift shift = openShift("500000");
		shift.recordCashPayment(new BigDecimal("300000"), NOW);

		shift.close("u_2", new BigDecimal("800000"), null, NOW);

		assertThat(shift.cashVariance()).isEqualByComparingTo("0");
	}

	@Test
	@DisplayName("THIẾU tiền -> lệch ÂM (giữ dấu, không lấy trị tuyệt đối)")
	void shortDrawerIsNegative() {
		CounterShift shift = openShift("500000");
		shift.recordCashPayment(new BigDecimal("300000"), NOW);

		shift.close("u_2", new BigDecimal("750000"), "thiếu 50k", NOW);

		assertThat(shift.cashVariance()).as("âm = mất tiền").isEqualByComparingTo("-50000");
	}

	@Test
	@DisplayName("THỪA tiền -> lệch DƯƠNG; hai hướng là hai vấn đề khác nhau")
	void overDrawerIsPositive() {
		CounterShift shift = openShift("500000");

		shift.close("u_2", new BigDecimal("530000"), null, NOW);

		assertThat(shift.cashVariance()).isEqualByComparingTo("30000");
	}

	@Test
	@DisplayName("Tiền đếm được âm bị chặn")
	void negativeCountedCashRejected() {
		CounterShift shift = openShift("500000");

		assertThatThrownBy(() -> shift.close("u", new BigDecimal("-1"), null, NOW))
				.extracting(CounterShiftTest::codeOf).isEqualTo("COUNTER_SHIFT_CLOSE_INVALID");
	}

	// --- đóng ca -------------------------------------------------------------------------------

	@Test
	@DisplayName("Đóng ca hai lần bị chặn — con số lệch đã được báo cáo rồi")
	void cannotCloseTwice() {
		CounterShift shift = openShift("500000");
		shift.close("u_2", new BigDecimal("500000"), null, NOW);

		assertThatThrownBy(() -> shift.close("u_3", new BigDecimal("999999"), null, NOW))
				.extracting(CounterShiftTest::codeOf).isEqualTo("COUNTER_SHIFT_ALREADY_CLOSED");
		assertThat(shift.actualCashTotal()).as("lần hai không được ghi đè").isEqualByComparingTo("500000");
	}

	@Test
	@DisplayName("Ghi nhận ai đóng ca và lúc nào")
	void closeRecordsWhoAndWhen() {
		CounterShift shift = openShift("500000");

		shift.close("u_2", new BigDecimal("500000"), "  ca sáng  ", NOW);

		assertThat(shift.closedByUserId()).isEqualTo("u_2");
		assertThat(shift.closedAt()).isEqualTo(NOW);
		assertThat(shift.closeNote()).isEqualTo("ca sáng");
	}

	// --- điều chỉnh ----------------------------------------------------------------------------

	@Test
	@DisplayName("Điều chỉnh dời tiền kỳ vọng theo cả hai chiều")
	void adjustmentMovesExpectedTotal() {
		CounterShift shift = openShift("500000");

		shift.recordAdjustment("PAYOUT", new BigDecimal("-100000"), NOW);
		assertThat(shift.expectedCashTotal()).isEqualByComparingTo("400000");

		shift.recordAdjustment("TOPUP", new BigDecimal("50000"), NOW);
		assertThat(shift.expectedCashTotal()).isEqualByComparingTo("450000");
	}

	@Test
	@DisplayName("Điều chỉnh phải có lý do — không cho sửa quỹ mà không giải thích")
	void adjustmentNeedsReason() {
		CounterShift shift = openShift("500000");

		assertThatThrownBy(() -> shift.recordAdjustment("  ", new BigDecimal("100000"), NOW))
				.extracting(CounterShiftTest::codeOf).isEqualTo("COUNTER_ADJUSTMENT_INVALID");
	}

	@Test
	@DisplayName("Ca đã đóng thì KHÔNG điều chỉnh được — không viết lại con số đã báo cáo")
	void cannotAdjustClosedShift() {
		CounterShift shift = openShift("500000");
		shift.close("u_2", new BigDecimal("450000"), null, NOW);

		assertThatThrownBy(() -> shift.recordAdjustment("FIX", new BigDecimal("50000"), NOW))
				.extracting(CounterShiftTest::codeOf).isEqualTo("COUNTER_SHIFT_CLOSED");
		assertThat(shift.cashVariance()).as("lệch quỹ đã chốt thì giữ nguyên")
				.isEqualByComparingTo("-50000");
	}
}
