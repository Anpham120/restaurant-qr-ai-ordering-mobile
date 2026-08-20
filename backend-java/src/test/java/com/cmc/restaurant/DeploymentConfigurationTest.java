package com.cmc.restaurant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Port của {@code DeploymentConfigurationTests.cs} (.NET) — #58.
 *
 * <p>Vì sao phải port chứ không để nó chết cùng {@code backend/} ở #59: đây là một bất biến TRIỂN
 * KHAI, không phải một bất biến của .NET. Nó không nằm trong mã backend nào cả — nó nằm giữa hai
 * tệp cấu hình, và nếu xoá bản .NET mà không mang nó theo thì bất biến vẫn còn nhưng không còn ai
 * canh. Đó là cách một cơ chế an toàn biến mất mà không ai nhận ra.
 *
 * <p>Và nó đã bắt được lỗi ngay khi được port: {@code docker-compose.java.yml} để
 * {@code BACKEND_AI_TIMEOUT_SECONDS} mặc định 12 trong khi {@code LLM_TIMEOUT_SECONDS} là 30 — tức
 * ĐẢO NGƯỢC quan hệ suốt thời gian bản Java tồn tại, và không có gì báo vì phép canh chỉ đọc tệp
 * compose của bản .NET.
 */
class DeploymentConfigurationTest {

	@Test
	@DisplayName("dịch vụ AI phải hết hạn TRƯỚC backend")
	void dich_vu_ai_het_han_truoc_backend() throws IOException {
		String compose = docCompose();

		int backendTimeout = docMacDinh(compose, "BACKEND_AI_TIMEOUT_SECONDS");
		int aiTimeout = docMacDinh(compose, "LLM_TIMEOUT_SECONDS");

		// Backend hết hạn trước nghĩa là nó cắt kết nối trong khi dịch vụ AI vẫn đang soạn câu
		// thoái hoá, nên khách nhận một lỗi thay vì một câu đọc được — trong khi câu đó đã sắp tới.
		assertThat(aiTimeout)
				.as("LLM_TIMEOUT_SECONDS (%d) phải nhỏ hơn BACKEND_AI_TIMEOUT_SECONDS (%d); nếu không "
						+ "backend hết hạn trước và khách nhận lỗi thay vì câu thoái hoá",
						aiTimeout, backendTimeout)
				.isLessThan(backendTimeout);
	}

	/**
	 * Đọc SỐ chứ không so chuỗi.
	 *
	 * <p>Một phép kiểm so chuỗi {@code "...:-30}"} sẽ xanh nếu ai đó đổi 30 thành 60 bằng cách viết
	 * khác đi, và đỏ vì lý do vô hại khi chỉ đổi cách trình bày. Lý do này lấy nguyên từ bản .NET và
	 * vẫn đúng.
	 */
	private static int docMacDinh(String compose, String ten) {
		Matcher m = Pattern.compile(Pattern.quote(ten) + ":\\s*\\$\\{" + Pattern.quote(ten) + ":-(\\d+)\\}")
				.matcher(compose);
		if (!m.find()) {
			return fail("không tìm thấy `" + ten + ": ${" + ten + ":-<số>}` trong "
					+ "docker-compose.java.yml — biến này là một đầu của bất biến hết hạn, nên nó "
					+ "biến mất là điều phải biết");
		}
		return Integer.parseInt(m.group(1));
	}

	private static String docCompose() throws IOException {
		return Files.readString(goc().resolve("deploy/docker-compose.java.yml"), StandardCharsets.UTF_8);
	}

	/** Test chạy với thư mục làm việc là {@code backend-java/}, nên gốc kho là thư mục cha. Dò lên
	 * thay vì viết cứng {@code ".."} để nó không phụ thuộc vào nơi Gradle được gọi. */
	private static Path goc() {
		Path p = Path.of("").toAbsolutePath();
		while (p != null && !Files.isDirectory(p.resolve("deploy"))) {
			p = p.getParent();
		}
		if (p == null) {
			throw new IllegalStateException("không tìm thấy gốc kho (thư mục chứa `deploy/`)");
		}
		return p;
	}
}
