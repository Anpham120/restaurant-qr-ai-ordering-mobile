package com.cmc.restaurant.auth;

import com.cmc.restaurant.counter.CounterUserReferences;
import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors {@code Users/UserEndpoints.cs} + {@code Users/DbUserStore.cs} (.NET) — quản trị tài
 * khoản nhân sự (#90).
 *
 * <p>Đặt ở tầng service chứ không dựng một lớp domain riêng, theo đúng cách module {@code auth}
 * đang tổ chức (phẳng, không hexagonal) và theo tiêu chí mật độ bất biến đã dùng suốt dự án: phần
 * lớn luật ở đây là kiểm tra dữ liệu vào, không phải máy trạng thái. Ngoại lệ duy nhất — luật xoá
 * tài khoản còn ràng buộc ca quầy — được đẩy sang {@link CounterUserReferences}, tức module SỞ HỮU
 * dữ liệu đó.
 */
@Service
public class AdminUserService {

	private static final int MIN_PASSWORD_LENGTH = 8;

	private final UserRepository userRepository;
	private final PasswordHasher passwordHasher;
	private final CounterUserReferences counterReferences;

	public AdminUserService(
			UserRepository userRepository, PasswordHasher passwordHasher,
			CounterUserReferences counterReferences) {
		this.userRepository = userRepository;
		this.passwordHasher = passwordHasher;
		this.counterReferences = counterReferences;
	}

	@Transactional(readOnly = true)
	public List<UserEntity> list() {
		return userRepository.findAll();
	}

	@Transactional
	public UserEntity create(AdminUserDtos.CreateUserRequest request) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		requireFullName(request.fullName());
		String email = requireEmail(request.email());
		requirePassword(request.password());
		String role = requireAssignableRole(request.role(), "Role must be Admin, CounterStaff, or Kitchen.");

		if (userRepository.existsByEmailIgnoreCase(email)) {
			throw ApiException.conflict("EMAIL_ALREADY_REGISTERED", "Email is already registered.");
		}

		return userRepository.save(new UserEntity(
				"usr_" + UUID.randomUUID().toString().replace("-", ""),
				email,
				request.fullName().trim(),
				passwordHasher.hashPassword(request.password()),
				role,
				OffsetDateTime.now()));
	}

	/**
	 * Sửa tài khoản. Chặn quản trị viên tự gỡ quyền Admin của CHÍNH MÌNH.
	 *
	 * <p>Không phải quy tắc thẩm mỹ: nếu Admin cuối cùng tự hạ vai trò thì không còn ai gọi được
	 * chính nhóm endpoint này, và hệ thống mất đường quản trị vĩnh viễn — chỉ sửa được bằng cách
	 * vào thẳng cơ sở dữ liệu.
	 */
	@Transactional
	public UserEntity update(String userId, AdminUserDtos.UpdateUserRequest request, String currentUserId) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		requireFullName(request.fullName());
		String email = requireEmail(request.email());
		String role = requireAssignableRole(request.role(), "Role is invalid.");

		if (userId.equals(currentUserId) && !UserRole.ADMIN.equals(role)) {
			throw ApiException.badRequest("CANNOT_REMOVE_OWN_ADMIN_ROLE",
					"The current administrator cannot remove their own Admin role.");
		}

		UserEntity user = userRepository.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User account was not found."));

		Optional<UserEntity> clash = userRepository.findByEmailIgnoreCase(email);
		if (clash.isPresent() && !clash.get().getId().equals(userId)) {
			throw ApiException.conflict("EMAIL_ALREADY_REGISTERED", "Email is already registered.");
		}

		user.setFullName(request.fullName().trim());
		user.setEmail(email);
		user.setRole(role);
		user.setUpdatedAt(OffsetDateTime.now());
		return userRepository.save(user);
	}

	/**
	 * Xoá tài khoản.
	 *
	 * <p>Ba nhánh, và thứ tự giữa chúng là phần dễ port sai nhất — bản .NET KHÔNG chặn mọi tài
	 * khoản còn ràng buộc ca quầy. Nó chỉ chặn khi không còn Admin nào khác để gán lịch sử ca sang.
	 * Còn Admin khác thì lịch sử được chuyển và tài khoản vẫn xoá được.
	 */
	@Transactional
	public void delete(String userId, String currentUserId) {
		if (userId.equals(currentUserId)) {
			throw ApiException.badRequest("CANNOT_DELETE_CURRENT_USER",
					"The current administrator cannot delete their own account.");
		}

		UserEntity user = userRepository.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User account was not found."));

		String fallbackAdminId = userRepository
				.findFirstByRoleAndIdNotOrderByCreatedAtAsc(UserRole.ADMIN, userId)
				.map(UserEntity::getId)
				.orElse(null);

		if (counterReferences.existFor(userId) && fallbackAdminId == null) {
			throw ApiException.conflict("USER_HAS_DEPENDENCIES",
					"Cannot delete this account because it is referenced by counter shift history. "
							+ "Reassign or close shifts first.");
		}

		if (fallbackAdminId != null) {
			counterReferences.reassign(userId, fallbackAdminId);
		}

		userRepository.delete(user);
	}

	@Transactional
	public void resetPassword(String userId, AdminUserDtos.ResetPasswordRequest request) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		requirePassword(request.newPassword());

		UserEntity user = userRepository.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User account was not found."));

		user.setPasswordHash(passwordHasher.hashPassword(request.newPassword()));
		user.setUpdatedAt(OffsetDateTime.now());
		userRepository.save(user);
	}

	// --- kiểm tra dữ liệu vào ------------------------------------------------------------------

	private static void requireFullName(String fullName) {
		if (fullName == null || fullName.isBlank()) {
			throw ApiException.badRequest("FULL_NAME_REQUIRED", "Full name is required.");
		}
	}

	private static String requireEmail(String email) {
		if (!EmailRule.isValid(email)) {
			throw ApiException.badRequest("EMAIL_INVALID", "Email is invalid.");
		}
		return EmailRule.normalize(email);
	}

	private static void requirePassword(String password) {
		if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
			throw ApiException.badRequest("PASSWORD_TOO_SHORT", "Password must be at least 8 characters.");
		}
	}

	/** So không phân biệt hoa thường rồi TRẢ VỀ dạng chuẩn, đúng như {@code NormalizeRole} của .NET. */
	private static String requireAssignableRole(String role, String message) {
		if (role != null) {
			for (String assignable : UserRole.ADMIN_ASSIGNABLE) {
				if (assignable.equalsIgnoreCase(role.trim())) {
					return assignable;
				}
			}
		}
		throw ApiException.badRequest("ROLE_INVALID", message);
	}

	public static AdminUserDtos.UserSummaryResponse toSummary(UserEntity user) {
		return new AdminUserDtos.UserSummaryResponse(
				user.getId(), user.getFullName(), user.getEmail(), user.getRole(), user.getCreatedAt());
	}
}
