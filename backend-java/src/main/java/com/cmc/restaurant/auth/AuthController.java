package com.cmc.restaurant.auth;

import com.cmc.restaurant.auth.AuthDtos.AuthUserResponse;
import com.cmc.restaurant.auth.AuthDtos.ChangePasswordRequest;
import com.cmc.restaurant.auth.AuthDtos.GoogleLoginRequest;
import com.cmc.restaurant.auth.AuthDtos.LoginRequest;
import com.cmc.restaurant.auth.AuthDtos.LoginResponse;
import com.cmc.restaurant.auth.AuthDtos.RegisterRequest;
import com.cmc.restaurant.auth.AuthDtos.RegisterResponse;
import com.cmc.restaurant.shared.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Auth.AuthEndpoints} (.NET) route-for-route. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

	// Simple, deliberately permissive check (unlike .NET's MailAddress-based validator) — good
	// enough to reject obviously-invalid input; exact edge-case parity was not worth chasing.

	private final UserService userService;
	private final JwtService jwtService;
	private final GoogleTokenVerifier googleVerifier;

	public AuthController(UserService userService, JwtService jwtService,
			GoogleTokenVerifier googleVerifier) {
		this.userService = userService;
		this.jwtService = jwtService;
		this.googleVerifier = googleVerifier;
	}

	@PostMapping("/register")
	public ResponseEntity<RegisterResponse> register(@RequestBody RegisterRequest request) {
		if (request == null || isBlank(request.fullName())) {
			throw ApiException.badRequest("FULL_NAME_REQUIRED", "Full name is required.");
		}
		if (!isValidEmail(request.email())) {
			throw ApiException.badRequest("EMAIL_INVALID", "Email is invalid.");
		}
		if (isBlank(request.password()) || request.password().length() < 8) {
			throw ApiException.badRequest("PASSWORD_TOO_SHORT", "Password must be at least 8 characters.");
		}

		UserEntity user = userService.registerCustomer(request.fullName(), request.email(), request.password());

		return ResponseEntity.status(HttpStatus.CREATED).body(
				new RegisterResponse(user.getId(), user.getFullName(), user.getEmail(), user.getRole()));
	}

	/**
	 * Đăng nhập bằng Google — tạo tài khoản ngay lần đầu, không có bước đăng ký riêng.
	 *
	 * <p>Trả về ĐÚNG dạng của {@code /login}. App không cần biết khách vào bằng đường nào, và mọi
	 * thứ phía sau (tích điểm, nối số) chỉ làm việc với JWT.
	 *
	 * <p>Cổng này KHÔNG thay thế bước nối số điện thoại. Google chứng minh khách sở hữu một tài
	 * khoản Google, nó không nói gì về số điện thoại — nên luật LOYALTY_PHONE_ALREADY_MEMBER và
	 * mã nối tại quầy giữ nguyên vai trò.
	 */
	@PostMapping("/google")
	public LoginResponse loginWithGoogle(@RequestBody(required = false) GoogleLoginRequest request) {
		if (request == null || isBlank(request.idToken())) {
			throw ApiException.badRequest("GOOGLE_TOKEN_REQUIRED", "Thiếu token Google.");
		}

		GoogleIdentity danhTinh = googleVerifier.xacMinh(request.idToken());
		UserEntity user = userService.signInWithGoogle(
				danhTinh.sub(), danhTinh.email(), danhTinh.fullName());

		JwtService.IssuedToken token = jwtService.issueToken(user);

		return new LoginResponse(
				token.accessToken(),
				token.expiresAt(),
				new AuthUserResponse(user.getId(), user.getFullName(), user.getEmail(), user.getRole()));
	}

	@PostMapping("/login")
	public LoginResponse login(@RequestBody LoginRequest request) {
		if (!isValidEmail(request == null ? null : request.email())) {
			throw ApiException.badRequest("EMAIL_INVALID", "Email is invalid.");
		}
		if (isBlank(request.password())) {
			throw ApiException.badRequest("PASSWORD_REQUIRED", "Password is required.");
		}

		UserEntity user = userService.validateCredentials(request.email(), request.password())
				.orElseThrow(() -> ApiException.unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect."));

		JwtService.IssuedToken token = jwtService.issueToken(user);

		return new LoginResponse(
				token.accessToken(),
				token.expiresAt(),
				new AuthUserResponse(user.getId(), user.getFullName(), user.getEmail(), user.getRole()));
	}

	@GetMapping("/me")
	public AuthUserResponse me(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return new AuthUserResponse(principal.userId(), principal.fullName(), principal.email(), principal.role());
	}

	@PostMapping("/change-password")
	public ResponseEntity<Void> changePassword(
			@RequestBody ChangePasswordRequest request,
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		if (request == null || isBlank(request.currentPassword())) {
			throw ApiException.badRequest("CURRENT_PASSWORD_REQUIRED", "Current password is required.");
		}
		if (isBlank(request.newPassword()) || request.newPassword().length() < 8) {
			throw ApiException.badRequest("PASSWORD_TOO_SHORT", "Password must be at least 8 characters.");
		}

		userService.changePassword(principal.userId(), request.currentPassword(), request.newPassword());

		return ResponseEntity.noContent().build();
	}

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}

	private static boolean isValidEmail(String email) {
		return EmailRule.isValid(email);
	}
}
