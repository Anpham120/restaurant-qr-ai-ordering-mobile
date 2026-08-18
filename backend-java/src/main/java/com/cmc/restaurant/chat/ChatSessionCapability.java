package com.cmc.restaurant.chat;

import com.cmc.restaurant.tables.CapabilityTokenSigner;
import org.springframework.stereotype.Component;

/** Mirrors {@code ChatSessionCapability} (.NET). Only the v2 purpose is implemented — there is no
 * pre-existing Java-issued chat token to stay backward compatible with, same reasoning as
 * {@code TableSessionCapability}. */
@Component
public class ChatSessionCapability {

	public static final String HEADER = "X-Chat-Session-Token";
	private static final String PURPOSE = "restaurant-qr-ai-ordering:chat-session-capability:v2";

	public String createToken(ChatSessionEntity session, String signingKey) {
		return CapabilityTokenSigner.createToken(signingKey, PURPOSE, session.getId());
	}

	public boolean isValid(ChatSessionEntity session, String suppliedToken, String signingKey) {
		return CapabilityTokenSigner.isValid(suppliedToken, signingKey, PURPOSE, session.getId());
	}
}
