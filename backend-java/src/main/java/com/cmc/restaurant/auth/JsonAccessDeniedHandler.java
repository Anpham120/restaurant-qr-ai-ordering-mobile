package com.cmc.restaurant.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/** Authenticated but wrong role must use the standard error shape too, not Spring's default JSON. */
@Component
public class JsonAccessDeniedHandler implements AccessDeniedHandler {

	private final ObjectMapper objectMapper;

	public JsonAccessDeniedHandler(ObjectMapper objectMapper) {
		this.objectMapper = objectMapper;
	}

	@Override
	public void handle(
			HttpServletRequest request, HttpServletResponse response, AccessDeniedException accessDeniedException)
			throws java.io.IOException {
		response.setStatus(HttpServletResponse.SC_FORBIDDEN);
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.getWriter().write(objectMapper.writeValueAsString(Map.of(
				"error", Map.of(
						"code", "FORBIDDEN",
						"message", "You do not have permission to perform this action.",
						"details", Map.of()))));
	}
}
