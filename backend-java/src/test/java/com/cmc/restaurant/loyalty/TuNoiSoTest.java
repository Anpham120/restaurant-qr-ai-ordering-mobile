package com.cmc.restaurant.loyalty;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.auth.XacMinhGia;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Khách TỰ nối số của mình vào tài khoản, xác minh bằng OTP.
 *
 * <p><b>Nghiệp vụ được canh ở đây.</b> Khách ăn tại quán quét QR dùng web, không đăng nhập, và
 * điểm tích theo SỐ ĐIỆN THOẠI vì màn thanh toán bắt điền số. Sau đó họ tải app và tạo tài khoản.
 * Số của họ ĐÃ có hồ sơ điểm — đó là ca phổ biến nhất, không phải ca hiếm.
 *
 * <p>Bản trước từ chối đúng ca đó ({@code LOYALTY_PHONE_ALREADY_MEMBER}) và bảo khách ra quầy nhờ
 * nhân viên nối hộ. Lý do của cái từ chối là chính đáng: đường tự nối nhận SỐ TRẦN, nên cho nối một
 * số đã có điểm là cho người lạ gõ số của khách quen rồi lấy điểm.
 *
 * <p>Có OTP thì hết phải chọn giữa hai cái dở. Token chứng minh khách sở hữu SỐ — đúng thứ cần
 * chứng minh — nên nối được ngay, và CHẶT HƠN đường nối tại quầy vừa gỡ: mã sáu số ở quầy chỉ
 * chứng minh khách sở hữu TÀI KHOẢN, không nói gì về số.
 */
