package com.cmc.restaurant.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * JWT issuing/validation for the Java backend. Same contract as the .NET {@code JwtTokenService}
 * (issuer/audience/subject/role/expiry claims, Bearer token), but built on a standard library
 * (JJWT) instead of the hand-rolled HMAC signer .NET uses — per the plan's own decision
 * (docs/pm/KE_HOACH_HOC_KY_2026-2.md §5.4): preserve the invariants, not the exact mechanism.
 */
@Service
public class JwtService {

	private final JwtProperties properties;
	private final Key signingKey;

	public JwtService(JwtProperties properties) {
		this.properties = properties;
		this.signingKey = Keys.hmacShaKeyFor(
				properties.signingKey().getBytes(StandardCharsets.UTF_8));
	}

	public record IssuedToken(String accessToken, Instant expiresAt) {
	}

	public IssuedToken issueToken(UserEntity user) {
		Instant now = Instant.now();
		Instant expiresAt = now.plus(Math.max(1, properties.accessTokenMinutes()), ChronoUnit.MINUTES);

		String token = Jwts.builder()
				.issuer(properties.issuer())
				.audience().add(properties.audience()).and()
				.subject(user.getId())
				.claim("name", user.getFullName())
				.claim("email", user.getEmail())
				.claim("role", user.getRole())
				.claim("auth_version", user.securityStampTicks())
				.issuedAt(Date.from(now))
				.notBefore(Date.from(now))
				.expiration(Date.from(expiresAt))
				.signWith(signingKey)
				.compact();

		return new IssuedToken(token, expiresAt);
	}

	public record AuthenticatedUser(String userId, String fullName, String email, String role) {
	}

	/** Returns empty when the token is missing, expired, mis-signed, or carries an unknown role. */
	public Optional<AuthenticatedUser> parseToken(String token) {
		Claims claims;
		try {
			claims = Jwts.parser()
					.verifyWith((javax.crypto.SecretKey) signingKey)
					.requireIssuer(properties.issuer())
					.requireAudience(properties.audience())
					.build()
					.parseSignedClaims(token)
					.getPayload();
		} catch (JwtException | IllegalArgumentException e) {
			return Optional.empty();
		}

		String role = claims.get("role", String.class);
		if (role == null || !UserRole.ALL.contains(role)) {
			return Optional.empty();
		}

		return Optional.of(new AuthenticatedUser(
				claims.getSubject(),
				claims.get("name", String.class),
				claims.get("email", String.class),
				role));
	}
}
