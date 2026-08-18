package com.cmc.restaurant.chat;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Reuses the env var names the .NET backend and docker-compose already use ({@code AI_SERVICE_URL},
 * {@code AI_INTERNAL_TOKEN}), so the Java backend can point at the same running Python service
 * without a second set of settings to keep in sync. */
@ConfigurationProperties(prefix = "chat.ai")
public record ChatProperties(String serviceUrl, String internalToken, int timeoutSeconds) {

	public ChatProperties {
		if (timeoutSeconds <= 0) {
			timeoutSeconds = 12;
		}
	}
}
