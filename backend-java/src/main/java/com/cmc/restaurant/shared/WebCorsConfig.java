package com.cmc.restaurant.shared;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Applies {@link CorsProperties} to the REST endpoints, so the browser origin policy is set in one
 * place for both HTTP and the STOMP handshake. */
@Configuration
public class WebCorsConfig implements WebMvcConfigurer {

	private final CorsProperties corsProperties;

	public WebCorsConfig(CorsProperties corsProperties) {
		this.corsProperties = corsProperties;
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**")
				.allowedOriginPatterns(corsProperties.allowedOrigins().toArray(String[]::new))
				.allowedMethods("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS")
				.allowedHeaders("*");
	}

	/**
	 * CÙNG luật đó, nhưng ở dạng Spring Security dùng được.
	 *
	 * <p><b>LỖI CÓ THẬT.</b> Khai CORS chỉ qua {@link WebMvcConfigurer} là chưa đủ: nó chạy ở tầng
	 * MVC, tức SAU lớp phân quyền. Một preflight {@code OPTIONS} tới đường cần đăng nhập bị
	 * {@code anyRequest().authenticated()} chặn ở 401 trước khi CORS kịp trả lời — và câu trả lời
	 * 401 đó không mang header CORS nào, nên trình duyệt chặn luôn request thật.
	 *
	 * <p>Triệu chứng nhìn từ ngoài rất dễ đọc nhầm: đăng nhập trả 200 và token hợp lệ, nhưng app
	 * không tải được gì sau đó, y như "đăng nhập không vào được". Đo trên máy chủ thật:
	 *
	 * <pre>
	 *   OPTIONS /api/auth/login   (permitAll)     -> 200, có Access-Control-Allow-Origin
	 *   OPTIONS /api/users        (cần đăng nhập) -> 401, KHÔNG có header CORS nào
	 * </pre>
	 *
	 * <p>Vì sao mọi phép kiểm trước đó không thấy: chúng dùng {@code curl}, mà curl KHÔNG gửi
	 * preflight — nó bắn thẳng request kèm token nên luôn nhận 200. Chỉ trình duyệt thật mới đi
	 * qua đường này.
	 */
	@Bean
	public CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration cauHinh = new CorsConfiguration();
		cauHinh.setAllowedOriginPatterns(corsProperties.allowedOrigins());
		cauHinh.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
		cauHinh.setAllowedHeaders(List.of("*"));

		UrlBasedCorsConfigurationSource nguon = new UrlBasedCorsConfigurationSource();
		nguon.registerCorsConfiguration("/api/**", cauHinh);
		return nguon;
	}
}
