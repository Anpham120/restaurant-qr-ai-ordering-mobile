package com.cmc.restaurant.payments;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Cổng SePay gọi vào mỗi khi có giao dịch mới trên tài khoản ngân hàng. */
@RestController
public class SePayWebhookController {

	private final SePayWebhookService webhookService;

	public SePayWebhookController(SePayWebhookService webhookService) {
		this.webhookService = webhookService;
	}

	@PostMapping("/api/payments/webhooks/sepay")
	public SePayDtos.WebhookResponse nhan(
			@RequestBody(required = false) SePayDtos than, HttpServletRequest request) {
		// Kiểm khoá TRƯỚC khi chạm vào thân request.
		webhookService.kiemKhoa(request.getHeader("Authorization"));
		return webhookService.xuLy(than);
	}
}
