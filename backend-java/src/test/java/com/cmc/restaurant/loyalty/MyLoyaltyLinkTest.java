package com.cmc.restaurant.loyalty;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.auth.UserRole;
import com.cmc.restaurant.loyalty.domain.LoyaltyMember;
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
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Ai đọc được điểm của ai (#27, §9.10 M1 mục 3).
 *
 * <p>Luật đắt giá nhất ở đây là luật KHÔNG được vi phạm: {@code /api/loyalty/me} không nhận số
 * điện thoại từ request ở bất cứ đâu. Nếu một ngày ai đó thêm tham số {@code ?phone=} cho tiện,
 * toàn bộ lý do tồn tại của lớp này biến mất mà mọi phép kiểm khác vẫn xanh.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyLoyaltyLinkTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private UserRepository users;

	@Autowired
	private LoyaltyService loyaltyService;

	private record TaiKhoan(String userId, String token) {
	}

	private TaiKhoan taoKhach() {
		String email = "loy." + UUID.randomUUID() + "@local.test";
		rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "Khach", "email", email, "password", "MatKhauProbe12345")), Map.class);
		return dangNhap(email);
	}

	@SuppressWarnings("unchecked")
	private TaiKhoan dangNhap(String email) {
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("email", email, "password", "MatKhauProbe12345")), Map.class).getBody();
		Map<String, Object> user = (Map<String, Object>) body.get("user");
		return new TaiKhoan((String) user.get("userId"), (String) body.get("accessToken"));
	}

	private TaiKhoan taoNhanVien() {
		TaiKhoan tk = taoKhach();
		UserEntity u = users.findById(tk.userId()).orElseThrow();
		u.setRole(UserRole.STAFF);
		users.save(u);
		return dangNhap(u.getEmail());
	}

	private static HttpEntity<Map<String, String>> json(Map<String, String> body) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(body, headers);
	}

	private ResponseEntity<Map> noiSo(String token, String phone) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		headers.setBearerAuth(token);
		return rest.exchange("/api/loyalty/me/phone", HttpMethod.POST,
				new HttpEntity<>(Map.of("phone", phone), headers), Map.class);
	}

	private ResponseEntity<Map> doDiem(String token) {
		HttpHeaders headers = new HttpHeaders();
		headers.setBearerAuth(token);
		return rest.exchange("/api/loyalty/me", HttpMethod.GET, new HttpEntity<>(headers), Map.class);
	}

	/**
	 * Tạo hồ sơ tích điểm qua ĐÚNG đường sản xuất: cộng điểm cho một hoá đơn đã thanh toán.
	 *
	 * <p>Dựng thẳng entity rồi save sẽ nhanh hơn nhưng kiểm một trạng thái mà hệ thống thật có thể
	 * không bao giờ tạo ra. Ở đây điều đó quan trọng vì cả tính năng xoay quanh câu hỏi "số này đã
	 * có hồ sơ chưa", và hồ sơ chỉ sinh ra từ việc khách tiêu tiền.
	 */
	private void taoHoSoDiem(String phone, int points) {
		loyaltyService.accrue(
				phone,
				BigDecimal.valueOf(points).multiply(LoyaltyMember.VND_PER_POINT),
				OffsetDateTime.now());
	}

	private static String soNgauNhien() {
		return "09" + String.format("%08d", (int) (Math.random() * 100000000));
	}

	@Test
	@DisplayName("Tài khoản mới: chưa liên kết, 0 điểm, KHÔNG phải lỗi")
	void newAccountIsUnlinked() {
		ResponseEntity<Map> res = doDiem(taoKhach().token());

		assertThat(res.getStatusCode().value()).isEqualTo(200);
		assertThat(res.getBody()).containsEntry("linked", false).containsEntry("points", 0);
		assertThat(res.getBody().get("phoneNumber")).isNull();
	}

	@Test
	@DisplayName("Nối được số CHƯA có hồ sơ tích điểm")
	void canLinkAPhoneWithNoProfile() {
		String phone = soNgauNhien();

		ResponseEntity<Map> res = noiSo(taoKhach().token(), phone);

		assertThat(res.getStatusCode().value()).isEqualTo(200);
		assertThat(res.getBody()).containsEntry("linked", true).containsEntry("phoneNumber", phone);
	}

	@Test
	@SuppressWarnings("unchecked")
	@DisplayName("KHÔNG nối được số ĐÃ có hồ sơ — luật giữ cho tính năng không lộ điểm")
	void cannotLinkAPhoneThatAlreadyHasPoints() {
		String phone = soNgauNhien();
		taoHoSoDiem(phone, 500);

		ResponseEntity<Map> res = noiSo(taoKhach().token(), phone);

		assertThat(res.getStatusCode().value()).isEqualTo(409);
		assertThat((Map<String, Object>) res.getBody().get("error"))
				.containsEntry("code", "LOYALTY_PHONE_ALREADY_MEMBER");
	}

	@Test
	@DisplayName("Bị từ chối thì KHÔNG lộ số điểm ra thân phản hồi")
	void refusalLeaksNoPoints() {
		String phone = soNgauNhien();
		taoHoSoDiem(phone, 777);

		ResponseEntity<Map> res = noiSo(taoKhach().token(), phone);

		assertThat(res.getBody().toString()).doesNotContain("777");
	}

	@Test
	@SuppressWarnings("unchecked")
	@DisplayName("Hai tài khoản không cùng giữ một số")
	void twoAccountsCannotShareAPhone() {
		String phone = soNgauNhien();
		assertThat(noiSo(taoKhach().token(), phone).getStatusCode().value()).isEqualTo(200);

		ResponseEntity<Map> res = noiSo(taoKhach().token(), phone);

		assertThat(res.getStatusCode().value()).isEqualTo(409);
		assertThat((Map<String, Object>) res.getBody().get("error")).containsEntry("code", "LOYALTY_PHONE_TAKEN");
	}

	@Test
	@DisplayName("Nối lại CÙNG số của chính mình không phải lỗi")
	void relinkingTheSamePhoneIsIdempotent() {
		String phone = soNgauNhien();
		TaiKhoan khach = taoKhach();
		noiSo(khach.token(), phone);

		assertThat(noiSo(khach.token(), phone).getStatusCode().value()).isEqualTo(200);
	}

	@Test
	@DisplayName("Số gõ khác định dạng vẫn về cùng một hồ sơ")
	void phoneIsNormalisedBeforeMatching() {
		String phone = soNgauNhien();
		taoHoSoDiem(phone, 100);

		String goKieuKhac = phone.substring(0, 4) + " " + phone.substring(4, 7) + "-" + phone.substring(7);

		assertThat(noiSo(taoKhach().token(), goKieuKhac).getStatusCode().value()).isEqualTo(409);
	}

	@Test
	@DisplayName("Điểm hiện ra sau khi hồ sơ được tạo dưới số đã nối")
	void pointsAppearOnceTheProfileExists() {
		String phone = soNgauNhien();
		TaiKhoan khach = taoKhach();
		noiSo(khach.token(), phone);

		taoHoSoDiem(phone, 250);

		assertThat(doDiem(khach.token()).getBody())
				.containsEntry("linked", true).containsEntry("points", 250);
	}

	@Test
	@DisplayName("Vai NHÂN VIÊN không dùng được /api/loyalty/me")
	void staffCannotUseTheCustomerRoute() {
		assertThat(doDiem(taoNhanVien().token()).getStatusCode().value()).isEqualTo(403);
	}

	@Test
	@DisplayName("Chưa đăng nhập thì không đọc được điểm của ai")
	void anonymousCannotRead() {
		assertThat(rest.getForEntity("/api/loyalty/me", Map.class).getStatusCode().value())
				.isEqualTo(401);
	}

	@Test
	@DisplayName("Tham số ?phone= KHÔNG đổi được kết quả")
	void phoneParameterIsIgnored() {
		String cuaNguoiKhac = soNgauNhien();
		taoHoSoDiem(cuaNguoiKhac, 999);
		TaiKhoan khach = taoKhach();

		HttpHeaders headers = new HttpHeaders();
		headers.setBearerAuth(khach.token());
		ResponseEntity<Map> res = rest.exchange("/api/loyalty/me?phone=" + cuaNguoiKhac,
				HttpMethod.GET, new HttpEntity<>(headers), Map.class);

		assertThat(res.getBody()).containsEntry("linked", false).containsEntry("points", 0);
		assertThat(res.getBody().toString()).doesNotContain("999");
	}

	/** Mã lỗi nằm trong {@code error.code}, không phải ở gốc thân trả về. */
	@SuppressWarnings("unchecked")
	private static String maLoi(ResponseEntity<Map> res) {
		return (String) ((Map<String, Object>) res.getBody().get("error")).get("code");
	}

	/** Khách xin mã để đọc ở quầy. */
	private ResponseEntity<Map> xinMa(String token) {
		HttpHeaders headers = new HttpHeaders();
		headers.setBearerAuth(token);
		return rest.exchange("/api/loyalty/me/link-code", HttpMethod.POST,
				new HttpEntity<>(headers), Map.class);
	}

	/** Quầy nối số vào tài khoản khách bằng mã khách đọc. */
	private ResponseEntity<Map> noiTaiQuay(String token, String ma, String phone) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		headers.setBearerAuth(token);
		return rest.exchange("/api/loyalty/link", HttpMethod.POST,
				new HttpEntity<>(Map.of("code", ma, "phone", phone), headers), Map.class);
	}

	@Test
	@DisplayName("Quầy nối được số ĐÃ có hồ sơ — đường vòng duy nhất cho khách quen cũ")
	void counterCanLinkAPhoneThatAlreadyHasPoints() {
		// Chính là ca mà khách TỰ nối bị chặn ở trên. Nếu ca này hỏng, khách quen cũ vĩnh viễn
		// không lấy lại được điểm của mình, và không có phép kiểm nào khác nói ra điều đó.
		String phone = soNgauNhien();
		taoHoSoDiem(phone, 2500);
		TaiKhoan khach = taoKhach();
		String ma = (String) xinMa(khach.token()).getBody().get("code");

		ResponseEntity<Map> res = noiTaiQuay(taoNhanVien().token(), ma, phone);

		assertThat(res.getStatusCode().value()).isEqualTo(200);
		assertThat(res.getBody()).containsEntry("linked", true).containsEntry("phoneNumber", phone);
		// Điểm cũ phải về ĐÚNG tài khoản vừa nối, không phải một hồ sơ trống mang cùng số.
		assertThat(doDiem(khach.token()).getBody()).containsEntry("points", 2500);
	}

	@Test
	@DisplayName("Mã chỉ dùng được MỘT lần")
	void theCodeDiesAfterOneUse() {
		// Mã đọc to giữa quầy thì người đứng cạnh cũng nghe được. Dùng lại được nghĩa là họ nối
		// số của mình vào tài khoản người khác.
		TaiKhoan khach = taoKhach();
		String ma = (String) xinMa(khach.token()).getBody().get("code");
		String nhanVien = taoNhanVien().token();
		noiTaiQuay(nhanVien, ma, soNgauNhien());

		ResponseEntity<Map> lanHai = noiTaiQuay(nhanVien, ma, soNgauNhien());

		assertThat(lanHai.getStatusCode().value()).isEqualTo(409);
		assertThat(maLoi(lanHai)).isEqualTo("LOYALTY_LINK_CODE_EXPIRED");
	}

	@Test
	@DisplayName("Xin mã mới thì mã CŨ chết theo")
	void askingForANewCodeKillsTheOldOne() {
		// Khách bấm lại vì tưởng mã cũ hỏng. Nếu mã cũ vẫn sống, khách không có cách nào thu hồi
		// một mã đã lỡ đọc cho nhầm người.
		TaiKhoan khach = taoKhach();
		String maCu = (String) xinMa(khach.token()).getBody().get("code");
		xinMa(khach.token());

		ResponseEntity<Map> res = noiTaiQuay(taoNhanVien().token(), maCu, soNgauNhien());

		assertThat(res.getStatusCode().value()).isNotEqualTo(200);
	}

	@Test
	@DisplayName("Mã bịa ra thì không nối được")
	void madeUpCodesAreRejected() {
		ResponseEntity<Map> res = noiTaiQuay(taoNhanVien().token(), "000000", soNgauNhien());

		assertThat(res.getStatusCode().value()).isEqualTo(400);
		assertThat(maLoi(res)).isEqualTo("LOYALTY_LINK_CODE_INVALID");
	}

	@Test
	@DisplayName("Khách KHÔNG tự gọi được cổng của quầy")
	void customersCannotCallTheCounterEndpoint() {
		// Nếu chỗ này mở, khách tự xin mã rồi tự nối — và luật chặn ở trên thành vô nghĩa.
		TaiKhoan khach = taoKhach();
		String ma = (String) xinMa(khach.token()).getBody().get("code");
		String cuaNguoiKhac = soNgauNhien();
		taoHoSoDiem(cuaNguoiKhac, 999);

		ResponseEntity<Map> res = noiTaiQuay(khach.token(), ma, cuaNguoiKhac);

		assertThat(res.getStatusCode().value()).isEqualTo(403);
		assertThat(doDiem(khach.token()).getBody()).containsEntry("points", 0);
	}

	@Test
	@DisplayName("Số đang thuộc tài khoản KHÁC thì quầy cũng không nối được")
	void theCounterStillCannotStealAPhoneFromAnotherAccount() {
		// Mã chứng minh khách sở hữu TÀI KHOẢN, nó không chứng minh gì về số. Luật "một số một
		// tài khoản" phải sống sót qua cả đường quầy.
		String phone = soNgauNhien();
		noiSo(taoKhach().token(), phone);
		String ma = (String) xinMa(taoKhach().token()).getBody().get("code");

		ResponseEntity<Map> res = noiTaiQuay(taoNhanVien().token(), ma, phone);

		assertThat(res.getStatusCode().value()).isEqualTo(409);
		assertThat(maLoi(res)).isEqualTo("LOYALTY_PHONE_TAKEN");
	}
}
