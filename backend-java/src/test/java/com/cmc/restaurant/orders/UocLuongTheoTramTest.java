package com.cmc.restaurant.orders;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.auth.UserRole;
import com.cmc.restaurant.auth.XacMinhGia;
import java.util.List;
import java.util.Locale;
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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Ước lượng thời gian lên món, chạy hết đường từ HTTP xuống cơ sở dữ liệu.
 *
 * <p><b>Vì sao phải là test tích hợp.</b> Luật chia trạm đã có test đơn vị
 * ({@code TramChuanBiTest}) và công thức đã có test với repository giả lập
 * ({@code OrderItemEstimationServiceTest}). Cả hai đều bỏ qua đúng chỗ dễ vỡ nhất: câu SQL gộp
 * hàng đợi theo món, và việc nối mảng nhãn thành chuỗi có thật sự trả về nhãn hay không. Một truy
 * vấn viết sai vẫn cho mọi test giả lập xanh, rồi mọi món rơi hết về một trạm.
 *
 * <p>Ba món cố định lấy từ seed, mỗi món một trạm:
 *
 * <pre>
 *   m_004  Bánh cuốn Thanh Trì   method:steamed   → BẾP
 *   m_059  Bạc xỉu Sài Gòn       cat_drink        → QUẦY
 *   m_072  Bánh flan caramel     cat_dessert      → LẤY SẴN
 * </pre>
 */
