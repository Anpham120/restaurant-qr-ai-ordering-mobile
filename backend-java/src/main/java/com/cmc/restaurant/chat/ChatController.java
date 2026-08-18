package com.cmc.restaurant.chat;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the two customer-facing routes of {@code ChatEndpoints.cs} that a proxy needs. History,
 * recommendations, feedback and assistance stay on .NET — see PR description. */
@RestController
public class ChatController {

	private final ChatService chatService;

	public ChatController(ChatService chatService) {
		this.chatService = chatService;
	}

	@PostMapping("/api/chat/sessions")
	public ChatDtos.OpenChatSessionResponse openSession(
			@RequestBody(required = false) ChatDtos.OpenChatSessionRequest request) {
		return chatService.openSession(request);
	}

	@PostMapping("/api/chat/sessions/{chatSessionId}/messages")
	public ChatDtos.SendChatMessageResponse sendMessage(
			@PathVariable String chatSessionId,
			@RequestBody(required = false) ChatDtos.SendChatMessageRequest body,
			HttpServletRequest request) {
		return chatService.sendMessage(chatSessionId, body, request.getHeader(ChatSessionCapability.HEADER));
	}
}
