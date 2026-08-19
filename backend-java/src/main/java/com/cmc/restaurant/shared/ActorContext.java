package com.cmc.restaurant.shared;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.auth.UserRole;
import com.cmc.restaurant.orders.domain.Actor;
import org.springframework.security.core.Authentication;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Orders.ActorContext} (.NET): who initiated a state
 * change, for the status-history audit trail. Anonymous QR customers resolve to Customer.
 *
 * <p>Lives in the web-facing layer because it is built from a Spring {@code Authentication}; the
 * domain sees only {@link Actor}, which knows nothing about Spring Security. */
public record ActorContext(String userId, String role) {

	public static final ActorContext CUSTOMER = new ActorContext(null, UserRole.CUSTOMER);

	public static ActorContext fromAuthentication(Authentication authentication) {
		if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedPrincipal principal)) {
			return CUSTOMER;
		}
		return new ActorContext(principal.userId(), principal.role());
	}

	public Actor toDomain() {
		return new Actor(userId, role);
	}
}
