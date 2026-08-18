package com.cmc.restaurant.payments;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Payments.VietQrContracts} (.NET). Response shapes are
 * ported in full now (issue #10) even though {@code VietQrResponse} stays unused (always null)
 * until issue #11 wires real QR generation — §5.4 of the plan requires not changing a ported
 * endpoint's contract later, so the shape is fixed here rather than extended afterwards. */
public final class PaymentDtos {

	private PaymentDtos() {
	}

	public record PaymentRequestRequest(String method) {
	}

	public record ConfirmPaymentRequest(String providerTransactionId, String note) {
	}

	public record FailPaymentRequest(String note) {
	}

	public record RefundPaymentRequest(String note) {
	}

	public record PaymentTransactionResponse(
			String transactionId, String method, String status, BigDecimal amount, String provider,
			String providerTransactionId, String note, OffsetDateTime createdAt) {
	}

	public record PaymentResponse(
			String paymentId, String orderCode, String method, String status, BigDecimal amount,
			String providerTransactionId, OffsetDateTime createdAt, OffsetDateTime paidAt, OffsetDateTime updatedAt,
			List<PaymentTransactionResponse> transactions) {
	}

	public record VietQrResponse(
			String orderCode, BigDecimal amount, String transferContent, String bankId, String accountNumber,
			String accountName, String quickLink, String qrPayload, String qrImageDataUri, String paymentStatus) {
	}

	public record PaymentRequestResponse(PaymentResponse payment, VietQrResponse vietQr) {
	}
}
