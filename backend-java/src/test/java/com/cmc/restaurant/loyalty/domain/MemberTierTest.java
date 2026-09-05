package com.cmc.restaurant.loyalty.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Luật xếp hạng — xem lý lẽ nghiệp vụ ở javadoc của {@link MemberTier}. */
@DisplayName("Hạng thành viên")
class MemberTierTest {

	private static BigDecimal vnd(long v) {
		return BigDecimal.valueOf(v);
	}

	@Test
	@DisplayName("chưa chi đồng nào vẫn là thành viên, hạng Bạc")
	void mac_dinh_la_bac() {
		assertThat(MemberTier.theoChiTieu(vnd(0))).isEqualTo(MemberTier.BAC);
		assertThat(MemberTier.theoChiTieu(null)).isEqualTo(MemberTier.BAC);
	}

	@Test
	@DisplayName("đúng ngưỡng là ĐÃ lên hạng, không phải vượt mới lên")
	void dung_nguong_la_len_hang() {
		// Khách chi tròn 5 triệu mà vẫn ở hạng Bạc là thứ không giải thích được ở quầy.
		assertThat(MemberTier.theoChiTieu(vnd(5_000_000))).isEqualTo(MemberTier.VANG);
		assertThat(MemberTier.theoChiTieu(vnd(15_000_000))).isEqualTo(MemberTier.KIM_CUONG);
	}

	@Test
	@DisplayName("thiếu một đồng thì chưa lên")
	void thieu_mot_dong_thi_chua_len() {
		assertThat(MemberTier.theoChiTieu(vnd(4_999_999))).isEqualTo(MemberTier.BAC);
		assertThat(MemberTier.theoChiTieu(vnd(14_999_999))).isEqualTo(MemberTier.VANG);
	}

	@Test
	@DisplayName("chi tiêu vượt NHIỀU ngưỡng vẫn cho hạng cao nhất")
	void vuot_nhieu_nguong_van_dung() {
		// Lỗi kinh điển: duyệt từ hạng thấp lên rồi dừng ở ngưỡng đầu tiên khớp, cho ra hạng Vàng
		// cho một khách đã chi 40 triệu.
		assertThat(MemberTier.theoChiTieu(vnd(40_000_000))).isEqualTo(MemberTier.KIM_CUONG);
	}

	@Test
	@DisplayName("hệ số tăng dần theo hạng")
	void he_so_tang_dan() {
		assertThat(MemberTier.BAC.heSo()).isEqualByComparingTo("1.0");
		assertThat(MemberTier.VANG.heSo()).isEqualByComparingTo("1.25");
		assertThat(MemberTier.KIM_CUONG.heSo()).isEqualByComparingTo("1.5");
	}

	@Test
	@DisplayName("hạng cao nhất KHÔNG có hạng kế tiếp")
	void hang_cao_nhat_khong_co_hang_ke() {
		assertThat(MemberTier.KIM_CUONG.ke()).isNull();
		assertThat(MemberTier.BAC.ke()).isEqualTo(MemberTier.VANG);
		assertThat(MemberTier.VANG.ke()).isEqualTo(MemberTier.KIM_CUONG);
	}

	@Test
	@DisplayName("còn thiếu bao nhiêu để lên hạng")
	void con_thieu_bao_nhieu() {
		assertThat(MemberTier.conThieuDeLenHang(vnd(0))).isEqualByComparingTo(vnd(5_000_000));
		assertThat(MemberTier.conThieuDeLenHang(vnd(3_000_000))).isEqualByComparingTo(vnd(2_000_000));
		assertThat(MemberTier.conThieuDeLenHang(vnd(5_000_000))).isEqualByComparingTo(vnd(10_000_000));
	}

	@Test
	@DisplayName("hạng cao nhất thì còn thiếu 0, KHÔNG phải số âm")
	void hang_cao_nhat_thi_con_thieu_khong() {
		// Màn hình hiện thẳng con số này. "Còn -25.000.000đ để lên hạng" là câu vô nghĩa.
		assertThat(MemberTier.conThieuDeLenHang(vnd(40_000_000))).isEqualByComparingTo(BigDecimal.ZERO);
	}

	@Test
	@DisplayName("ngưỡng phải tăng dần theo thứ tự khai báo")
	void nguong_tang_dan_theo_thu_tu() {
		// datToiThieu() so theo ordinal. Nếu ai đó chèn một hạng mới sai chỗ, so sánh hạng sẽ âm
		// thầm cho phép đổi ưu đãi cao cấp mà không có test nào khác đỏ lên.
		MemberTier[] tatCa = MemberTier.values();
		for (int i = 1; i < tatCa.length; i++) {
			assertThat(tatCa[i].nguong())
					.as("nguong cua %s phai lon hon %s", tatCa[i], tatCa[i - 1])
					.isGreaterThan(tatCa[i - 1].nguong());
		}
	}

	@Test
	@DisplayName("so hạng: cao đạt mức thấp, thấp không đạt mức cao")
	void so_hang() {
		assertThat(MemberTier.KIM_CUONG.datToiThieu(MemberTier.BAC)).isTrue();
		assertThat(MemberTier.VANG.datToiThieu(MemberTier.VANG)).isTrue();
		assertThat(MemberTier.BAC.datToiThieu(MemberTier.VANG)).isFalse();
		assertThat(MemberTier.VANG.datToiThieu(MemberTier.KIM_CUONG)).isFalse();
	}
}