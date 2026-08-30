package com.cmc.restaurant.payments;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Chuỗi VietQR phải khớp TỪNG KÝ TỰ với mã thật.
 *
 * <p>Chuỗi đối chiếu dưới đây KHÔNG phải tôi tự nghĩ ra. Nó lấy bằng cách gọi
 * {@code https://qr.sepay.vn/img?acc=1041485738&bank=VCB&amount=125000&des=CMC%20DH123456} rồi
 * giải mã ảnh PNG trả về. Đó là điều làm phép kiểm này có giá trị: nếu tôi tự dựng cả chuỗi mong
 * đợi lẫn chuỗi được kiểm thì hai bên cùng sai theo một kiểu và phép kiểm vẫn xanh.
 *
 * <p>Lỗi mà phép kiểm này canh KHÔNG làm sập gì cả. Mã QR sai vẫn là một mã QR hợp lệ, vẫn hiện ra
 * đẹp đẽ, vẫn quét được — chỉ có app ngân hàng đọc xong thì từ chối. Không có ngoại lệ nào ném ra,
 * không có log nào đỏ. Chỉ có khách đứng ở quầy không trả được tiền.
 */
class EmvCoVietQrTest {

	/** Vietcombank. */
	private static final String BIN_VCB = "970436";

	private static final String TAI_KHOAN = "1041485738";

	/** Giải mã từ ảnh PNG do qr.sepay.vn trả về cho đúng bộ tham số ở ca kiểm dưới. */
	private static final String CHUAN_CUA_SEPAY =
			"00020101021238540010A0000007270124000697043601101041485738"
					+ "0208QRIBFTTA53037045406125000"
					+ "5802VN62160812CMC DH1234566304E93C";

	@Test
	@DisplayName("Khớp từng ký tự với mã thật của SePay")
	void matchesTheRealCodeCharacterForCharacter() {
		String duoc = EmvCoVietQr.taoChuoi(
				BIN_VCB, TAI_KHOAN, new BigDecimal("125000"), "CMC DH123456");

		assertThat(duoc).isEqualTo(CHUAN_CUA_SEPAY);
	}

	@Test
	@DisplayName("Bốn ký tự cuối là CRC, và nó tính TRÊN CẢ mã 6304")
	void theCrcCoversItsOwnTag() {
		// Bỏ "6304" ra khỏi phép tính là lỗi kinh điển: chuỗi vẫn đúng hình dạng, app ngân hàng
		// vẫn đọc được mọi trường, rồi từ chối ở bước cuối mà không nói gì về CRC.
		//
		// Ca này chốt bằng cách đổi MỘT ký tự trong nội dung: CRC phải đổi theo.
		String a = EmvCoVietQr.taoChuoi(BIN_VCB, TAI_KHOAN, new BigDecimal("125000"), "CMC DH123456");
		String b = EmvCoVietQr.taoChuoi(BIN_VCB, TAI_KHOAN, new BigDecimal("125000"), "CMC DH123457");

		assertThat(a).endsWith("6304E93C");
		assertThat(b.substring(b.length() - 4)).isNotEqualTo("E93C");
	}

	@Test
	@DisplayName("Số tiền bị CẮT phần lẻ, không làm tròn lên")
	void truncatesTheAmount() {
		// Làm tròn lên nghĩa là mã QR đòi nhiều hơn hoá đơn một đồng, và phần đối soát tự động so
		// số tiền sẽ không khớp — tiền về nhưng đơn không được đánh dấu đã trả.
		String s = EmvCoVietQr.taoChuoi(BIN_VCB, TAI_KHOAN, new BigDecimal("110000.99"), "CMC X");

		assertThat(s).contains("5406110000");
	}

	@Test
	@DisplayName("Độ dài trong TLV đếm theo giá trị thật, không phải số cố định")
	void lengthPrefixesFollowTheValue() {
		// Nội dung chuyển khoản dài ngắn khác nhau tuỳ mã hoá đơn. Ghi cứng độ dài thì chuỗi vẫn
		// "trông đúng" với một độ dài và hỏng với mọi độ dài khác.
		String ngan = EmvCoVietQr.taoChuoi(BIN_VCB, TAI_KHOAN, new BigDecimal("1000"), "CMC A");
		String dai = EmvCoVietQr.taoChuoi(
				BIN_VCB, TAI_KHOAN, new BigDecimal("1000"), "CMC INV-20260830-87E50884");

		assertThat(ngan).contains("62090805CMC A");
		assertThat(dai).contains("62290825CMC INV-20260830-87E50884");
	}
}
