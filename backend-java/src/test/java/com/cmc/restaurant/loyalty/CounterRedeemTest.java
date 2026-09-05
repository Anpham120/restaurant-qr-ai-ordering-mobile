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
 * Quầy đổi thưởng HỘ khách chỉ dùng web.
 *
 * <p><b>Nghiệp vụ được canh ở đây.</b> Khách quét QR dùng web thì KHÔNG đăng nhập — hệ thống không
 * biết họ là ai, nên họ không tự đổi thưởng được. Nhưng điểm của họ vẫn tích, vì màn thanh toán
 * bắt điền số điện thoại và hồ sơ điểm được mở theo SỐ.
 *
 * <p>Trước bản này, backend không có đường nào cho quầy tạo một lần đổi. Nghĩa là cả nhóm khách đó
 * kiếm được điểm mà vĩnh viễn không tiêu được, trừ khi cài app — một chương trình tích điểm hỏng
 * về nghiệp vụ, không phải thiếu một màn hình.
 *
 * <p>Phải là test tích hợp: điều đáng canh nhất là hội viên KHÔNG có tài khoản người dùng nào, và
 * một test dùng repository giả lập sẽ bỏ qua đúng chỗ đó.
 */
@Testcontainers
@Import(XacMinhGia.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CounterRedeemTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private com.cmc.restaurant.auth.UserRepository users;

	@Autowired
	private LoyaltyMemberRepository members;

	@Autowired
	private LoyaltyRewardRepository rewards;

	@Autowired
	private LoyaltyRedemptionRepository redemptions;

	@Autowired
	private com.cmc.restaurant.menu.MenuItemRepository menuItems;

	private static String soNgauNhien() {
		return "09" + String.format("%08d", (int) (Math.random() * 100000000));
	}

	/** Hồ sơ điểm CHỈ theo số điện thoại — không có tài khoản người dùng nào đi kèm. */
	private String hoiVienChiCoSo(int soDiem) {
		String phone = soNgauNhien();
		LoyaltyMemberEntity m = new LoyaltyMemberEntity(
				"loy_" + UUID.randomUUID().toString().replace("-", ""), phone, OffsetDateTime.now());
		m.applyFrom(new com.cmc.restaurant.loyalty.domain.LoyaltyMember(
				m.getId(), phone, null, soDiem, BigDecimal.ZERO, OffsetDateTime.now()));
		members.save(m);
		return phone;
	}

	private String uuDaiGiamTien(int chiPhi, int soTienGiam) {
		OffsetDateTime now = OffsetDateTime.now();
		LoyaltyRewardEntity r = new LoyaltyRewardEntity(
				"rw_" + UUID.randomUUID().toString().replace("-", ""), now);
		r.applyDefinition("Giam " + soTienGiam, "demo", chiPhi, true, now,
				"DISCOUNT", null, new BigDecimal(soTienGiam), "BAC");
		rewards.save(r);
		return r.getId();
	}

	private String uuDaiTangMon(int chiPhi) {
		OffsetDateTime now = OffsetDateTime.now();
		LoyaltyRewardEntity r = new LoyaltyRewardEntity(
				"rw_" + UUID.randomUUID().toString().replace("-", ""), now);
		String monId = menuItems.findAll().stream().findFirst()
				.orElseThrow(() -> new IllegalStateException("CSDL thử thiếu món"))
				.getId();
		r.applyDefinition("Tang mon", "demo", chiPhi, true, now, "FREE_ITEM", monId, null, "BAC");
		rewards.save(r);
		return r.getId();
	}

	/**
	 * Tài khoản nhân viên quầy: đăng ký rồi nâng vai, đúng khuôn MyLoyaltyLinkTest dùng.
	 *
	 * KHÔNG dựa vào AdminBootstrap: nó cố ý không có giá trị mặc định, nên trong test nó sẽ không
	 * tạo gì, và một hàm trả null sẽ khiến MỌI ca lặng lẽ bỏ qua — tức một tệp test luôn xanh mà
	 * không kiểm gì.
	 */
	@SuppressWarnings("unchecked")
	private String tokenQuay() {
		String so = soNgauNhien();
		rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "NV quay", "phoneIdToken", so, "password", "MatKhauProbe12345")), Map.class);
		com.cmc.restaurant.auth.UserEntity u = users.findByPhoneNumber(so).orElseThrow();
		u.setRole(com.cmc.restaurant.auth.UserRole.COUNTER_STAFF);
		users.save(u);
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("identifier", so, "password", "MatKhauProbe12345")), Map.class).getBody();
		return (String) body.get("accessToken");
	}

	private static HttpEntity<Map<String, String>> json(Map<String, String> body) {
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(body, h);
	}

	private ResponseEntity<Map> goiQuay(String token, Map<String, String> than, String khoa) {
		HttpHeaders h = new HttpHeaders();
		h.setContentType(MediaType.APPLICATION_JSON);
		if (token != null) {
			h.setBearerAuth(token);
		}
		if (khoa != null) {
			h.set("Idempotency-Key", khoa);
		}
		return rest.exchange("/api/loyalty/counter/redeem", HttpMethod.POST,
				new HttpEntity<>(than, h), Map.class);
	}

	@Test
	@DisplayName("Khách KHÔNG có tài khoản app vẫn đổi được thưởng qua quầy")
	@SuppressWarnings("unchecked")
	void redeemsForAWebOnlyCustomer() {
		String token = tokenQuay();
		String phone = hoiVienChiCoSo(500);
		String rewardId = uuDaiGiamTien(300, 50000);

		ResponseEntity<Map> kq = goiQuay(token,
				Map.of("phone", phone, "rewardId", rewardId), "quay-" + UUID.randomUUID());

		assertThat(kq.getStatusCode().value()).isEqualTo(200);
		Map<String, Object> than = kq.getBody();
		assertThat(than).isNotNull();
		// Mã là thứ nhân viên ĐỌC CHO KHÁCH nhập ở màn thanh toán. Không có mã thì cả luồng vô nghĩa.
		assertThat((String) than.get("code")).isNotBlank();
		assertThat((Integer) than.get("pointsSpent")).isEqualTo(300);
		assertThat((Integer) than.get("soDuMoi")).isEqualTo(200);
	}

	@Test
	@DisplayName("Ghi lại NHÂN VIÊN đã tiêu điểm — khác với người phát món")
	void recordsWhichStaffSpentThePoints() {
		String token = tokenQuay();
		String phone = hoiVienChiCoSo(500);
		String rewardId = uuDaiGiamTien(300, 50000);

		goiQuay(token, Map.of("phone", phone, "rewardId", rewardId), "quay-" + UUID.randomUUID());

		LoyaltyMemberEntity m = members.findByPhoneNumber(phone).orElseThrow();
		LoyaltyRedemptionEntity ghi = redemptions.findAll().stream()
				.filter(r -> r.getMemberId().equals(m.getId()))
				.findFirst().orElseThrow();
		// Đây là nhân viên tiêu điểm THẬT của khách. Không ghi lại thì khi khách khiếu nại "sao
		// điểm của tôi mất" không có gì để tra.
		assertThat(ghi.getRedeemedBy()).isNotBlank();
	}

	@Test
	@DisplayName("Số chưa có điểm nào thì từ chối, không tự mở hồ sơ rỗng")
	@SuppressWarnings("unchecked")
	void refusesAPhoneWithNoProfile() {
		String token = tokenQuay();
		String rewardId = uuDaiGiamTien(300, 50000);

		ResponseEntity<Map> kq = goiQuay(token,
				Map.of("phone", soNgauNhien(), "rewardId", rewardId), "quay-" + UUID.randomUUID());

		assertThat(kq.getStatusCode().value()).isEqualTo(400);
	}

	@Test
	@DisplayName("Thiếu Idempotency-Key thì từ chối — bấm hai lần ở đây tiêu điểm THẬT")
	@SuppressWarnings("unchecked")
	void requiresAnIdempotencyKey() {
		String token = tokenQuay();
		String phone = hoiVienChiCoSo(500);
		String rewardId = uuDaiGiamTien(300, 50000);

		ResponseEntity<Map> kq = goiQuay(token, Map.of("phone", phone, "rewardId", rewardId), null);

		assertThat(kq.getStatusCode().value()).isEqualTo(400);
	}

	@Test
	@DisplayName("Gửi lại CÙNG khoá idempotency thì KHÔNG trừ điểm lần hai")
	@SuppressWarnings("unchecked")
	void doesNotSpendTwiceOnReplay() {
		String token = tokenQuay();
		String phone = hoiVienChiCoSo(500);
		String rewardId = uuDaiGiamTien(300, 50000);
		String khoa = "quay-" + UUID.randomUUID();

		goiQuay(token, Map.of("phone", phone, "rewardId", rewardId), khoa);
		ResponseEntity<Map> lai = goiQuay(token, Map.of("phone", phone, "rewardId", rewardId), khoa);

		assertThat(lai.getStatusCode().value()).isEqualTo(200);
		assertThat(members.findByPhoneNumber(phone).orElseThrow().getPoints()).isEqualTo(200);
	}

	@Test
	@DisplayName("Không đủ điểm thì từ chối")
	@SuppressWarnings("unchecked")
	void refusesWhenThereArentEnoughPoints() {
		String token = tokenQuay();
		String phone = hoiVienChiCoSo(100);
		String rewardId = uuDaiGiamTien(300, 50000);

		ResponseEntity<Map> kq = goiQuay(token,
				Map.of("phone", phone, "rewardId", rewardId), "quay-" + UUID.randomUUID());

		assertThat(kq.getStatusCode().value()).isEqualTo(400);
		assertThat(members.findByPhoneNumber(phone).orElseThrow().getPoints()).isEqualTo(100);
	}

	@Test
	@DisplayName("KHÁCH đã đăng nhập cũng KHÔNG gọi được cổng của quầy")
	@SuppressWarnings("unchecked")
	void refusesLoggedInCustomers() {
		// Cổng này tiêu điểm của NGƯỜI KHÁC — chỉ cần biết số điện thoại là đổi được. Cho vai
		// Customer đi qua nghĩa là bất kỳ ai có tài khoản cũng tiêu sạch điểm của người lạ.
		//
		// Kiểm bằng khách ĐÃ đăng nhập chứ không phải lời gọi ẩn danh: `TestRestTemplate` không
		// gửi được request ẩn danh tới cổng có xác thực (nó hỏng ở phía client trước khi tới máy
		// chủ), nên ca đó sẽ đỏ vì lý do chẳng liên quan gì tới luật đang canh.
		String so = soNgauNhien();
		rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "Khach", "phoneIdToken", so, "password", "MatKhauProbe12345")), Map.class);
		Map<String, Object> dn = rest.postForEntity("/api/auth/login",
				json(Map.of("identifier", so, "password", "MatKhauProbe12345")), Map.class).getBody();
		String tokenKhach = (String) dn.get("accessToken");

		String phone = hoiVienChiCoSo(500);
		String rewardId = uuDaiGiamTien(300, 50000);

		ResponseEntity<Map> kq = goiQuay(tokenKhach,
				Map.of("phone", phone, "rewardId", rewardId), "quay-" + UUID.randomUUID());

		assertThat(kq.getStatusCode().value()).isEqualTo(403);
		assertThat(members.findByPhoneNumber(phone).orElseThrow().getPoints()).isEqualTo(500);
	}

	@Test
	@DisplayName("Ưu đãi tặng món không kèm đơn thì phiếu nằm chờ quầy phát")
	@SuppressWarnings("unchecked")
	void aFreeItemWithoutAnOrderWaitsAtTheCounter() {
		String token = tokenQuay();
		String phone = hoiVienChiCoSo(500);
		String rewardId = uuDaiTangMon(300);

		ResponseEntity<Map> kq = goiQuay(token,
				Map.of("phone", phone, "rewardId", rewardId), "quay-" + UUID.randomUUID());

		assertThat(kq.getStatusCode().value()).isEqualTo(200);
		Map<String, Object> than = kq.getBody();
		assertThat(than).isNotNull();
		// Không mã, không đơn: đúng nhánh "khách đổi để dành, quầy phát bằng tay".
		assertThat(than.get("code")).isNull();
		assertThat(than.get("orderCode")).isNull();
	}
}
