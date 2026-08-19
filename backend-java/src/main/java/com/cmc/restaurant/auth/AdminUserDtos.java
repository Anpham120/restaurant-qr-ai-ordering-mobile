package com.cmc.restaurant.auth;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Hợp đồng của 5 endpoint quản trị tài khoản (#90).
 *
 * <p>Tên trường lấy đúng từ {@code frontend/packages/shared-types} — {@code userId} chứ không phải
 * {@code id}, vì bản ghi .NET là {@code UserSummaryResponse(string UserId, ...)}. Đặt sai một tên
 * ở đây thì frontend nhận {@code undefined} chứ không nhận lỗi.
 */
public final class AdminUserDtos {

	private AdminUserDtos() {
	}

	public record UserSummaryResponse(
			String userId, String fullName, String email, String role, OffsetDateTime createdAt) {
	}

	public record UserListResponse(List<UserSummaryResponse> users) {
	}

	public record CreateUserRequest(String fullName, String email, String password, String role) {
	}

	public record UpdateUserRequest(String fullName, String email, String role) {
	}

	public record ResetPasswordRequest(String newPassword) {
	}
}
