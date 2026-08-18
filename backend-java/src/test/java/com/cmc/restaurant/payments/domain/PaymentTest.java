package com.cmc.restaurant.payments.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** The payment state machine and the bank-reconciliation rules, without Spring or a database. */
class PaymentTest {

	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-18T12:00:00Z");

	private static Payment payment(PaymentStatus status, PaymentMethod method) {
		return new Payment("pay_1", new BigDecimal("110000.00"), status, method, null, null, NOW);
	}

	private static String codeOf(Throwable t) {
		return ((PaymentRuleViolation) t).code();
	}

	// --- request -------------------------------------------------------------------------------

	@Test
	@DisplayName("Yêu cầu thanh toán lần đầu -> Pending")
	void firstRequestGoesPending() {
		Payment p = payment(PaymentStatus.NotRequested, PaymentMethod.Unselected);

		p.request(PaymentMethod.COD, null, NOW);

		assertThat(p.status()).isEqualTo(PaymentStatus.Pending);
		assertThat(p.method()).isEqualTo(PaymentMethod.COD);
	}

	@Test
	@DisplayName("Yêu cầu lần hai khi đang chờ -> chặn")
	void secondRequestIsRejected() {
		Payment p = payment(PaymentStatus.Pending, PaymentMethod.COD);

		assertThatThrownBy(() -> p.request(PaymentMethod.VietQR, null, NOW))
				.isInstanceOf(PaymentRuleViolation.class)
				.extracting(PaymentTest::codeOf).isEqualTo("PAYMENT_ALREADY_REQUESTED");
	}

	@Test
	@DisplayName("Chỉ COD và VietQR mới đặt được; Unselected không phải lựa chọn")
	void onlyRealMethodsAreRequestable() {
		assertThat(PaymentMethod.parseRequestable("COD")).contains(PaymentMethod.COD);
		assertThat(PaymentMethod.parseRequestable("VietQR")).contains(PaymentMethod.VietQR);
		assertThat(PaymentMethod.parseRequestable("Unselected")).isEmpty();
		assertThat(PaymentMethod.parseRequestable("Bitcoin")).isEmpty();
	}

	// --- manual confirm/fail/refund ------------------------------------------------------------

	@Test
	@DisplayName("Chưa yêu cầu thì quầy không xác nhận được")
	void cannotConfirmBeforeRequest() {
		Payment p = payment(PaymentStatus.NotRequested, PaymentMethod.Unselected);

		assertThatThrownBy(() -> p.confirmManually(null, NOW))
				.extracting(PaymentTest::codeOf).isEqualTo("PAYMENT_NOT_REQUESTED");
	}

	@Test
	@DisplayName("Xác nhận rồi thì không xác nhận lại, cũng không đánh thất bại")
	void confirmedIsFinalForBothDirections() {
		Payment p = payment(PaymentStatus.Confirmed, PaymentMethod.COD);

		assertThatThrownBy(() -> p.confirmManually(null, NOW))
				.extracting(PaymentTest::codeOf).isEqualTo("PAYMENT_ALREADY_CONFIRMED");
		assertThatThrownBy(() -> p.failManually(NOW))
				.extracting(PaymentTest::codeOf).isEqualTo("PAYMENT_ALREADY_CONFIRMED");
	}

	@Test
	@DisplayName("Đã hoàn tiền thì không quay lại được")
	void refundedIsTerminal() {
		Payment p = payment(PaymentStatus.Refunded, PaymentMethod.COD);

		assertThatThrownBy(() -> p.confirmManually(null, NOW))
				.extracting(PaymentTest::codeOf).isEqualTo("PAYMENT_ALREADY_REFUNDED");
	}

	@Test
	@DisplayName("Chỉ hoàn được tiền đã thu")
	void refundRequiresSettledMoney() {
		assertThatThrownBy(() -> payment(PaymentStatus.Pending, PaymentMethod.COD).refund(NOW))
				.extracting(PaymentTest::codeOf).isEqualTo("PAYMENT_NOT_REFUNDABLE");

		Payment confirmed = payment(PaymentStatus.Confirmed, PaymentMethod.COD);
		confirmed.refund(NOW);
		assertThat(confirmed.status()).isEqualTo(PaymentStatus.Refunded);
	}

	@Test
	@DisplayName("Paid được đối xử như Confirmed: tiền đã về")
	void paidCountsAsSettled() {
		assertThat(payment(PaymentStatus.Paid, PaymentMethod.COD).isSettled()).isTrue();
		assertThat(payment(PaymentStatus.Pending, PaymentMethod.COD).isSettled()).isFalse();
	}

	// --- hạn chế #3: đối soát ngân hàng --------------------------------------------------------

	@Test
	@DisplayName("Chuyển đúng số tiền -> tự xác nhận, lưu mã giao dịch")
	void matchingTransferConfirms() {
		Payment p = payment(PaymentStatus.Pending, PaymentMethod.VietQR);

		assertThat(p.reconcileFromBank("FT-1", new BigDecimal("110000"), NOW))
				.isEqualTo(Payment.ReconcileOutcome.Confirmed);
		assertThat(p.status()).isEqualTo(PaymentStatus.Confirmed);
		assertThat(p.providerTransactionId()).isEqualTo("FT-1");
		assertThat(p.paidAt()).isEqualTo(NOW);
	}

	@Test
	@DisplayName("Số tiền lẻ: đơn 110000.99 nhận 110000 vẫn hợp lệ (VietQR cắt phần lẻ)")
	void wholeDongComparison() {
		Payment p = new Payment("pay_1", new BigDecimal("110000.99"),
				PaymentStatus.Pending, PaymentMethod.VietQR, null, null, NOW);

		assertThat(p.reconcileFromBank("FT-1", new BigDecimal("110000"), NOW))
				.isEqualTo(Payment.ReconcileOutcome.Confirmed);
	}

	@Test
	@DisplayName("Chuyển thiếu -> KHÔNG xác nhận, giữ nguyên Pending")
	void shortTransferIsNotSettled() {
		Payment p = payment(PaymentStatus.Pending, PaymentMethod.VietQR);

		assertThat(p.reconcileFromBank("FT-1", new BigDecimal("50000"), NOW))
				.isEqualTo(Payment.ReconcileOutcome.AmountMismatch);
		assertThat(p.status()).as("tiền chưa đủ thì đơn phải còn chờ").isEqualTo(PaymentStatus.Pending);
	}

	@Test
	@DisplayName("Quầy xác nhận tay trước -> webhook KHÔNG ghi đè")
	void manualConfirmationWinsOverLateWebhook() {
		Payment p = payment(PaymentStatus.Confirmed, PaymentMethod.VietQR);

		assertThat(p.reconcileFromBank("FT-LATE", new BigDecimal("110000"), NOW))
				.isEqualTo(Payment.ReconcileOutcome.AlreadySettled);
		assertThat(p.providerTransactionId()).as("không ghi đè quyết định của người").isNull();
	}

	@Test
	@DisplayName("Ghi chú quá 500 ký tự bị chặn")
	void noteLengthIsCapped() {
		Payment.validateNote("x".repeat(500));
		assertThatThrownBy(() -> Payment.validateNote("x".repeat(501)))
				.extracting(PaymentTest::codeOf).isEqualTo("PAYMENT_NOTE_TOO_LONG");
	}
}
