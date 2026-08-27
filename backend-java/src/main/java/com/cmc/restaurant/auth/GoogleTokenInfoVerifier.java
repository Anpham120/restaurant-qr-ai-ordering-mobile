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
 * Xác minh ID token bằng cổng {@code tokeninfo} của Google.
 *
 * <p>Đánh đổi có chủ ý: cách "chuẩn" là tải bộ khoá công khai của Google rồi tự kiểm chữ ký RS256
 * ngay tại máy chủ — nhanh hơn và không phụ thuộc mạng lúc khách đăng nhập. Cách đó cần thêm thư
 * viện và thêm phần quản lý vòng đời khoá. Ở quy mô một quán ăn, mỗi lần đăng nhập thêm một lời
 * gọi mạng là chấp nhận được, và đổi lại là ít mã hơn hẳn để sai.
 *
 * <p>Nếu về sau lượng đăng nhập lớn tới mức lời gọi này thành nút cổ chai, chỉ cần thay lớp này —
 * {@link GoogleTokenVerifier} giữ nguyên và mọi phép kiểm vẫn dùng được.
 *
 * <p>Lớp này CHỈ lấy dữ liệu về. Toàn bộ phần quyết định token có dùng được hay không nằm ở
 * {@link GoogleClaimsRule}, nơi kiểm chứng được mà không cần mạng.
 */
@Component
class GoogleTokenInfoVerifier implements GoogleTokenVerifier {

	private static final URI GOC = URI.create("https://oauth2.googleapis.com/tokeninfo");

	private final HttpClient http = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(5))
			.build();
	private final ObjectMapper json = new ObjectMapper();
	private final String clientId;

	GoogleTokenInfoVerifier(@Value("${google.client-id:}") String clientId) {
		this.clientId = clientId;
	}

	@Override
	public GoogleIdentity xacMinh(String idToken) {
		if (idToken == null || idToken.isBlank()) {
			throw ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Đăng nhập Google không hợp lệ.");
		}

		HttpResponse<String> res;
		try {
			res = http.send(
					HttpRequest.newBuilder(URI.create(GOC + "?id_token="
									+ URLEncoder.encode(idToken, StandardCharsets.UTF_8)))
							.timeout(Duration.ofSeconds(8))
							.GET()
							.build(),
					HttpResponse.BodyHandlers.ofString());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw ApiException.unauthorized("GOOGLE_UNREACHABLE", "Không liên hệ được Google. Thử lại.");
		} catch (Exception e) {
			// Mạng hỏng KHÔNG được biến thành "token hợp lệ". Nói rõ đây là lỗi tạm để khách thử
			// lại, thay vì để họ tưởng tài khoản Google của mình có vấn đề.
			throw ApiException.unauthorized("GOOGLE_UNREACHABLE", "Không liên hệ được Google. Thử lại.");
		}

		if (res.statusCode() != 200) {
			throw ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Đăng nhập Google không hợp lệ.");
		}

		Map<String, Object> claims;
		try {
			claims = json.readValue(res.body(), new TypeReference<>() {
			});
		} catch (Exception e) {
			throw ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Đăng nhập Google không hợp lệ.");
		}

		return GoogleClaimsRule.doc(claims, clientId);
	}
}
