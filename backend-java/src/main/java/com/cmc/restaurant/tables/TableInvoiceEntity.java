package com.cmc.restaurant.tables;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Mirrors {@code RestaurantQrAiOrdering.Entities.TableInvoice} (.NET) — minimal mapping. A row
 * only exists once settlement/payment-request starts (issues #10-12); until then, the GET
 * projection in {@link TableInvoiceService} works from live Order Rounds alone (V14/V19), which
 * is exactly what the .NET GET handler does too (persisted invoice is optional there).
 */
@Entity
@Table(name = "table_invoices")
public class TableInvoiceEntity {

	@Id
	private String id;

	@Column(name = "invoice_code", nullable = false)
	private String invoiceCode;

	@Column(name = "table_session_id", nullable = false)
	private String tableSessionId;

	@Column(nullable = false)
	private String status;

	@Column(name = "subtotal_amount", nullable = false)
	private BigDecimal subtotalAmount;

	@Column(name = "discount_amount", nullable = false)
	private BigDecimal discountAmount;

	@Column(name = "total_amount", nullable = false)
	private BigDecimal totalAmount;

	@Column(name = "promotion_code")
	private String promotionCode;

	@Column(name = "customer_phone_number")
	private String customerPhoneNumber;

	@Column(nullable = false)
	private String method;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected TableInvoiceEntity() {
		// JPA
	}

	/** Hoá đơn mới, tạo lúc khách bấm thanh toán lần đầu (#96). */
	TableInvoiceEntity(String id, String invoiceCode, String tableSessionId, OffsetDateTime now) {
		this.id = id;
		this.invoiceCode = invoiceCode;
		this.tableSessionId = tableSessionId;
		this.status = "NotRequested";
		this.subtotalAmount = java.math.BigDecimal.ZERO;
		this.discountAmount = java.math.BigDecimal.ZERO;
		this.totalAmount = java.math.BigDecimal.ZERO;
		this.method = "Unselected";
		this.createdAt = now;
		this.updatedAt = now;
	}

	/** Ghi lại toàn bộ phần tính được từ một lần khách yêu cầu thanh toán. */
	@Column(name = "loyalty_redemption_id")
	private String loyaltyRedemptionId;

	/** Phần giảm do đổi điểm, tách khỏi {@code discountAmount} vốn là TỔNG. */
	@Column(name = "loyalty_discount_amount")
	private BigDecimal loyaltyDiscountAmount;

	/**
	 * @param discount tổng mọi khoản giảm, đã cắt theo trần
	 * @param loyaltyRedemptionId lần đổi điểm đã dùng, {@code null} nếu không dùng
	 * @param loyaltyDiscount phần do đổi điểm, tách khỏi tổng để biên nhận giải thích được
	 */
	void applyPaymentRequest(
			BigDecimal subtotal, BigDecimal discount, BigDecimal total, String promotionCode,
			String customerPhoneNumber, String method, String loyaltyRedemptionId,
			BigDecimal loyaltyDiscount, OffsetDateTime now) {
		this.status = "Pending";
		this.subtotalAmount = subtotal;
		this.discountAmount = discount;
		this.totalAmount = total;
		this.promotionCode = promotionCode;
		this.customerPhoneNumber = customerPhoneNumber;
		this.method = method;
		this.loyaltyRedemptionId = loyaltyRedemptionId;
		this.loyaltyDiscountAmount = loyaltyDiscount;
		this.updatedAt = now;
	}

	public String getLoyaltyRedemptionId() {
		return loyaltyRedemptionId;
	}

	public BigDecimal getLoyaltyDiscountAmount() {
		return loyaltyDiscountAmount;
	}

	void settle(String status, OffsetDateTime now) {
		this.status = status;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public BigDecimal getSubtotalAmount() {
		return subtotalAmount;
	}

	public BigDecimal getTotalAmount() {
		return totalAmount;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public String getInvoiceCode() {
		return invoiceCode;
	}

	public String getTableSessionId() {
		return tableSessionId;
	}

	public String getStatus() {
		return status;
	}

	public BigDecimal getDiscountAmount() {
		return discountAmount;
	}

	public String getPromotionCode() {
		return promotionCode;
	}

	public String getCustomerPhoneNumber() {
		return customerPhoneNumber;
	}

	public String getMethod() {
		return method;
	}
}
