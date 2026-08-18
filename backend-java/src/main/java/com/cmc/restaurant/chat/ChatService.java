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

	public ChatService(
			ChatSessionRepository chatSessionRepository, TableSessionRepository tableSessionRepository,
			ChatSessionCapability capability, JwtProperties jwtProperties, AiChatClient aiChatClient) {
		this.chatSessionRepository = chatSessionRepository;
		this.tableSessionRepository = tableSessionRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.aiChatClient = aiChatClient;
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

		Optional<ChatDtos.AiChatResponse> answer = aiChatClient.ask(question, session.getSessionState());
		if (answer.isEmpty()) {
			return AiChatClient.fallback();
		}
		ChatDtos.AiChatResponse ai = answer.get();

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

	/** Drops any action the service marked as not requiring confirmation. The schema declares
	 * {@code requires_customer_confirmation} as {@code const true} precisely because "AI không tự
	 * đặt món" is a boundary, so anything arriving otherwise is treated as untrustworthy rather
	 * than passed to the customer as a one-tap add. */
	private static List<ChatDtos.SuggestedCartActionResponse> toCartActions(
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
