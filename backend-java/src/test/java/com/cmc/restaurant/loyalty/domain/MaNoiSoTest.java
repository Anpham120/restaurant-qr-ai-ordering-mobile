package com.cmc.restaurant.loyalty.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Mã nối số ở quầy")
class MaNoiSoTest {

	@Test
	@DisplayName("luôn đúng sáu chữ số, không bao giờ bắt đầu bằng 0")
	void luon_sau_chu_so() {
		// Mã bắt đầu bằng 0 thì khách đọc "không sáu ba..." và nhân viên rất dễ bỏ mất chữ số đầu,
		// rồi cả hai loay hoay với một mã năm chữ số không hiểu vì sao sai.
		for (int i = 0; i < 2_000; i++) {
			assertThat(MaNoiSo.sinh()).matches("[1-9][0-9]{5}");
		}
	}

	@Test
	@DisplayName("không lặp lại trong 5.000 lần sinh")
	void khong_lap_lai_nhieu() {
		// Sáu chữ số thì trùng là chuyện sẽ xảy ra, nhưng một bộ sinh HỎNG — hằng số, hạt giống cố
		// định — sẽ lộ ra ngay ở tỷ lệ trùng.
		Set<String> da = new HashSet<>();
		for (int i = 0; i < 5_000; i++) {
			da.add(MaNoiSo.sinh());
		}
		assertThat(da).hasSizeGreaterThan(4_900);
	}

	@Test
	@DisplayName("chuẩn hoá thứ nhân viên gõ lại từ lời khách đọc")
	void chuan_hoa() {
		assertThat(MaNoiSo.chuanHoa(" 123-456 ")).isEqualTo("123456");
		assertThat(MaNoiSo.chuanHoa("123 456")).isEqualTo("123456");
		assertThat(MaNoiSo.chuanHoa(null)).isEmpty();
	}
}
