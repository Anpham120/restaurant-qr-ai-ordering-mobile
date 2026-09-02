package com.cmc.restaurant.tables.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Tiền khách đưa và tiền thối.
 *
 * <p>Một phép trừ sai ở đây là quầy thối nhầm tiền cho khách thật, nên mọi ca đều viết bằng con số
 * người ta thật sự cầm trên tay.
 */
class TienKhachDuaTest {

	@Test
	@DisplayName("Khách đưa dư thì thối đúng phần dư")
	void givesBackTheDifference() {
		assertThat(TienKhachDua.thoiLai(new BigDecimal("35000"), new BigDecimal("50000")))
				.isEqualByComparingTo("15000");
		assertThat(TienKhachDua.thoiLai(new BigDecimal("110000"), new BigDecimal("200000")))
				.isEqualByComparingTo("90000");
	}

	@Test
	@DisplayName("Khách đưa đúng thì thối 0, KHÔNG phải null")
	void exactMoneyGivesZeroNotNull() {
		// Phân biệt được "đã đếm, không phải thối" với "không nhập gì". Trộn hai thứ này là mất khả
		// năng đối chiếu quỹ cuối ca.
		assertThat(TienKhachDua.thoiLai(new BigDecimal("35000"), new BigDecimal("35000")))
				.isEqualByComparingTo("0");
	}

	@Test
	@DisplayName("Không nhập thì trả null — khác hẳn nhập 0")
	void notEnteredIsNotZero() {
		// Bắt buộc nhập làm chậm quầy ở ca thường gặp nhất — khách đưa đúng tiền — mà không chặn
		// thêm nhầm lẫn nào. Nên để trống được, và để trống nghĩa là "không áp dụng".
		assertThat(TienKhachDua.thoiLai(new BigDecimal("35000"), null)).isNull();
	}

	@Test
	@DisplayName("Khách đưa THIẾU thì từ chối, không lặng lẽ ghi đã thu đủ")
	void refusesWhenTheCustomerPaysLess() {
		// Cho qua nghĩa là ghi "đã thu đủ" cho một hoá đơn trả thiếu, và cuối ca ngăn kéo lệch mà
		// không ai biết lệch ở đâu. Đây là ca đắt giá nhất tệp này.
		assertThatThrownBy(
				() -> TienKhachDua.thoiLai(new BigDecimal("35000"), new BigDecimal("30000")))
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("30000")
				.hasMessageContaining("35000");
	}

	@Test
	@DisplayName("Thiếu đúng một đồng cũng bị từ chối")
	void refusesEvenOneDongShort() {
		assertThatThrownBy(
				() -> TienKhachDua.thoiLai(new BigDecimal("35000"), new BigDecimal("34999")))
				.isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Phần lẻ bị CẮT, đúng cách đếm tiền Việt")
	void cutsTheFractionTheWayCashIsCounted() {
		// Không cắt thì một hoá đơn 35.000,00 và tờ 35.000 có thể lệch nhau vì phần thập phân của
		// kiểu số, và quầy nhận một lỗi "khách đưa thiếu" không thể giải thích được.
		assertThat(TienKhachDua.thoiLai(new BigDecimal("35000.00"), new BigDecimal("35000.99")))
				.isEqualByComparingTo("0");
		assertThat(TienKhachDua.thoiLai(new BigDecimal("34999.50"), new BigDecimal("35000")))
				.isEqualByComparingTo("1");
	}

	@Test
	@DisplayName("Số âm bị từ chối")
	void refusesNegativeMoney() {
		assertThatThrownBy(
				() -> TienKhachDua.thoiLai(new BigDecimal("35000"), new BigDecimal("-1000")))
				.isInstanceOf(ApiException.class);
	}
}
