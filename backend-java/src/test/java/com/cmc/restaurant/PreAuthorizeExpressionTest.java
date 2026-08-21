package com.cmc.restaurant;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Biểu thức trong {@code @PreAuthorize} phải viết đúng — và đây là loại lỗi KHÔNG lộ ra lúc biên
 * dịch.
 *
 * <p>Spring Security phân giải chuỗi đó bằng SpEL lúc CHẠY. Một biểu thức hỏng như
 * {@code hasRole(Customer)} (thiếu nháy quanh tên vai) biên dịch sạch, Checkstyle sạch, và chỉ nổ
 * ở request đầu tiên chạm tới endpoint:
 *
 * <pre>
 * IllegalArgumentException: Failed to evaluate expression 'hasRole(Customer)'  → HTTP 500
 * </pre>
 *
 * <p>Đã xảy ra HAI LẦN trong repo này, cả hai lần vì shell nuốt mất dấu nháy đơn khi sinh mã. Cả
 * hai lần đều chỉ phát hiện được nhờ gọi thật vào endpoint. Phép kiểm này biến nó thành lỗi lúc
 * build.
 *
 * <p>Đọc thẳng mã nguồn thay vì quét annotation lúc chạy: quét lúc chạy cần dựng cả context
 * Spring, và nó vẫn không đánh giá biểu thức cho tới khi có request thật.
 */
class PreAuthorizeExpressionTest {

	private static final Path SRC = Path.of("src/main/java");

	/** Bắt mọi lời gọi hasRole/hasAnyRole và tham số của nó. */
	private static final Pattern LOI_GOI =
			Pattern.compile("has(?:Any)?Role\\s*\\(([^)]*)\\)");

	/** Tham số hợp lệ: chuỗi trong nháy đơn, phân tách bằng dấu phẩy. */
	private static final Pattern THAM_SO_HOP_LE =
			Pattern.compile("\\s*'[^']+'\\s*(,\\s*'[^']+'\\s*)*");

	@Test
	@DisplayName("Mọi hasRole/hasAnyRole trong @PreAuthorize đều có nháy quanh tên vai")
	void everyRoleArgumentIsQuoted() throws IOException {
		List<String> hong = new ArrayList<>();

		try (Stream<Path> files = Files.walk(SRC)) {
			for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
				String noiDung = Files.readString(file, StandardCharsets.UTF_8);
				for (String dong : noiDung.split("\n")) {
					if (!dong.contains("@PreAuthorize")) {
						continue;
					}
					Matcher m = LOI_GOI.matcher(dong);
					while (m.find()) {
						if (!THAM_SO_HOP_LE.matcher(m.group(1)).matches()) {
							hong.add(file.getFileName() + ": " + dong.trim());
						}
					}
				}
			}
		}

		assertThat(hong)
				.describedAs("Biểu thức @PreAuthorize thiếu nháy — sẽ thành HTTP 500 lúc chạy")
				.isEmpty();
	}

	@Test
	@DisplayName("Chính phép kiểm này phân biệt được đúng và sai")
	void theCheckItselfCanFail() {
		// Không có ca này thì một biểu thức chính quy viết sai sẽ khiến phép kiểm trên luôn xanh,
		// và cổng chặn thành đồ trang trí.
		assertThat(THAM_SO_HOP_LE.matcher("'Customer'").matches()).isTrue();
		assertThat(THAM_SO_HOP_LE.matcher("'Staff', 'Admin'").matches()).isTrue();
		assertThat(THAM_SO_HOP_LE.matcher("Customer").matches()).isFalse();
		assertThat(THAM_SO_HOP_LE.matcher("'Staff', Admin").matches()).isFalse();
		assertThat(THAM_SO_HOP_LE.matcher("").matches()).isFalse();
	}
}
