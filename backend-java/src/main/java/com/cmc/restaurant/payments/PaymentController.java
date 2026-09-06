package com.cmc.restaurant.payments;

import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.shared.RequestIdempotency;
import com.cmc.restaurant.shared.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors {@code PaymentEndpoints.cs} (.NET) — see PR description for what is deliberately out of
 * scope in issue #10 (VietQR generation, Casso webhook, realtime, Loyalty accrual). */
@RestController
public class PaymentController {

	private final PaymentService paymentService;

	public PaymentController(PaymentService paymentService) {
		this.paymentService = paymentService;
	}

	@GetMapping("/api/orders/{orderCode}/payment")
	public PaymentDtos.PaymentResponse getPayment(
			@PathVariable String orderCode, HttpServletRequest request, Authentication authentication) {
		rejectKitchen(authentication);
		return paymentService.getPayment(
				orderCode, request.getHeader("X-Order-Token"), isOperator(authentication));
	}

	@PostMapping("/api/orders/{orderCode}/payment/request")
	public PaymentDtos.PaymentRequestResponse requestPayment(
			@PathVariable String orderCode,
			@RequestBody(required = false) PaymentDtos.PaymentRequestRequest body,
			HttpServletRequest request,
			Authentication authentication) {
		rejectKitchen(authentication);
		String idempotencyKey = RequestIdempotency.readValid(request);
		if (idempotencyKey == null) {
			boolean headerPresent = request.getHeader(RequestIdempotency.HEADER_NAME) != null;
			throw ApiException.badRequest(
					headerPresent ? "IDEMPOTENCY_KEY_INVALID" : "IDEMPOTENCY_KEY_REQUIRED",
					headerPresent
							? "Idempotency-Key must contain 1 to 100 letters, numbers, '.', '_', ':' or '-'."
							: "Idempotency-Key header is required.");
		}
		return paymentService.requestPayment(orderCode, body, idempotencyKey, request.getHeader("X-Order-Token"));
	}

	@PostMapping("/api/orders/{orderCode}/payment/confirm")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public PaymentDtos.PaymentResponse confirmPayment(
			@PathVariable String orderCode,
			@RequestBody(required = false) PaymentDtos.ConfirmPaymentRequest body,
			Authentication authentication) {
		return paymentService.confirmPayment(orderCode, body, ActorContext.fromAuthentication(authentication));
	}

	@PostMapping("/api/orders/{orderCode}/payment/fail")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public PaymentDtos.PaymentResponse failPayment(
			@PathVariable String orderCode,
			@RequestBody(required = false) PaymentDtos.FailPaymentRequest body,
			Authentication authentication) {
		return paymentService.failPayment(orderCode, body, ActorContext.fromAuthentication(authentication));
	}

	@PostMapping("/api/orders/{orderCode}/payment/refund")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public PaymentDtos.PaymentResponse refundPayment(
			@PathVariable String orderCode,
			@RequestBody(required = false) PaymentDtos.RefundPaymentRequest body,
			Authentication authentication) {
		return paymentService.refundPayment(orderCode, body, ActorContext.fromAuthentication(authentication));
	}

	/** Kitchen is explicitly barred from payment operations even though it is otherwise an
	 * operator role — mirrors the guard at the top of every .NET payment endpoint. */
	private static void rejectKitchen(Authentication authentication) {
		if (hasRole(authentication, "Kitchen")) {
			throw new ApiException(HttpStatus.FORBIDDEN,
					"PAYMENT_ACCESS_DENIED", "Kitchen users cannot access payment operations.");
		}
	}

	private static boolean isOperator(Authentication authentication) {
		return hasRole(authentication, "Staff") || hasRole(authentication, "CounterStaff")
				|| hasRole(authentication, "Admin");
	}

	private static boolean hasRole(Authentication authentication, String role) {
		return authentication != null
				&& authentication.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
	}
}
