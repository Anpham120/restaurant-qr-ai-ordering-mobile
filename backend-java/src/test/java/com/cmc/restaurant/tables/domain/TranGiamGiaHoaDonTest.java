package com.cmc.restaurant.tables.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Trần tổng giảm giá trên hoá đơn")
class TranGiamGiaHoaDonTest {

	private static BigDecimal vnd(long v) {
		return BigDecimal.valueOf(v);
	}

	@Test
	@DisplayName("hai nguồn đều hợp lệ nhưng cộng lại vượt trần thì bị cắt")
	void cong_lai_vuot_tran_thi_bi_cat() {
		// Hoá đơn 760.000: mã quán giảm 152.000 (20%) + đổi điểm 200.000 = 352.000.
		// Từng khoản đều nằm trong hạn mức riêng, tổng thì không.
		assertThat(TranGiamGiaHoaDon.cat(vnd(352_000), vnd(760_000)))
				.isEqualByComparingTo(vnd(380_000).min(vnd(352_000)));
		assertThat(TranGiamGiaHoaDon.cat(vnd(500_000), vnd(760_000)))
				.isEqualByComparingTo(vnd(380_000));
	}

	@Test
	@DisplayName("dưới trần thì giữ nguyên, không cắt oan")
	void duoi_tran_thi_giu_nguyen() {
		assertThat(TranGiamGiaHoaDon.cat(vnd(100_000), vnd(760_000)))
				.isEqualByComparingTo(vnd(100_000));
	}

	@Test
	@DisplayName("đúng bằng trần thì giữ nguyên")
	void dung_bang_tran() {
		assertThat(TranGiamGiaHoaDon.cat(vnd(380_000), vnd(760_000)))
				.isEqualByComparingTo(vnd(380_000));
	}

	@Test
	@DisplayName("không bao giờ trả về số âm hay vượt tạm tính")
	void khong_am_khong_vuot() {
		// Tổng giảm âm là dữ liệu hỏng, không phải một khoản cộng thêm cho khách.
		assertThat(TranGiamGiaHoaDon.cat(vnd(-50_000), vnd(760_000))).isEqualByComparingTo(BigDecimal.ZERO);
		// Trần luôn nhỏ hơn tạm tính vì tỷ lệ dưới 100%, nên tổng không bao giờ ăn hết hoá đơn.
		assertThat(TranGiamGiaHoaDon.cat(vnd(9_999_999), vnd(100_000)))
				.isEqualByComparingTo(vnd(50_000));
	}

	@Test
	@DisplayName("hoá đơn 0đ thì không giảm được gì")
	void hoa_don_rong() {
		assertThat(TranGiamGiaHoaDon.toiDa(BigDecimal.ZERO)).isEqualByComparingTo(BigDecimal.ZERO);
		assertThat(TranGiamGiaHoaDon.cat(vnd(10_000), BigDecimal.ZERO)).isEqualByComparingTo(BigDecimal.ZERO);
	}
}
