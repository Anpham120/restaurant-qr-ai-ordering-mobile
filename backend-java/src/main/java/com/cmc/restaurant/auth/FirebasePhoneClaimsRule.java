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

	/**
	 * Token có ĐÚNG thuộc dự án Firebase của quán không.
	 *
	 * <p>Đọc từ CHÍNH token chứ không đọc từ câu trả lời của {@code accounts:lookup}.
	 *
	 * <p><b>LỖI CÓ THẬT.</b> Bản đầu so {@code projectId} lấy từ thân trả về của
	 * {@code accounts:lookup} — nhưng cổng đó KHÔNG trả trường ấy. Đo bằng một token thật:
	 *
	 * <pre>
	 *   accounts:lookup -> localId, providerUserInfo, lastLoginAt, createdAt, phoneNumber,
	 *                      lastRefreshAt          (không có projectId)
	 *   chính ID token  -> aud = cmcrestaurants
	 *                      iss = https://securetoken.google.com/cmcrestaurants
	 * </pre>
	 *
	 * <p>So với {@code null} thì phép kiểm KHÔNG BAO GIỜ qua được, và mọi lượt đăng ký bằng OTP đều
	 * trả {@code PHONE_TOKEN_INVALID}. Mọi phép kiểm trước đó dùng token BỊA nên chết sớm hơn ở
	 * Firebase và cũng ra đúng mã lỗi đó — <b>đúng mã, sai lý do</b>. Chỉ một token thật mới phân
	 * biệt được hai ca.
	 *
	 * <p>Đọc payload mà KHÔNG kiểm chữ ký là đủ ở đây, vì nó không đứng một mình: lượt gọi
	 * {@code accounts:lookup} đi kèm dùng khoá API của chính dự án này, và Firebase mới là bên kiểm
	 * chữ ký. Phép kiểm dưới đây bịt nốt câu hỏi còn lại — token đó của dự án nào.
	 */
	static void kiemDuAn(String idToken, String duAnMongDoi) {
		String[] phan = idToken.split("\\.");
		if (phan.length != 3) {
			throw tuChoi();
		}
		Map<String, Object> claims;
		try {
			byte[] than = java.util.Base64.getUrlDecoder().decode(phan[1]);
			claims = new com.fasterxml.jackson.databind.ObjectMapper()
					.readValue(than, new com.fasterxml.jackson.core.type.TypeReference<>() {
					});
		} catch (Exception e) {
			throw tuChoi();
		}

		// Kiểm CẢ HAI. `aud` một mình đủ trong thực tế, nhưng `iss` chốt thêm rằng token do
		// securetoken.google.com phát — tức là ID token của Firebase Auth, không phải một loại
		// token khác của Google tình cờ mang cùng `aud`.
		if (!duAnMongDoi.equals(chuoi(claims, "aud"))
				|| !("https://securetoken.google.com/" + duAnMongDoi).equals(chuoi(claims, "iss"))) {
			throw tuChoi();
		}
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
