package com.cmc.restaurant.loyalty;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.loyalty.domain.PhoneNumber;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Chuẩn hoá số điện thoại — khoá nối tài khoản với hồ sơ điểm.
 *
 * <p>Cùng một người phải cho ra CÙNG một chuỗi dù số đi vào hệ thống bằng đường nào. Hai đường có
 * thật, và chúng viết số khác nhau:
 *
 * <ul>
 *   <li>Thu ngân gõ tay lúc thanh toán: {@code 0901234567} — dạng trong nước.
 *   <li>Firebase trả về sau khi xác minh OTP: {@code +84901234567} — dạng E.164, bắt buộc theo
 *       chuẩn quốc tế, app không chọn được dạng khác.
 * </ul>
 *
 * <p>Giữ nguyên chữ số thì hai đường cho ra {@code 0901234567} và {@code 84901234567} — hai khoá
 * khác nhau. Hậu quả: khách đăng ký bằng OTP xong KHÔNG đăng nhập lại được bằng số mình vừa gõ,
 * và hồ sơ điểm tích ở quầy không bao giờ nối được với tài khoản đó — tức mất đúng lý do tính năng
 * này tồn tại.
 */
class PhoneNumberTest {

	@Test
	@DisplayName("Số của Firebase và số thu ngân gõ phải ra CÙNG một khoá")
	void theSameHumanGetsTheSameKeyFromEitherPath() {
		// Đây là ca đắt nhất trong tệp này. Hỏng ca này thì mọi ca khác xanh cũng vô nghĩa.
		assertThat(PhoneNumber.normalize("+84901234567"))
				.as("dạng E.164 của Firebase phải quy về đúng dạng thu ngân gõ")
				.isEqualTo(PhoneNumber.normalize("0901234567"));
	}

	@Test
	@DisplayName("Quy về dạng trong nước, không quy về dạng quốc tế")
	void normalisesToTheNationalForm() {
		// Chọn dạng trong nước vì dữ liệu đã có trong cơ sở dữ liệu là dạng đó — hồ sơ điểm nhập
		// tay ở quầy có trước tính năng OTP. Đổi sang dạng quốc tế thì mọi hồ sơ cũ mất khoá.
		assertThat(PhoneNumber.normalize("+84901234567")).isEqualTo("0901234567");
		assertThat(PhoneNumber.normalize("84901234567")).isEqualTo("0901234567");
		assertThat(PhoneNumber.normalize("0901234567")).isEqualTo("0901234567");
	}

	@Test
	@DisplayName("Số cố định cũng theo cùng luật")
	void handlesLandlines() {
		// +84 28 3822 1234 → 028 3822 1234. Cùng luật, độ dài khác.
		assertThat(PhoneNumber.normalize("+842838221234")).isEqualTo("02838221234");
	}

	@Test
	@DisplayName("Bỏ dấu cách, gạch, ngoặc — cùng một người gõ mỗi lần một kiểu")
	void stripsPunctuation() {
		assertThat(PhoneNumber.normalize("0901 234 567")).isEqualTo("0901234567");
		assertThat(PhoneNumber.normalize("0901-234-567")).isEqualTo("0901234567");
		assertThat(PhoneNumber.normalize("(090) 123 4567")).isEqualTo("0901234567");
		assertThat(PhoneNumber.normalize("+84 901 234 567")).isEqualTo("0901234567");
	}

	@Test
	@DisplayName("KHÔNG đụng vào số trong nước 10 chữ số bắt đầu bằng 08")
	void leavesNationalNumbersStartingWith08Alone() {
		// Luật "bắt đầu bằng 84 thì đổi thành 0" mà áp bừa sẽ cắt nhầm đây: `0846...` cũng bắt đầu
		// bằng chữ số 8 và 4 ở vị trí thứ hai, ba. Chốt theo độ dài mới phân biệt được — số trong
		// nước có 10 chữ số và mở đầu bằng 0, số kèm mã quốc gia thì không.
		assertThat(PhoneNumber.normalize("0846123456")).isEqualTo("0846123456");
		assertThat(PhoneNumber.normalize("0842345678")).isEqualTo("0842345678");
	}

	@Test
	@DisplayName("Rỗng và không có chữ số nào thì trả null")
	void returnsNullWhenThereAreNoDigits() {
		assertThat(PhoneNumber.normalize(null)).isNull();
		assertThat(PhoneNumber.normalize("")).isNull();
		assertThat(PhoneNumber.normalize("   ")).isNull();
		assertThat(PhoneNumber.normalize("khong-co-so")).isNull();
	}
}
