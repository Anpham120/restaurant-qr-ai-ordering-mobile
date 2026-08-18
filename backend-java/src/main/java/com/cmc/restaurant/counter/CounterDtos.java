package com.cmc.restaurant.counter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Mirrors {@code CounterShiftContracts} (.NET). */
public final class CounterDtos {

	private CounterDtos() {
	}

	public record OpenShiftRequest(BigDecimal openingCashBalance) {
	}

	public record CloseShiftRequest(BigDecimal actualCashTotal, String closeNote) {
	}

	public record AdjustmentRequest(String reasonCode, BigDecimal amount, String note) {
	}

	public record ShiftSummaryResponse(
			String shiftId, String status, BigDecimal openingCashBalance, BigDecimal expectedCashTotal,
			BigDecimal actualCashTotal, BigDecimal cashVariance, String closeNote,
			OffsetDateTime openedAt, OffsetDateTime closedAt) {
	}
}
