package com.cmc.restaurant.auth;

import java.time.Instant;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Auth.AuthContracts} (.NET) field-for-field. */
public final class AuthDtos {

	private AuthDtos() {
	}

	public record RegisterRequest(String fullName, String email, String password) {
	}

	/** ID token do Google phát cho app, app gửi thẳng lên đây. */
	public record GoogleLoginRequest(String idToken) {
	}

	public record LoginRequest(String email, String password) {
	}

	public record ChangePasswordRequest(String currentPassword, String newPassword) {
	}

	public record AuthUserResponse(String userId, String fullName, String email, String role) {
	}

	public record RegisterResponse(String userId, String fullName, String email, String role) {
	}

	public record LoginResponse(String accessToken, Instant expiresAt, AuthUserResponse user) {
	}
}
