package com.cmc.restaurant.shared;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Matches the existing .NET endpoint path ({@code GET /api/health}) so the same
 * Docker Compose healthcheck pattern (curl http://.../api/health) works unchanged.
 */
@RestController
public class HealthController {

	@GetMapping("/api/health")
	public Map<String, String> health() {
		return Map.of("status", "ok");
	}
}
