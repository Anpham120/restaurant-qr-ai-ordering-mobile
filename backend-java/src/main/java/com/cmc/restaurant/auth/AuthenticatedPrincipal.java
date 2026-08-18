package com.cmc.restaurant.auth;

/** The principal object {@link JwtAuthenticationFilter} attaches to the security context. */
public record AuthenticatedPrincipal(String userId, String fullName, String email, String role) {
}
