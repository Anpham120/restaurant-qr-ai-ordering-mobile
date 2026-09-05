package com.cmc.restaurant.loyalty.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Trần đổi điểm")
class TranDoiDiemTest {

	private static BigDecimal vnd(long v) {
		return BigDecimal.valueOf(v);
	}

	@Test
	@DisplayName("hoá đơn nhỏ bị chặn bởi TỶ LỆ")
	void hoa_don_nho_chan_boi_ty_le() {
		// 300.000 × 30% = 90.000, nhỏ hơn trần tuyệt đối nên tỷ lệ là thứ ràng buộc.
		assertThat(TranDoiDiem.toiDaChoHoaDon(vnd(300_000))).isEqualByComparingTo(vnd(90_000));
	}

	@Test
	@DisplayName("hoá đơn lớn bị chặn bởi TRẦN TUYỆT ĐỐI")
	void hoa_don_lon_chan_boi_tran() {
		// 3.000.000 × 30% = 900.000 — nếu chỉ có tỷ lệ thì quán mất 900.000đ trong một lần.
		assertThat(TranDoiDiem.toiDaChoHoaDon(vnd(3_000_000))).isEqualByComparingTo(vnd(200_000));
	}

    @Test
	@DisplayName("mỗi giới hạn một mình đều hở một đầu")
	void moi_gioi_han_deu_ho_mot_dau() {
		// Chỉ trần tuyệt đối: hoá đơn 250.000đ sẽ cho giảm 200.000đ, tức 80% hoá đơn.
		assertThat(TranDoiDiem.chapNhan(vnd(200_000), vnd(250_000))).isFalse();
		// Chỉ tỷ lệ: hoá đơn 3 triệu sẽ cho giảm 900.000đ.
		assertThat(TranDoiDiem.chapNhan(vnd(900_000), vnd(3_000_000))).isFalse();
	}

	@Test
	@DisplayName("đúng bằng trần thì CHẤP NHẬN")
	void dung_bang_tran_thi_chap_nhan() {
		assertThat(TranDoiDiem.chapNhan(vnd(90_000), vnd(300_000))).isTrue();
		assertThat(TranDoiDiem.chapNhan(vnd(200_000), vnd(3_000_000))).isTrue();
	}

	@Test
	@DisplayName("vượt trần một đồng thì từ chối")
	void vuot_tran_mot_dong_thi_tu_choi() {
		assertThat(TranDoiDiem.chapNhan(vnd(90_001), vnd(300_000))).isFalse();
	}

	@Test
	@DisplayName("hoá đơn 0đ hoặc âm thì không đổi được gì")
	void hoa_don_khong_hop_le() {
		assertThat(TranDoiDiem.toiDaChoHoaDon(vnd(0))).isEqualByComparingTo(BigDecimal.ZERO);
		assertThat(TranDoiDiem.toiDaChoHoaDon(null)).isEqualByComparingTo(BigDecimal.ZERO);
		assertThat(TranDoiDiem.chapNhan(vnd(10_000), vnd(0))).isFalse();
	}
}
