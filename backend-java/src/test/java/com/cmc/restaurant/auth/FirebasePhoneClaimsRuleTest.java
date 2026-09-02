package com.cmc.restaurant.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cmc.restaurant.shared.ApiException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Luật đọc câu trả lời của Firebase về một token xác minh số điện thoại.
 *
 * <p>Toàn bộ phần bảo mật của luồng đăng ký nằm ở lớp được kiểm ở đây. Các phép kiểm này chạy
 * không cần mạng, không cần dự án Firebase, và KHÔNG TỐN MỘT TIN NHẮN NÀO — đó chính là lý do lớp
 * luật được tách khỏi phần gọi HTTP.
 */
class FirebasePhoneClaimsRuleTest {

	private static final String DU_AN = "vi-an-quan-an";

	private static Map<String, Object> hopLe() {
		Map<String, Object> nguoi = new HashMap<>();
		nguoi.put("localId", "abc123");
		// KHÔNG có "projectId": đo bằng token thật, accounts:lookup chỉ trả localId,
		// providerUserInfo, lastLoginAt, createdAt, phoneNumber, lastRefreshAt.
		nguoi.put("phoneNumber", "+84901234567");
		return new HashMap<>(Map.of("users", List.of(nguoi)));
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> nguoiDau(Map<String, Object> than) {
		return (Map<String, Object>) ((List<Object>) than.get("users")).get(0);
	}

	@Test
	@DisplayName("Token hợp lệ: đọc ra số điện thoại đã chuẩn hoá về DẠNG TRONG NƯỚC")
	void readsAVerifiedPhone() {
		// Chuẩn hoá vì hồ sơ điểm khoá theo dạng thu ngân gõ ở quầy. Trả nguyên "+84901234567"
		// nghĩa là khách đăng ký xong không thấy điểm cũ của chính mình.
		//
		// Bản đầu của ca này khẳng định "84901234567" — tức chỉ bỏ dấu cộng. Ý định trong chú
		// thích đúng, giá trị thì sai: thu ngân gõ "0901234567", nên "84901234567" vẫn là một khoá
		// KHÁC và vẫn đúng cái hỏng mà chú thích cảnh báo. Xem PhoneNumberTest.
		assertThat(FirebasePhoneClaimsRule.doc(hopLe(), DU_AN)).isEqualTo("0901234567");
	}

	@Test
	@DisplayName("Token của DỰ ÁN Firebase khác thì bị từ chối — đọc từ CHÍNH token")
	void rejectsATokenFromAnotherProject() {
		// Phép kiểm đắt giá nhất tệp này. Bỏ nó thì bất kỳ ai có một dự án Firebase đều đăng ký được
		// vào đây bằng số bất kỳ mà họ tự xác minh lấy.
		//
		// Bản đầu đọc "projectId" từ thân trả về của accounts:tra cứu — cổng đó KHÔNG trả trường ấy,
		// nên phép so luôn gặp null và KHÔNG BAO GIỜ qua được. Mọi lượt đăng ký OTP đều hỏng, và mọi
		// phép kiểm cũ vẫn xanh vì chúng tự dựng "projectId" mà Firebase không hề gửi.
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.kiemDuAn(token("du-an-cua-ke-khac"), DU_AN))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Token đúng dự án thì qua")
	void acceptsATokenFromOurProject() {
		FirebasePhoneClaimsRule.kiemDuAn(token(DU_AN), DU_AN);
	}

	@Test
	@DisplayName("iss sai thì từ chối dù aud đúng")
	void rejectsAWrongIssuer() {
		// aud một mình có thể trùng với một loại token khác của Google. iss chốt rằng đây đúng là ID
		// token do Firebase Auth phát.
		String xau = jwt("{\"aud\":\"" + DU_AN + "\",\"iss\":\"https://ke-la.example/" + DU_AN + "\"}");

		assertThatThrownBy(() -> FirebasePhoneClaimsRule.kiemDuAn(xau, DU_AN))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Chuỗi không phải JWT thì từ chối, không nổ")
	void rejectsAMalformedToken() {
		for (String xau : new String[] {"", "khong-phai-jwt", "a.b", "a.b.c.d", "a.@@@.c"}) {
			assertThatThrownBy(() -> FirebasePhoneClaimsRule.kiemDuAn(xau, DU_AN))
					.as("token hỏng: %s", xau)
					.isInstanceOf(ApiException.class);
		}
	}

	/** ID token của Firebase cho một dự án — HÌNH DẠNG THẬT, chép từ token đo được. */
	private static String token(String duAn) {
		return jwt("{\"aud\":\"" + duAn + "\",\"iss\":\"https://securetoken.google.com/" + duAn
				+ "\",\"phone_number\":\"+84901234567\"}");
	}

	private static String jwt(String payloadJson) {
		String than = java.util.Base64.getUrlEncoder().withoutPadding()
				.encodeToString(payloadJson.getBytes(java.nio.charset.StandardCharsets.UTF_8));
		// Chữ ký KHÔNG kiểm ở đây — Firebase mới là bên kiểm, qua accounts:lookup với khoá API của
		// chính dự án này. Xem javadoc của kiemDuAn.
		return "eyJhbGciOiJSUzI1NiJ9." + than + ".chu-ky-khong-kiem-o-day";
	}

	@Test
	@DisplayName("Máy chủ chưa cấu hình dự án thì từ chối TẤT CẢ, không nhận tất cả")
	void refusesEverythingWhenUnconfigured() {
		// Không có mã dự án thì không có gì để so. Cho qua nghĩa là mọi token của mọi dự án đều
		// lọt. Cùng luật đã đặt cho GOOGLE_CLIENT_ID, AI_INTERNAL_TOKEN và Casso.
		assertThat(maLoi(hopLe(), "")).isEqualTo("PHONE_VERIFY_NOT_CONFIGURED");
		assertThat(maLoi(hopLe(), null)).isEqualTo("PHONE_VERIFY_NOT_CONFIGURED");
	}

	@Test
	@DisplayName("Token KHÔNG mang số điện thoại thì bị từ chối")
	void rejectsATokenWithoutAPhone() {
		// Firebase phát token cho nhiều kiểu đăng nhập — ẩn danh, email, Google. Chúng hợp lệ
		// nhưng không chứng minh gì về số điện thoại. Nhận bừa là mất trắng lý do dùng OTP.
		Map<String, Object> khongSo = hopLe();
		nguoiDau(khongSo).remove("phoneNumber");
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(khongSo, DU_AN))
				.isInstanceOf(ApiException.class);

		Map<String, Object> soRong = hopLe();
		nguoiDau(soRong).put("phoneNumber", "");
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(soRong, DU_AN))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Không có ai, hoặc nhiều hơn một người, đều bị từ chối")
	void rejectsAnythingButExactlyOneUser() {
		// Cả hai đều nghĩa là token không trỏ tới đúng một người, và không có cách nào đoán đúng.
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(Map.of("users", List.of()), DU_AN))
				.isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(Map.of(), DU_AN))
				.isInstanceOf(ApiException.class);

