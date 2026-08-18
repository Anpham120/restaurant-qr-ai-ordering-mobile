package com.cmc.restaurant.payments;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Hạn chế #3 — settings for the Casso reconciliation webhook. {@code secureToken} has no default:
 * an unconfigured deployment must reject every webhook call rather than accept unauthenticated
 * ones, since accepting a forged payload would mark orders paid for free. */
@ConfigurationProperties(prefix = "payments.casso")
public record CassoProperties(String secureToken) {
}
