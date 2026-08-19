package com.cmc.restaurant.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<UserEntity, String> {

	Optional<UserEntity> findByEmailIgnoreCase(String email);

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
