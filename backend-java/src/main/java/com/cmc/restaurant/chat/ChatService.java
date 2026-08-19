package com.cmc.restaurant.chat;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableSessionEntity;
import com.cmc.restaurant.tables.TableSessionRepository;
import com.cmc.restaurant.tables.TableSessionStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Proxy layer for Chat (issue #14). Owns the chat session row and its memory; the answer itself
 * comes entirely from the Python service via {@link AiChatClient}. */
@Service
public class ChatService {

	private static final int MAX_QUESTION_LENGTH = 2000;

	private final ChatSessionRepository chatSessionRepository;
	private final TableSessionRepository tableSessionRepository;
	private final ChatSessionCapability capability;
	private final JwtProperties jwtProperties;
	private final AiChatClient aiChatClient;
	private final ChatMessageRepository chatMessageRepository;

	public ChatService(
			ChatSessionRepository chatSessionRepository, TableSessionRepository tableSessionRepository,
			ChatSessionCapability capability, JwtProperties jwtProperties, AiChatClient aiChatClient,
			ChatMessageRepository chatMessageRepository) {
		this.chatSessionRepository = chatSessionRepository;
		this.tableSessionRepository = tableSessionRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.aiChatClient = aiChatClient;
		this.chatMessageRepository = chatMessageRepository;
	}

	@Transactional
	public ChatDtos.OpenChatSessionResponse openSession(ChatDtos.OpenChatSessionRequest request) {
		if (request == null || request.tableSessionId() == null || request.tableSessionId().isBlank()) {
			throw ApiException.badRequest("TABLE_SESSION_REQUIRED", "A table session is required to start a chat.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		TableSessionEntity tableSession = tableSessionRepository.findById(request.tableSessionId().trim())
				.filter(s -> s.getStatus() == TableSessionStatus.Open)
				.filter(s -> s.getExpiresAt().isAfter(now))
				.orElseThrow(() -> new ApiException(HttpStatus.GONE, "TABLE_SESSION_EXPIRED",
						"Table session has expired. Please scan QR again."));

		// One open chat per table session, so a customer reopening the panel keeps their memory
		// instead of silently starting over.
		ChatSessionEntity session = chatSessionRepository
				.findByTableSessionIdAndClosedFalse(tableSession.getId()).stream().findFirst()
				.orElseGet(() -> chatSessionRepository.save(new ChatSessionEntity(
						"chat_" + UUID.randomUUID().toString().replace("-", ""),
						tableSession.getRestaurantTableId(), tableSession.getTableCode(),
						tableSession.getId(), now)));

		return new ChatDtos.OpenChatSessionResponse(
				session.getId(), session.getTableCode(),
				capability.createToken(session, jwtProperties.signingKey()));
	}

	/**
	 * Lịch sử hội thoại của một phiên chat (#95).
	 *
	 * <p>Trước PR này bảng {@code chat_messages} có sẵn trong migration nhưng bản Java không ghi
	 * vào, nên endpoint này không có gì để đọc — khách tải lại trang là mất sạch hội thoại.
	 */
	@Transactional(readOnly = true)
	public ChatDtos.ChatMessageListResponse listMessages(String chatSessionId, String suppliedToken) {
		ChatSessionEntity session = chatSessionRepository.findById(chatSessionId.trim())
				.orElseThrow(() -> ApiException.notFound("CHAT_SESSION_NOT_FOUND", "Chat session was not found."));
		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED,
					"CHAT_SESSION_TOKEN_INVALID", "A valid chat session token is required.");
		}
		return new ChatDtos.ChatMessageListResponse(
				chatMessageRepository.findByChatSessionIdOrderByCreatedAtAsc(session.getId()).stream()
						.map(m -> new ChatDtos.ChatMessageResponse(
								m.getId(), m.getRole(), m.getContent(), m.getCreatedAt(),
								m.getSuggestedCartActions() == null ? List.of() : m.getSuggestedCartActions()))
						.toList());
	}

	@Transactional
	public ChatDtos.SendChatMessageResponse sendMessage(
			String chatSessionId, ChatDtos.SendChatMessageRequest request, String suppliedToken) {
		ChatSessionEntity session = chatSessionRepository.findById(chatSessionId.trim())
				.orElseThrow(() -> ApiException.notFound("CHAT_SESSION_NOT_FOUND", "Chat session was not found."));

		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED,
					"CHAT_SESSION_TOKEN_INVALID", "A valid chat session token is required.");
		}
		if (session.isClosed()) {
			throw ApiException.conflict("CHAT_SESSION_CLOSED", "This chat session is closed.");
		}

		String question = request == null || request.content() == null ? "" : request.content().trim();
		if (question.isEmpty()) {
			throw ApiException.badRequest("CHAT_MESSAGE_REQUIRED", "Message content is required.");
		}
		if (question.length() > MAX_QUESTION_LENGTH) {
			// The contract caps question at 2000; rejecting here gives a clear error instead of a
			// 422 from the AI service that the customer would see as a generic failure.
			throw ApiException.badRequest("CHAT_MESSAGE_TOO_LONG",
					"Message must be " + MAX_QUESTION_LENGTH + " characters or fewer.");
		}

		// Lưu câu hỏi TRƯỚC khi gọi dịch vụ AI (#95). Gọi xong mới lưu thì một lần AI chết sẽ làm
		// mất luôn câu khách vừa gõ, và họ phải nhớ mình đã hỏi gì để gõ lại.
		saveMessage(session.getId(), "user", question, List.of());

		Optional<ChatDtos.AiChatResponse> answer = aiChatClient.ask(question, session.getSessionState());
		if (answer.isEmpty()) {
			ChatDtos.SendChatMessageResponse fallback = AiChatClient.fallback();
			saveMessage(session.getId(), "assistant", fallback.content(), List.of());
			return fallback;
		}
		ChatDtos.AiChatResponse ai = answer.get();
		saveMessage(session.getId(), "assistant", ai.content(), toCartActions(ai.suggestedCartActions()));

		// Backend owns storing the memory (per the schema: "Backend sở hữu việc lưu và XÓA — dịch vụ
		// AI chỉ đọc và ghi"). Only overwrite when the service actually returned new state, so a
		// degraded turn cannot wipe an allergy the customer declared earlier.
		Map<String, Object> updated = ai.sessionUpdates() == null ? null : ai.sessionUpdates().sessionState();
		if (updated != null) {
			session.setSessionState(updated);
			session.setUpdatedAt(OffsetDateTime.now());
			chatSessionRepository.save(session);
		}

		return new ChatDtos.SendChatMessageResponse(
				ai.content(),
				toCartActions(ai.suggestedCartActions()),
				ai.guardrailFlags() == null ? List.of() : ai.guardrailFlags(),
				Boolean.TRUE.equals(ai.suggestStaffHandoff()),
				!Boolean.FALSE.equals(ai.providerAvailable()));
	}

	private void saveMessage(
			String chatSessionId, String role, String content,
			List<ChatDtos.SuggestedCartActionResponse> actions) {
		chatMessageRepository.save(new ChatMessageEntity(
				"msg_" + java.util.UUID.randomUUID().toString().replace("-", ""), chatSessionId, role,
				content == null ? "" : content, actions, OffsetDateTime.now()));
	}

	/** Drops any action the service marked as not requiring confirmation. The schema declares
	 * {@code requires_customer_confirmation} as {@code const true} precisely because "AI không tự
	 * đặt món" is a boundary, so anything arriving otherwise is treated as untrustworthy rather
	 * than passed to the customer as a one-tap add. */
	static List<ChatDtos.SuggestedCartActionResponse> toCartActions(
			List<ChatDtos.AiSuggestedCartAction> actions) {
		if (actions == null) {
			return List.of();
		}
		return actions.stream()
				.filter(a -> a.menuItemId() != null && a.price() != null)
				.filter(a -> Boolean.TRUE.equals(a.requiresCustomerConfirmation()))
				.map(a -> new ChatDtos.SuggestedCartActionResponse(
						a.menuItemId(), a.name(), a.price(), a.quantity() == null ? 1 : a.quantity(),
						a.reason(), true, a.evidenceIds() == null ? List.of() : a.evidenceIds()))
				.toList();
	}
}
