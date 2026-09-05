package com.cmc.restaurant.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cmc.restaurant.shared.ApiException;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Luật đọc token Google.
 *
 * <p>Toàn bộ phần bảo mật của tính năng đăng nhập Google nằm ở lớp được kiểm ở đây. Các phép kiểm
 * này chạy không cần mạng và không cần tài khoản Google — đó chính là lý do lớp luật được tách ra
 * khỏi phần gọi HTTP.
 */
class GoogleClaimsRuleTest {

	private static final String CUA_TA = "123-quan-an.apps.googleusercontent.com";

	private static Map<String, Object> hopLe() {
		Map<String, Object> m = new HashMap<>();
		m.put("iss", "https://accounts.google.com");
		m.put("aud", CUA_TA);
		m.put("sub", "108156789012345678901");
		m.put("email", "An.Pham@Gmail.com");
		m.put("email_verified", true);
		m.put("name", "An Phạm");
		return m;
	}

	@Test
	@DisplayName("Token hợp lệ: đọc ra sub, email đã hạ chữ thường, và tên")
	void readsAValidToken() {
		GoogleIdentity d = GoogleClaimsRule.doc(hopLe(), CUA_TA);

		assertThat(d.sub()).isEqualTo("108156789012345678901");
		// Hạ chữ thường vì luật gộp tài khoản so theo email; "An.Pham@Gmail.com" và
		// "an.pham@gmail.com" mà thành hai tài khoản thì khách mất điểm.
		assertThat(d.email()).isEqualTo("an.pham@gmail.com");
		assertThat(d.fullName()).isEqualTo("An Phạm");
	}

	@Test
	@DisplayName("Token phát cho ứng dụng KHÁC thì bị từ chối")
	void rejectsATokenIssuedForAnotherApp() {
		// Phép kiểm đắt giá nhất trong tệp này. Token dưới đây hoàn toàn thật: chữ ký của Google,
		// chưa hết hạn, email đã xác minh. Nó chỉ được phát cho ứng dụng của người khác. Bỏ phép
		// so `aud` thì bất kỳ ai có một ứng dụng Google đều đăng nhập được vào đây với danh nghĩa
		// bất kỳ người dùng nào của họ — và không phép kiểm nào khác trong dự án nói ra điều đó.
		Map<String, Object> cuaKe = hopLe();
		cuaKe.put("aud", "999-app-cua-ke-khac.apps.googleusercontent.com");

		assertThatThrownBy(() -> GoogleClaimsRule.doc(cuaKe, CUA_TA))
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("không hợp lệ");
	}

	@Test
	@DisplayName("Máy chủ chưa cấu hình client ID thì từ chối TẤT CẢ, không nhận tất cả")
	void refusesEverythingWhenUnconfigured() {
		// Một triển khai quên đặt GOOGLE_CLIENT_ID mà vẫn cho đăng nhập là tệ hơn hẳn việc không
		// đăng nhập được: không có client ID thì không có gì để so `aud`, tức mọi token của mọi
		// ứng dụng đều lọt. Cùng luật đã đặt cho AI_INTERNAL_TOKEN và PAYMENTS_CASSO_SECURETOKEN.
		// Bám vào MÃ LỖI, không chỉ "có ném". Chỉ khẳng định có ném thì phép kiểm này vô dụng:
		// bỏ hẳn nhánh chặn, phép so aud với chuỗi rỗng vẫn ra false và vẫn ném — phép kiểm vẫn
		// xanh trong khi thứ nó định canh đã biến mất. Với null còn tệ hơn: equals trên null ném
		// NPE, thành 500 thay vì 401.
		assertThat(maLoi(hopLe(), "")).isEqualTo("GOOGLE_NOT_CONFIGURED");
		assertThat(maLoi(hopLe(), null)).isEqualTo("GOOGLE_NOT_CONFIGURED");
	}

