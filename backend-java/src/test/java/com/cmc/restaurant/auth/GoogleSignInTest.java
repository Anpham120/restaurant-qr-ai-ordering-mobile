package com.cmc.restaurant.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Đăng nhập Google, và điều gì xảy ra khi email đó đã có tài khoản mật khẩu.
 *
 * <p>Phần xác minh chữ ký của Google được thay bằng bản giả — các luật đọc token đã có
 * {@link GoogleClaimsRuleTest} canh riêng và chạy không cần mạng. Ở đây kiểm phần còn lại: nối
 * theo {@code sub}, luật gộp, và việc mật khẩu cũ phải chết sau khi gộp.
 *
 * <p>Gọi HTTP bằng {@link HttpClient} của JDK chứ không dùng {@code TestRestTemplate}: lớp kia
 * chạy trên {@code HttpURLConnection}, và {@code HttpURLConnection} gặp 401 thì tự động thử gửi
 * lại request kèm thông tin đăng nhập — thân request đã gửi đi rồi nên nó ném I/O error thay vì
 * trả 401 về. Nửa số phép kiểm ở đây kiểm đúng mã 401, nên phải dùng client không làm chuyện đó.
 */
@Testcontainers
@Import(XacMinhGia.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GoogleSignInTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@LocalServerPort
	private int cong;

	@Autowired
	private UserRepository users;

	@Autowired
	private PasswordHasher hasher;

	private final HttpClient http = HttpClient.newHttpClient();
	private final ObjectMapper json = new ObjectMapper();

	private record Ket(int ma, Map<String, Object> than) {
	}

	private Ket dang(String duong, Map<String, String> than) {
		try {
			HttpResponse<String> res = http.send(
					HttpRequest.newBuilder(URI.create("http://localhost:" + cong + duong))
							.header("Content-Type", "application/json")
							.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(than)))
							.build(),
					HttpResponse.BodyHandlers.ofString());
			Map<String, Object> body = res.body() == null || res.body().isBlank()
					? Map.of()
					: json.readValue(res.body(), new TypeReference<>() {
					});
			return new Ket(res.statusCode(), body);
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(e);
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private static String emailNgauNhien() {
		return "gg." + UUID.randomUUID() + "@local.test";
	}

	private static String subNgauNhien() {
		return "sub-" + UUID.randomUUID();
	}

	private Ket vaoBangGoogle(String sub, String email, String ten) {
		return dang("/api/auth/google", Map.of("idToken", sub + "|" + email + "|" + ten));
	}

	/**
	 * Tài khoản khách CÓ EMAIL — loại sinh ra TRƯỚC V22.
	 *
	 * <p>Dựng thẳng qua kho vì {@code /api/auth/register} nay chỉ tạo tài khoản theo số điện thoại;
	 * không còn đường công khai nào tạo ra hình dạng này. Nhưng dữ liệu cũ thì vẫn còn, và đường
	 * gộp của {@code signInWithGoogle} tồn tại chính là vì chúng.
	 */
	private String taoTaiKhoanEmailCu(String email, String matKhau, String vaiTro) {
		UserEntity u = new UserEntity(
				"usr_" + UUID.randomUUID().toString().replace("-", ""),
				email,
				"Khach",
				hasher.hashPassword(matKhau),
				vaiTro,
				OffsetDateTime.now());
		return users.save(u).getId();
	}

	private Ket dangNhapMatKhau(String dinhDanh, String matKhau) {
		return dang("/api/auth/login", Map.of("identifier", dinhDanh, "password", matKhau));
	}

	@SuppressWarnings("unchecked")
	private static String idCuaKhach(Ket ket) {
		return (String) ((Map<String, Object>) ket.than().get("user")).get("userId");
	}

	@Test
	@SuppressWarnings("unchecked")
	@DisplayName("Lần đầu: tạo tài khoản và trả JWT ngay, không có bước đăng ký riêng")
	void firstSignInCreatesTheAccount() {
		String email = emailNgauNhien();

		Ket res = vaoBangGoogle(subNgauNhien(), email, "An Phạm");

		assertThat(res.ma()).isEqualTo(200);
		assertThat(res.than().get("accessToken")).isNotNull();
		Map<String, Object> user = (Map<String, Object>) res.than().get("user");
		assertThat(user).containsEntry("email", email).containsEntry("role", "Customer");
	}

	@Test
	@DisplayName("Vào lại lần hai: CÙNG một tài khoản, không tạo thêm")
	void signingInAgainReusesTheAccount() {
		String sub = subNgauNhien();
		String email = emailNgauNhien();

		String lan1 = idCuaKhach(vaoBangGoogle(sub, email, "An"));
		String lan2 = idCuaKhach(vaoBangGoogle(sub, email, "An"));

		assertThat(lan2).isEqualTo(lan1);
	}

	@Test
	@DisplayName("Khách đổi email trên tài khoản Google vẫn về ĐÚNG tài khoản cũ")
	void followsTheSubNotTheEmail() {
		// Nối theo email thì hôm nào khách đổi email Google, lần đăng nhập sau rơi vào một tài
		// khoản trắng và mất sạch điểm. `sub` không đổi, nên phải nối theo `sub`.
		String sub = subNgauNhien();

		String lan1 = idCuaKhach(vaoBangGoogle(sub, emailNgauNhien(), "An"));
		String lan2 = idCuaKhach(vaoBangGoogle(sub, emailNgauNhien(), "An"));

		assertThat(lan2).isEqualTo(lan1);
	}

	@Test
	@DisplayName("Email đã có tài khoản mật khẩu: GỘP vào đúng tài khoản đó, không tạo tài khoản thứ hai")
	void mergesIntoTheExistingPasswordAccount() {
		// Hai tài khoản cho cùng một email nghĩa là khách có hai ví điểm và không hiểu vì sao
		// điểm của mình biến mất.
		String email = emailNgauNhien();
		String idCu = taoTaiKhoanEmailCu(email, "MatKhauProbe12345", UserRole.CUSTOMER);

		Ket res = vaoBangGoogle(subNgauNhien(), email, "An");

		assertThat(res.ma()).isEqualTo(200);
		assertThat(idCuaKhach(res)).isEqualTo(idCu);
	}

	@Test
	@DisplayName("Gộp xong thì mật khẩu CŨ hết dùng được")
	void theOldPasswordDiesAfterTheMerge() {
		// Phép kiểm quan trọng nhất tệp này. Lúc đăng ký, hệ thống KHÔNG hề xác minh email — nên
		// tài khoản mật khẩu kia rất có thể do người khác mở bằng địa chỉ này. Google vừa chứng
		// minh ai mới là chủ thật. Để nguyên mật khẩu cũ nghĩa là kẻ mở tài khoản vẫn giữ đường
		// vào, và đường đó dẫn thẳng vào ví điểm của chủ thật.
		String email = emailNgauNhien();
		taoTaiKhoanEmailCu(email, "MatKhauProbe12345", UserRole.CUSTOMER);
		assertThat(dangNhapMatKhau(email, "MatKhauProbe12345").ma()).isEqualTo(200);

		vaoBangGoogle(subNgauNhien(), email, "An");

		assertThat(dangNhapMatKhau(email, "MatKhauProbe12345").ma()).isEqualTo(401);
	}

	@Test
	@DisplayName("Tài khoản chỉ-Google: đăng nhập mật khẩu trả 401, KHÔNG phải 500")
	void aGoogleOnlyAccountRejectsPasswordLoginCleanly() {
		// Không có mật khẩu để so. Nếu để lọt xuống PasswordHasher.verifyPassword thì
		// passwordHash.split(...) ném NPE -> 500, trong khi email lạ trả 401. Chênh lệch đó đủ
		// để dò ra email nào đã đăng ký — đúng thứ javadoc của validateCredentials nói phải tránh.
		String email = emailNgauNhien();
		vaoBangGoogle(subNgauNhien(), email, "An");

		int daDangKy = dangNhapMatKhau(email, "MatKhauProbe12345").ma();
		int chuaTungCo = dangNhapMatKhau(emailNgauNhien(), "MatKhauProbe12345").ma();

		assertThat(daDangKy).isEqualTo(401);
		// Và phải giống hệt ca email chưa từng tồn tại.
		assertThat(daDangKy).isEqualTo(chuaTungCo);
	}

	@Test
	@DisplayName("Email trùng tài khoản NHÂN VIÊN thì KHÔNG gộp — không chiếm được vai trò")
	void cannotTakeOverAStaffAccount() {
		// Từ V22 khách không còn email, nên gần như mọi tài khoản mang email đều là nội bộ. Gộp vào
		// một tài khoản như thế nghĩa là ai có Google trùng email nhân viên sẽ chiếm luôn tài khoản
		// đó KÈM VAI TRÒ, và mật khẩu cũ bị xoá nên nhân viên thật mất đường vào.
		String email = emailNgauNhien();
		taoTaiKhoanEmailCu(email, "MatKhauProbe12345", UserRole.STAFF);

		Ket res = vaoBangGoogle(subNgauNhien(), email, "Ke gian");

		assertThat(res.ma()).isEqualTo(409);
		// Và nhân viên thật vẫn vào được bằng mật khẩu cũ.
		assertThat(dangNhapMatKhau(email, "MatKhauProbe12345").ma()).isEqualTo(200);
	}

	@Test
	@DisplayName("Thiếu token thì trả 400")
	void rejectsAMissingToken() {
		assertThat(dang("/api/auth/google", Map.of()).ma()).isEqualTo(400);
	}
}
