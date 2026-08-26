package com.cmc.restaurant.loyalty.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Mã ưu đãi đổi bằng điểm")
class MaUuDaiTest {

	@Test
	@DisplayName("không chứa ký tự dễ đọc nhầm")
	void khong_chua_ky_tu_de_nham() {
		// Khách đọc mã qua điện thoại; O/0 và I/1 lẫn nhau là một mã hỏng không ai hiểu vì sao.
		for (int i = 0; i < 500; i++) {
			assertThat(MaUuDai.sinh()).doesNotContainAnyWhitespaces()
					.matches("[ABCDEFGHJKMNPQRSTWXYZ23456789]{8}");
		}
	}

	@Test
	@DisplayName("không lặp lại trong 20.000 lần sinh")
	void khong_lap_lai() {
		// Không chứng minh được tính duy nhất bằng test, nhưng một bộ sinh hỏng — hằng số, hoặc
		// hạt giống cố định — sẽ lộ ra ngay ở đây.
		Set<String> da = new HashSet<>();
		for (int i = 0; i < 20_000; i++) {
			da.add(MaUuDai.sinh());
		}
		assertThat(da).hasSize(20_000);
	}

	@Test
	@DisplayName("chuẩn hoá thứ khách gõ: chữ thường, khoảng trắng, gạch nối")
	void chuan_hoa() {
		assertThat(MaUuDai.chuanHoa(" a7k2-m9x3 ")).isEqualTo("A7K2M9X3");
		assertThat(MaUuDai.chuanHoa("A7K2M9X3")).isEqualTo("A7K2M9X3");
	}

	@Test
	@DisplayName("chuỗi rỗng hoặc null thành rỗng, không nổ")
	void rong_khong_no() {
		assertThat(MaUuDai.chuanHoa(null)).isEmpty();
		assertThat(MaUuDai.chuanHoa("   ")).isEmpty();
	}
}