		Map<String, Object> hai = hopLe();
		hai.put("users", List.of(nguoiDau(hopLe()), nguoiDau(hopLe())));
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(hai, DU_AN))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Số quá ngắn hoặc quá dài thì bị từ chối")
	void rejectsAnImplausiblePhone() {
		Map<String, Object> ngan = hopLe();
		nguoiDau(ngan).put("phoneNumber", "+8490");
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(ngan, DU_AN))
				.isInstanceOf(ApiException.class);

		Map<String, Object> dai = hopLe();
		nguoiDau(dai).put("phoneNumber", "+849012345678901234");
		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(dai, DU_AN))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Mọi ca hỏng nói CÙNG một câu, không chỉ ra sai ở đâu")
	void everyRejectionLooksTheSame() {
		// Phân biệt "sai dự án" với "không có số" là chỉ cho người tấn công biết họ đang vướng ở
		// đâu để sửa.
		//
		// Hai ca giờ nằm ở HAI hàm khác nhau — dự án đọc từ token, số đọc từ thân trả về — nên phép
		// so này càng đáng giữ: cùng một câu phải đi ra từ cả hai đường.
		Map<String, Object> khongSo = hopLe();
		nguoiDau(khongSo).remove("phoneNumber");

		assertThat(maLoiToken(token("du-an-cua-ke-khac"), DU_AN)).isEqualTo(maLoi(khongSo, DU_AN));
	}

	/** Mã lỗi khi kiểm dự án thất bại; ném AssertionError nếu lại cho qua. */
	private static String maLoiToken(String idToken, String duAn) {
		try {
			FirebasePhoneClaimsRule.kiemDuAn(idToken, duAn);
			throw new AssertionError("đáng lẽ phải từ chối");
		} catch (ApiException e) {
			return e.getCode();
		}
	}

	/** Mã lỗi khi đọc thất bại; ném AssertionError nếu lại đọc được. */
	private static String maLoi(Map<String, Object> than, String duAn) {
		try {
			FirebasePhoneClaimsRule.doc(than, duAn);
			throw new AssertionError("đáng lẽ phải từ chối");
		} catch (ApiException e) {
			return e.getCode();
		}
	}
}
