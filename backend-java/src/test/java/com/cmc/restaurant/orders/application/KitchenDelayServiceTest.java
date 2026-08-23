package com.cmc.restaurant.orders.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.cmc.restaurant.orders.adapter.out.persistence.KitchenDelayEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.KitchenDelayRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Độ trễ bếp tự khai (#142).
 *
 * <p>Phần đáng test không phải việc ghi con số xuống — đó là một câu UPDATE. Phần đáng test là
 * <b>cờ tự tắt</b>, vì đó là thứ giữ cho tính năng này không biến thành nguồn sai số: bếp bật lúc
 * bảy giờ tối rồi quên, và nếu không có đường tự tắt thì mười giờ ứng dụng vẫn cộng thêm hai mươi
 * phút vào một cái bếp trống.
 *
 * <p>Dùng đồng hồ bơm vào chứ không chờ thật, theo đúng lối của {@code ChatRateLimiterTest}: chờ
 * chín mươi phút thật thì không ai chạy bộ test này nữa.
 */
class KitchenDelayServiceTest {

	private static final class DongHo extends Clock {
		private Instant now = Instant.parse("2026-08-23T12:00:00Z");

		void tien(Duration d) {
			now = now.plus(d);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}
	}

	private DongHo dongHo;
	private KitchenDelayService service;

	@BeforeEach
	void setUp() {
		dongHo = new DongHo();
		KitchenDelayRepository repo = mock(KitchenDelayRepository.class);
		AtomicReference<KitchenDelayEntity> luu = new AtomicReference<>();
		when(repo.findById(any())).thenAnswer(i -> Optional.ofNullable(luu.get()));
		when(repo.save(any())).thenAnswer(i -> {
			KitchenDelayEntity e = i.getArgument(0);
			luu.set(e);
			return e;
		});
		service = new KitchenDelayService(repo, dongHo);
	}

	@Test
	@DisplayName("chưa ai bật thì không cộng phút nào")
	void chuaBat() {
		assertThat(service.phutTreHienTai()).isZero();
		assertThat(service.xem().delayMinutes()).isZero();
	}

	@Test
	@DisplayName("bếp khai 20 phút thì ước lượng cộng 20 phút")
	void batLen() {
		service.dat(20, "Bếp trưởng");

		assertThat(service.phutTreHienTai()).isEqualTo(20);
		assertThat(service.xem().delayMinutes()).isEqualTo(20);
		assertThat(service.xem().updatedBy()).isEqualTo("Bếp trưởng");
	}

	@Test
	@DisplayName("còn trong hạn 90 phút thì vẫn hiệu lực")
	void conHan() {
		service.dat(20, "Bếp trưởng");
		dongHo.tien(Duration.ofMinutes(89));

		assertThat(service.phutTreHienTai()).isEqualTo(20);
		assertThat(service.xem().minutesLeft()).isEqualTo(1);
	}

	@Test
	@DisplayName("quá 90 phút thì tự tắt, không cần tiến trình nào chạy")
	void tuTat() {
		service.dat(20, "Bếp trưởng");
		dongHo.tien(Duration.ofMinutes(91));

		// Không gọi hàm dọn nào, không khởi động lại gì. Hết hạn được xét ngay lúc đọc, nên máy
		// chủ chết cả đêm rồi bật lại thì cờ vẫn tắt đúng.
		assertThat(service.phutTreHienTai()).isZero();
		assertThat(service.xem().delayMinutes()).isZero();
		assertThat(service.xem().minutesLeft()).isZero();
	}

	@Test
	@DisplayName("bấm lại thì gia hạn thêm 90 phút nữa")
	void giaHan() {
		service.dat(20, "Bếp trưởng");
		dongHo.tien(Duration.ofMinutes(80));
		service.dat(20, "Bếp phó");

		dongHo.tien(Duration.ofMinutes(80));
		// Nếu gia hạn tính từ lần bật ĐẦU thì lúc này đã 160 phút và cờ phải tắt. Nó còn sống,
		// tức hạn được tính lại từ lần bấm gần nhất — đúng cái người trực ca mong đợi khi họ bấm
		// lại giữa lúc còn đông.
		assertThat(service.phutTreHienTai()).isEqualTo(20);
	}

	@Test
	@DisplayName("tắt thì xoá hẳn hạn, không để lại mốc thời gian đã qua")
	void tatHan() {
		service.dat(30, "Bếp trưởng");
		service.dat(0, "Bếp trưởng");

		assertThat(service.phutTreHienTai()).isZero();
		assertThat(service.xem().minutesLeft()).isZero();
	}

	@Test
	@DisplayName("chặn số âm và số vượt trần 60 phút")
	void chanSoVoLy() {
		assertThatThrownBy(() -> service.dat(-1, "Bếp trưởng"))
				.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> service.dat(61, "Bếp trưởng"))
				.isInstanceOf(IllegalArgumentException.class);

		// Hai đầu mút phải nhận được, nếu không thì nút "Tắt" và trần hợp lệ đều hỏng.
		service.dat(0, "Bếp trưởng");
		service.dat(60, "Bếp trưởng");
		assertThat(service.phutTreHienTai()).isEqualTo(60);
	}
}
