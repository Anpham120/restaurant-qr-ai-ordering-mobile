package com.cmc.restaurant.orders;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.auth.UserRole;
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
 * Bảng Bếp đọc được danh sách đơn.
 *
 * <h2>Lỗi mà test này sinh ra để chặn</h2>
 *
 * <p>{@code listOrders} là hàm danh sách DUY NHẤT trong {@code OrderService} không có
 * {@code @Transactional}. Dự án đặt {@code open-in-view: false}, nên ngoài giao dịch thì bộ sưu tập
 * {@code items} tải lười không đọc được lúc dựng phản hồi:
 *
 * <pre>
 * LazyInitializationException: could not initialize proxy - no Session   → HTTP 500
 * </pre>
 *
 * <p>Điều khiến nó sống sót lâu đến vậy là hình dạng của nó: <b>không có đơn nào thì endpoint trả
 * 200</b>, vì không có gì để ánh xạ nên không có gì tải lười. Nó chỉ hỏng từ đơn đầu tiên trở đi —
 * tức xanh trên máy trống và đỏ trên quán đang bán.
 *
 * <p>Nên ca "có đơn" ở dưới là ca duy nhất có ích, và ca "chưa có đơn" được giữ lại để người đọc
 * sau hiểu vì sao một endpoint hỏng lại trông như đang chạy.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class KitchenBoardListTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private UserRepository users;

	private record TaiKhoan(String userId, String token) {
	}

	@SuppressWarnings("unchecked")
	private TaiKhoan taoKhach() {
		String email = "bep." + UUID.randomUUID() + "@local.test";
		Map<String, Object> dangKy = rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "K", "email", email, "password", "MatKhauProbe12345")), Map.class).getBody();
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("email", email, "password", "MatKhauProbe12345")), Map.class).getBody();
		return new TaiKhoan((String) dangKy.get("userId"), (String) body.get("accessToken"));
	}

	private TaiKhoan taoNhanVienBep() {
		TaiKhoan tk = taoKhach();
		UserEntity u = users.findById(tk.userId()).orElseThrow();
		u.setRole(UserRole.KITCHEN);
		users.save(u);
		@SuppressWarnings("unchecked")
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("email", u.getEmail(), "password", "MatKhauProbe12345")), Map.class).getBody();
		return new TaiKhoan(tk.userId(), (String) body.get("accessToken"));
	}

	private static HttpEntity<Map<String, String>> json(Map<String, String> body) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(body, headers);
	}

	@SuppressWarnings("unchecked")
	private void datDon(String tableCode, List<Map<String, Object>> items) {
		String qrToken = "cmc-table-" + tableCode.toLowerCase(java.util.Locale.ROOT) + "-qr";
		HttpHeaders mo = new HttpHeaders();
		mo.setContentType(MediaType.APPLICATION_JSON);
		Map<String, Object> phien = rest.exchange("/api/table-sessions", HttpMethod.POST,
				new HttpEntity<>(Map.of("qrToken", qrToken, "tableCode", tableCode), mo), Map.class)
				.getBody();
		// Chốt fixture. Lần chạy đầu dùng bàn T31/T32 — seed chỉ có tới T30 — nên phiên không mở
		// được và test đỏ vì NullPointerException ở dòng dưới. Nó VẪN đỏ, đúng hai ca dự định, nên
		// nhìn qua thì tưởng đã bắt được lỗi 500. Một test đỏ sai lý do còn nguy hơn test xanh sai,
		// vì nó tạo cảm giác đã có cổng chặn.
		assertThat(phien)
				.as("không mở được phiên bàn %s — kiểm lại bàn này có trong seed không", tableCode)
				.isNotNull();

		HttpHeaders dat = new HttpHeaders();
		dat.setContentType(MediaType.APPLICATION_JSON);
		dat.set("X-Table-Session-Token", (String) phien.get("tableSessionToken"));
		dat.set("Idempotency-Key", "kb." + UUID.randomUUID());
		rest.exchange("/api/orders", HttpMethod.POST, new HttpEntity<>(Map.of(
				"orderType", "DineIn",
				"tableSessionId", phien.get("sessionId"),
				"tableCode", tableCode,
				"qrToken", qrToken,
				"items", items), dat), Map.class);
	}

	private ResponseEntity<Map> goi(String duongDan, String token) {
		HttpHeaders headers = new HttpHeaders();
		headers.setBearerAuth(token);
		return rest.exchange(duongDan, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
	}

	@Test
	@DisplayName("Bảng Bếp đọc được đơn KÈM danh sách món")
	void boardLoadsOrdersWithItems() {
		TaiKhoan bep = taoNhanVienBep();
		datDon("T25", List.of(Map.of("menuItemId", "m_004", "quantity", 1),
				Map.of("menuItemId", "m_010", "quantity", 2)));

		ResponseEntity<Map> res = goi("/api/orders", bep.token());

		assertThat(res.getStatusCode().value()).isEqualTo(200);
		List<Map<String, Object>> orders = (List<Map<String, Object>>) res.getBody().get("orders");
		assertThat(orders).isNotEmpty();
		// Đọc HẲN vào items chứ không chỉ xem mã 200: chính bộ sưu tập này là thứ tải lười và là
		// thứ đã ném LazyInitializationException.
		assertThat((List<?>) orders.get(0).get("items")).isNotEmpty();
	}

	@Test
	@DisplayName("Lọc theo trạng thái cũng phải đọc được món")
	void boardLoadsFilteredOrders() {
		TaiKhoan bep = taoNhanVienBep();
		datDon("T26", List.of(Map.of("menuItemId", "m_004", "quantity", 1)));

		ResponseEntity<Map> res = goi("/api/orders?status=Placed", bep.token());

		assertThat(res.getStatusCode().value()).isEqualTo(200);
		List<Map<String, Object>> orders = (List<Map<String, Object>>) res.getBody().get("orders");
		assertThat(orders).isNotEmpty();
		assertThat((List<?>) orders.get(0).get("items")).isNotEmpty();
	}

	@Test
	@DisplayName("Bộ lọc không khớp đơn nào vẫn trả 200 — ca đã che lỗi suốt thời gian dài")
	void emptyResultLooksHealthy() {
		TaiKhoan bep = taoNhanVienBep();

		// Ca này XANH kể cả khi endpoint hỏng. Giữ lại có chủ đích, để lần sau ai sửa vùng này thì
		// biết rằng một mã 200 ở đây không chứng minh được gì nếu danh sách rỗng.
		ResponseEntity<Map> res = goi("/api/orders?tableCode=T30", bep.token());

		assertThat(res.getStatusCode().value()).isEqualTo(200);
	}
}
