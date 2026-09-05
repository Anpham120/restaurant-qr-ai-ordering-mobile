package com.cmc.restaurant.auth;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Tạo tài khoản quản trị đầu tiên khi cơ sở dữ liệu chưa có quản trị viên nào.
 *
 * <p>VÌ SAO CẦN: không có migration nào chèn người dùng, và mọi đường tạo tài khoản nhân sự đều
 * nằm sau lớp xác thực vai trò Admin. Một bản triển khai mới vì thế khoá chính nó ra ngoài — cổng
 * quản trị, nhân viên và bếp đều bật lên bình thường nhưng không có tài khoản nào đăng nhập được,
 * và không có cách nào tạo tài khoản đầu tiên qua API. Đã gặp thật trên máy chủ staging.
 *
 * <p>BA LUẬT, mỗi luật bịt một cách hỏng khác nhau:
 *
 * <ul>
 *   <li>Thiếu email hoặc mật khẩu thì KHÔNG làm gì. Không có mặc định — đặt sẵn một cặp trong mã
 *       nghĩa là mọi máy chủ chưa cấu hình đều dùng chung một tài khoản quản trị công khai.
 *   <li>Đã có bất kỳ quản trị viên nào thì KHÔNG làm gì. Không ghi đè, không đổi mật khẩu. Nếu
 *       không, mỗi lần khởi động lại là một lần đặt lại mật khẩu về giá trị nằm trong biến môi
 *       trường — kể cả khi quản trị viên đã tự đổi.
 *   <li>Mật khẩu ngắn hơn 8 ký tự thì DỪNG HẲN ứng dụng, không phải bỏ qua. Bỏ qua ở đây cho ra
 *       đúng cái triệu chứng mà lớp này sinh ra để chữa — máy chủ lên xanh, không ai đăng nhập
 *       được, và không có gì nói tại sao.
 * </ul>
 *
 * <p>Lớp này chạy cả trong lượt {@code --migrate-only}: chế độ đó vẫn dựng đủ context, chỉ không
 * mở cổng web. Thành ra tài khoản được tạo ngay ở bước migrate, và lượt khởi động API sau đó thấy
 * đã có quản trị viên nên bỏ qua. Cố ý để vậy — mật khẩu ngắn làm hỏng bước migrate, tức hỏng ở
 * chỗ người triển khai đang nhìn, chứ không hỏng lặng lẽ trong log của một container đã lên xanh.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

	/** Cùng ngưỡng với `/api/auth/register` và trang đổi mật khẩu. */
	private static final int TOI_THIEU_MAT_KHAU = 8;

	private static final String HO_TEN_MAC_DINH = "Quản trị hệ thống";

	private final UserRepository userRepository;
	private final PasswordHasher passwordHasher;
	private final AdminBootstrapProperties props;

	public AdminBootstrap(UserRepository userRepository, PasswordHasher passwordHasher,
			AdminBootstrapProperties props) {
		this.userRepository = userRepository;
		this.passwordHasher = passwordHasher;
		this.props = props;
	}

	@Override
	public void run(ApplicationArguments args) {
		String email = trimHoacRong(props.email());
		String matKhau = props.password() == null ? "" : props.password();

		if (email.isEmpty() || matKhau.isBlank()) {
			log.debug("Bỏ qua tạo quản trị viên đầu tiên: chưa đặt ADMIN_BOOTSTRAP_EMAIL/PASSWORD.");
			return;
		}

		if (matKhau.length() < TOI_THIEU_MAT_KHAU) {
			// Ném ra để ứng dụng dừng hẳn. Xem ghi chú luật thứ ba ở đầu lớp.
			throw new IllegalStateException(
					"ADMIN_BOOTSTRAP_PASSWORD phải có ít nhất " + TOI_THIEU_MAT_KHAU + " ký tự.");
		}

		if (userRepository.existsByRole(UserRole.ADMIN)) {
			log.info("Đã có quản trị viên, không tạo thêm.");
			return;
		}

		// Kiểm riêng email: cơ sở dữ liệu có thể đã mang tài khoản KHÔNG phải Admin dùng đúng địa
		// chỉ này, và `ux_users_email` sẽ chặn lúc lưu. Bắt trước để câu báo nói đúng chuyện.
		if (userRepository.existsByEmailIgnoreCase(email)) {
			log.warn("Không tạo quản trị viên: email {} đã thuộc về một tài khoản khác.", email);
			return;
		}

		String hoTen = trimHoacRong(props.fullName());
		userRepository.save(new UserEntity(
				"usr_" + UUID.randomUUID().toString().replace("-", ""),
				email,
				hoTen.isEmpty() ? HO_TEN_MAC_DINH : hoTen,
				passwordHasher.hashPassword(matKhau),
				UserRole.ADMIN,
				OffsetDateTime.now()));

		// KHÔNG ghi mật khẩu ra log. Log máy chủ đọc được bởi nhiều người hơn biến môi trường.
		log.info("Đã tạo quản trị viên đầu tiên: {}", email);
	}

	private static String trimHoacRong(String s) {
		return s == null ? "" : s.trim();
	}
}
