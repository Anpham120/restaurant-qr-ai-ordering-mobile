package com.cmc.restaurant.payments;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Hạn chế #3 — the endpoint Casso calls when money lands in the restaurant's bank account. */
@RestController
public class CassoWebhookController {

	/** Casso's own header name for the shared secret configured on their dashboard. */
	private static final String TOKEN_HEADER = "Secure-Token";

	private final CassoWebhookService webhookService;

	public CassoWebhookController(CassoWebhookService webhookService) {
		this.webhookService = webhookService;
	}

	/**
	 * Answers 200 for every authenticated call, including ones where nothing was settled
	 * (unmatched description, wrong amount, already-confirmed payment). Casso retries a non-200 up
	 * to 17 times in 24h, so reporting "processed, but skipped, and here is why" must not look
	 * like a delivery failure. Only an invalid token (401) or a genuine server fault is non-200.
	 */
	@PostMapping("/api/payments/webhooks/casso")
	public CassoDtos.WebhookResponse receive(
			@RequestBody(required = false) CassoDtos.WebhookRequest body, HttpServletRequest request) {
		webhookService.verifyToken(request.getHeader(TOKEN_HEADER));
		return webhookService.handle(body);
	}
}
