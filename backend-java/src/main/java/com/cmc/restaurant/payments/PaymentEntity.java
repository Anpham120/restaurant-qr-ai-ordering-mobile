package com.cmc.restaurant.payments;

import jakarta.persistence.Column;
import com.cmc.restaurant.payments.domain.Payment;
import com.cmc.restaurant.payments.domain.PaymentMethod;
import com.cmc.restaurant.payments.domain.PaymentStatus;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private PaymentMethod method;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private PaymentStatus status;

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
		this.method = PaymentMethod.Unselected;
		this.status = PaymentStatus.NotRequested;
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

	public PaymentMethod getMethod() {
		return method;
	}

	public void setMethod(PaymentMethod method) {
		this.method = method;
	}

	public PaymentStatus getStatus() {
		return status;
	}

	public void setStatus(PaymentStatus status) {
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

	/** Lifts the row into the aggregate that owns the payment rules (issue #63). */
	public Payment toDomain() {
		return new Payment(id, amount, status, method, providerTransactionId, paidAt, updatedAt);
	}

	/** Writes back what the aggregate decided. The only place payment state is copied into a row. */
	public void applyFrom(Payment payment) {
		this.status = payment.status();
		this.method = payment.method();
		this.providerTransactionId = payment.providerTransactionId();
		this.paidAt = payment.paidAt();
		this.updatedAt = payment.updatedAt();
	}
}
