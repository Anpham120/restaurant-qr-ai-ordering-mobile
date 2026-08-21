package com.cmc.restaurant.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Maps the {@code users} table created by {@code V1__baseline_schema.sql}. */
@Entity
@Table(name = "users")
public class UserEntity {

	@Id
	private String id;

	@Column(nullable = false, unique = true)
	private String email;

	@Column(name = "full_name", nullable = false)
	private String fullName;

	/**
	 * Số điện thoại đã liên kết với hồ sơ tích điểm (V9, §9.10 M1 mục 3).
	 *
	 * <p>Null với tài khoản chưa liên kết — đó là trạng thái bình thường, không phải thiếu dữ liệu.
	 * Lưu ở dạng CHỈ CHỮ SỐ, đã qua {@code PhoneNumber.normalize}: cùng một khách gõ số khác nhau
	 * mỗi lần ({@code 0901 234 567}, {@code +84901234567}), lưu nguyên văn sẽ nối nhầm hồ sơ.
	 */
	@Column(name = "phone_number")
	private String phoneNumber;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	@Column(nullable = false)
	private String role;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "failed_login_count", nullable = false)
	private int failedLoginCount;

	@Column(name = "lockout_end_at")
	private OffsetDateTime lockoutEndAt;

	protected UserEntity() {
		// JPA
	}

	public UserEntity(String id, String email, String fullName, String passwordHash, String role,
			OffsetDateTime createdAt) {
		this.id = id;
		this.email = email;
		this.fullName = fullName;
		this.passwordHash = passwordHash;
		this.role = role;
		this.createdAt = createdAt;
		this.updatedAt = createdAt;
		this.failedLoginCount = 0;
	}

	public String getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public String getFullName() {
		return fullName;
	}

	public void setFullName(String fullName) {
		this.fullName = fullName;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public void setPasswordHash(String passwordHash) {
		this.passwordHash = passwordHash;
	}

	public String getPhoneNumber() {
		return phoneNumber;
	}

	public void setPhoneNumber(String phoneNumber) {
		this.phoneNumber = phoneNumber;
	}

	public String getRole() {
		return role;
	}

	public void setRole(String role) {
		this.role = role;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}

	public int getFailedLoginCount() {
		return failedLoginCount;
	}

	public void setFailedLoginCount(int failedLoginCount) {
		this.failedLoginCount = failedLoginCount;
	}

	public OffsetDateTime getLockoutEndAt() {
		return lockoutEndAt;
	}

	public void setLockoutEndAt(OffsetDateTime lockoutEndAt) {
		this.lockoutEndAt = lockoutEndAt;
	}

	/**
	 * Mirrors {@code DbUserStore.ToUserAccount}: the security stamp is the row's own
	 * {@code updated_at}, so any update (password change, profile edit) changes it without a
	 * dedicated column.
	 */
	public long securityStampTicks() {
		return updatedAt.toInstant().toEpochMilli();
	}
}
