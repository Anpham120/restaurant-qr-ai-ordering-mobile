package com.cmc.restaurant.auth;

import com.cmc.restaurant.loyalty.domain.PhoneNumber;
import com.cmc.restaurant.shared.ApiException;
import java.util.List;
import java.util.Map;

/**
 * Luật đọc câu trả lời của Firebase về một token xác minh số điện thoại.
 *
 * <p>Tách khỏi phần gọi mạng vì đây là toàn bộ phần bảo mật của luồng đăng ký, và nếu nó chỉ chạy
 * được khi có mạng ra Firebase thì trên thực tế sẽ không có phép kiểm nào canh nó.
 *
 * <p>Luật đắt giá nhất: <b>token phải mang số điện thoại đã xác minh</b>. Firebase phát token cho
 * nhiều kiểu đăng nhập — ẩn danh, email, Google — và các token đó hoàn toàn hợp lệ nhưng KHÔNG
 * chứng minh gì về số điện thoại. Nhận bừa nghĩa là ai cũng đăng ký được bằng số người khác, tức
 * mất trắng lý do dùng OTP.
 */
final class FirebasePhoneClaimsRule {

	private FirebasePhoneClaimsRule() {
	}

	/**
	 * @param than            thân trả về của {@code accounts:lookup}
	 * @param duAnMongDoi     mã dự án Firebase của chính quán
	 * @return số điện thoại đã xác minh
	 */
	@SuppressWarnings("unchecked")
	static String doc(Map<String, Object> than, String duAnMongDoi) {
		if (duAnMongDoi == null || duAnMongDoi.isBlank()) {
			// Chưa cấu hình thì KHÔNG có gì để đối chiếu. Chặn hẳn, không chạy ở chế độ bỏ qua
			// kiểm tra — cùng luật đã đặt cho GOOGLE_CLIENT_ID, AI_INTERNAL_TOKEN và Casso.
			throw ApiException.unauthorized("PHONE_VERIFY_NOT_CONFIGURED",
					"Xác minh số điện thoại chưa được cấu hình trên máy chủ.");
		}

		Object ds = than.get("users");
		if (!(ds instanceof List<?> danhSach) || danhSach.size() != 1) {
			// Không có ai, hoặc nhiều hơn một: cả hai đều nghĩa là token không trỏ tới đúng một
			// người, và không có cách nào đoán đúng người nào.
			throw tuChoi();
		}

		Object dau = danhSach.get(0);
		if (!(dau instanceof Map)) {
			throw tuChoi();
		}
		Map<String, Object> nguoi = (Map<String, Object>) dau;

		if (!duAnMongDoi.equals(chuoi(nguoi, "projectId"))) {
			// Token của một dự án Firebase KHÁC. Xem javadoc của lớp.
			throw tuChoi();
		}

		String so = chuoi(nguoi, "phoneNumber");
		if (so == null || so.isBlank()) {
			// Token hợp lệ nhưng của một kiểu đăng nhập không dính gì tới số điện thoại.
			throw tuChoi();
		}

		String chuanHoa = PhoneNumber.normalize(so);
		if (chuanHoa == null || chuanHoa.length() < 9 || chuanHoa.length() > 15) {
			throw tuChoi();
		}
		return chuanHoa;
	}

	/** Mọi ca hỏng nói CÙNG một câu — phân biệt là chỉ cho người tấn công biết họ sai ở đâu. */
	private static ApiException tuChoi() {
		return ApiException.unauthorized("PHONE_TOKEN_INVALID",
				"Xác minh số điện thoại không thành công. Thử lại.");
	}

	private static String chuoi(Map<String, Object> o, String khoa) {
		Object v = o.get(khoa);
		return v instanceof String s ? s : null;
	}
}
