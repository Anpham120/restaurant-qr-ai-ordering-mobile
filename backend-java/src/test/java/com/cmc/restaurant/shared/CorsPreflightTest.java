package com.cmc.restaurant.shared;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Preflight CORS cho đường CẦN ĐĂNG NHẬP.
 *
 * <p><b>LỖI CÓ THẬT, người dùng phát hiện qua giao diện chứ không phải bộ kiểm.</b> Đăng nhập trả
 * 200 và token hợp lệ, nhưng trang quản trị trắng trơn — vì mọi lời gọi tiếp theo mang header
 * {@code Authorization} đều bị trình duyệt chặn. Đo trên máy chủ thật:
 *
 * <pre>
 *   OPTIONS /api/auth/login   (permitAll)     -> 200, có Access-Control-Allow-Origin
 *   OPTIONS /api/users        (cần đăng nhập) -> 401, KHÔNG có header CORS nào
 * </pre>
 *
 * <p>Nguyên nhân: {@code SecurityConfig} không gọi {@code .cors(...)}, nên bộ lọc CORS của Spring
 * Security không có trong chuỗi. Khai CORS ở tầng MVC là chưa đủ — tầng đó chạy SAU lớp phân
 * quyền, và preflight đã chết ở {@code anyRequest().authenticated()} trước khi tới nơi.
 *
 * <p><b>Vì sao không phép kiểm nào bắt được:</b> tất cả đều gọi bằng {@code curl} hoặc
 * {@code TestRestTemplate}, và cả hai đều KHÔNG gửi preflight — chúng bắn thẳng request kèm token
 * nên luôn nhận 200. Preflight là hành vi riêng của trình duyệt. Ca kiểm này dựng lại đúng ba
 * header mà trình duyệt gửi, nên nó đi qua chính con đường đã hỏng.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "cors.allowed-origins=https://admin.cmcrestaurant.app")
class CorsPreflightTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@LocalServerPort
	private int port;

	private static final String ORIGIN = "https://admin.cmcrestaurant.app";

	private HttpResponse<String> preflight(String duongDan, String phuongThuc, String header)
			throws Exception {
		HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + duongDan))
				.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
				.header("Origin", ORIGIN)
				.header("Access-Control-Request-Method", phuongThuc)
				.timeout(Duration.ofSeconds(20));
		if (header != null) {
			b.header("Access-Control-Request-Headers", header);
		}
		return HttpClient.newHttpClient().send(b.build(), HttpResponse.BodyHandlers.ofString());
	}

	@Test
	@DisplayName("Preflight cho đường CẦN ĐĂNG NHẬP phải qua — đây là ca đã hỏng")
	void preflightSucceedsOnAProtectedEndpoint() throws Exception {
		// Trình duyệt hỏi "tôi được gửi header Authorization tới đây không?". Câu hỏi này KHÔNG mang
		// token — không trình duyệt nào gửi thông tin đăng nhập trong preflight. Nên lớp phân quyền
		// phải để nó đi qua, còn CORS mới là thứ trả lời.
		HttpResponse<String> res = preflight("/api/users", "GET", "authorization");

		assertThat(res.statusCode())
				.as("401 ở đây nghĩa là preflight bị lớp phân quyền chặn, và trình duyệt sẽ chặn "
						+ "MỌI lời gọi có token — app trắng trơn sau khi đăng nhập")
				.isEqualTo(200);
		assertThat(res.headers().firstValue("Access-Control-Allow-Origin"))
				.as("qua được nhưng không có header này thì trình duyệt vẫn chặn")
				.contains(ORIGIN);
	}

	@Test
	@DisplayName("Cho phép cả hai header mà app thật sự gửi")
	void allowsTheHeadersTheAppActuallySends() throws Exception {
		HttpResponse<String> res = preflight("/api/table-invoices", "GET", "authorization,content-type");

		assertThat(res.statusCode()).isEqualTo(200);
		assertThat(res.headers().firstValue("Access-Control-Allow-Origin")).contains(ORIGIN);
	}

	@Test
	@DisplayName("Đường công khai vẫn qua — ca này vốn đã xanh, giữ để thấy khác biệt")
	void preflightAlsoSucceedsOnAPublicEndpoint() throws Exception {
		HttpResponse<String> res = preflight("/api/auth/login", "POST", "content-type");

		assertThat(res.statusCode()).isEqualTo(200);
		assertThat(res.headers().firstValue("Access-Control-Allow-Origin")).contains(ORIGIN);
	}

	@Test
	@DisplayName("Origin lạ KHÔNG được cấp quyền — nếu không thì ba ca trên vô nghĩa")
	void refusesAnUnknownOrigin() throws Exception {
		// Không có ca này thì "mở toang cho mọi origin" cũng làm ba ca trên xanh.
		HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/users"))
				.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
				.header("Origin", "https://ke-la.example")
				.header("Access-Control-Request-Method", "GET")
				.header("Access-Control-Request-Headers", "authorization")
				.timeout(Duration.ofSeconds(20))
				.build();
		HttpResponse<String> res =
				HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());

		assertThat(res.headers().firstValue("Access-Control-Allow-Origin"))
				.as("cấp quyền cho origin lạ nghĩa là bất kỳ trang web nào cũng gọi được API này "
						+ "bằng token của người dùng đang đăng nhập")
				.isEmpty();
	}
}