	@Test
	@DisplayName("Email chưa xác minh thì bị từ chối")
	void rejectsAnUnverifiedEmail() {
		// Quan trọng vì UserService.signInWithGoogle GỘP theo email. Nhận email chưa xác minh
		// nghĩa là ai đó tạo tài khoản Google khai email người khác rồi chiếm luôn tài khoản đó.
		Map<String, Object> chuaXacMinh = hopLe();
		chuaXacMinh.put("email_verified", false);

		assertThatThrownBy(() -> GoogleClaimsRule.doc(chuaXacMinh, CUA_TA))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Thiếu hẳn email_verified cũng bị từ chối, không coi là đã xác minh")
	void treatsAMissingFlagAsUnverified() {
		Map<String, Object> thieu = hopLe();
		thieu.remove("email_verified");

		assertThatThrownBy(() -> GoogleClaimsRule.doc(thieu, CUA_TA))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Google trả email_verified dạng chuỗi \"true\" vẫn nhận")
	void acceptsTheStringForm() {
		// Google trả boolean hay chuỗi tuỳ đường lấy token. Từ chối dạng chuỗi nghĩa là khách
		// đăng nhập được trên nền tảng này nhưng không đăng nhập được trên nền tảng kia.
		Map<String, Object> dangChuoi = hopLe();
		dangChuoi.put("email_verified", "true");

		assertThat(GoogleClaimsRule.doc(dangChuoi, CUA_TA).sub()).isEqualTo("108156789012345678901");
	}

	@Test
	@DisplayName("iss lạ thì bị từ chối")
	void rejectsAForeignIssuer() {
		Map<String, Object> gia = hopLe();
		gia.put("iss", "https://accounts.google.com.ke-gia.example");

		assertThatThrownBy(() -> GoogleClaimsRule.doc(gia, CUA_TA))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Nhận cả hai dạng iss mà Google thật sự phát")
	void acceptsBothIssuerForms() {
		Map<String, Object> khongCoLuoc = hopLe();
		khongCoLuoc.put("iss", "accounts.google.com");

		assertThat(GoogleClaimsRule.doc(khongCoLuoc, CUA_TA).email()).isEqualTo("an.pham@gmail.com");
	}

	@Test
	@DisplayName("Thiếu sub hoặc email thì bị từ chối")
	void rejectsMissingIdentity() {
		Map<String, Object> khongSub = hopLe();
		khongSub.remove("sub");
		assertThatThrownBy(() -> GoogleClaimsRule.doc(khongSub, CUA_TA))
				.isInstanceOf(ApiException.class);

		Map<String, Object> khongEmail = hopLe();
		khongEmail.remove("email");
		assertThatThrownBy(() -> GoogleClaimsRule.doc(khongEmail, CUA_TA))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Mọi ca hỏng nói CÙNG một câu, không chỉ ra sai ở đâu")
	void everyRejectionLooksTheSame() {
		// Phân biệt "sai aud" với "email chưa xác minh" là chỉ cho người tấn công biết họ đang
		// vướng ở đâu để sửa.
		Map<String, Object> saiAud = hopLe();
		saiAud.put("aud", "khac");
		Map<String, Object> chuaXacMinh = hopLe();
		chuaXacMinh.put("email_verified", false);

		String a = catchThrowable(saiAud);
		String b = catchThrowable(chuaXacMinh);

		assertThat(a).isEqualTo(b);
	}

	/** Mã lỗi khi đọc thất bại; ném AssertionError nếu lại đọc được. */
	private static String maLoi(Map<String, Object> claims, String clientId) {
		try {
			GoogleClaimsRule.doc(claims, clientId);
			throw new AssertionError("đáng lẽ phải từ chối");
		} catch (ApiException e) {
			return e.getCode();
		}
	}

	private static String catchThrowable(Map<String, Object> claims) {
		try {
			GoogleClaimsRule.doc(claims, CUA_TA);
			throw new AssertionError("đáng lẽ phải từ chối");
		} catch (ApiException e) {
			return e.getCode() + "|" + e.getMessage();
		}
	}
}
