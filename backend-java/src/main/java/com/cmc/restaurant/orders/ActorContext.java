package com.cmc.restaurant.orders;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.auth.UserRole;
import org.springframework.security.core.Authentication;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Orders.ActorContext} (.NET): who initiated a state
 * change, for the status-history audit trail. Anonymous QR customers resolve to Customer. */
public record ActorContext(String userId, String role) {

	public static final ActorContext CUSTOMER = new ActorContext(null, UserRole.CUSTOMER);

	public static ActorContext fromAuthentication(Authentication authentication) {
		if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedPrincipal principal)) {
			return CUSTOMER;
		}
		return new ActorContext(principal.userId(), principal.role());
	}
}
