package com.cmc.restaurant.orders;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.regex.Pattern;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Orders.RequestIdempotency} (.NET). */
final class RequestIdempotency {

	static final String HEADER_NAME = "Idempotency-Key";
	private static final int MAX_KEY_LENGTH = 100;
	private static final Pattern KEY_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

	private RequestIdempotency() {
	}

	static String readValid(HttpServletRequest request) {
		String candidate = request.getHeader(HEADER_NAME);
		if (candidate == null) {
			return null;
		}
		candidate = candidate.trim();
		if (candidate.isEmpty() || candidate.length() > MAX_KEY_LENGTH || !KEY_PATTERN.matcher(candidate).matches()) {
			return null;
		}
		return candidate;
	}

	static String computeFingerprint(Object body) {
		try {
			String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(body);
			byte[] hash = MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8));
			StringBuilder hex = new StringBuilder();
			for (byte b : hash) {
				hex.append(String.format("%02x", b));
			}
			return hex.toString();
		} catch (NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException e) {
			throw new IllegalStateException(e);
		}
	}
}
