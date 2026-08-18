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
