package com.cmc.restaurant.auth;

import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Mirrors {@code RestaurantQrAiOrdering.Api.Users.DbUserStore} (.NET): same lockout policy (5
 * failed attempts locks the account for 15 minutes), same normalized-email duplicate check.
 */
@Service
public class UserService {

	private static final int MAX_FAILED_LOGIN_ATTEMPTS = 5;
	private static final long LOCKOUT_MINUTES = 15;

	private final UserRepository userRepository;
	private final PasswordHasher passwordHasher;

	public UserService(UserRepository userRepository, PasswordHasher passwordHasher) {
		this.userRepository = userRepository;
		this.passwordHasher = passwordHasher;
	}

	public UserEntity registerCustomer(String fullName, String email, String password) {
		String normalizedEmail = normalizeEmail(email);
		if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
			throw ApiException.conflict("EMAIL_ALREADY_REGISTERED", "Email is already registered.");
		}

		UserEntity user = new UserEntity(
				"usr_" + UUID.randomUUID().toString().replace("-", ""),
				normalizedEmail,
				fullName.trim(),
				passwordHasher.hashPassword(password),
				UserRole.CUSTOMER,
				OffsetDateTime.now());

		return userRepository.save(user);
	}

	/**
	 * Signs a customer in with a Google identity, creating the account on first sight.
	 *
	 * <p>Matching is by {@code sub}, never by email: a user can change the email on their Google
	 * account, but {@code sub} is permanent. Keying on email would drop a returning customer into
	 * a blank account and lose their points.
	 *
	 * <p>When the email already belongs to a password account, the two are MERGED and the old
	 * password is cleared. Registration never verified email ownership, so that password account
	 * may well have been opened by someone else using this address; Google has just proven who
	 * actually owns it. Leaving the password in place would let the impostor keep their way in.
	 *
	 * @param sub   the Google {@code sub} claim, already verified by {@link GoogleTokenVerifier}
	 * @param email the verified email on that Google account
	 */
	public UserEntity signInWithGoogle(String sub, String email, String fullName) {
		Optional<UserEntity> bySub = userRepository.findByGoogleSub(sub);
		if (bySub.isPresent()) {
			return bySub.get();
		}

		String normalizedEmail = normalizeEmail(email);
		OffsetDateTime now = OffsetDateTime.now();

		Optional<UserEntity> byEmail = userRepository.findByEmailIgnoreCase(normalizedEmail);
		if (byEmail.isPresent()) {
			UserEntity existing = byEmail.get();
			existing.setGoogleSub(sub);
			existing.setPasswordHash(null);
			// Cũng gỡ khoá: đếm sai mật khẩu là của chủ tài khoản CŨ, giữ lại nghĩa là chủ thật
			// vừa được Google xác minh xong lại bị khoá ngoài vì lỗi của người khác.
			existing.setFailedLoginCount(0);
			existing.setLockoutEndAt(null);
			existing.setUpdatedAt(now);
			return userRepository.save(existing);
		}

		UserEntity user = new UserEntity(
				"usr_" + UUID.randomUUID().toString().replace("-", ""),
				normalizedEmail,
				fullName == null || fullName.isBlank() ? normalizedEmail : fullName.trim(),
				null,
				UserRole.CUSTOMER,
				now);
		user.setGoogleSub(sub);
		return userRepository.save(user);
	}

	/**
	 * Returns empty on any rejection (unknown email, locked account, wrong password) — callers
	 * must not distinguish these cases in the response, same as the .NET version, so a caller
	 * cannot probe which emails are registered.
	 */
	public Optional<UserEntity> validateCredentials(String email, String password) {
		Optional<UserEntity> maybeUser = userRepository.findByEmailIgnoreCase(normalizeEmail(email));
		if (maybeUser.isEmpty()) {
			return Optional.empty();
		}

		UserEntity user = maybeUser.get();
		OffsetDateTime now = OffsetDateTime.now();

		if (user.getLockoutEndAt() != null && user.getLockoutEndAt().isAfter(now)) {
			return Optional.empty();
		}

		// Tài khoản chỉ đăng nhập bằng Google thì không có mật khẩu để so.
		//
		// Phải trả về rỗng Y HỆT mọi ca từ chối khác. Bỏ nhánh này thì
		// PasswordHasher.verifyPassword gọi passwordHash.split(...) và ném NPE -> 500, trong khi
		// email lạ trả 401. Chênh lệch đó đủ để dò xem email nào đã đăng ký, đúng thứ javadoc
		// ngay trên phương thức này nói phải tránh.
		if (user.getPasswordHash() == null) {
			return Optional.empty();
		}

		if (passwordHasher.verifyPassword(password, user.getPasswordHash())) {
			if (user.getFailedLoginCount() != 0 || user.getLockoutEndAt() != null) {
				user.setFailedLoginCount(0);
				user.setLockoutEndAt(null);
				user.setUpdatedAt(now);
				userRepository.save(user);
			}
			return Optional.of(user);
		}

		if (user.getLockoutEndAt() != null) {
			user.setFailedLoginCount(0);
			user.setLockoutEndAt(null);
		}

		user.setFailedLoginCount(user.getFailedLoginCount() + 1);
		if (user.getFailedLoginCount() >= MAX_FAILED_LOGIN_ATTEMPTS) {
			user.setLockoutEndAt(now.plusMinutes(LOCKOUT_MINUTES));
		}
		user.setUpdatedAt(now);
		userRepository.save(user);

		return Optional.empty();
	}

	public void changePassword(String userId, String currentPassword, String newPassword) {
		UserEntity user = userRepository.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User account was not found."));

		if (!passwordHasher.verifyPassword(currentPassword, user.getPasswordHash())) {
			throw ApiException.badRequest("CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
		}

		user.setPasswordHash(passwordHasher.hashPassword(newPassword));
		user.setUpdatedAt(OffsetDateTime.now());
		userRepository.save(user);
	}

	private static String normalizeEmail(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
