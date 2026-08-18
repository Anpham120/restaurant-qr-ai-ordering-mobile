package com.cmc.restaurant.shared;

import com.cmc.restaurant.orders.domain.OrderRuleViolation;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

	@ExceptionHandler(ApiException.class)
	public ResponseEntity<Map<String, Object>> handleApiException(ApiException exception) {
		return error(exception.getStatus(), exception.getCode(), exception.getMessage());
	}

	/**
	 * Turns a broken domain rule into the HTTP answer the API contract promises.
	 *
	 * <p>This is the half of the hexagonal split that the domain deliberately does not do:
	 * {@link OrderRuleViolation} carries only a stable error code, so the aggregate stays testable
	 * without Spring, and the choice of status code lives here in the web layer.
	 *
	 * <p>Added after issue #61's real-stack check: the unit tests passed while every rule violation
	 * came back as HTTP 500, because the domain exception had nothing mapping it. The tests could
	 * not have caught it — they never touch HTTP, which is exactly why both kinds of test exist.
	 */
	@ExceptionHandler(OrderRuleViolation.class)
	public ResponseEntity<Map<String, Object>> handleOrderRuleViolation(OrderRuleViolation violation) {
		HttpStatus status = switch (violation.code()) {
			// Changing an order that already finished is a conflict with its current state, not a
			// malformed request — same status the .NET endpoint returned.
			case "ORDER_STATUS_TERMINAL" -> HttpStatus.CONFLICT;
			case "ORDER_ITEM_NOT_FOUND" -> HttpStatus.NOT_FOUND;
			default -> HttpStatus.BAD_REQUEST;
		};
		return error(status, violation.code(), violation.getMessage());
	}

	/**
	 * Same split as {@link OrderRuleViolation}: the Payment aggregate reports which rule broke, the
	 * web layer decides the status code.
	 *
	 * <p>Every payment rule maps to 400. That is not laziness — a payment refusal is always "you
	 * asked for something this payment's current state does not allow", which is a bad request, not
	 * a conflict with a concurrent writer. Genuine races surface as {@code CONFLICT_STALE} from the
	 * optimistic-lock path instead, and that one is already an {@link ApiException}.
	 */
	@ExceptionHandler(com.cmc.restaurant.payments.domain.PaymentRuleViolation.class)
	public ResponseEntity<Map<String, Object>> handlePaymentRuleViolation(
			com.cmc.restaurant.payments.domain.PaymentRuleViolation violation) {
		return error(HttpStatus.BAD_REQUEST, violation.code(), violation.getMessage());
	}

	/** Cart rules: quantity bounds and the delta check are bad requests; the two invoice guards are
	 * conflicts with the table.s current payment state, matching the .NET status codes. */
	/** Promotion rules are all "this code cannot be used for this order" — a bad request. */
	@ExceptionHandler(com.cmc.restaurant.promotions.domain.PromotionRuleViolation.class)
	public ResponseEntity<Map<String, Object>> handlePromotionRuleViolation(
			com.cmc.restaurant.promotions.domain.PromotionRuleViolation violation) {
		return error(HttpStatus.BAD_REQUEST, violation.code(), violation.getMessage());
	}

	@ExceptionHandler(com.cmc.restaurant.cart.domain.CartRuleViolation.class)
	public ResponseEntity<Map<String, Object>> handleCartRuleViolation(
			com.cmc.restaurant.cart.domain.CartRuleViolation violation) {
		HttpStatus status = switch (violation.code()) {
			case "TABLE_INVOICE_PAYMENT_PENDING", "TABLE_SESSION_SETTLED" -> HttpStatus.CONFLICT;
			default -> HttpStatus.BAD_REQUEST;
		};
		return error(status, violation.code(), violation.getMessage());
	}

	private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
		return ResponseEntity.status(status).body(Map.of(
				"error", Map.of("code", code, "message", message, "details", Map.of())));
	}
}
