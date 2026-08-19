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
			String method, List<OrderRoundResponse> orderRounds, List<LineResponse> items,
			VietQrResponse vietQr) {
	}

	/** Dữ liệu để khách quét chuyển khoản — {@code null} khi phương thức không phải VietQR (#96). */
	public record VietQrResponse(
			String invoiceCode, BigDecimal amount, String transferContent, String quickLink,
			String qrImageDataUri) {
	}

	public record PaymentSummaryResponse(String paymentId, String status, String method, BigDecimal amount) {
	}

	public record PaymentRequestResponse(
			InvoiceResponse invoice, PaymentSummaryResponse payment, VietQrResponse vietQr) {
	}

	/** Ghi chú nhân viên nhập khi xác nhận hoặc huỷ — tối đa 500 ký tự, đúng bản .NET. */
	public record PaymentActionRequest(String note) {
	}

	public record TableInvoicePaymentRequest(
			String method, String promotionCode, String customerPhoneNumber) {
	}
}
