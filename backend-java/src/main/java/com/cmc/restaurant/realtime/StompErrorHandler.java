package com.cmc.restaurant.realtime;

import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

/**
 * Puts the guard's own error code in the STOMP ERROR frame.
 *
 * <p>Without this, Spring wraps anything thrown from a {@code ChannelInterceptor} and the client
 * receives {@code "Failed to send message to ExecutorSubscribableChannel[clientInboundChannel]"} —
 * technically a refusal, but it tells the client nothing. The .NET hub threw
 * {@code HubException("ORDER_ACCESS_DENIED")} and the browser saw exactly that string, so the
 * client could distinguish "wrong token" from "order does not exist" from a transport fault. This
 * unwraps to the root cause to keep that contract.
 */
@Component
public class StompErrorHandler extends StompSubProtocolErrorHandler {

	@Override
	public Message<byte[]> handleClientMessageProcessingError(Message<byte[]> clientMessage, Throwable ex) {
		Throwable root = ex;
		while (root.getCause() != null) {
			root = root.getCause();
		}

		String reason = root.getMessage();
		if (reason == null || reason.isBlank()) {
			return super.handleClientMessageProcessingError(clientMessage, ex);
		}

		StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.ERROR);
		accessor.setMessage(reason);
		accessor.setLeaveMutable(true);
		return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
	}
}
