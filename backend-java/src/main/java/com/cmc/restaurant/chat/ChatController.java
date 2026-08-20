package com.cmc.restaurant.chat;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Mirrors toàn bộ nhóm khách của {@code ChatEndpoints.cs} (.NET) — #14, #95. Quyền quản trị nằm
 * ở {@link AdminChatController} vì hai lớp có chế độ bảo vệ ngược nhau. */
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
	public ChatDtos.ChatHistoryResponse listMessages(
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
			produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public ResponseEntity<StreamingResponseBody> streamMessage(
			@PathVariable String chatSessionId,
			@RequestBody(required = false) ChatDtos.SendChatMessageRequest body,
			HttpServletRequest request) {
		ChatMessageEntity userMessage = chatStreamService.acceptQuestion(
				chatSessionId, body == null ? null : body.content(),
				request.getHeader(ChatSessionCapability.HEADER));

		return ResponseEntity.ok()
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

	@PostMapping("/api/chat/sessions/{chatSessionId}/recommendations")
	public List<ChatDtos.ChatRecommendationResponse> updateRecommendation(
			@PathVariable String chatSessionId,
			@RequestBody(required = false) ChatDtos.UpdateRecommendationRequest body,
			HttpServletRequest request) {
		return chatService.updateRecommendation(
				chatSessionId, body, request.getHeader(ChatSessionCapability.HEADER));
	}

	@PostMapping("/api/chat/sessions/{chatSessionId}/feedback")
	public Map<String, Object> submitFeedback(
			@PathVariable String chatSessionId,
			@RequestBody(required = false) ChatDtos.ChatFeedbackRequest body,
			HttpServletRequest request) {
		chatService.submitFeedback(chatSessionId, body, request.getHeader(ChatSessionCapability.HEADER));
		return Map.of("ok", true);
	}

	@PostMapping("/api/chat/sessions/{chatSessionId}/assistance")
	public Map<String, Object> requestAssistance(
			@PathVariable String chatSessionId,
			@RequestBody(required = false) ChatDtos.AssistanceRequestBody body,
			HttpServletRequest request) {
		String tableCode = chatService.requestAssistance(
				chatSessionId, body, request.getHeader(ChatSessionCapability.HEADER));
		return Map.of("ok", true, "tableCode", tableCode);
	}
}
