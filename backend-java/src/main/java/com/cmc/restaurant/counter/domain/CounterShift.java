package com.cmc.restaurant.counter.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One cashier shift and its cash drawer. Ported from {@code CounterShiftEndpoints.cs} (.NET).
 *
 * <p>This aggregate exists to keep one number honest: {@code cashVariance}, the gap between what
 * the till should hold and what the cashier actually counted. It is the figure a manager reads when
 * money goes missing, so the rules around it are stated here rather than spread across endpoints.
 *
 * <p>The plan (§7.2) already flagged the matching UX gap on the ops side: closing a shift is
 * irreversible and adjusts the cash record, yet the web UI asks for no confirmation. This class is
 * the server-side half of that — it will not let a closed shift be closed again or adjusted.
 */
public class CounterShift {

	private final String id;
	private final String openedByUserId;
	private CounterShiftStatus status;
	private final BigDecimal openingCashBalance;
	private BigDecimal expectedCashTotal;
	private BigDecimal actualCashTotal;
	private BigDecimal cashVariance;
	private String closedByUserId;
	private String closeNote;
	private OffsetDateTime closedAt;
	private OffsetDateTime updatedAt;

	public CounterShift(
			String id, String openedByUserId, CounterShiftStatus status, BigDecimal openingCashBalance,
			BigDecimal expectedCashTotal, BigDecimal actualCashTotal, BigDecimal cashVariance,
			String closedByUserId, String closeNote, OffsetDateTime closedAt, OffsetDateTime updatedAt) {
		this.id = id;
		this.openedByUserId = openedByUserId;
		this.status = status;
		this.openingCashBalance = openingCashBalance;
		this.expectedCashTotal = expectedCashTotal;
		this.actualCashTotal = actualCashTotal;
		this.cashVariance = cashVariance;
		this.closedByUserId = closedByUserId;
		this.closeNote = closeNote;
		this.closedAt = closedAt;
		this.updatedAt = updatedAt;
	}

	/** A shift starts with whatever float is already in the drawer; the expected total starts equal
	 * to it and grows with every cash payment and adjustment. */
	public static CounterShift open(String id, String openedByUserId, BigDecimal openingCashBalance,
			OffsetDateTime now) {
		if (openingCashBalance == null || openingCashBalance.signum() < 0) {
			throw new CounterRuleViolation(
					"COUNTER_SHIFT_OPEN_INVALID", "Opening cash balance must be zero or greater.");
		}
		return new CounterShift(id, openedByUserId, CounterShiftStatus.Open, openingCashBalance,
				openingCashBalance, null, null, null, null, null, now);
	}

	/**
	 * Closes the shift and records the variance.
	 *
	 * <p>{@code variance = counted - expected}. The sign is meaningful and must not be made
	 * absolute: negative means money is missing, positive means the drawer holds more than the
	 * system knows about. Both need explaining, but they are different problems.
	 */
	public void close(String closedByUserId, BigDecimal actualCashTotal, String closeNote, OffsetDateTime now) {
		if (actualCashTotal == null || actualCashTotal.signum() < 0) {
			throw new CounterRuleViolation(
					"COUNTER_SHIFT_CLOSE_INVALID", "Actual cash total must be zero or greater.");
		}
		if (status != CounterShiftStatus.Open) {
			throw new CounterRuleViolation("COUNTER_SHIFT_ALREADY_CLOSED", "This shift is already closed.");
		}

		this.status = CounterShiftStatus.Closed;
		this.closedByUserId = closedByUserId;
		this.actualCashTotal = actualCashTotal;
		this.cashVariance = actualCashTotal.subtract(expectedCashTotal);
		this.closeNote = closeNote == null || closeNote.isBlank() ? null : closeNote.trim();
		this.closedAt = now;
		this.updatedAt = now;
	}

	/**
	 * Records a manual cash correction (a payout, a float top-up, a miscount found mid-shift) and
	 * moves the expected total with it.
	 *
	 * <p>Only allowed while the shift is open: once closed, the variance has been reported and
	 * signed off, so changing the expected total afterwards would silently rewrite a number someone
	 * has already acted on.
	 */
	public void recordAdjustment(String reasonCode, BigDecimal amount, OffsetDateTime now) {
		if (reasonCode == null || reasonCode.isBlank()) {
			throw new CounterRuleViolation("COUNTER_ADJUSTMENT_INVALID", "Reason code is required.");
		}
		if (status != CounterShiftStatus.Open) {
			throw new CounterRuleViolation(
					"COUNTER_SHIFT_CLOSED", "Adjustments are only allowed on an open shift.");
		}
		this.expectedCashTotal = expectedCashTotal.add(amount);
		this.updatedAt = now;
	}

	/** Cash taken at the till during this shift. */
	public void recordCashPayment(BigDecimal amount, OffsetDateTime now) {
		if (status != CounterShiftStatus.Open) {
			throw new CounterRuleViolation(
					"COUNTER_SHIFT_CLOSED", "Cash can only be recorded on an open shift.");
		}
		this.expectedCashTotal = expectedCashTotal.add(amount);
		this.updatedAt = now;
	}

	public boolean isOpen() {
		return status == CounterShiftStatus.Open;
	}

	public String id() {
		return id;
	}

	public String openedByUserId() {
		return openedByUserId;
	}

	public CounterShiftStatus status() {
		return status;
	}

	public BigDecimal openingCashBalance() {
		return openingCashBalance;
	}

	public BigDecimal expectedCashTotal() {
		return expectedCashTotal;
	}

	public BigDecimal actualCashTotal() {
		return actualCashTotal;
	}

	public BigDecimal cashVariance() {
		return cashVariance;
	}

	public String closedByUserId() {
		return closedByUserId;
	}

	public String closeNote() {
		return closeNote;
	}

	public OffsetDateTime closedAt() {
		return closedAt;
	}

	public OffsetDateTime updatedAt() {
		return updatedAt;
	}
}
