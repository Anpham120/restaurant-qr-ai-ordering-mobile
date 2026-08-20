package com.cmc.restaurant.chat;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.shared.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Đường chat dạng SSE (#95) — mirror {@code ChatStreamEndpoints.cs} (.NET).
 *
 * <p>Đây là ĐƯỜNG CHÍNH của khách, không phải đường phụ: {@code ChatbotPage.tsx} gọi
 * {@code sendMessageStream} trước rồi mới lùi về {@code sendMessage}. Một lần lệch khung SSE ở đây
 * làm mọi câu trả lời thật biến thành câu xin lỗi — đúng sự cố mà {@code ai/app/service.py} ghi lại.
 *
 * <p>Khung phát ra giữ nguyên ba tên {@code token} / {@code final} / {@code done} và nguyên định
 * dạng {@code event: X\ndata: {...}\n\n} của bản .NET. Frontend đã viết theo khung đó.
 */
@Service
public class ChatStreamService {

	private static final Logger log = LoggerFactory.getLogger(ChatStreamService.class);

	private static final int MAX_QUESTION_LENGTH = 2000;

	/** Câu dự phòng lấy nguyên văn từ bản .NET — khách đang ngồi tại bàn, phải đọc được gì đó.
	 * Dùng chung với đường không-stream để một sự cố không hiện ra hai kiểu. */
	private static final String FALLBACK_TEXT = AiChatClient.FALLBACK_TEXT;

	private final ChatSessionRepository chatSessionRepository;
	private final ChatMessageRepository chatMessageRepository;
	private final ChatSessionCapability capability;
	private final JwtProperties jwtProperties;
	private final AiChatStreamClient streamClient;
	private final ObjectMapper objectMapper;
	private final ChatRateLimiter rateLimiter;

	public ChatStreamService(
			ChatSessionRepository chatSessionRepository, ChatMessageRepository chatMessageRepository,
			ChatSessionCapability capability, JwtProperties jwtProperties,
			AiChatStreamClient streamClient, ObjectMapper objectMapper, ChatRateLimiter rateLimiter) {
		this.chatSessionRepository = chatSessionRepository;
		this.chatMessageRepository = chatMessageRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.streamClient = streamClient;
		this.objectMapper = objectMapper;
		this.rateLimiter = rateLimiter;
	}

	/**
	 * Kiểm mọi thứ có thể trả mã lỗi HTTP, TRƯỚC khi mở luồng SSE.
	 *
	 * <p>Thứ tự này bắt buộc: một khi đã ghi byte đầu tiên của SSE thì mã trạng thái đã gửi đi rồi,
	 * không còn trả 400 hay 401 được nữa. Bản .NET cũng kiểm hết rồi mới đặt {@code Content-Type}.
	 *
	 * @return tin nhắn của khách đã lưu, để phần streaming dùng lại
	 */
	@Transactional
	public ChatMessageEntity acceptQuestion(String chatSessionId, String content, String suppliedToken) {
		ChatSessionEntity session = chatSessionRepository.findById(chatSessionId.trim())
				.orElseThrow(() -> ApiException.notFound("CHAT_SESSION_NOT_FOUND", "Chat session was not found."));

		if (suppliedToken == null || suppliedToken.isBlank()
				|| !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED,
					"CHAT_SESSION_TOKEN_INVALID", "A valid chat session token is required.");
		}
		if (session.isClosed()) {
			throw ApiException.conflict("CHAT_SESSION_CLOSED", "This chat session is closed.");
		}

		String question = content == null ? "" : content.trim();
		if (question.isEmpty()) {
			throw ApiException.badRequest("CHAT_MESSAGE_EMPTY", "Chat message content is required.");
		}
		if (question.length() > MAX_QUESTION_LENGTH) {
			throw ApiException.badRequest("CHAT_MESSAGE_TOO_LONG",
					"Chat message must be at most " + MAX_QUESTION_LENGTH + " characters.");
		}

		// Cùng hạn mức, cùng bộ đếm với đường không-stream: hai endpoint là hai cách gõ CÙNG một câu
		// hỏi, nên đếm riêng sẽ cho khách gấp đôi hạn mức chỉ bằng cách đổi đường gọi.
		//
		// Kiểm ở ĐÂY chứ không trong `stream()`: một khi luồng SSE đã mở thì mã trạng thái đã gửi đi,
		// không còn trả 429 được nữa — cùng lý do mọi phép kiểm khác nằm trong hàm này.
		if (!rateLimiter.tryAcquire(session.getId())) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "CHAT_RATE_LIMITED",
					"Too many messages. Please wait a moment before sending again.");
		}

		return chatMessageRepository.save(new ChatMessageEntity(
				"msg_" + UUID.randomUUID().toString().replace("-", ""), session.getId(), "user",
				question, List.of(), OffsetDateTime.now()));
	}

	/**
	 * Phát luồng SSE ra client, chuyển tiếp từng khung của dịch vụ AI.
	 *
	 * <p>Không chú giải {@code @Transactional}: luồng này sống lâu và ghi dần, giữ một transaction
	 * mở suốt thời gian đó sẽ khoá kết nối cơ sở dữ liệu trong khi chờ mô hình trả lời.
	 */
	public void stream(String chatSessionId, ChatMessageEntity userMessage, OutputStream out) {
		Map<String, Object> sessionState = chatSessionRepository.findById(chatSessionId)
				.map(ChatSessionEntity::getSessionState)
				.orElse(null);

		StringBuilder answer = new StringBuilder();
		boolean[] sawFinal = {false};

		boolean completed = streamClient.stream(userMessage.getContent(), sessionState, (event, data) -> {
			try {
				if ("token".equals(event)) {
					answer.append(readText(data));
					write(out, "token", data);
				} else if ("final".equals(event)) {
					sawFinal[0] = true;
					write(out, "final", buildFinalPayload(userMessage, data, answer.toString()));
				} else if ("done".equals(event)) {
					write(out, "done", "{\"ok\":true}");
				}
			} catch (Exception e) {
				// Khách đóng tab giữa chừng là chuyện bình thường, không phải lỗi hệ thống.
				log.debug("Chat stream write failed; client likely disconnected.", e);
			}
		});

		if (completed && sawFinal[0]) {
			return;
		}

		// Dự phòng: phát ĐÚNG ba khung như đường thành công, để frontend không phải xử lý một dạng
		// phản hồi thứ hai. Bản .NET làm y hệt.
		try {
			ChatMessageEntity assistant = persistAssistant(chatSessionId, FALLBACK_TEXT, List.of());
			write(out, "token", objectMapper.writeValueAsString(Map.of("text", FALLBACK_TEXT)));
			write(out, "final", objectMapper.writeValueAsString(Map.of(
					"userMessage", toWire(userMessage),
					"message", toWire(assistant),
					"suggestedCartActions", List.of(),
					"guardrailFlags", List.of("AI_PROVIDER_UNAVAILABLE"),
					"suggestStaffHandoff", true)));
			write(out, "done", "{\"ok\":true}");
		} catch (Exception e) {
			log.warn("Could not write the chat fallback frames.", e);
		}
	}

	// --- helper -----------------------------------------------------------------------------------

	/**
	 * CỐ Ý không chú giải {@code @Transactional}.
	 *
	 * <p>Hàm này được gọi từ {@link #stream} trong CÙNG lớp, nên proxy của Spring không chạy qua —
	 * chú giải ở đây sẽ gợi ý một ranh giới giao dịch không tồn tại. Đây đúng cái bẫy self-invocation
	 * đã phải tách bean để tránh ở #12 ({@code CassoWebhookService} / {@code CassoTransactionReconciler}).
	 *
	 * <p>Việc ghi vẫn an toàn vì {@code save()} của Spring Data tự mở giao dịch của nó, và mỗi tin
	 * nhắn là một dòng độc lập — không có bất biến nào cần hai dòng cùng vào hoặc cùng không.
	 */
	private ChatMessageEntity persistAssistant(
			String chatSessionId, String content, List<ChatDtos.SuggestedCartActionResponse> actions) {
		return chatMessageRepository.save(new ChatMessageEntity(
				"msg_" + UUID.randomUUID().toString().replace("-", ""), chatSessionId, "assistant",
				content, actions, OffsetDateTime.now()));
	}

	/**
	 * Ghép khung {@code final} mà frontend chờ.
	 *
	 * <p>Dịch vụ AI trả về nội dung câu trả lời và gợi ý món, nhưng KHÔNG biết id tin nhắn — id do
	 * backend cấp khi lưu. Nên khung {@code final} được dựng lại ở đây chứ không chuyển tiếp
	 * nguyên khối của dịch vụ.
	 */
	private String buildFinalPayload(ChatMessageEntity userMessage, String upstreamData, String streamed) {
		try {
			ChatDtos.AiChatResponse ai = objectMapper.readValue(upstreamData, ChatDtos.AiChatResponse.class);
			String content = ai.content() == null || ai.content().isBlank() ? streamed.trim() : ai.content();
			List<ChatDtos.SuggestedCartActionResponse> actions = ChatService.toCartActions(ai.suggestedCartActions());
			ChatMessageEntity assistant = persistAssistant(userMessage.getChatSessionId(), content, actions);
			persistSessionState(userMessage.getChatSessionId(), ai);

			return objectMapper.writeValueAsString(Map.of(
					"userMessage", toWire(userMessage),
					"message", toWire(assistant),
					"suggestedCartActions", actions,
					"guardrailFlags", ai.guardrailFlags() == null ? List.of() : ai.guardrailFlags(),
					"suggestStaffHandoff", ai.suggestStaffHandoff()));
		} catch (Exception e) {
			log.warn("Could not parse the AI final frame; sending the streamed text instead.", e);
			return upstreamData;
		}
	}

	/**
	 * Ghi bộ nhớ hội thoại mà dịch vụ AI trả về — ĐƯỜNG NÀY TRƯỚC ĐÂY KHÔNG LÀM.
	 *
	 * <p>Hậu quả không nhỏ và rất khó thấy: đường không-stream lưu {@code session_updates}, đường SSE
	 * thì không, mà SSE mới là đường khách thật đi ({@code ChatbotPage.tsx} gọi stream trước). Nên
	 * mỗi lượt trên đường chính đều bắt đầu lại từ đầu: "cho mình xem thêm vài món" trả lời như câu
	 * hỏi đầu tiên vì backend không nhớ đã liệt kê những gì.
	 *
	 * <p>Từng endpoint đều trả 200, từng câu trả lời đọc riêng đều hợp lý — chỉ khi hỏi NHIỀU LƯỢT
	 * liên tiếp mới lộ. `run_golden_e2e.py` bắt được đúng vì nó hỏi theo hội thoại, không theo lượt.
	 *
	 * <p>Chỉ ghi đè khi dịch vụ thực sự trả về trạng thái mới — cùng quy tắc với
	 * {@code ChatService.sendMessage}: một lượt suy giảm không được phép xoá thông tin dị ứng khách
	 * đã khai từ trước.
	 */
	private void persistSessionState(String chatSessionId, ChatDtos.AiChatResponse ai) {
		Map<String, Object> updated = ai.sessionUpdates() == null ? null : ai.sessionUpdates().sessionState();
		if (updated == null) {
			return;
		}
		chatSessionRepository.findById(chatSessionId).ifPresent(session -> {
			session.setSessionState(updated);
			session.setUpdatedAt(OffsetDateTime.now());
			chatSessionRepository.save(session);
		});
	}

	private Map<String, Object> toWire(ChatMessageEntity message) {
		return Map.of(
				"id", message.getId(),
				"role", message.getRole(),
				"content", message.getContent(),
				"createdAt", message.getCreatedAt().toString(),
				"suggestedCartActions",
				message.getSuggestedCartActions() == null ? List.of() : message.getSuggestedCartActions());
	}

	private String readText(String data) {
		try {
			JsonNode node = objectMapper.readTree(data);
			return node.path("text").asText("");
		} catch (Exception e) {
			return "";
		}
	}

	/**
	 * Ghi một khung SSE.
	 *
	 * <p>Định dạng giữ nguyên từng byte của bản .NET: {@code event: <tên>\ndata: <json>\n\n}, và
	 * {@code flush} ngay sau mỗi khung. Không flush thì khung nằm trong bộ đệm và khách thấy toàn
	 * bộ câu trả lời hiện ra một lần — tức mất hẳn tác dụng của streaming.
	 */
	private static void write(OutputStream out, String event, String json) throws java.io.IOException {
		out.write(("event: " + event + "\ndata: " + json + "\n\n").getBytes(StandardCharsets.UTF_8));
		out.flush();
	}
}
