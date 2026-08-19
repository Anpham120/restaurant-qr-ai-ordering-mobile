package com.cmc.restaurant.auth;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Một luật email duy nhất cho cả hai đường nhập: khách tự đăng ký ({@code AuthController}) và quản
 * trị viên tạo tài khoản nhân sự ({@code AdminUserService}).
 *
 * <p>Tách ra vì lý do cụ thể, không phải cho gọn: hai bản sao của cùng một biểu thức sẽ trôi khỏi
 * nhau — sửa một chỗ, quên chỗ kia — và hậu quả là cùng một chuỗi email được chấp nhận ở đường này
 * nhưng bị từ chối ở đường kia. Đây đúng lớp lỗi mà dự án đã gặp với {@code message} vs
 * {@code question} và với tên biến {@code AI_EMBEDDING_CACHE}.
 */
final class EmailRule {

	private static final Pattern PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

	private EmailRule() {
	}

	static boolean isValid(String email) {
		return email != null && PATTERN.matcher(email.trim()).matches();
	}

	/** Dạng chuẩn để lưu và để so trùng: bỏ khoảng trắng hai đầu, hạ chữ thường. */
	static String normalize(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
