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
