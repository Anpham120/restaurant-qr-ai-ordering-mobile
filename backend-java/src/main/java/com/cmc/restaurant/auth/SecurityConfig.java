package com.cmc.restaurant.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

	private final JwtAuthenticationFilter jwtAuthenticationFilter;
	private final JsonAuthenticationEntryPoint authenticationEntryPoint;
	private final JsonAccessDeniedHandler accessDeniedHandler;

	public SecurityConfig(
			JwtAuthenticationFilter jwtAuthenticationFilter,
			JsonAuthenticationEntryPoint authenticationEntryPoint,
			JsonAccessDeniedHandler accessDeniedHandler) {
		this.jwtAuthenticationFilter = jwtAuthenticationFilter;
		this.authenticationEntryPoint = authenticationEntryPoint;
		this.accessDeniedHandler = accessDeniedHandler;
	}

	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.exceptionHandling(exceptions -> exceptions
						.authenticationEntryPoint(authenticationEntryPoint)
						.accessDeniedHandler(accessDeniedHandler))
				.authorizeHttpRequests(authorize -> authorize
						.requestMatchers("/api/health", "/api/auth/register", "/api/auth/login", "/error").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/menu", "/api/tables/**").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/table-sessions").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/table-sessions/*").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/table-sessions/*/invoice").permitAll()
						// #96 — hai đường của khách trong phiên bàn. Xác thực bằng token năng lực bên trong
						// service (khách quét QR không có tài khoản), giống hệt đường /invoice ở trên.
						.requestMatchers(HttpMethod.GET, "/api/table-sessions/*/orders").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/table-sessions/*/assistance").permitAll()
						// Cart is part of the anonymous QR flow; the capability token gates it.
						.requestMatchers("/api/table-sessions/*/cart", "/api/table-sessions/*/cart/items").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/promotions/validate").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/orders").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/orders/*").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/orders/*/items/*/cancel").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/orders/*/payment").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/orders/*/payment/request").permitAll()
						// Casso authenticates with its own Secure-Token header, verified inside the
						// handler before the payload is touched — not with a JWT.
						.requestMatchers(HttpMethod.POST, "/api/payments/webhooks/casso").permitAll()
						// The WebSocket handshake carries no JWT; authorization happens per-SUBSCRIBE
						// in StompSubscriptionGuard, mirroring the .NET hub's Watch* guards.
						.requestMatchers("/hub/orders/**").permitAll()
						// Chat is an anonymous QR-customer flow: the table session gates opening a
						// chat, and X-Chat-Session-Token gates every message after that.
						.requestMatchers(HttpMethod.POST, "/api/chat/sessions").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/chat/sessions/*/messages").permitAll()
						.anyRequest().authenticated())
				.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

		return http.build();
	}
}
