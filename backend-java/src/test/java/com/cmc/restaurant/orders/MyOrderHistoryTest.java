package com.cmc.restaurant.orders;

import com.cmc.restaurant.auth.XacMinhGia;
import org.springframework.context.annotation.Import;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
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
 * Lịch sử đơn theo tài khoản và "món hay gọi" (#33, #35).
 *
 * <p>Hai endpoint này chạy bằng SQL NATIVE nối sang bảng của module Tables. Câu SQL native không
 * được trình biên dịch kiểm, cũng không được ArchUnit kiểm — nên chỉ có một lời gọi thật mới biết
 * nó chạy được.
 *
 * <p>Đây không phải lo xa: bản đầu của {@code findTopItemsForMember} bị mất dấu nháy quanh
 * {@code 'Cancelled'} lúc sinh mã, và Postgres đọc nó thành TÊN CỘT:
 *
 * <pre>
 * ERROR: column "cancelled" does not exist   → HTTP 500
 * </pre>
 *
 * <p>Biên dịch sạch, Checkstyle sạch, cổng {@code @PreAuthorize} sạch. Chỉ gọi thật mới lộ ra.
 */
@Testcontainers
@Import(XacMinhGia.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyOrderHistoryTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	private record Khach(String token) {
	}

	/** Số điện thoại ngẫu nhiên. Với bản giả, token xác minh CHÍNH LÀ số này. */
	private static String soNgauNhienChoTaiKhoan() {
		return "09" + String.format("%08d", (int) (Math.random() * 100000000));
	}

	private Khach taoKhach() {
		String soDangNhap = soNgauNhienChoTaiKhoan();
		rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "K", "phoneIdToken", soDangNhap, "password", "MatKhauProbe12345")), Map.class);
		@SuppressWarnings("unchecked")
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("identifier", soDangNhap, "password", "MatKhauProbe12345")), Map.class).getBody();
		return new Khach((String) body.get("accessToken"));
	}

	private static HttpEntity<Map<String, String>> json(Map<String, String> body) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(body, headers);
	}

	/** Mở phiên bàn KÈM token khách rồi đặt một đơn — đúng luồng app di động. */
	@SuppressWarnings("unchecked")
	private void datDon(Khach khach, String tableCode, List<Map<String, Object>> items) {
		String qrToken = "cmc-table-" + tableCode.toLowerCase(java.util.Locale.ROOT) + "-qr";

		HttpHeaders mo = new HttpHeaders();
		mo.setContentType(MediaType.APPLICATION_JSON);
		mo.setBearerAuth(khach.token());
		Map<String, Object> phien = rest.exchange("/api/table-sessions", HttpMethod.POST,
				new HttpEntity<>(Map.of("qrToken", qrToken, "tableCode", tableCode), mo), Map.class)
				.getBody();

		HttpHeaders dat = new HttpHeaders();
		dat.setContentType(MediaType.APPLICATION_JSON);
		dat.set("X-Table-Session-Token", (String) phien.get("tableSessionToken"));
		dat.set("Idempotency-Key", "it." + UUID.randomUUID());
		rest.exchange("/api/orders", HttpMethod.POST, new HttpEntity<>(Map.of(
				"orderType", "DineIn",
				"tableSessionId", phien.get("sessionId"),
				"tableCode", tableCode,
				"qrToken", qrToken,
				"items", items), dat), Map.class);
	}

	private static Map<String, Object> mon(String id, int sl) {
		return Map.of("menuItemId", id, "quantity", sl);
	}

	private ResponseEntity<Map> goi(String duongDan, String token) {
		HttpHeaders headers = new HttpHeaders();
		if (token != null) {
			headers.setBearerAuth(token);
		}
		return rest.exchange(duongDan, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
	}

	@Test
	@DisplayName("Lịch sử gom đơn từ NHIỀU BÀN của cùng một tài khoản")
	void historySpansVisits() {
		Khach khach = taoKhach();
		datDon(khach, "T21", List.of(mon("m_004", 1)));
		datDon(khach, "T22", List.of(mon("m_010", 2)));

		ResponseEntity<Map> res = goi("/api/orders/mine", khach.token());

		assertThat(res.getStatusCode().value()).isEqualTo(200);
		assertThat((List<?>) res.getBody().get("orders")).hasSize(2);
	}

	@Test
	@DisplayName("Khách khác không thấy đơn của mình")
	void historyIsPerAccount() {
		Khach mot = taoKhach();
		datDon(mot, "T23", List.of(mon("m_004", 1)));

		ResponseEntity<Map> res = goi("/api/orders/mine", taoKhach().token());

		assertThat((List<?>) res.getBody().get("orders")).isEmpty();
	}

	@Test
	@DisplayName("Tham số ?memberId= KHÔNG đổi được kết quả")
	void memberIdParameterIsIgnored() {
		// Luật KHÔNG được vi phạm, giống ca ?phone= ở MyLoyaltyLinkTest. Thêm @RequestParam
		// memberId "cho tiện" biến đây thành đường đọc lịch sử ăn uống của người khác.
		Khach mot = taoKhach();
		datDon(mot, "T24", List.of(mon("m_004", 1)));

		ResponseEntity<Map> res =
				goi("/api/orders/mine?memberId=bat-ky-ai", taoKhach().token());

		assertThat((List<?>) res.getBody().get("orders")).isEmpty();
	}

	@Test
	@DisplayName("Chưa đăng nhập thì không đọc được lịch sử")
	void anonymousCannotRead() {
		assertThat(goi("/api/orders/mine", null).getStatusCode().value()).isEqualTo(401);
	}

	@Test
	@DisplayName("Món hay gọi: SỐ LẦN gọi quyết định thứ tự, không phải tổng số phần")
	void favouritesRankByTimesNotQuantity() {
		// Một người gọi phở ba lần, mỗi lần một bát, "hay gọi" phở hơn người từng gọi tám phần
		// chè trong đúng một bữa liên hoan. Sắp theo tổng số lượng sẽ cho ra danh sách của bữa
		// tiệc đó, không phải thói quen của khách.
		Khach khach = taoKhach();
		datDon(khach, "T25", List.of(mon("m_004", 1)));
		datDon(khach, "T26", List.of(mon("m_004", 1)));
		datDon(khach, "T27", List.of(mon("m_004", 1), mon("m_020", 8)));

		ResponseEntity<Map> res = goi("/api/orders/mine/favourites", khach.token());

		assertThat(res.getStatusCode().value()).isEqualTo(200);
		@SuppressWarnings("unchecked")
		List<Map<String, Object>> items = (List<Map<String, Object>>) res.getBody().get("items");
		assertThat(items).isNotEmpty();
		assertThat(items.get(0)).containsEntry("menuItemId", "m_004");
		assertThat(((Number) items.get(0).get("timesOrdered")).intValue()).isEqualTo(3);
		assertThat(((Number) items.get(0).get("totalQuantity")).intValue()).isEqualTo(3);
	}

	@Test
	@DisplayName("Câu SQL native của món hay gọi CHẠY ĐƯỢC — chỉ lời gọi thật mới biết")
	void favouritesQueryActuallyRuns() {
		// Bản đầu mất dấu nháy quanh 'Cancelled' và Postgres đọc nó thành tên cột:
		//   ERROR: column "cancelled" does not exist  → HTTP 500
		// Biên dịch sạch, Checkstyle sạch, cổng @PreAuthorize sạch.
		assertThat(goi("/api/orders/mine/favourites", taoKhach().token()).getStatusCode().value())
				.isEqualTo(200);
	}

	@Test
	@DisplayName("Chưa có lịch sử thì món hay gọi rỗng, không lỗi")
	void favouritesEmptyForNewAccount() {
		ResponseEntity<Map> res = goi("/api/orders/mine/favourites", taoKhach().token());

		assertThat((List<?>) res.getBody().get("items")).isEmpty();
	}
}
