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

	/**
	 * Hoá đơn bàn mà khoản thanh toán này thuộc về (#96).
	 *
	 * <p>Cơ sở dữ liệu có ràng buộc {@code CK_payments_single_target}: đúng MỘT trong
	 * {@code order_id} và {@code table_invoice_id} được khác NULL. Một khoản thanh toán hoặc thuộc
	 * về một đơn lẻ (luồng cũ, V10) hoặc thuộc về hoá đơn cả bàn (V14) — không bao giờ cả hai.
	 * Ràng buộc đó nằm ở tầng cơ sở dữ liệu nên nó đúng kể cả khi mã ứng dụng viết sai.
	 */
	@Column(name = "table_invoice_id")
	private String tableInvoiceId;

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

	/**
	 * Khoản thanh toán của một HOÁ ĐƠN BÀN (#96).
	 *
	 * <p>Hàm dựng riêng chứ không thêm tham số vào hàm trên: {@code CK_payments_single_target} đòi
	 * đúng một trong hai khoá khác NULL, nên một hàm dựng nhận cả hai sẽ mở ra khả năng gọi sai mà
	 * chỉ cơ sở dữ liệu mới chặn được. Hai hàm dựng thì gọi sai là lỗi biên dịch.
	 */
	public static PaymentEntity forTableInvoice(
			String id, String tableInvoiceId, PaymentMethod method, BigDecimal amount, OffsetDateTime now) {
		PaymentEntity payment = new PaymentEntity();
		payment.id = id;
		payment.tableInvoiceId = tableInvoiceId;
		payment.method = method;
		payment.status = PaymentStatus.Pending;
		payment.amount = amount;
		payment.createdAt = now;
		payment.updatedAt = now;
		return payment;
	}

	public String getTableInvoiceId() {
		return tableInvoiceId;
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
