package com.cmc.restaurant.payments;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Payments.VietQrOptions} (.NET), including its
 * {@code compact2} default template. Bank details have no default on purpose — an unconfigured
 * deployment must fail with {@code VIETQR_CONFIG_MISSING}, not silently render a QR pointing at
 * nobody's account. */
@ConfigurationProperties(prefix = "payments.vietqr")
public record VietQrProperties(String bankId, String accountNumber, String accountName, String template) {

	public VietQrProperties {
		if (template == null || template.isBlank()) {
			template = "compact2";
		}
	}
}
