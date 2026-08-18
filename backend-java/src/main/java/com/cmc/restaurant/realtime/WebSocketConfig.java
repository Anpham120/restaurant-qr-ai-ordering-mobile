package com.cmc.restaurant.realtime;

import com.cmc.restaurant.shared.CorsProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/** Replaces {@code app.MapHub<OrderUpdatesHub>("/hubs/orders")} (.NET). The endpoint path differs
 * ({@code /hub/orders}) because the wire protocol differs — a SignalR client cannot talk to a STOMP
 * broker, so reusing the old path would only produce confusing handshake failures. */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

	private final StompSubscriptionGuard subscriptionGuard;
	private final StompErrorHandler errorHandler;
	private final CorsProperties corsProperties;

	public WebSocketConfig(
			StompSubscriptionGuard subscriptionGuard, StompErrorHandler errorHandler,
			CorsProperties corsProperties) {
		this.subscriptionGuard = subscriptionGuard;
		this.errorHandler = errorHandler;
		this.corsProperties = corsProperties;
	}

	@Override
	public void registerStompEndpoints(StompEndpointRegistry registry) {
		// Was hardcoded to "*" until issue #16 — see CorsProperties for why packaging is where that
		// gets fixed.
		String[] origins = corsProperties.allowedOrigins().toArray(String[]::new);
		registry.setErrorHandler(errorHandler);
		registry.addEndpoint("/hub/orders").setAllowedOriginPatterns(origins).withSockJS();
		registry.addEndpoint("/hub/orders").setAllowedOriginPatterns(origins);
	}

	@Override
	public void configureMessageBroker(MessageBrokerRegistry registry) {
		// In-memory broker only. The .NET deployment runs a single API instance too, so no backplane
		// (SignalR Redis / STOMP relay) is needed to match its behaviour.
		registry.enableSimpleBroker("/topic");
	}

	@Override
	public void configureClientInboundChannel(ChannelRegistration registration) {
		// Registered on the INBOUND channel so it sees SUBSCRIBE frames before the broker does.
		registration.interceptors(subscriptionGuard);
	}
}
