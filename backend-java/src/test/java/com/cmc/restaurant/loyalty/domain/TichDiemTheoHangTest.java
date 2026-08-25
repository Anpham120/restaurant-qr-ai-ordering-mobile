package com.cmc.restaurant.loyalty.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Công thức tích điểm khi có hệ số hạng. */
@DisplayName("Tích điểm theo hạng")
class TichDiemTheoHangTest {

	private static BigDecimal vnd(long v) {
		return BigDecimal.valueOf(v);
	}

	@Test
	@DisplayName("hạng Bạc giữ nguyên tỷ lệ cũ: 1 điểm mỗi 10.000đ")
	void bac_giu_nguyen_ty_le_cu() {
		// Bản vẽ giao diện ghi hoá đơn 330.000đ được 38 điểm. Tỷ lệ thật cho 33.
		assertThat(LoyaltyMember.pointsFor(vnd(330_000), MemberTier.BAC)).isEqualTo(33);
		assertThat(LoyaltyMember.pointsFor(vnd(330_000))).isEqualTo(33);
	}

	@Test
	@DisplayName("hạng Vàng nhân 1,25 TRƯỚC khi chia")
	void vang_nhan_truoc_khi_chia() {
		// 330.000 × 1,25 = 412.500 → 41 điểm.
		// Nhân SAU khi chia cho 41 luôn ở ca này, nhưng sai ở ca dưới — nên phải có cả hai.
		assertThat(LoyaltyMember.pointsFor(vnd(330_000), MemberTier.VANG)).isEqualTo(41);
	}

	@Test
	@DisplayName("nhân trước hay nhân sau CHO KẾT QUẢ KHÁC NHAU")
	void nhan_truoc_khac_nhan_sau() {
		// 195.000đ hạng Vàng:
		//   đúng  — 195.000 × 1,25 = 243.750 → 24 điểm
		//   sai   — floor(195.000 / 10.000) = 19, rồi 19 × 1,25 = 23,75 → 23 điểm
		// Chênh một điểm mỗi hoá đơn, và luôn chênh về phía bất lợi cho khách.
		assertThat(LoyaltyMember.pointsFor(vnd(195_000), MemberTier.VANG)).isEqualTo(24);
	}

	@Test
	@DisplayName("hạng Kim cương nhân 1,5")
	void kim_cuong_nhan_mot_ruoi() {
		assertThat(LoyaltyMember.pointsFor(vnd(330_000), MemberTier.KIM_CUONG)).isEqualTo(49);
	}

	@Test
	@DisplayName("chia nhỏ hoá đơn KHÔNG lợi hơn trả một lần")
	void chia_nho_khong_loi_hon() {
		// Tính chất này đã có từ trước và hệ số không được phá nó.
		int motLan = LoyaltyMember.pointsFor(vnd(99_000), MemberTier.KIM_CUONG);
		int chiaBa = 3 * LoyaltyMember.pointsFor(vnd(33_000), MemberTier.KIM_CUONG);
		assertThat(chiaBa).isLessThanOrEqualTo(motLan);
	}

	@Test
	@DisplayName("hoá đơn quá nhỏ thì không ra điểm nào, ở mọi hạng")
	void hoa_don_qua_nho() {
		assertThat(LoyaltyMember.pointsFor(vnd(5_000), MemberTier.KIM_CUONG)).isEqualTo(0);
		assertThat(LoyaltyMember.pointsFor(vnd(0), MemberTier.VANG)).isEqualTo(0);
		assertThat(LoyaltyMember.pointsFor(null, MemberTier.VANG)).isEqualTo(0);
	}

	@Test
	@DisplayName("hạng null coi như Bạc, không nổ")
	void hang_null_coi_nhu_bac() {
		assertThat(LoyaltyMember.pointsFor(vnd(330_000), null)).isEqualTo(33);
	}
}
