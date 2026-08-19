package com.cmc.restaurant.chat;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the two customer-facing routes of {@code ChatEndpoints.cs} that a proxy needs. History,
 * recommendations, feedback and assistance stay on .NET — see PR description. */
@RestController
public class ChatController {

	private final ChatService chatService;
	private final ChatStreamService chatStreamService;

	public ChatController(ChatService chatService, ChatStreamService chatStreamService) {
		this.chatService = chatService;
		this.chatStreamService = chatStreamService;
	}

	@PostMapping("/api/chat/sessions")
	public ChatDtos.OpenChatSessionResponse openSession(
			@RequestBody(required = false) ChatDtos.OpenChatSessionRequest request) {
		return chatService.openSession(request);
	}

	@GetMapping("/api/chat/sessions/{chatSessionId}/messages")
	public ChatDtos.ChatMessageListResponse listMessages(
			@PathVariable String chatSessionId, HttpServletRequest request) {
		return chatService.listMessages(chatSessionId, request.getHeader(ChatSessionCapability.HEADER));
	}

	/**
	 * Đường chat dạng SSE — ĐƯỜNG CHÍNH của khách (#95).
	 *
	 * <p>Mọi phép kiểm trả mã lỗi chạy TRƯỚC khi mở luồng: một khi đã ghi byte đầu tiên thì mã
	 * trạng thái đã gửi đi, không còn trả 400 hay 401 được nữa.
	 */
	@PostMapping(value = "/api/chat/sessions/{chatSessionId}/messages/stream",
			produces = org.springframework.http.MediaType.TEXT_EVENT_STREAM_VALUE)
	public org.springframework.http.ResponseEntity<org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody> streamMessage(
			@PathVariable String chatSessionId,
			@RequestBody(required = false) ChatDtos.SendChatMessageRequest body,
			HttpServletRequest request) {
		ChatMessageEntity userMessage = chatStreamService.acceptQuestion(
				chatSessionId, body == null ? null : body.content(),
				request.getHeader(ChatSessionCapability.HEADER));

		return org.springframework.http.ResponseEntity.ok()
				.header("Cache-Control", "no-cache")
				// Nginx đệm phản hồi theo mặc định, và đệm một luồng SSE nghĩa là khách không thấy gì
				// cho tới khi luồng đóng. Bản .NET đặt đúng header này vì cùng lý do.
				.header("X-Accel-Buffering", "no")
				.body(out -> chatStreamService.stream(chatSessionId, userMessage, out));
	}

	@PostMapping("/api/chat/sessions/{chatSessionId}/messages")
	public ChatDtos.SendChatMessageResponse sendMessage(
			@PathVariable String chatSessionId,
			@RequestBody(required = false) ChatDtos.SendChatMessageRequest body,
			HttpServletRequest request) {
		return chatService.sendMessage(chatSessionId, body, request.getHeader(ChatSessionCapability.HEADER));
	}
}
