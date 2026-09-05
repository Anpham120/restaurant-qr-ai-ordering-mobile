package com.cmc.restaurant.auth;

import java.time.Instant;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Auth.AuthContracts} (.NET) field-for-field. */
public final class AuthDtos {

	private AuthDtos() {
	}

	/**
	 * Đăng ký khách: tên, token đã xác minh số điện thoại, mật khẩu.
	 *
	 * <p>KHÔNG nhận số điện thoại dưới dạng chuỗi. Số lấy từ chính token — nhận số từ thân request
	 * là mở đúng lỗ hổng mà OTP sinh ra để bịt.
	 */
	public record RegisterRequest(String fullName, String phoneIdToken, String password) {
	}

	/** ID token do Google phát cho app, app gửi thẳng lên đây. */
	public record GoogleLoginRequest(String idToken) {
	}

	/** {@code identifier}: số điện thoại (khách) hoặc email (nhân viên, quản trị viên). */
	public record LoginRequest(String identifier, String password) {
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
