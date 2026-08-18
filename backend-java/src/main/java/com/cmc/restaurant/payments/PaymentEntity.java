package com.cmc.restaurant.payments;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Mirrors {@code RestaurantQrAiOrdering.Entities.Payment} (.NET) — one row per order, its
 * lifecycle driven by {@code PaymentService} (issues #10-12: COD, VietQR, Casso webhook).
 * {@code @Version} guards concurrent manual-confirm/fail/refund races and the manual-vs-webhook
 * race issue #12 explicitly requires (§6 mục #3) — same pattern as {@code TableSessionEntity}
 * (issue #7).
 */
@Entity
@Table(name = "payments")
public class PaymentEntity {

	@Id
	private String id;

	@Column(name = "order_id")
	private String orderId;

	@Column(nullable = false)
	private String method;

	@Column(nullable = false)
	private String status;

	@Column(nullable = false)
	private BigDecimal amount;

	@Column(name = "provider_transaction_id")
	private String providerTransactionId;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "paid_at")
	private OffsetDateTime paidAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Version
	@Column(nullable = false)
	private long version;

	protected PaymentEntity() {
		// JPA
	}

	public PaymentEntity(String id, String orderId, OffsetDateTime now) {
		this.id = id;
		this.orderId = orderId;
		this.method = "Unselected";
		this.status = "NotRequested";
		this.amount = BigDecimal.ZERO;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getOrderId() {
		return orderId;
	}

	public String getMethod() {
		return method;
	}

	public void setMethod(String method) {
		this.method = method;
	}

	public String getStatus() {
		return status;
	}

	public void setStatus(String status) {
		this.status = status;
	}

	public BigDecimal getAmount() {
		return amount;
	}

	public void setAmount(BigDecimal amount) {
		this.amount = amount;
	}

	public String getProviderTransactionId() {
		return providerTransactionId;
	}

	public void setProviderTransactionId(String providerTransactionId) {
		this.providerTransactionId = providerTransactionId;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getPaidAt() {
		return paidAt;
	}

	public void setPaidAt(OffsetDateTime paidAt) {
		this.paidAt = paidAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}
}
