package com.cmc.restaurant.auth;

import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

/**
 * Byte-compatible port of {@code RestaurantQrAiOrdering.Api.Users.PasswordHasher} (.NET):
 * PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte salt, 32-byte hash, encoded as
 * {@code v1.<iterations>.<base64 salt>.<base64 hash>}. Kept identical on purpose so password
 * hashes stay valid regardless of which backend (this one or the .NET original) wrote them.
 */
@Component
public class PasswordHasher {

	private static final int SALT_SIZE_BYTES = 16;
	private static final int HASH_SIZE_BYTES = 32;
	private static final int ITERATIONS = 600_000;
	private static final String ALGORITHM = "PBKDF2WithHmacSHA256";

	private final SecureRandom secureRandom = new SecureRandom();

	public String hashPassword(String password) {
		byte[] salt = new byte[SALT_SIZE_BYTES];
		secureRandom.nextBytes(salt);
		byte[] hash = pbkdf2(password, salt, ITERATIONS);

		return "v1." + ITERATIONS + "." + encode(salt) + "." + encode(hash);
	}

	public boolean verifyPassword(String password, String passwordHash) {
		String[] parts = passwordHash.split("\\.");
		if (parts.length != 4 || !"v1".equals(parts[0])) {
			return false;
		}

		int iterations;
		try {
			iterations = Integer.parseInt(parts[1]);
		} catch (NumberFormatException e) {
			return false;
		}

		try {
			byte[] salt = decode(parts[2]);
			byte[] expectedHash = decode(parts[3]);
			byte[] actualHash = pbkdf2(password, salt, iterations, expectedHash.length);
			return constantTimeEquals(actualHash, expectedHash);
		} catch (IllegalArgumentException e) {
			return false;
		}
	}

	private byte[] pbkdf2(String password, byte[] salt, int iterations) {
		return pbkdf2(password, salt, iterations, HASH_SIZE_BYTES);
	}

	private byte[] pbkdf2(String password, byte[] salt, int iterations, int hashLengthBytes) {
		PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, hashLengthBytes * 8);
		try {
			SecretKeyFactory factory = SecretKeyFactory.getInstance(ALGORITHM);
			return factory.generateSecret(spec).getEncoded();
		} catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
			throw new IllegalStateException("PBKDF2 is not available on this JVM", e);
		} finally {
			spec.clearPassword();
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
		return Base64.getEncoder().encodeToString(bytes);
	}

	private static byte[] decode(String value) {
		return Base64.getDecoder().decode(value);
	}
}
