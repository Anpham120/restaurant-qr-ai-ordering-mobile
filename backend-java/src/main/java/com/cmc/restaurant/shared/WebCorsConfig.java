package com.cmc.restaurant.shared;

import org.springframework.context.annotation.Configuration;
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
}
