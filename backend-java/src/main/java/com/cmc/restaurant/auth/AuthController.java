package com.cmc.restaurant.auth;

import com.cmc.restaurant.auth.AuthDtos.AuthUserResponse;
import com.cmc.restaurant.auth.AuthDtos.ChangePasswordRequest;
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

	public AuthController(UserService userService, JwtService jwtService) {
		this.userService = userService;
		this.jwtService = jwtService;
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
