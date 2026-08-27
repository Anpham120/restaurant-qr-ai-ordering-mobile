package com.cmc.restaurant.auth;

import com.cmc.restaurant.shared.ApiException;
import java.util.Map;

/**
 * Luật đọc một token Google đã giải mã.
 *
 * <p>Tách khỏi phần gọi mạng vì lý do cụ thể: các luật ở đây là toàn bộ phần bảo mật của tính năng,
 * và nếu chúng chỉ chạy được khi có mạng ra Google thì sẽ không có phép kiểm nào canh chúng cả.
 *
 * <p>Luật đắt giá nhất là {@code aud}. Google phát token cho MỌI ứng dụng; một token hợp lệ hoàn
 * hảo, chữ ký thật, chưa hết hạn, vẫn có thể là token Google phát cho ứng dụng của người khác. Bỏ
 * phép so {@code aud} thì bất kỳ ai có một ứng dụng Google đều đăng nhập được vào đây với danh
 * nghĩa bất kỳ người dùng nào của họ.
 */
final class GoogleClaimsRule {

	/** Google phát {@code iss} ở hai dạng này, cả hai đều hợp lệ. */
	private static final java.util.Set<String> ISS_HOP_LE =
			java.util.Set.of("accounts.google.com", "https://accounts.google.com");

	private GoogleClaimsRule() {
	}

	/**
	 * @param claims     phần thân token Google đã giải mã
	 * @param clientIdMongDoi client ID của chính ứng dụng này
	 * @throws ApiException 401 nếu token không dùng được, KHÔNG nói rõ hỏng ở đâu
	 */
	static GoogleIdentity doc(Map<String, Object> claims, String clientIdMongDoi) {
		if (clientIdMongDoi == null || clientIdMongDoi.isBlank()) {
			// Không cấu hình client ID thì KHÔNG có gì để so aud. Chặn hẳn, không cho chạy ở chế
			// độ "bỏ qua kiểm tra" — một triển khai quên cấu hình phải từ chối mọi lời gọi, chứ
			// không phải nhận mọi lời gọi. Cùng luật với AI_INTERNAL_TOKEN và CASSO_SECURETOKEN.
			throw ApiException.unauthorized("GOOGLE_NOT_CONFIGURED",
					"Đăng nhập Google chưa được cấu hình trên máy chủ.");
		}

		if (!ISS_HOP_LE.contains(chuoi(claims, "iss"))) {
			throw tuChoi();
		}

		// Phép so quan trọng nhất trong cả lớp này. Xem javadoc của lớp.
		if (!clientIdMongDoi.equals(chuoi(claims, "aud"))) {
			throw tuChoi();
		}

		// Google trả email_verified dưới dạng boolean hoặc chuỗi "true" tuỳ đường lấy token.
		Object daXacMinh = claims.get("email_verified");
		if (!Boolean.TRUE.equals(daXacMinh) && !"true".equals(daXacMinh)) {
			// Email chưa xác minh mà vẫn nhận thì luật gộp tài khoản theo email trong
			// UserService.signInWithGoogle trở thành đường cướp tài khoản.
			throw tuChoi();
		}

		String sub = chuoi(claims, "sub");
		String email = chuoi(claims, "email");
		if (sub == null || sub.isBlank() || email == null || email.isBlank()) {
			throw tuChoi();
		}

		return new GoogleIdentity(sub, EmailRule.normalize(email), chuoi(claims, "name"));
	}

	/**
	 * Mọi ca hỏng nói CÙNG một câu.
	 *
	 * <p>Phân biệt "sai aud" với "hết hạn" là chỉ cho người tấn công biết họ đang sai ở đâu.
	 */
	private static ApiException tuChoi() {
		return ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Đăng nhập Google không hợp lệ.");
	}

	private static String chuoi(Map<String, Object> claims, String khoa) {
		Object v = claims.get(khoa);
		return v instanceof String s ? s : null;
	}
}
