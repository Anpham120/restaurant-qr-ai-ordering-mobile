package com.cmc.restaurant.tables;

import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.shared.RequestIdempotency;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mirrors bốn endpoint hoá đơn bàn trong {@code TableInvoiceEndpoints.cs} (.NET) — #96 phần 2.
 *
 * <p>Hai nhóm quyền KHÁC nhau và ranh giới đó là chủ ý: khách yêu cầu thanh toán bằng token năng
 * lực của phiên bàn (họ không có tài khoản), còn xác nhận và huỷ là việc của quầy — chỉ
 * {@code CounterStaff}, {@code Staff}, {@code Admin}. Khách không được tự xác nhận là mình đã trả
 * tiền.
 */
@RestController
public class TableInvoicePaymentController {

	private final TableInvoicePaymentService paymentService;

	public TableInvoicePaymentController(TableInvoicePaymentService paymentService) {
		this.paymentService = paymentService;
	}

	@PostMapping("/api/table-sessions/{sessionId}/invoice/payment-request")
	public TableInvoiceDtos.PaymentRequestResponse requestPayment(
			@PathVariable String sessionId,
			@RequestBody(required = false) TableInvoiceDtos.TableInvoicePaymentRequest body,
			HttpServletRequest request) {
		String idempotencyKey = RequestIdempotency.readValid(request);
		if (idempotencyKey == null) {
			boolean headerPresent = request.getHeader(RequestIdempotency.HEADER_NAME) != null;
			throw ApiException.badRequest(
					headerPresent ? "IDEMPOTENCY_KEY_INVALID" : "IDEMPOTENCY_KEY_REQUIRED",
					"A valid Idempotency-Key header is required.");
		}
		return paymentService.requestPayment(
				sessionId, body, request.getHeader("X-Table-Session-Token"), idempotencyKey);
	}

	@PostMapping("/api/table-sessions/{sessionId}/invoice/payment/confirm")
	@PreAuthorize("hasAnyRole('CounterStaff', 'Staff', 'Admin')")
	public TableInvoiceDtos.InvoiceResponse confirm(
			@PathVariable String sessionId,
			@RequestBody(required = false) TableInvoiceDtos.PaymentActionRequest body,
			Authentication authentication) {
		return paymentService.confirm(sessionId, body, ActorContext.fromAuthentication(authentication));
	}

	@PostMapping("/api/table-sessions/{sessionId}/invoice/payment/cancel")
	@PreAuthorize("hasAnyRole('CounterStaff', 'Staff', 'Admin')")
	public TableInvoiceDtos.InvoiceResponse cancel(
			@PathVariable String sessionId,
			@RequestBody(required = false) TableInvoiceDtos.PaymentActionRequest body) {
		return paymentService.cancel(sessionId, body);
	}

	@GetMapping("/api/table-invoices")
	@PreAuthorize("hasAnyRole('CounterStaff', 'Staff', 'Admin')")
	public List<TableInvoiceDtos.InvoiceResponse> list(@RequestParam(required = false) String status) {
		return paymentService.list(status);
	}
}
