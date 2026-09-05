package com.cmc.restaurant.auth;

import com.cmc.restaurant.shared.ApiException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Hỏi Firebase xem một ID token thuộc về ai, qua {@code accounts:lookup}.
 *
 * <p>Đánh đổi có chủ ý, giống hệt {@link GoogleTokenInfoVerifier}: cách "chuẩn" là tải bộ khoá
 * công khai của Google rồi tự kiểm chữ ký RS256 tại máy chủ, nhanh hơn và không phụ thuộc mạng lúc
 * khách đăng ký. Cách đó cần thêm thư viện và phần quản lý vòng đời khoá. Ở quy mô một quán ăn,
 * thêm một lời gọi mạng cho mỗi lần ĐĂNG KÝ (không phải mỗi lần đăng nhập) là chấp nhận được, đổi
 * lại là ít mã hơn hẳn để sai.
 *
 * <p>Lớp này CHỈ lấy dữ liệu về. Phần quyết định token có dùng được hay không nằm ở
 * {@link FirebasePhoneClaimsRule}, nơi kiểm chứng được mà không cần mạng.
 */
@Component
class FirebasePhoneVerifier implements PhoneTokenVerifier {

	private static final String GOC = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

	private final HttpClient http = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(5))
			.build();
	private final ObjectMapper json = new ObjectMapper();
	private final String apiKey;
	private final String projectId;

	FirebasePhoneVerifier(
			@Value("${firebase.api-key:}") String apiKey,
			@Value("${firebase.project-id:}") String projectId) {
		this.apiKey = apiKey;
		this.projectId = projectId;
	}

	@Override
	public String xacMinh(String idToken) {
		if (idToken == null || idToken.isBlank()) {
			throw ApiException.unauthorized("PHONE_TOKEN_INVALID",
					"Xác minh số điện thoại không thành công. Thử lại.");
		}
		if (apiKey.isBlank()) {
			throw ApiException.unauthorized("PHONE_VERIFY_NOT_CONFIGURED",
					"Xác minh số điện thoại chưa được cấu hình trên máy chủ.");
		}

		HttpResponse<String> res;
		try {
			res = http.send(
					HttpRequest.newBuilder(URI.create(
									GOC + "?key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8)))
							.header("Content-Type", "application/json")
							.timeout(Duration.ofSeconds(8))
							.POST(HttpRequest.BodyPublishers.ofString(
									json.writeValueAsString(Map.of("idToken", idToken))))
							.build(),
					HttpResponse.BodyHandlers.ofString());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw khongLienHeDuoc();
		} catch (Exception e) {
			// Mạng hỏng KHÔNG được biến thành "đã xác minh". Nói rõ đây là lỗi tạm để khách thử
			// lại, thay vì để họ tưởng số của mình có vấn đề.
			throw khongLienHeDuoc();
		}

		if (res.statusCode() != 200) {
			throw ApiException.unauthorized("PHONE_TOKEN_INVALID",
					"Xác minh số điện thoại không thành công. Thử lại.");
		}

		Map<String, Object> than;
		try {
			than = json.readValue(res.body(), new TypeReference<>() {
			});
		} catch (Exception e) {
			throw ApiException.unauthorized("PHONE_TOKEN_INVALID",
					"Xác minh số điện thoại không thành công. Thử lại.");
		}

		// Dự án đọc từ CHÍNH token — `accounts:lookup` không trả `projectId`. Xem
		// FirebasePhoneClaimsRule.kiemDuAn.
		FirebasePhoneClaimsRule.kiemDuAn(idToken, projectId);

		return FirebasePhoneClaimsRule.doc(than, projectId);
	}

	private static ApiException khongLienHeDuoc() {
		return ApiException.unauthorized("PHONE_VERIFY_UNREACHABLE",
				"Không liên hệ được dịch vụ xác minh. Thử lại sau ít phút.");
	}
}
