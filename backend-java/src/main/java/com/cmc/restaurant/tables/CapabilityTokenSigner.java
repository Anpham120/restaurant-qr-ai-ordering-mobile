package com.cmc.restaurant.tables;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Byte-compatible port of {@code RestaurantQrAiOrdering.Api.Auth.CapabilityTokenSigner} (.NET):
 * HMAC-SHA256(HMAC-SHA256(signingKey, purpose), payload), base64url-encoded. */
// Widened from package-private to public in issue #14: the Chat module signs its own capability
// tokens with a different purpose string, exactly as ChatSessionCapability does in .NET.
public final class CapabilityTokenSigner {

	private static final String ALGORITHM = "HmacSHA256";

	private CapabilityTokenSigner() {
	}

	public static String createToken(String signingKey, String purpose, String payload) {
		return encode(createSignature(signingKey, purpose, payload));
	}

	public static boolean isValid(String suppliedToken, String signingKey, String purpose, String payload) {
		byte[] supplied;
		try {
			supplied = decode(suppliedToken);
		} catch (IllegalArgumentException e) {
			return false;
		}
		byte[] expected = createSignature(signingKey, purpose, payload);
		return constantTimeEquals(expected, supplied);
	}

	private static byte[] createSignature(String signingKey, String purpose, String payload) {
		if (signingKey == null || signingKey.isBlank()) {
			throw new IllegalStateException("A signing key is required for session capabilities.");
		}
		byte[] purposeKey = hmac(signingKey.getBytes(StandardCharsets.UTF_8), purpose.getBytes(StandardCharsets.UTF_8));
		return hmac(purposeKey, payload.getBytes(StandardCharsets.UTF_8));
	}

	private static byte[] hmac(byte[] key, byte[] message) {
		try {
			Mac mac = Mac.getInstance(ALGORITHM);
			mac.init(new SecretKeySpec(key, ALGORITHM));
			return mac.doFinal(message);
		} catch (NoSuchAlgorithmException | InvalidKeyException e) {
			throw new IllegalStateException("HMAC-SHA256 is not available on this JVM", e);
		}
	}

	private static boolean constantTimeEquals(byte[] a, byte[] b) {
		if (a.length != b.length) {
			return false;
		}
		int diff = 0;
		for (int i = 0; i < a.length; i++) {
			diff |= a[i] ^ b[i];
		}
		return diff == 0;
	}

	private static String encode(byte[] bytes) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private static byte[] decode(String value) {
		return Base64.getUrlDecoder().decode(value);
	}
}
