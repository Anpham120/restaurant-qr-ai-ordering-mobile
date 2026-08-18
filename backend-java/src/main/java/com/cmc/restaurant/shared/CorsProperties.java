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
		if (allowedOrigins == null || allowedOrigins.isEmpty()) {
			allowedOrigins = List.of("*");
		}
	}
}
