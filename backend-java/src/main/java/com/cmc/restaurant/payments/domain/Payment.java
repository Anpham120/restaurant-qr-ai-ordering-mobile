package com.cmc.restaurant.payments.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.Set;

/**
 * The Payment aggregate. Payments carried 34 rule-bearing lines — the highest of any module — which
 * is why it gets a domain model under the same criterion used in issue #62 (invariant density, not
 * uniformity).
 *
 * <p>Everything here is about one question: <em>has the money arrived, and may this actor say so?</em>
 * Getting it wrong costs real money in one direction (marking an unpaid order as paid) or a real
 * customer dispute in the other, so the rules are stated once, here, instead of being spread across
 * the manual-confirmation path and the Casso webhook path as they were before.
 */
public class Payment {

	/** Money already arrived (or was returned). The webhook and the counter both treat these as
	 * "do not touch". */
	private static final Set<PaymentStatus> SETTLED =
			EnumSet.of(PaymentStatus.Confirmed, PaymentStatus.Paid, PaymentStatus.Refunded);

	/** A customer may not ask for payment twice while one is already in flight or done. */
	private static final Set<PaymentStatus> ALREADY_REQUESTED = EnumSet.of(
			PaymentStatus.Pending, PaymentStatus.Confirmed, PaymentStatus.Paid, PaymentStatus.Refunded);

	private static final int MAX_NOTE_LENGTH = 500;

	private final String id;
	private final BigDecimal amount;
	private PaymentStatus status;
	private PaymentMethod method;
	private String providerTransactionId;
	private OffsetDateTime paidAt;
	private OffsetDateTime updatedAt;

	public Payment(
			String id, BigDecimal amount, PaymentStatus status, PaymentMethod method,
			String providerTransactionId, OffsetDateTime paidAt, OffsetDateTime updatedAt) {
		this.id = id;
		this.amount = amount;
		this.status = status;
		this.method = method;
		this.providerTransactionId = providerTransactionId;
		this.paidAt = paidAt;
		this.updatedAt = updatedAt;
	}

	// --- customer ----------------------------------------------------------------------------

	/** Customer choosing how to pay. */
	public void request(PaymentMethod requested, String providerReference, OffsetDateTime now) {
		if (ALREADY_REQUESTED.contains(status)) {
			throw new PaymentRuleViolation(
					"PAYMENT_ALREADY_REQUESTED", "Payment was already requested or completed.");
		}
		this.method = requested;
		this.status = PaymentStatus.Pending;
		this.providerTransactionId = providerReference;
		this.updatedAt = now;
	}

	// --- counter (manual fallback, kept permanently per plan §6 mục #3) -----------------------

	public void confirmManually(String providerTransactionId, OffsetDateTime now) {
		guardManualTransition(PaymentStatus.Confirmed);
		this.status = PaymentStatus.Confirmed;
		if (providerTransactionId != null && !providerTransactionId.isBlank()) {
			this.providerTransactionId = providerTransactionId.trim();
		}
		this.paidAt = now;
		this.updatedAt = now;
	}

	public void failManually(OffsetDateTime now) {
		guardManualTransition(PaymentStatus.Failed);
		this.status = PaymentStatus.Failed;
		this.updatedAt = now;
	}

	public void refund(OffsetDateTime now) {
		if (status != PaymentStatus.Confirmed && status != PaymentStatus.Paid) {
			throw new PaymentRuleViolation(
					"PAYMENT_NOT_REFUNDABLE", "Only a confirmed or paid payment can be refunded.");
		}
		this.status = PaymentStatus.Refunded;
		this.updatedAt = now;
	}

	/** Mirrors {@code ValidateManualPaymentTransition} (.NET), including its per-target wording. */
	private void guardManualTransition(PaymentStatus next) {
		if (status == PaymentStatus.NotRequested || method == PaymentMethod.Unselected) {
			throw new PaymentRuleViolation("PAYMENT_NOT_REQUESTED", "Customer has not requested payment yet.");
		}
		if (status == PaymentStatus.Refunded) {
			throw new PaymentRuleViolation("PAYMENT_ALREADY_REFUNDED",
					"Refunded payment cannot be " + (next == PaymentStatus.Confirmed ? "confirmed" : "failed") + ".");
		}
		if (status == PaymentStatus.Confirmed || status == PaymentStatus.Paid) {
			throw new PaymentRuleViolation("PAYMENT_ALREADY_CONFIRMED",
					next == PaymentStatus.Confirmed
							? "Payment was already confirmed." : "Confirmed payment cannot be failed.");
		}
		if (status == PaymentStatus.Failed) {
			throw new PaymentRuleViolation("PAYMENT_ALREADY_FAILED",
					next == PaymentStatus.Confirmed
							? "Failed payment cannot be confirmed." : "Payment was already failed.");
		}
	}

	// --- bank reconciliation (hạn chế #3) ----------------------------------------------------

	/** What the Casso webhook decided about one bank transaction. */
	public enum ReconcileOutcome {
		Confirmed,
		/** Someone — almost always the counter, using the manual fallback — settled it first. */
		AlreadySettled,
		/** Deliberately not settled: settling a short transfer loses real money, and an
		 * over-transfer needs a human to decide on a refund. */
		AmountMismatch
	}

	/**
	 * Applies a bank transfer reported by Casso. Never forces a settlement it cannot justify — the
	 * two non-confirming outcomes are reported to the caller, which answers Casso 200 anyway so it
	 * stops retrying a transaction that was in fact handled.
	 */
	public ReconcileOutcome reconcileFromBank(String reference, BigDecimal received, OffsetDateTime now) {
		if (SETTLED.contains(status)) {
			return ReconcileOutcome.AlreadySettled;
		}
		// Whole-dong comparison: a VietQR transfer carries the truncated amount, so an order of
		// 110000.99 legitimately receives 110000.
		BigDecimal expected = amount.setScale(0, RoundingMode.DOWN);
		BigDecimal actual = received == null ? BigDecimal.valueOf(-1) : received.setScale(0, RoundingMode.DOWN);
		if (expected.compareTo(actual) != 0) {
			return ReconcileOutcome.AmountMismatch;
		}

		this.status = PaymentStatus.Confirmed;
		this.providerTransactionId = reference;
		this.paidAt = now;
		this.updatedAt = now;
		return ReconcileOutcome.Confirmed;
	}

	// --- shared ------------------------------------------------------------------------------

	public static void validateNote(String note) {
		if (note != null && note.trim().length() > MAX_NOTE_LENGTH) {
			throw new PaymentRuleViolation("PAYMENT_NOTE_TOO_LONG",
					"Payment note must be " + MAX_NOTE_LENGTH + " characters or fewer.");
		}
	}

	/** True once the money is in — the condition an order must meet before it can be completed. */
	public boolean isSettled() {
		return status == PaymentStatus.Confirmed || status == PaymentStatus.Paid;
	}

	public String id() {
		return id;
	}

	public BigDecimal amount() {
		return amount;
	}

	public PaymentStatus status() {
		return status;
	}

	public PaymentMethod method() {
		return method;
	}

	public String providerTransactionId() {
		return providerTransactionId;
	}

	public OffsetDateTime paidAt() {
		return paidAt;
	}

	public OffsetDateTime updatedAt() {
		return updatedAt;
	}
}
