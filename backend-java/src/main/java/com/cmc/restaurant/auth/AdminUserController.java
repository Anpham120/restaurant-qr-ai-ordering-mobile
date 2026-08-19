package com.cmc.restaurant.auth;

import com.cmc.restaurant.auth.AdminUserDtos.CreateUserRequest;
import com.cmc.restaurant.auth.AdminUserDtos.ResetPasswordRequest;
import com.cmc.restaurant.auth.AdminUserDtos.UpdateUserRequest;
import com.cmc.restaurant.auth.AdminUserDtos.UserListResponse;
import com.cmc.restaurant.auth.AdminUserDtos.UserSummaryResponse;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mirrors {@code Users/UserEndpoints.cs} (.NET) — 5 endpoint quản trị tài khoản nhân sự (#90).
 *
 * <p>{@code @PreAuthorize} ở cấp lớp thay cho {@code .RequireAuthorization("AdminOnly")} của bản
 * .NET. Có tác dụng vì {@code SecurityConfig} bật {@code @EnableMethodSecurity} — không bật thì
 * chú giải này im lặng vô hiệu và cả 5 endpoint mở cho mọi tài khoản đã đăng nhập.
 */
@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasRole('Admin')")
public class AdminUserController {

	private final AdminUserService users;

	public AdminUserController(AdminUserService users) {
		this.users = users;
	}

	@GetMapping
	public UserListResponse list() {
		return new UserListResponse(users.list().stream().map(AdminUserService::toSummary).toList());
	}

	@PostMapping
	public ResponseEntity<UserSummaryResponse> create(@RequestBody(required = false) CreateUserRequest request) {
		UserSummaryResponse created = AdminUserService.toSummary(users.create(request));
		return ResponseEntity.created(URI.create("/api/users/" + created.userId())).body(created);
	}

	@PutMapping("/{userId}")
	public UserSummaryResponse update(
			@PathVariable String userId,
			@RequestBody(required = false) UpdateUserRequest request,
			Authentication authentication) {
		return AdminUserService.toSummary(users.update(userId, request, currentUserId(authentication)));
	}

	@DeleteMapping("/{userId}")
	public ResponseEntity<Void> delete(@PathVariable String userId, Authentication authentication) {
		users.delete(userId, currentUserId(authentication));
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/{userId}/reset-password")
	public ResponseEntity<Void> resetPassword(
			@PathVariable String userId, @RequestBody(required = false) ResetPasswordRequest request) {
		users.resetPassword(userId, request);
		return ResponseEntity.noContent().build();
	}

	/**
	 * Id của quản trị viên đang gọi — hai luật tự bảo vệ cần nó.
	 *
	 * <p>Lấy từ token đã xác thực, KHÔNG lấy từ thân yêu cầu: nếu để client tự khai id thì hai luật
	 * "không tự xoá mình" và "không tự gỡ quyền Admin của mình" bị vô hiệu chỉ bằng cách gửi một id
	 * khác.
	 */
	private static String currentUserId(Authentication authentication) {
		if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedPrincipal principal) {
			return principal.userId();
		}
		return null;
	}
}
