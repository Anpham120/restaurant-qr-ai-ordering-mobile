package com.cmc.restaurant.tables;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Tables.TableSessionCapability} (.NET). Header-based
 * (not Authorization/Bearer) because it authorizes a table session, not a user account — the
 * anonymous QR flow has no user account at all. Only the current purpose version is implemented
 * (no legacy v1 fallback — there is no pre-existing Java-issued token to stay compatible with). */
@Component
public class TableSessionCapability {

	private static final String PURPOSE = "restaurant-qr-ai-ordering:table-session-capability:v2";
	private static final String HEADER = "X-Table-Session-Token";

	public Optional<String> readToken(HttpServletRequest request) {
		String value = request.getHeader(HEADER);
		return (value == null || value.isBlank()) ? Optional.empty() : Optional.of(value);
	}

	public boolean isValid(TableSessionEntity session, String suppliedToken, String signingKey) {
		return CapabilityTokenSigner.isValid(suppliedToken, signingKey, PURPOSE, session.getId());
	}

	public String createToken(TableSessionEntity session, String signingKey) {
		return CapabilityTokenSigner.createToken(signingKey, PURPOSE, session.getId());
	}
}
