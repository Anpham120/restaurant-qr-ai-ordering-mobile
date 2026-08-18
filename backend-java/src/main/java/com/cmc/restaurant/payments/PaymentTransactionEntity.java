package com.cmc.restaurant.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Mirrors {@code RestaurantQrAiOrdering.Entities.PaymentTransaction} (.NET) — an append-only
 * ledger row per payment-status change, and the idempotency record for
 * {@code POST .../payment/request} ({@code idempotency_key} has a unique index — see
 * {@code V1__baseline_schema.sql}). */
@Entity
@Table(name = "payment_transactions")
public class PaymentTransactionEntity {

	@Id
	private String id;

	@Column(name = "payment_id", nullable = false)
	private String paymentId;

	@Column(nullable = false)
	private String method;

	@Column(nullable = false)
	private String status;

	@Column(nullable = false)
	private BigDecimal amount;

	@Column(nullable = false)
	private String provider;

	@Column(name = "provider_transaction_id")
	private String providerTransactionId;

	@Column
	private String note;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "idempotency_key")
	private String idempotencyKey;

	@Column(name = "request_fingerprint")
	private String requestFingerprint;

	protected PaymentTransactionEntity() {
		// JPA
	}

	public PaymentTransactionEntity(
			String id, String paymentId, String method, String status, BigDecimal amount, String provider,
			String providerTransactionId, String note, OffsetDateTime createdAt, String idempotencyKey,
			String requestFingerprint) {
		this.id = id;
		this.paymentId = paymentId;
		this.method = method;
		this.status = status;
		this.amount = amount;
		this.provider = provider;
		this.providerTransactionId = providerTransactionId;
		this.note = note;
		this.createdAt = createdAt;
		this.idempotencyKey = idempotencyKey;
		this.requestFingerprint = requestFingerprint;
	}

	public String getId() {
		return id;
	}

	public String getPaymentId() {
		return paymentId;
	}

	public String getMethod() {
		return method;
	}

	public String getStatus() {
		return status;
	}

	public BigDecimal getAmount() {
		return amount;
	}

	public String getProvider() {
		return provider;
	}

	public String getProviderTransactionId() {
		return providerTransactionId;
	}

	public String getNote() {
		return note;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public String getIdempotencyKey() {
		return idempotencyKey;
	}

	public String getRequestFingerprint() {
		return requestFingerprint;
	}
}
