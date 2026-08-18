package com.cmc.restaurant.shared;

import java.nio.charset.StandardCharsets;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Orders.OrderAccessGuard.HasCustomerToken} (.NET) —
 * constant-time comparison of the per-order {@code X-Order-Token} capability token against the
 * order's stored access token. Shared between Orders and Payments (both gate customer access to
 * an order the same way), same as the .NET original. */
public final class CustomerTokenGuard {

	private CustomerTokenGuard() {
	}

	public static boolean hasCustomerToken(String accessToken, String provided) {
		if (accessToken == null || accessToken.isEmpty() || provided == null || provided.isEmpty()) {
			return false;
		}
		byte[] a = accessToken.getBytes(StandardCharsets.UTF_8);
		byte[] b = provided.getBytes(StandardCharsets.UTF_8);
		if (a.length != b.length) {
			return false;
		}
		int diff = 0;
		for (int i = 0; i < a.length; i++) {
			diff |= a[i] ^ b[i];
		}
		return diff == 0;
	}
}
