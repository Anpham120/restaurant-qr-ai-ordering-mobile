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
		nguoi.put("projectId", DU_AN);
		nguoi.put("phoneNumber", "+84901234567");
		return new HashMap<>(Map.of("users", List.of(nguoi)));
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> nguoiDau(Map<String, Object> than) {
		return (Map<String, Object>) ((List<Object>) than.get("users")).get(0);
	}

	@Test
	@DisplayName("Token hợp lệ: đọc ra số điện thoại đã chuẩn hoá")
	void readsAVerifiedPhone() {
		// Chuẩn hoá về chữ số vì hồ sơ điểm khoá theo dạng đó. Trả nguyên "+84901234567" nghĩa là
		// khách đăng ký xong không thấy điểm cũ của chính mình.
		assertThat(FirebasePhoneClaimsRule.doc(hopLe(), DU_AN)).isEqualTo("84901234567");
	}

	@Test
	@DisplayName("Token của DỰ ÁN Firebase khác thì bị từ chối")
	void rejectsATokenFromAnotherProject() {
		// Phép kiểm đắt giá nhất tệp này. Token dưới đây hoàn toàn thật và mang một số đã xác minh
		// thật — chỉ là của dự án Firebase người khác. Bỏ phép so này thì bất kỳ ai có một dự án
		// Firebase đều đăng ký được vào đây với số bất kỳ mà họ tự xác minh lấy.
		Map<String, Object> cuaKe = hopLe();
		nguoiDau(cuaKe).put("projectId", "du-an-cua-ke-khac");

		assertThatThrownBy(() -> FirebasePhoneClaimsRule.doc(cuaKe, DU_AN))
				.isInstanceOf(ApiException.class);
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
		Map<String, Object> saiDuAn = hopLe();
		nguoiDau(saiDuAn).put("projectId", "khac");
		Map<String, Object> khongSo = hopLe();
		nguoiDau(khongSo).remove("phoneNumber");

		assertThat(maLoi(saiDuAn, DU_AN)).isEqualTo(maLoi(khongSo, DU_AN));
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
