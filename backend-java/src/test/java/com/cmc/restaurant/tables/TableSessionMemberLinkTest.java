package com.cmc.restaurant.tables;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.auth.UserRole;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Ai được gắn vào phiên bàn qua {@code member_id} (§9.4).
 *
 * <p>Chạy trên PostgreSQL thật vì luật này nằm ở ranh giới HTTP + bảo mật + JPA: nó phụ thuộc vào
 * việc filter JWT có nạp principal cho một endpoint vốn ẩn danh hay không. Một test không có
 * Spring sẽ kiểm được đúng phần đã đúng sẵn và bỏ lọt đúng phần từng sai.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TableSessionMemberLinkTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private TableSessionRepository sessionRepository;

	@Autowired
	private UserRepository userRepository;

	// --- công cụ ------------------------------------------------------------------------------

	private record TaiKhoan(String userId, String token) {
	}

	private TaiKhoan taoTaiKhoan(String role) {
		String email = "probe." + java.util.UUID.randomUUID() + "@local.test";
		rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "Probe", "email", email, "password", "MatKhauProbe12345")), Map.class);

		if (!UserRole.CUSTOMER.equals(role)) {
			// Đổi vai TRƯỚC khi đăng nhập: role nằm trong token, nên đổi sau khi lấy token thì
			// token cũ vẫn mang vai cũ và phép kiểm sẽ đo nhầm thứ.
			UserEntity user = userRepository.findByEmailIgnoreCase(email).orElseThrow();
			user.setRole(role);
			userRepository.save(user);
		}

		@SuppressWarnings("unchecked")
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("email", email, "password", "MatKhauProbe12345")), Map.class).getBody();

		@SuppressWarnings("unchecked")
		Map<String, Object> user = (Map<String, Object>) body.get("user");
		return new TaiKhoan((String) user.get("userId"), (String) body.get("accessToken"));
	}

	private String moPhien(String qrToken, String tableCode, String bearer) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		if (bearer != null) {
			headers.setBearerAuth(bearer);
		}
		@SuppressWarnings("unchecked")
		Map<String, Object> body = rest.exchange("/api/table-sessions",
				org.springframework.http.HttpMethod.POST,
				new HttpEntity<>(Map.of("qrToken", qrToken, "tableCode", tableCode), headers),
				Map.class).getBody();
		return (String) body.get("sessionId");
	}

	private static HttpEntity<Map<String, String>> json(Map<String, String> body) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(body, headers);
	}

	private String memberIdCua(String sessionId) {
		return sessionRepository.findById(sessionId).orElseThrow().getMemberId();
	}

	// --- luật ---------------------------------------------------------------------------------

	@Test
	@DisplayName("Khách đã đăng nhập mở phiên thì phiên được gắn vào tài khoản")
	void customerGetsLinked() {
		TaiKhoan khach = taoTaiKhoan(UserRole.CUSTOMER);

		String sessionId = moPhien("cmc-table-t11-qr", "T11", khach.token());

		assertThat(memberIdCua(sessionId)).isEqualTo(khach.userId());
	}

	@Test
	@DisplayName("Khách vãng lai (không token) giữ nguyên phiên ẩn danh")
	void anonymousStaysAnonymous() {
		String sessionId = moPhien("cmc-table-t12-qr", "T12", null);

		assertThat(memberIdCua(sessionId)).isNull();
	}

	@Test
	@DisplayName("Token NHÂN VIÊN không được gắn làm chủ phiên")
	void staffIsNotAMember() {
		// Đây là ca chính. Nhân viên quét QR để kiểm bàn hoặc hỗ trợ khách là việc thường ngày;
		// trước bản sửa, backend đang chạy gán member_id đúng bằng id của nhân viên đó, và lịch
		// sử đơn + điểm thưởng của cả bàn sẽ chảy vào tài khoản nhân viên (#33, #35).
		TaiKhoan nhanVien = taoTaiKhoan(UserRole.STAFF);

		String sessionId = moPhien("cmc-table-t13-qr", "T13", nhanVien.token());

		assertThat(memberIdCua(sessionId)).isNull();
	}

	@Test
	@DisplayName("Token quản trị cũng không được gắn làm chủ phiên")
	void adminIsNotAMember() {
		TaiKhoan quanTri = taoTaiKhoan(UserRole.ADMIN);

		String sessionId = moPhien("cmc-table-t14-qr", "T14", quanTri.token());

		assertThat(memberIdCua(sessionId)).isNull();
	}

	@Test
	@DisplayName("Khách thứ hai vào cùng bàn KHÔNG cướp được liên kết của người thứ nhất")
	void secondCustomerDoesNotStealTheLink() {
		// Phiên bàn dùng chung cho mọi người ngồi cùng bàn. Nếu ghi đè thì người đăng nhập sau
		// chiếm mất liên kết của người trước — và người trước không hề biết.
		TaiKhoan mot = taoTaiKhoan(UserRole.CUSTOMER);
		TaiKhoan hai = taoTaiKhoan(UserRole.CUSTOMER);

		String sessionId = moPhien("cmc-table-t15-qr", "T15", mot.token());
		String sessionIdLan2 = moPhien("cmc-table-t15-qr", "T15", hai.token());

		assertThat(sessionIdLan2).isEqualTo(sessionId);
		assertThat(memberIdCua(sessionId)).isEqualTo(mot.userId());
	}

	@Test
	@DisplayName("Khách đăng nhập vào phiên ẩn danh đang mở thì gắn được")
	void customerCanClaimAnAnonymousSession() {
		// Luồng thật: khách quét QR trước (ẩn danh), đăng nhập sau. Không gắn được ở đây nghĩa là
		// tính năng chỉ chạy khi khách đăng nhập TRƯỚC lúc quét — điều không ai làm.
		String sessionId = moPhien("cmc-table-t16-qr", "T16", null);
		assertThat(memberIdCua(sessionId)).isNull();

		TaiKhoan khach = taoTaiKhoan(UserRole.CUSTOMER);
		String lan2 = moPhien("cmc-table-t16-qr", "T16", khach.token());

		assertThat(lan2).isEqualTo(sessionId);
		assertThat(memberIdCua(sessionId)).isEqualTo(khach.userId());
	}
}
