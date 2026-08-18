package com.cmc.restaurant.tables;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors the read-only subset of {@code TableInvoiceContracts} (.NET) this issue covers — the
 * payment fields (VietQR, payment state) are added in issues #10-12. */
public final class TableInvoiceDtos {

	private TableInvoiceDtos() {
	}

	public record LineResponse(String menuItemId, String name, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {
	}

	public record OrderRoundResponse(String orderCode, String status, BigDecimal subtotalAmount, OffsetDateTime createdAt) {
	}

	public record InvoiceResponse(
			String tableSessionId, String invoiceCode, String tableCode, String status, BigDecimal subtotalAmount,
			BigDecimal discountAmount, BigDecimal totalAmount, String promotionCode, String customerPhoneNumber,
			String method, List<OrderRoundResponse> orderRounds, List<LineResponse> items) {
	}
}
