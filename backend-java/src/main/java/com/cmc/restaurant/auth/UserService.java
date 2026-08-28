package com.cmc.restaurant.auth;

import com.cmc.restaurant.loyalty.domain.PhoneNumber;
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

	/**
	 * Tạo tài khoản khách bằng số điện thoại ĐÃ xác minh.
	 *
	 * <p>Số ở đây phải do {@link PhoneTokenVerifier} trả về, không bao giờ lấy thẳng từ thân
	 * request. Điểm thưởng tính theo số điện thoại, nên nhận một số chưa xác minh nghĩa là cho
	 * người lạ chiếm hồ sơ điểm của khách quen và khoá luôn chủ thật ra ngoài.
	 *
	 * <p>Không có email. Đó là lý do V22 cho {@code users.email} nhận NULL — nhân viên vẫn dùng
	 * email, khách thì không cần.
	 *
	 * <p>Hồ sơ điểm mang số này, nếu đã có, thuộc về tài khoản vừa tạo NGAY LẬP TỨC: một khoá duy
	 * nhất cho cả hai phía nên không còn gì để nối.
	 */
	public UserEntity registerCustomerByPhone(String fullName, String verifiedPhone, String password) {
		if (userRepository.findByPhoneNumber(verifiedPhone).isPresent()) {
			throw ApiException.conflict("PHONE_ALREADY_REGISTERED",
					"Số điện thoại này đã có tài khoản. Hãy đăng nhập.");
		}

		UserEntity user = new UserEntity(
				"usr_" + UUID.randomUUID().toString().replace("-", ""),
				null,
				fullName.trim(),
				passwordHasher.hashPassword(password),
				UserRole.CUSTOMER,
				OffsetDateTime.now());
		user.setPhoneNumber(verifiedPhone);

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

			// CHỈ gộp vào tài khoản KHÁCH.
			//
			// Từ V22, khách đăng ký bằng số điện thoại và không có email — nên phần lớn tài khoản
			// còn mang email là nhân viên và quản trị viên. Gộp vào một tài khoản như thế nghĩa là
			// bất kỳ ai có tài khoản Google trùng email nhân viên sẽ chiếm luôn tài khoản đó, KÈM
			// CẢ VAI TRÒ, và mật khẩu cũ bị xoá nên nhân viên thật mất đường vào.
			//
			// Tài khoản khách có email vẫn còn: chúng sinh ra trước V22, và đường gộp tồn tại là
			// vì chúng.
			if (!UserRole.CUSTOMER.equals(existing.getRole())) {
				throw ApiException.conflict("EMAIL_BELONGS_TO_STAFF",
						"Email này thuộc tài khoản nội bộ. Dùng đường đăng nhập dành cho nhân viên.");
			}

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
	 * Tìm tài khoản theo thứ người dùng vừa gõ: số điện thoại HOẶC email.
	 *
	 * <p>Một ô nhập duy nhất cho cả hai. Khách gõ số, nhân viên gõ email, và không ai phải chọn
	 * "đăng nhập bằng gì" trước — một câu hỏi mà người dùng không có lý do gì để quan tâm.
	 *
	 * <p>Thử số trước: một chuỗi chuẩn hoá được thành số điện thoại thì không thể là email hợp lệ,
	 * và cả hai cột đều UNIQUE nên không có ca nào mơ hồ.
	 */
	private Optional<UserEntity> timTheoDinhDanh(String dinhDanh) {
		if (dinhDanh == null || dinhDanh.isBlank()) {
			return Optional.empty();
		}
		String so = PhoneNumber.normalize(dinhDanh);
		if (so != null && !so.isBlank()) {
			Optional<UserEntity> theoSo = userRepository.findByPhoneNumber(so);
			if (theoSo.isPresent()) {
				return theoSo;
			}
		}
		return userRepository.findByEmailIgnoreCase(normalizeEmail(dinhDanh));
	}

	/**
	 * Returns empty on any rejection (unknown email, locked account, wrong password) — callers
	 * must not distinguish these cases in the response, same as the .NET version, so a caller
	 * cannot probe which emails are registered.
	 */
	public Optional<UserEntity> validateCredentials(String dinhDanh, String password) {
		Optional<UserEntity> maybeUser = timTheoDinhDanh(dinhDanh);
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
