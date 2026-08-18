package com.cmc.restaurant.payments;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.util.List;

/** Casso webhook payload (hạn chế #3). Only the fields this integration actually reads are
 * mapped; {@code @JsonIgnoreProperties} keeps unknown fields from breaking us when Casso adds
 * some — a webhook we reject is one Casso retries 17 times. */
public final class CassoDtos {

	private CassoDtos() {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record WebhookRequest(int error, List<Transaction> data) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Transaction(String reference, String description, BigDecimal amount, String when) {
	}

	/** What happened to one incoming bank transaction. Returned so the operator can see, from
	 * Casso's own delivery log, why a transfer did or didn't settle an order. */
	public record TransactionResult(String reference, String outcome, String orderCode, String detail) {
	}

	public record WebhookResponse(int received, int confirmed, List<TransactionResult> results) {
	}
}