@Testcontainers
@Import(XacMinhGia.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UocLuongTheoTramTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private UserRepository users;

	private static final String MON_BEP = "m_004";
	private static final String MON_QUAY = "m_059";
	private static final String MON_SAN = "m_072";

	private static HttpEntity<Map<String, String>> json(Map<String, String> than) {
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(than, h);
	}

	private static String soNgauNhien() {
		return "09" + String.format("%08d", (int) (Math.random() * 100000000));
	}

	@SuppressWarnings("unchecked")
	private String tokenBep() {
		String so = soNgauNhien();
		rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "Bep", "phoneIdToken", so, "password", "MatKhauProbe12345")), Map.class);
		UserEntity u = users.findByPhoneNumber(so).orElseThrow();
		u.setRole(UserRole.KITCHEN);
		users.save(u);
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("identifier", so, "password", "MatKhauProbe12345")), Map.class).getBody();
		return (String) body.get("accessToken");
	}

	/** Đặt một đơn thật qua HTTP và trả về danh sách món kèm ước lượng máy chủ tính. */
	@SuppressWarnings("unchecked")
	private List<Map<String, Object>> datDon(String tableCode, List<Map<String, Object>> mon) {
		String qrToken = "cmc-table-" + tableCode.toLowerCase(Locale.ROOT) + "-qr";
		Map<String, Object> phien = rest.exchange("/api/table-sessions", HttpMethod.POST,
				json(Map.of("qrToken", qrToken, "tableCode", tableCode)), Map.class).getBody();
		assertThat(phien).as("không mở được phiên bàn %s — bàn này có trong seed không?", tableCode)
				.isNotNull();

		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		h.set("X-Table-Session-Token", (String) phien.get("tableSessionToken"));
		h.set("Idempotency-Key", "ul." + UUID.randomUUID());
		Map<String, Object> don = rest.exchange("/api/orders", HttpMethod.POST,
				new HttpEntity<>(Map.of(
						"orderType", "DineIn",
						"tableSessionId", phien.get("sessionId"),
						"tableCode", tableCode,
						"qrToken", qrToken,
						"items", mon), h), Map.class).getBody();
		assertThat(don).as("không đặt được đơn").isNotNull();
		maDonVuaDat = (String) don.get("orderCode");
		return (List<Map<String, Object>>) don.get("items");
	}

	/** Mã đơn của lần {@link #datDon} gần nhất. */
	private String maDonVuaDat;

	private static Map<String, Object> mon(List<Map<String, Object>> items, String menuItemId) {
		return items.stream()
				.filter(m -> menuItemId.equals(m.get("menuItemId")))
				.findFirst()
				.orElseThrow(() -> new AssertionError("đơn không có món " + menuItemId));
	}

	private static int cao(Map<String, Object> item) {
		Object v = item.get("estimatedReadyMinutesHigh");
		assertThat(v).as("món %s không có ước lượng", item.get("name")).isNotNull();
		return ((Number) v).intValue();
	}

	/**
	 * Đọc lại MỘT đơn đã có qua bảng bếp.
	 *
	 * <p>Đo bằng cách đặt thêm đơn thì chính phép đo làm hàng đợi dài ra, và hiệu số thu được lẫn
	 * giữa "độ trễ bếp khai" với "hàng đợi vừa dài thêm". Đã đo hụt đúng như vậy: kỳ vọng +20,
	 * nhận +24, và bốn phút thừa là do chính đơn dùng để đo.
	 *
	 * <p>Đọc lại đơn CŨ thì giữa hai lần đo không có gì đổi ngoài thứ đang thử.
	 */
	@SuppressWarnings("unchecked")
	private List<Map<String, Object>> docLaiDon(String token, String orderCode) {
		HttpHeaders h = new HttpHeaders();
		h.setBearerAuth(token);
		Map<String, Object> body = rest.exchange("/api/orders", HttpMethod.GET,
				new HttpEntity<>(h), Map.class).getBody();
		assertThat(body).isNotNull();
		List<Map<String, Object>> don = (List<Map<String, Object>>) body.get("orders");
		Map<String, Object> cua = don.stream()
				.filter(d -> orderCode.equals(d.get("orderCode")))
				.findFirst()
				.orElseThrow(() -> new AssertionError("bảng bếp không thấy đơn " + orderCode));
		return (List<Map<String, Object>>) cua.get("items");
	}

	private void datTreBep(String token, int phut) {
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		h.setBearerAuth(token);
		rest.exchange("/api/kitchen/delay", HttpMethod.PUT,
				new HttpEntity<>(Map.of("delayMinutes", phut), h), Map.class);
	}

	@Test
	@DisplayName("cả BA trạm đều ra ước lượng — trước đây 34/91 món im lặng")
	void baTramDeuCoUocLuong() {
		List<Map<String, Object>> items = datDon("T21", List.of(
				Map.of("menuItemId", MON_BEP, "quantity", 1),
				Map.of("menuItemId", MON_QUAY, "quantity", 1),
				Map.of("menuItemId", MON_SAN, "quantity", 1)));

		// V11 chỉ suy được prep_minutes từ nhãn `method:`, nên hai món dưới trả về null suốt từ đó.
		// Đây là ca canh V27 đã chạy VÀ câu SQL đọc đúng.
		assertThat(cao(mon(items, MON_BEP))).isPositive();
		assertThat(cao(mon(items, MON_QUAY))).isPositive();
		assertThat(cao(mon(items, MON_SAN))).isPositive();
	}

	@Test
	@DisplayName("MÓN LẤY SẴN nhanh hơn hẳn món bếp trong CÙNG một đơn")
	void laySanNhanhHonMonBep() {
		List<Map<String, Object>> items = datDon("T22", List.of(
				Map.of("menuItemId", MON_BEP, "quantity", 1),
				Map.of("menuItemId", MON_SAN, "quantity", 1)));

		// Bánh cuốn hấp 15 phút, bánh flan lấy sẵn 2 phút. Một hàng đợi chung kéo cả hai về gần
		// nhau; tách trạm thì khoảng cách giữ nguyên.
		assertThat(cao(mon(items, MON_SAN))).isLessThan(cao(mon(items, MON_BEP)));
	}

	@Test
	@DisplayName("bếp ĐÔNG thì món bếp lâu thêm, món lấy sẵn ĐỨNG YÊN")
	void bepDongKhongLamChamLySan() {
		// Ca chính của cả mô hình ba trạm.
		List<Map<String, Object>> truoc = datDon("T23", List.of(
				Map.of("menuItemId", MON_BEP, "quantity", 1),
				Map.of("menuItemId", MON_SAN, "quantity", 1)));
		int bepTruoc = cao(mon(truoc, MON_BEP));
		int sanTruoc = cao(mon(truoc, MON_SAN));

		// Chất tải cho BẾP: bốn phần món hấp 15 phút ở một bàn khác.
		datDon("T24", List.of(Map.of("menuItemId", MON_BEP, "quantity", 4)));

		List<Map<String, Object>> sau = datDon("T25", List.of(
				Map.of("menuItemId", MON_BEP, "quantity", 1),
				Map.of("menuItemId", MON_SAN, "quantity", 1)));

		assertThat(cao(mon(sau, MON_BEP)))
				.as("bếp đã nhận thêm việc mà ước lượng món bếp không nhúc nhích")
				.isGreaterThan(bepTruoc);
		assertThat(cao(mon(sau, MON_SAN)))
				.as("việc BẾP không được phép làm chậm món LẤY SẴN")
				.isEqualTo(sanTruoc);
	}

	@Test
	@DisplayName("bếp tự khai trễ CHỈ cộng vào món của bếp")
	void treBepChiChamMonBep() {
		// Chỗ suýt bỏ sót lúc tách trạm: độ trễ khai vẫn cộng cho mọi món, nên bếp bấm "+20 phút"
		// là cái bánh flan lấy từ tủ cũng đọc ra hơn hai mươi phút.
		//
		// Đo bằng cách ĐỌC LẠI cùng một đơn, không đặt thêm đơn nào: giữa hai lần đo hàng đợi không
		// đổi, nên hiệu số thu được đúng bằng thứ đang thử. Bản đầu của ca này đặt đơn mới để đo và
		// nhận +24 thay vì +20 — bốn phút thừa là việc bếp do chính phép đo sinh ra.
		String bep = tokenBep();
		datTreBep(bep, 0);
		datDon("T26", List.of(
				Map.of("menuItemId", MON_BEP, "quantity", 1),
				Map.of("menuItemId", MON_SAN, "quantity", 1)));
		String maDon = maDonVuaDat;

		List<Map<String, Object>> truoc = docLaiDon(bep, maDon);
		int bepTruoc = cao(mon(truoc, MON_BEP));
		int sanTruoc = cao(mon(truoc, MON_SAN));

		datTreBep(bep, 20);
		try {
			List<Map<String, Object>> sau = docLaiDon(bep, maDon);

			assertThat(cao(mon(sau, MON_BEP)))
					.as("món bếp phải cộng ĐÚNG số phút bếp khai")
					.isEqualTo(bepTruoc + 20);
			assertThat(cao(mon(sau, MON_SAN)))
					.as("bếp hỏng lò không làm chậm cái bánh flan lấy từ tủ")
					.isEqualTo(sanTruoc);
		}
		finally {
			// Cờ sống 90 phút và dùng chung cho cả ứng dụng. Không tắt thì ca chạy sau nhận một độ
			// trễ nó không đặt, rồi đỏ vì lý do chẳng liên quan gì tới nó.
			datTreBep(bep, 0);
		}
	}

	@Test
	@DisplayName("SỐ LƯỢNG có tính vào tải bếp — 10 phần nặng hơn 1 phần")
	void soLuongCoTinhVaoTaiBep() {
		// LỖI CÓ THẬT, tìm ra bằng cách gõ vào máy chủ đang chạy chứ không phải bằng đọc mã.
		//
		// Tải bếp cộng `prep_minutes` một lần cho mỗi DÒNG món, không nhân số lượng. Một bàn gọi 30
		// con gà quay trong một dòng đè lên bếp đúng bằng một con. Đo trên staging: chất 30 phần gà
		// quay (35 phút/phần, tức 1050 phút việc) làm ước lượng nhích từ 45–75 lên 48–79 — cộng ba
		// phút thay vì cộng khoảng 175.
		//
		// Sai theo hướng NGUY nhất: hứa nhanh rồi giao chậm, và sai to nhất đúng lúc quán đông có
		// đoàn khách gọi nhiều phần cùng món.
		//
		// Lỗi sống sót từ #141 vì mọi phép kiểm trước đây đều đặt `quantity: 1` — số lượng chưa bao
		// giờ được đưa vào phép đo nào.
		String bep = tokenBep();
		datTreBep(bep, 0);
		datDon("T28", List.of(Map.of("menuItemId", MON_BEP, "quantity", 1)));
		String maDon = maDonVuaDat;
		int truoc = cao(mon(docLaiDon(bep, maDon), MON_BEP));

		// 10 phần món hấp 15 phút = 150 phút việc, chia 6 trạm song song ≈ +25 phút.
		// Khi bỏ qua số lượng, cùng đơn này chỉ cộng 15/6 ≈ 2,5 phút.
		datDon("T29", List.of(Map.of("menuItemId", MON_BEP, "quantity", 10)));

		assertThat(cao(mon(docLaiDon(bep, maDon), MON_BEP)) - truoc)
				.as("10 phần phải nặng hơn hẳn 1 phần; +2 phút nghĩa là số lượng đang bị bỏ qua")
				.isGreaterThanOrEqualTo(15);
	}
}
