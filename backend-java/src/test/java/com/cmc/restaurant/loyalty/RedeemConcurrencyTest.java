package com.cmc.restaurant.loyalty;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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
 * Khoá chống tranh chấp khi đổi điểm (#34) — đúng thứ DoD của issue yêu cầu.
 *
 * <p>Luật cần bảo vệ: hai request SONG SONG với số dư chỉ đủ cho MỘT lần đổi thì đúng một request
 * được thành công, và số dư không bao giờ âm. Không có phép kiểm này, việc bỏ điều kiện
 * {@code and points >= :chiPhi} khỏi câu UPDATE sẽ đi qua mọi cổng khác mà không ai thấy — cho tới
 * khi có khách đổi được hai ưu đãi bằng số điểm của một.
 *
 * <p>Phải là test tích hợp thật: luật nằm ở câu SQL và ở tính nguyên tử của nó, nên một test dùng
 * repository giả lập sẽ kiểm đúng phần không có luật.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RedeemConcurrencyTest {

	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private UserRepository users;

	@Autowired
	private LoyaltyMemberRepository members;

	@Autowired
	private LoyaltyRewardRepository rewards;

	@Autowired
	private LoyaltyRedemptionRepository redemptions;

	private record BoiCanh(String token, String phone, String rewardId) {
	}

	@SuppressWarnings("unchecked")
	private BoiCanh dungBoiCanh(int soDiem, int chiPhi) {
		String email = "rd." + UUID.randomUUID() + "@local.test";
		rest.postForEntity("/api/auth/register", json(Map.of(
				"fullName", "K", "email", email, "password", "MatKhauProbe12345")), Map.class);
		Map<String, Object> body = rest.postForEntity("/api/auth/login",
				json(Map.of("email", email, "password", "MatKhauProbe12345")), Map.class).getBody();
		String token = (String) body.get("accessToken");
		String userId = (String) ((Map<String, Object>) body.get("user")).get("userId");

		String phone = "09" + String.format("%08d", (int) (Math.random() * 100000000));
		UserEntity user = users.findById(userId).orElseThrow();
		user.setPhoneNumber(phone);
		users.save(user);

		LoyaltyMemberEntity m = new LoyaltyMemberEntity(
				"loy_" + UUID.randomUUID().toString().replace("-", ""), phone, OffsetDateTime.now());
		m.applyFrom(new com.cmc.restaurant.loyalty.domain.LoyaltyMember(
				m.getId(), phone, null, soDiem, BigDecimal.ZERO, OffsetDateTime.now()));
		members.save(m);

		OffsetDateTime now = OffsetDateTime.now();
		LoyaltyRewardEntity r = new LoyaltyRewardEntity(
				"rw_" + UUID.randomUUID().toString().replace("-", ""), now);
		// Ưu đãi giảm tiền có số tiền hẳn hoi: ràng buộc payload của V13 từ chối một ưu đãi đang bật
		// mà không nói được nó trả cho khách cái gì.
		r.applyDefinition("Uu dai demo", "demo", chiPhi, true, now,
				"DISCOUNT", null, BigDecimal.valueOf(10_000), "BAC");
		rewards.save(r);

		return new BoiCanh(token, phone, r.getId());
	}

	private static HttpEntity<Map<String, String>> json(Map<String, String> body) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		return new HttpEntity<>(body, headers);
	}

	private ResponseEntity<Map> doi(BoiCanh bc, String khoa) {
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_JSON);
		headers.setBearerAuth(bc.token());
		headers.set("Idempotency-Key", khoa);
		return rest.exchange("/api/loyalty/me/redeem", HttpMethod.POST,
				new HttpEntity<>(Map.of("rewardId", bc.rewardId()), headers), Map.class);
	}

	private int diemHienTai(String phone) {
		return members.findByPhoneNumber(phone).orElseThrow().getPoints();
	}

	@Test
	@DisplayName("Hai request SONG SONG với số dư đủ MỘT lần: đúng một thành công, điểm không âm")
	void concurrentRedeemSpendsPointsOnlyOnce() throws Exception {
		// Đây là ca chính của #34. Bỏ `and points >= :chiPhi` khỏi câu UPDATE làm nó đỏ; mọi cổng
		// khác vẫn xanh.
		BoiCanh bc = dungBoiCanh(60, 60);

		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			List<Callable<ResponseEntity<Map>>> viec = List.of(
					() -> doi(bc, "song.a." + UUID.randomUUID()),
					() -> doi(bc, "song.b." + UUID.randomUUID()));
			List<Future<ResponseEntity<Map>>> ketQua = pool.invokeAll(viec);

			long thanhCong = ketQua.stream().filter(f -> {
				try {
					return f.get().getStatusCode().is2xxSuccessful();
				} catch (Exception e) {
					return false;
				}
			}).count();

			assertThat(thanhCong).describedAs("đúng MỘT request được đổi").isEqualTo(1);
		} finally {
			pool.shutdown();
		}

		assertThat(diemHienTai(bc.phone())).describedAs("điểm không được âm").isEqualTo(0);
		assertThat(redemptions.findByMemberIdOrderByCreatedAtDesc(
				members.findByPhoneNumber(bc.phone()).orElseThrow().getId()))
				.describedAs("chỉ một dòng sổ được ghi").hasSize(1);
	}

	@Test
	@DisplayName("Cùng khoá idempotency gửi hai lần chỉ trừ điểm MỘT lần")
	void sameIdempotencyKeySpendsOnce() {
		// Bấm hai lần lúc mạng chập chờn. Khác ca trên: ở đó là hai yêu cầu KHÁC nhau chạy song
		// song, ở đây là CÙNG một yêu cầu gửi lại.
		BoiCanh bc = dungBoiCanh(200, 60);
		String khoa = "idem." + UUID.randomUUID();

		ResponseEntity<Map> lan1 = doi(bc, khoa);
		ResponseEntity<Map> lan2 = doi(bc, khoa);

		assertThat(lan1.getStatusCode().is2xxSuccessful()).isTrue();
		assertThat(lan2.getStatusCode().is2xxSuccessful()).isTrue();
		assertThat(lan2.getBody()).containsEntry("redemptionId", lan1.getBody().get("redemptionId"));
		assertThat(diemHienTai(bc.phone())).isEqualTo(140);
	}

	@Test
	@DisplayName("Số dư trả về trong phản hồi khớp với cơ sở dữ liệu")
	void responseBalanceMatchesDatabase() {
		// Câu UPDATE hàng loạt không đụng persistence context. Thiếu `clearAutomatically = true`
		// thì lượt đọc ngay sau đó trả entity còn trong cache — đo thật: DB 140, phản hồi 200.
		// Khách nhìn thấy số dư không đổi và sẽ bấm đổi lần nữa.
		BoiCanh bc = dungBoiCanh(200, 60);

		ResponseEntity<Map> res = doi(bc, "sd." + UUID.randomUUID());

		@SuppressWarnings("unchecked")
		Map<String, Object> soDu = (Map<String, Object>) res.getBody().get("soDuMoi");
		assertThat(soDu).containsEntry("points", 140);
		assertThat(diemHienTai(bc.phone())).isEqualTo(140);
	}

	@Test
	@DisplayName("Không đủ điểm thì không trừ gì và không ghi sổ")
	void notEnoughPointsChangesNothing() {
		BoiCanh bc = dungBoiCanh(30, 60);

		ResponseEntity<Map> res = doi(bc, "thieu." + UUID.randomUUID());

		assertThat(res.getStatusCode().value()).isEqualTo(400);
		assertThat(diemHienTai(bc.phone())).isEqualTo(30);
		assertThat(redemptions.findByMemberIdOrderByCreatedAtDesc(
				members.findByPhoneNumber(bc.phone()).orElseThrow().getId())).isEmpty();
	}
}
