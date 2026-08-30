package com.cmc.restaurant;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
	private static final Path DEPLOY_SH = GOC.resolve("deploy/scripts/deploy-vps.sh");
	private static final Path CD_WORKFLOW = GOC.resolve(".github/workflows/cd.yml");
	private static final Path ENV_PROD = GOC.resolve("deploy/env/production.example.env");
	private static final Path ENV_STAGING = GOC.resolve("deploy/env/staging.example.env");

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

	@Test
	@DisplayName("Workflow triển khai cấp ĐỦ mọi biến deploy-vps.sh đòi")
	void theWorkflowSuppliesEveryRequiredVariable() throws IOException {
		// deploy-vps.sh thoát ngay khi thiếu một biến — nhưng nó thoát TRÊN ĐƯỜNG tới máy chủ, sau
		// khi workflow đã chạy phép kiểm và người duyệt đã bấm đồng ý. Thiếu một cái tên ở đây
		// nghĩa là phát hiện ra vào đúng lúc đang triển khai, chứ không phải lúc sửa mã.
		//
		// Ghi chú trong chính deploy-vps.sh mô tả một phép kiểm như thế này ở
		// frontend/src/utils/deploymentWorkflowEnv.test.ts — tệp đó không còn tồn tại, nên luật
		// được dựng lại ở đây.
		String sh = Files.readString(DEPLOY_SH);
		Matcher khoi = Pattern.compile("required_vars=\\(([^)]*)\\)").matcher(sh);
		assertThat(khoi.find()).as("không thấy khối required_vars trong deploy-vps.sh").isTrue();

		Set<String> doiHoi = new LinkedHashSet<>();
		for (String dong : khoi.group(1).split("\\s+")) {
			String ten = dong.trim();
			// Bỏ dòng trống và ghi chú — comment nằm TRONG ngoặc sẽ thành tên biến giả.
			if (!ten.isEmpty() && !ten.startsWith("#") && ten.matches("[A-Z][A-Z0-9_]*")) {
				doiHoi.add(ten);
			}
		}
		assertThat(doiHoi).as("khối required_vars đọc ra rỗng").isNotEmpty();

		String wf = Files.readString(CD_WORKFLOW);
		Set<String> thieu = new LinkedHashSet<>();
		for (String ten : doiHoi) {
			// Workflow phải gán biến đó trong khối env: "TEN:".
			if (!wf.contains(ten + ":")) {
				thieu.add(ten);
			}
		}

		assertThat(thieu)
				.as("cd.yml không cấp biến mà deploy-vps.sh đòi — script sẽ thoát giữa chừng, "
						+ "sau khi đã qua cửa duyệt")
				.isEmpty();
	}

	@Test
	@DisplayName("production và staging KHÔNG dùng chung cổng nào")
	void theTwoEnvironmentsShareNoPort() throws IOException {
		// Hai môi trường chạy trên CÙNG một máy — đó là lý do chúng có COMPOSE_PROJECT_NAME riêng.
		// Nhưng tách project không tách cổng: compose vẫn gắn cổng ra máy chủ, nên trùng số thì môi
		// trường lên sau chết với "port is already allocated", và người triển khai thấy một lỗi
		// Docker chứ không thấy nguyên nhân là hai tệp cấu hình ghi cùng một con số.
		//
		// Lỗi có thật: cả hai tệp đều để AI_SERVICE_PORT=8001.
		Map<String, String> prod = docCong(ENV_PROD);
		Map<String, String> staging = docCong(ENV_STAGING);

		assertThat(prod).as("không đọc được cổng nào từ tệp production").isNotEmpty();

		Set<String> trung = new LinkedHashSet<>(prod.values());
		trung.retainAll(new LinkedHashSet<>(staging.values()));

		assertThat(trung)
				.as("production %s và staging %s dùng chung cổng — môi trường lên sau sẽ không "
						+ "khởi động được", prod, staging)
				.isEmpty();
	}

	@Test
	@DisplayName("Cổng publish của compose CHỈ dùng biến mà tệp env có khai")
	void everyPublishedPortUsesAKnownVariable() throws IOException {
		// Dùng một tên biến không tệp env nào khai thì compose lặng lẽ rơi về giá trị mặc định
		// trong chính tệp compose. Hai hậu quả đã gặp thật:
		//   1. api rơi về 8081, đụng FRONTEND_PORT=8081 -> "port is already allocated";
		//   2. write-nginx-config.sh proxy tới BACKEND_PORT=5001 trong khi api nghe 8081, nên kể
		//      cả không đụng cổng thì nginx cũng trỏ vào chỗ không ai trả lời.
		//
		// Phép kiểm cổng ở trên KHÔNG bắt được: nó so hai tệp env với nhau, còn lỗi này nằm ở chỗ
		// compose đọc một cái tên thứ ba.
		String compose = Files.readString(COMPOSE);
		Matcher dong = Pattern.compile("(?m)^\\s*- \"([^\"]*\\$\\{[^\"]*)\"").matcher(compose);

		Set<String> dungTrongPorts = new LinkedHashSet<>();
		while (dong.find()) {
			Matcher bien = Pattern.compile("\\$\\{([A-Z][A-Z0-9_]*)").matcher(dong.group(1));
			while (bien.find()) {
				dungTrongPorts.add(bien.group(1));
			}
		}
		assertThat(dungTrongPorts).as("không đọc được biến nào từ khối ports").isNotEmpty();

		String envStaging = Files.readString(ENV_STAGING);
		String envProd = Files.readString(ENV_PROD);
		Set<String> khongKhai = new LinkedHashSet<>();
		for (String ten : dungTrongPorts) {
			// BIND là địa chỉ gắn, không phải cổng, và chỉ khai ở môi trường công khai.
			if (ten.endsWith("_BIND")) {
				continue;
			}
			if (!envStaging.contains(ten + "=") && !envProd.contains(ten + "=")) {
				khongKhai.add(ten);
			}
		}

		assertThat(khongKhai)
				.as("compose publish cổng theo biến mà không tệp env nào khai — nó sẽ lặng lẽ dùng "
						+ "mặc định, và không ai biết cho tới lúc đụng cổng hoặc nginx trỏ sai")
				.isEmpty();
	}

	/** Mọi dòng {@code TEN_PORT=so} trong một tệp env. */
	private static Map<String, String> docCong(Path tep) throws IOException {
		assertThat(tep).as("không thấy tệp env mẫu").exists();
		Matcher m = Pattern.compile("(?m)^([A-Z_]*PORT)=(\\d+)$").matcher(Files.readString(tep));
		Map<String, String> cong = new LinkedHashMap<>();
		while (m.find()) {
			cong.put(m.group(1), m.group(2));
		}
		return cong;
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
