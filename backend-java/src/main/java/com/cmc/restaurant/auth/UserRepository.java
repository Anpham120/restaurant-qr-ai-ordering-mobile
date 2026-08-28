package com.cmc.restaurant.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<UserEntity, String> {

	Optional<UserEntity> findByEmailIgnoreCase(String email);

	/** Nối theo {@code sub}, không theo email: email của tài khoản Google đổi được, {@code sub} thì không. */
	Optional<UserEntity> findByGoogleSub(String googleSub);

	/** Đã có tài khoản KHÁC nào giữ số này chưa — dùng khi liên kết số điện thoại (V9, #27). */
	boolean existsByPhoneNumberAndIdNot(String phoneNumber, String id);

	/** Tài khoản đang giữ số này. Chỉ có tối đa một, theo `ux_users_phone_number`. */
	Optional<UserEntity> findByPhoneNumber(String phoneNumber);

	boolean existsByEmailIgnoreCase(String email);

	/**
	 * Admin cũ nhất KHÁC tài khoản đang bị xoá — nơi nhận lại lịch sử ca quầy (#90).
	 *
	 * <p>Sắp theo {@code createdAt} tăng dần, đúng như {@code OrderBy(u => u.CreatedAt)
	 * .FirstOrDefault()} của bản .NET: lựa chọn phải tất định, không phụ thuộc thứ tự cơ sở dữ
	 * liệu tình cờ trả về.
	 */
	Optional<UserEntity> findFirstByRoleAndIdNotOrderByCreatedAtAsc(String role, String excludedUserId);
}
