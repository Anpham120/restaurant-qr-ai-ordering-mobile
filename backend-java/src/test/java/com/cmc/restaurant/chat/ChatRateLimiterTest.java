package com.cmc.restaurant.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Hạn mức chat — port của {@code ChatRateLimiter.cs}.
 *
 * <p>Dùng đồng hồ bơm vào chứ không {@code Thread.sleep}: kiểm cửa sổ trượt một phút bằng cách chờ
 * thật sẽ làm bộ test dài hàng phút, và tệ hơn là thỉnh thoảng đỏ trên máy chạy chậm — một test
 * đỏ ngẫu nhiên sẽ bị người ta chạy lại cho tới khi xanh, tức nó thôi làm cổng chặn.
 */
class ChatRateLimiterTest {

	/** Đồng hồ tự dời được, để test quyết định "bây giờ" là lúc nào. */
	private static final class DongHo extends Clock {
		private Instant now = Instant.parse("2026-08-20T10:00:00Z");

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

	@Test
	@DisplayName("hai hạn mức đúng bằng con số của bản .NET")
	void ghim_dung_con_so_cua_ban_net() {
		// Viết CỨNG 10 và 100 ở đây, có chủ đích.
		//
		// Mọi test khác trong lớp này dùng `ChatRateLimiter.MOI_PHUT`, nên chúng kiểm CƠ CHẾ (cửa sổ
		// trượt, trần phiên, tách phiên) mà KHÔNG kiểm giá trị: đổi hằng số thành 11 thì chúng vẫn
		// xanh vì chúng tự đổi theo. Đã dựng lại đúng như vậy trước khi thêm test này.
		//
		// Hai con số này là HỢP ĐỒNG mang từ `ChatRateLimiter.cs` sang, không phải chi tiết cài đặt.
		// Ai muốn đổi thì phải sửa ở đây, tức phải chủ ý — thay vì đổi một hằng và thấy mọi thứ vẫn
		// xanh.
		assertThat(ChatRateLimiter.MOI_PHUT).as("PerMinuteLimit của bản .NET").isEqualTo(10);
		assertThat(ChatRateLimiter.MOI_PHIEN).as("PerSessionLimit của bản .NET").isEqualTo(100);
	}

	@Test
	@DisplayName("cho đúng 10 lượt mỗi phút, lượt thứ 11 bị chặn")
	void chan_luot_thu_muoi_mot_trong_mot_phut() {
		ChatRateLimiter gioi = new ChatRateLimiter(new DongHo());

		for (int i = 1; i <= ChatRateLimiter.MOI_PHUT; i++) {
			assertThat(gioi.tryAcquire("chat_a")).as("lượt %d phải được phép", i).isTrue();
		}
		assertThat(gioi.tryAcquire("chat_a")).as("lượt thứ 11 trong cùng một phút").isFalse();
	}

	@Test
	@DisplayName("cửa sổ TRƯỢT: qua một phút thì lại gửi được")
	void cua_so_truot_qua_mot_phut() {
		DongHo dh = new DongHo();
		ChatRateLimiter gioi = new ChatRateLimiter(dh);
		for (int i = 0; i < ChatRateLimiter.MOI_PHUT; i++) {
			gioi.tryAcquire("chat_a");
		}
		assertThat(gioi.tryAcquire("chat_a")).isFalse();

		// 61 giây: mốc cũ nhất rơi ra khỏi cửa sổ.
		dh.tien(Duration.ofSeconds(61));
		assertThat(gioi.tryAcquire("chat_a")).as("sau khi cửa sổ trượt qua").isTrue();
	}

	@Test
	@DisplayName("trần MỖI PHIÊN chặn kể cả khi trải đều qua nhiều giờ")
	void tran_moi_phien_chan_ke_ca_khi_rai_deu() {
		DongHo dh = new DongHo();
		ChatRateLimiter gioi = new ChatRateLimiter(dh);

		// Gửi đều 5 tin mỗi phút — không bao giờ chạm trần 10/phút. Đây đúng là kiểu dùng mà trần
		// thứ hai sinh ra để chặn: rút cạn từ từ.
		int cho = 0;
		for (int phut = 0; phut < 40; phut++) {
			for (int i = 0; i < 5; i++) {
				if (gioi.tryAcquire("chat_a")) {
					cho++;
				}
			}
			dh.tien(Duration.ofMinutes(1));
		}

		assertThat(cho)
				.as("tổng số lượt được phép trong một phiên")
				.isEqualTo(ChatRateLimiter.MOI_PHIEN);
		assertThat(gioi.tryAcquire("chat_a")).as("sau khi chạm trần phiên").isFalse();
	}

	@Test
	@DisplayName("hai phiên đếm riêng — khách bàn này không tiêu hạn mức của bàn kia")
	void hai_phien_dem_rieng() {
		ChatRateLimiter gioi = new ChatRateLimiter(new DongHo());
		for (int i = 0; i < ChatRateLimiter.MOI_PHUT; i++) {
			gioi.tryAcquire("chat_a");
		}
		assertThat(gioi.tryAcquire("chat_a")).isFalse();
		assertThat(gioi.tryAcquire("chat_b")).as("phiên khác vẫn nguyên hạn mức").isTrue();
	}

	@Test
	@DisplayName("phiên bỏ lâu bị dọn — bộ đếm không phình vô hạn")
	void phien_bo_lau_bi_don() {
		DongHo dh = new DongHo();
		ChatRateLimiter gioi = new ChatRateLimiter(dh);

		// Dùng hết hạn mức phiên.
		for (int phut = 0; phut < 40; phut++) {
			for (int i = 0; i < 5; i++) {
				gioi.tryAcquire("chat_cu");
			}
			dh.tien(Duration.ofMinutes(1));
		}
		assertThat(gioi.tryAcquire("chat_cu")).as("đã chạm trần phiên").isFalse();

		// Bỏ đó quá 4 giờ rồi quay lại: bộ đếm đã được dọn, nên phiên coi như mới.
		//
		// Đây KHÔNG phải lỗ hổng: 4 giờ đúng bằng đời một phiên bàn, nên một phiên còn sống không
		// bao giờ chạm mốc này. Test có mặt để nếu ai rút ngắn thời gian dọn thì thấy ngay rằng
		// mình đang cấp lại hạn mức, chứ không chỉ đang tiết kiệm bộ nhớ.
		dh.tien(Duration.ofHours(5));
		assertThat(gioi.tryAcquire("chat_cu")).as("sau 5 giờ bỏ không").isTrue();
	}
}
