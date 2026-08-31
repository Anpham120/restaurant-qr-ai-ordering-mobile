package com.cmc.restaurant.shared;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Tách danh sách origin.
 *
 * <p><b>LỖI CÓ THẬT, đo trên máy chủ đang chạy:</b> preflight từ cả năm cổng web đều trả 403 và
 * không có header {@code Access-Control-Allow-Origin} nào — kể cả hai domain CÓ mặt trong biến
 * cấu hình. Nguyên nhân là biến khai bằng dấu chấm phẩy, còn Spring tách {@code List<String>} theo
 * dấu phẩy, nên cả chuỗi trở thành MỘT origin không bao giờ khớp.
 *
 * <p>Triệu chứng chỉ hiện trong bảng điều khiển trình duyệt. Máy chủ vẫn xanh và mọi phép thử bằng
 * curl vẫn chạy — vì curl không gửi header {@code Origin}. Đó là lý do lỗi này sống được qua mọi
 * lượt kiểm sức khoẻ.
 */
class CorsPropertiesTest {

	@Test
	@DisplayName("Dấu CHẤM PHẨY — cách tài liệu triển khai đang ghi")
	void splitsOnSemicolons() {
		// Spring đưa vào đúng một phần tử vì nó chỉ tách theo dấu phẩy. Đây là hình dạng thật của
		// dữ liệu lúc lỗi xảy ra.
		CorsProperties p = new CorsProperties(
				List.of("http://a.example;http://b.example;http://c.example"));

		assertThat(p.allowedOrigins())
				.containsExactly("http://a.example", "http://b.example", "http://c.example");
	}

	@Test
	@DisplayName("Dấu PHẨY — cách Spring tự tách")
	void splitsOnCommas() {
		CorsProperties p = new CorsProperties(List.of("http://a.example", "http://b.example"));

		assertThat(p.allowedOrigins()).containsExactly("http://a.example", "http://b.example");
	}

	@Test
	@DisplayName("Trộn cả hai dấu vẫn ra đúng")
	void handlesAMixOfSeparators() {
		CorsProperties p = new CorsProperties(
				List.of("http://a.example, http://b.example;http://c.example"));

		assertThat(p.allowedOrigins())
				.containsExactly("http://a.example", "http://b.example", "http://c.example");
	}

	@Test
	@DisplayName("Cắt khoảng trắng — người ta hay gõ dấu cách sau dấu phân tách")
	void trimsWhitespace() {
		// Một origin thừa dấu cách KHÔNG khớp header Origin, và trình duyệt chỉ nói "CORS blocked".
		CorsProperties p = new CorsProperties(List.of(" http://a.example ; http://b.example "));

		assertThat(p.allowedOrigins()).containsExactly("http://a.example", "http://b.example");
	}

	@Test
	@DisplayName("Rỗng thì về '*' — máy phát triển vẫn chạy được")
	void fallsBackToWildcard() {
		assertThat(new CorsProperties(null).allowedOrigins()).containsExactly("*");
		assertThat(new CorsProperties(List.of()).allowedOrigins()).containsExactly("*");
		assertThat(new CorsProperties(List.of("  ", ";")).allowedOrigins()).containsExactly("*");
	}

	@Test
	@DisplayName("Bỏ trùng lặp")
	void dropsDuplicates() {
		CorsProperties p = new CorsProperties(List.of("http://a.example;http://a.example"));

		assertThat(p.allowedOrigins()).containsExactly("http://a.example");
	}
}
