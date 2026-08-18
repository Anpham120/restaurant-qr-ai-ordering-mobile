package com.cmc.restaurant.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Auth.JwtOptions} (.NET). */
@ConfigurationProperties(prefix = "jwt")
public record JwtProperties(String issuer, String audience, String signingKey, int accessTokenMinutes) {
}