@Testcontainers
@Import(XacMinhGia.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TuNoiSoTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private LoyaltyMemberRepository members;

	private static String soNgauNhien() {
		return "09" + String.format("%08d", (int) (Math.random() * 100000000));
	}

	private static HttpEntity<Map<String, String>> json(Map<String, String> body) {
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(body, h);
	}

	/** Hồ sơ điểm CHỈ theo số — chưa có tài khoản nào, đúng như khách web để lại. */
	private void hoSoDiemChiCoSo(String phone, int soDiem) {
		LoyaltyMemberEntity m = new LoyaltyMemberEntity(
				"loy_" + UUID.randomUUID().toString().replace("-", ""), phone, OffsetDateTime.now());
		m.applyFrom(new com.cmc.restaurant.loyalty.domain.LoyaltyMember(
				m.getId(), phone, null, soDiem, BigDecimal.ZERO, OffsetDateTime.now()));
		members.save(m);
	}

	/** Tài khoản mở bằng Google — KHÔNG có số điện thoại, đúng ca cần nối. */
	@SuppressWarnings("unchecked")
	private String tokenKhachKhongCoSo() {
		Map<String, Object> body = rest.postForEntity("/api/auth/google",
				json(Map.of("idToken",
						"sub-" + UUID.randomUUID() + "|" + UUID.randomUUID() + "@gmail.com|Khach moi")),
				Map.class).getBody();
		return (String) body.get("accessToken");
	}

	@SuppressWarnings("unchecked")
	/**
	 * Token OTP dạng MỜ ĐỤC: không đọc ra số nếu không qua bộ xác minh.
	 *
	 * <p>Đây là chỗ giữ cả bộ ca kiểm này. Dùng số trần làm token thì gỡ hẳn lời gọi bộ xác minh
	 * khỏi controller mà mọi ca vẫn xanh — đã đo thật.
	 */
	private ResponseEntity<Map> noiSo(String token, String phoneIdToken) {
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		h.setBearerAuth(token);
		return rest.exchange("/api/loyalty/me/phone", HttpMethod.POST,
				new HttpEntity<>(Map.of("phoneIdToken", phoneIdToken), h), Map.class);
	}

	@Test
	@DisplayName("số ĐÃ CÓ hồ sơ điểm nối được — đây là ca phổ biến nhất, trước bị chặn")
	@SuppressWarnings("unchecked")
	void soDaCoDiemVanNoiDuoc() {
		String phone = soNgauNhien();
		hoSoDiemChiCoSo(phone, 250);

		ResponseEntity<Map> kq = noiSo(tokenKhachKhongCoSo(), XacMinhGia.phatToken(phone));

		assertThat(kq.getStatusCode().value()).isEqualTo(200);
		// Và điểm về đúng chủ ngay: hồ sơ khoá theo số, nên gán số vào tài khoản là xong.
		assertThat(kq.getBody()).containsEntry("points", 250);
	}

	@Test
	@DisplayName("số CHƯA có hồ sơ vẫn nối được, không hồi quy")
	@SuppressWarnings("unchecked")
	void soMoiVanNoiDuoc() {
		ResponseEntity<Map> kq = noiSo(tokenKhachKhongCoSo(), XacMinhGia.phatToken(soNgauNhien()));

		assertThat(kq.getStatusCode().value()).isEqualTo(200);
		assertThat(kq.getBody()).containsEntry("points", 0);
	}

	@Test
	@DisplayName("KHÔNG có token OTP thì không nối được — cửa duy nhất chặn chiếm điểm")
	@SuppressWarnings("unchecked")
	void thieuTokenThiTuChoi() {
		// Đây là ca giữ cả thiết kế. Bỏ hàng rào này thì bất kỳ ai gõ số của khách quen cũng kéo
		// được hồ sơ điểm của họ về tài khoản mình — chính là lý do bản trước phải chặn số đã có
		// hồ sơ, và cũng là lý do đường nối tại quầy từng tồn tại.
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		h.setBearerAuth(tokenKhachKhongCoSo());
		ResponseEntity<Map> kq = rest.exchange("/api/loyalty/me/phone", HttpMethod.POST,
				new HttpEntity<>(Map.of(), h), Map.class);

		assertThat(kq.getStatusCode().value()).isEqualTo(400);
		assertThat(kq.getBody()).extracting("error").hasFieldOrPropertyWithValue("code", "PHONE_TOKEN_REQUIRED");
	}

	@Test
	@DisplayName("token HỎNG không nối được gì — kiểm bằng TRẠNG THÁI, không bằng mã lỗi")
	@SuppressWarnings("unchecked")
	void tokenHongThiKhongNoiDuocGi() {
		// Bản giả coi token thô là số điện thoại, nên một chuỗi không phải số là token không dùng
		// được. Ca này canh việc controller thật sự GỌI bộ xác minh chứ không chỉ đọc thân request.
		//
		// KHÔNG khẳng định được mã 401 ở đây: `TestRestTemplate` chạy trên `HttpURLConnection`, và
		// nó ném `HttpRetryException` ngay phía client khi gặp 401 trên một request đã gửi thân —
		// giới hạn của bộ gọi, không phải hành vi của máy chủ. Nên ca này kiểm thứ thật sự quan
		// trọng và quan sát được: sau lời gọi hỏng, tài khoản vẫn CHƯA nối số nào.
		String token = tokenKhachKhongCoSo();
		try {
			noiSo(token, "tkkhongphaitokenaophat");
		} catch (RuntimeException bỏQua) {
			// Lỗi phía client, xem bên trên.
		}

		HttpHeaders h = new HttpHeaders();
		h.setBearerAuth(token);
		ResponseEntity<Map> me = rest.exchange("/api/loyalty/me", HttpMethod.GET,
				new HttpEntity<>(h), Map.class);
		assertThat(me.getStatusCode().value()).isEqualTo(200);
		assertThat(me.getBody()).containsEntry("linked", false);
		assertThat(me.getBody()).containsEntry("phoneNumber", null);
	}

	@Test
	@DisplayName("đường nối tại quầy đã GỠ — gọi tới phải 404, không phải im lặng cho qua")
	@SuppressWarnings("unchecked")
	void duongNoiTaiQuayDaGo() {
		// Nghiệp vụ đổi: khách tự tải app, tự tạo tài khoản, tự nối số. Không còn ai đứng quầy nối
		// hộ, nên đường cũ phải biến mất thật chứ không nằm đó chờ người gọi nhầm.
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		h.setBearerAuth(tokenKhachKhongCoSo());

		assertThat(rest.exchange("/api/loyalty/me/link-code", HttpMethod.POST,
				new HttpEntity<>(Map.of(), h), Map.class).getStatusCode().value()).isEqualTo(404);
		assertThat(rest.exchange("/api/loyalty/link", HttpMethod.POST,
				new HttpEntity<>(Map.of("code", "123456", "phone", soNgauNhien()), h), Map.class)
				.getStatusCode().value()).isEqualTo(404);
	}
}
