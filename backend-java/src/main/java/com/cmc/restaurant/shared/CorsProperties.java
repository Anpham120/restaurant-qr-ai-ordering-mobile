package com.cmc.restaurant.shared;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Allowed browser origins, configurable instead of hardcoded.
 *
 * <p>Raised during the review of PR #47 (issue #13): the STOMP endpoint shipped with
 * {@code setAllowedOriginPatterns("*")} hardcoded, while the .NET deployment has always taken
 * {@code CORS_ALLOWED_ORIGINS} from the environment. Packaging is the right moment to close that
 * gap — a value baked into the image cannot be tightened per deployment.
 *
 * <p>The default stays permissive because the Java build is local-only for this course; the point
 * is that a deployment can now override it without rebuilding.
 */
@ConfigurationProperties(prefix = "cors")
public record CorsProperties(List<String> allowedOrigins) {

	public CorsProperties {
		allowedOrigins = tach(allowedOrigins);
		if (allowedOrigins.isEmpty()) {
			allowedOrigins = List.of("*");
		}
	}

	/**
	 * Tách lại danh sách, nhận CẢ dấu phẩy lẫn dấu chấm phẩy.
	 *
	 * <p><b>LỖI CÓ THẬT.</b> Spring tự tách {@code List<String>} theo dấu PHẨY. Tài liệu triển khai
	 * lại ghi ví dụ dùng dấu chấm phẩy — di sản từ bản .NET, nơi {@code CORS_ALLOWED_ORIGINS} phân
	 * tách bằng {@code ;}. Khai bằng chấm phẩy thì Spring nhận đúng MỘT phần tử:
	 *
	 * <pre>
	 *   "http://a.example;http://b.example"   ← một chuỗi, không phải hai origin
	 * </pre>
	 *
	 * <p>Chuỗi đó không bao giờ khớp một header {@code Origin} thật, nên MỌI cổng web bị chặn —
	 * kể cả những domain có mặt trong danh sách. Đo trên máy chủ thật: preflight trả 403 cho cả
	 * năm cổng, và không có header {@code Access-Control-Allow-Origin} nào.
	 *
	 * <p>Hỏng kiểu này không có nửa vời: không phải một cổng lỗi mà tất cả, và triệu chứng chỉ hiện
	 * ra trong bảng điều khiển của trình duyệt. Máy chủ vẫn xanh, mọi lời gọi bằng curl vẫn chạy
	 * bình thường vì curl không gửi {@code Origin}. Nhận cả hai dấu rẻ hơn nhiều so với việc phụ
	 * thuộc vào một ký tự gõ đúng.
	 */
	private static List<String> tach(List<String> thoBan) {
		if (thoBan == null) {
			return List.of();
		}
		return thoBan.stream()
				.filter(java.util.Objects::nonNull)
				.flatMap(dong -> java.util.Arrays.stream(dong.split("[;,]")))
				.map(String::trim)
				.filter(s -> !s.isEmpty())
				.distinct()
				.toList();
	}
}
