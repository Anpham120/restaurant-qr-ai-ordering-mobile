package com.cmc.restaurant;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Tên biến môi trường ở tệp triển khai phải khớp với tên máy chủ thật sự đọc.
 *
 * <p>Lớp lỗi mà phép kiểm này canh KHÔNG bao giờ làm sập gì cả — nó chỉ làm cấu hình lặng lẽ biến
 * mất. Máy chủ chạy bình thường, webhook trả 401, mã QR báo thiếu cấu hình, và không có gì chỉ ra
 * rằng nguyên nhân là một cái tên gõ khác nhau ở hai tệp.
 *
 * <p>Hai lỗi có thật đã sống nhờ chỗ trống này:
 *
 * <ul>
 *   <li>{@code deploy-vps.sh} ghi {@code PAYMENTS__VIETQR__BANKID} (hai gạch dưới, quy ước .NET)
 *       trong khi {@code application.yml} đọc {@code PAYMENTS_VIETQR_BANKID} — nên cấu hình VietQR
 *       chưa bao giờ tới được backend Java khi triển khai.
 *   <li>Ba khoá thêm về sau — SePay, Firebase, Google — không được liệt kê trong compose, nên
 *       chúng không đi vào container dù đã khai đúng ở {@code .env}.
 * </ul>
 *
 * <p>Bản .NET có {@code DeploymentConfigurationTests}; bản Java thì không, và đó chính là lý do.
 */
class DeploymentConfigTest {

	private static final Path GOC = Path.of("..");
	private static final Path APPLICATION_YML = GOC.resolve("backend-java/src/main/resources/application.yml");
	private static final Path COMPOSE = GOC.resolve("deploy/docker-compose.java.yml");

	/** {@code ${TEN}} hoặc {@code ${TEN:mặc định}} hoặc {@code ${TEN:?bắt buộc}}. */
	private static final Pattern BIEN = Pattern.compile("\\$\\{([A-Z][A-Z0-9_]*)[:}]");

	/** Dòng gán trong khối {@code x-api-environment}: {@code   TEN: ...}. */
	private static final Pattern GAN = Pattern.compile("(?m)^  ([A-Z][A-Z0-9_]*):");

	/**
	 * Khoá mà một bản triển khai thật BẮT BUỘC đặt được từ bên ngoài.
	 *
	 * <p>Mỗi khoá ở đây điều khiển một cổng từ chối-mặc-định. Không truyền được vào container thì
	 * tính năng đó tắt im lặng: webhook SePay từ chối mọi lời gọi, đăng ký OTP từ chối mọi lời gọi,
	 * nút Google không hiện — và người triển khai chỉ thấy "không chạy", không thấy lý do.
	 */
	private static final List<String> PHAI_TRUYEN_DUOC = List.of(
			"JWT_SIGNING_KEY",
			"PAYMENTS_SEPAY_APIKEY",
			"PAYMENTS_VIETQR_BANKID",
			"PAYMENTS_VIETQR_ACCOUNTNUMBER",
			"PAYMENTS_VIETQR_ACCOUNTNAME",
			"FIREBASE_API_KEY",
			"FIREBASE_PROJECT_ID",
			"GOOGLE_CLIENT_ID",
			"AI_INTERNAL_TOKEN");

	@Test
	@DisplayName("Compose KHÔNG đặt biến nào máy chủ không đọc — bắt lỗi gõ sai tên")
	void composeSetsNothingTheServerIgnores() throws IOException {
		Set<String> mayChuDoc = docTen(APPLICATION_YML, BIEN);
		Set<String> composeDat = docTen(COMPOSE, GAN);

		// Biến của hạ tầng, không đi qua application.yml: Spring Boot tự nhận SPRING_*, còn
		// BACKEND_JAVA_PORT thì application.yml đọc nhưng dưới một tên khác.
		Set<String> boQua = Set.of("SPRING_DATASOURCE_URL", "SPRING_DATASOURCE_USERNAME",
				"SPRING_DATASOURCE_PASSWORD", "SPRING_FLYWAY_ENABLED");

		Set<String> thua = new LinkedHashSet<>(composeDat);
		thua.removeAll(mayChuDoc);
		thua.removeAll(boQua);

		assertThat(thua)
				.as("compose đặt biến mà application.yml không đọc — gõ sai tên thì cấu hình biến "
						+ "mất lặng lẽ, không có gì báo")
				.isEmpty();
	}

	@Test
	@DisplayName("Mọi khoá bảo mật đều truyền được từ ngoài vào container")
	void everySecurityKeyReachesTheContainer() throws IOException {
		Set<String> composeDat = docTen(COMPOSE, GAN);

		assertThat(composeDat)
				.as("thiếu khoá nào ở đây thì tính năng tương ứng TẮT IM LẶNG khi triển khai: "
						+ "cổng từ chối mọi lời gọi, và người triển khai không thấy lý do")
				.containsAll(PHAI_TRUYEN_DUOC);
	}

	@Test
	@DisplayName("Đọc được cả hai tệp — phép kiểm này vô dụng nếu đường dẫn sai")
	void bothFilesAreActuallyRead() throws IOException {
		// Không có ca này thì đổi cấu trúc thư mục sẽ làm hai phép kiểm trên so hai tập RỖNG với
		// nhau và luôn xanh.
		assertThat(docTen(APPLICATION_YML, BIEN)).isNotEmpty();
		assertThat(docTen(COMPOSE, GAN)).isNotEmpty();
	}

	private static Set<String> docTen(Path tep, Pattern mau) throws IOException {
		assertThat(tep).as("không thấy tệp cấu hình triển khai").exists();
		Matcher m = mau.matcher(Files.readString(tep));
		Set<String> ten = new LinkedHashSet<>();
		while (m.find()) {
			ten.add(m.group(1));
		}
		return ten;
	}
}
