package com.cmc.restaurant.orders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Minimal mapping of the {@code payments} table — just enough for the Completed-status guard
 * ("payment must be Confirmed/Paid before an order can complete"). The full Payments module
 * (COD/VietQR/Casso webhook) is issues #10-12; this entity will grow there, not be replaced.
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

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

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

	public String getOrderId() {
		return orderId;
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

	public void setAmount(BigDecimal amount) {
		this.amount = amount;
	}
}
