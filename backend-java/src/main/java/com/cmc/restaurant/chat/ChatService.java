package com.cmc.restaurant.chat;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableSessionEntity;
import com.cmc.restaurant.tables.TableSessionRepository;
import com.cmc.restaurant.tables.TableSessionStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Proxy layer for Chat (issue #14). Owns the chat session row and its memory; the answer itself
 * comes entirely from the Python service via {@link AiChatClient}. */
@Service
public class ChatService {

	private static final int MAX_QUESTION_LENGTH = 2000;

	/**
	 * Ba trạng thái khách có thể đặt cho một thẻ gợi ý — đúng
	 * {@code AllowedRecommendationStatuses} của bản .NET.
	 *
	 * <p>Không có {@code suggested} ở đây: đó là trạng thái hệ thống tự đặt khi trợ lý gợi ý, không
	 * phải thứ khách bấm. Nhận nó qua endpoint này sẽ cho một client bất kỳ hạ trạng thái một thẻ
	 * khách đã bấm "thêm vào giỏ" xuống lại thành "vừa gợi ý".
	 */
	private static final Set<String> ALLOWED_RECOMMENDATION_STATUSES =
			Set.of("rejected", "accepted", "added_to_cart");

	private final ChatSessionRepository chatSessionRepository;
	private final TableSessionRepository tableSessionRepository;
	private final ChatSessionCapability capability;
	private final JwtProperties jwtProperties;
	private final AiChatClient aiChatClient;
	private final ChatMessageRepository chatMessageRepository;
	private final ChatRecommendationRepository chatRecommendationRepository;
	private final ChatFeedbackRepository chatFeedbackRepository;
	private final OrderRealtimeNotifier realtimeNotifier;
	private final ChatRateLimiter rateLimiter;

	public ChatService(
			ChatSessionRepository chatSessionRepository, TableSessionRepository tableSessionRepository,
			ChatSessionCapability capability, JwtProperties jwtProperties, AiChatClient aiChatClient,
			ChatMessageRepository chatMessageRepository,
			ChatRecommendationRepository chatRecommendationRepository,
			ChatFeedbackRepository chatFeedbackRepository, OrderRealtimeNotifier realtimeNotifier,
			ChatRateLimiter rateLimiter) {
		this.chatSessionRepository = chatSessionRepository;
		this.tableSessionRepository = tableSessionRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.aiChatClient = aiChatClient;
		this.chatMessageRepository = chatMessageRepository;
		this.chatRecommendationRepository = chatRecommendationRepository;
		this.chatFeedbackRepository = chatFeedbackRepository;
		this.realtimeNotifier = realtimeNotifier;
		this.rateLimiter = rateLimiter;
	}

	/**
	 * Mở phiên chat. Cả hai trường của yêu cầu đều tuỳ chọn — mirror {@code ChatEndpoints.cs}.
	 *
	 * <p>Không truyền {@code tableSessionId} thì tạo phiên ĐỘC LẬP, không gắn bàn. Mọi cột liên quan
	 * tới bàn trong {@code chat_sessions} đều nullable từ V1, nên đây là trạng thái schema đã lường
	 * trước chứ không phải lách.
	 */
	@Transactional
	public ChatDtos.OpenChatSessionResponse openSession(ChatDtos.OpenChatSessionRequest request) {
		OffsetDateTime now = OffsetDateTime.now();
		String tableSessionId = trimToNull(request == null ? null : request.tableSessionId());
		String tableCode = trimToNull(request == null ? null : request.tableCode());

		Optional<ChatSessionEntity> existing = Optional.empty();
		String restaurantTableId = null;

		if (tableSessionId != null) {
			TableSessionEntity tableSession = tableSessionRepository.findById(tableSessionId)
					.orElseThrow(() -> ApiException.notFound(
							"TABLE_SESSION_NOT_FOUND", "Table session was not found."));

			// Phiên bàn TỒN TẠI nhưng đã đóng/hết hạn là chuyện khác với phiên bàn không tồn tại:
			// cái đầu nghĩa là "quét lại QR đi", cái sau nghĩa là "id sai". Bản .NET tách 410 và 404
			// đúng theo nghĩa đó, nên frontend nói được câu khác nhau cho hai tình huống khác nhau.
			if (tableSession.getStatus() != TableSessionStatus.Open
					|| !tableSession.getExpiresAt().isAfter(now)) {
				throw new ApiException(HttpStatus.GONE, "TABLE_SESSION_INACTIVE",
						"Table session is closed or expired. Please scan QR again.");
			}
			if (tableCode != null && !tableCode.equalsIgnoreCase(tableSession.getTableCode())) {
				throw ApiException.badRequest(
						"CHAT_TABLE_MISMATCH", "Table code does not match the table session.");
			}

			restaurantTableId = tableSession.getRestaurantTableId();
			tableCode = tableSession.getTableCode();
			// One open chat per table session, so a customer reopening the panel keeps their memory
			// instead of silently starting over.
			//
			// KHÁC bản .NET một chỗ có chủ đích: nó dùng lại phiên chat mới nhất bất kể đã đóng hay
			// chưa, nên khách có thể nhận lại một phiên mà `sendMessage` sẽ từ chối bằng
			// CHAT_SESSION_CLOSED. Lọc `closed=false` ở đây khiến phiên đã đóng sinh phiên mới, tức
			// khách luôn nhận về một phiên dùng được.
			existing = chatSessionRepository.findByTableSessionIdAndClosedFalse(tableSession.getId())
					.stream().findFirst();
		}

		final String finalTableId = restaurantTableId;
		final String finalTableCode = tableCode;
		final String finalTableSessionId = tableSessionId;
		ChatSessionEntity session = existing.orElseGet(() -> chatSessionRepository.save(new ChatSessionEntity(
				"chat_" + UUID.randomUUID().toString().replace("-", ""),
				finalTableId, finalTableCode, finalTableSessionId, now)));

		// Trả kèm hội thoại cũ: khách mở lại panel là thấy ngay chỗ mình đang nói dở, không phải
		// chờ thêm một lượt gọi lịch sử nữa mới hiện ra.
		return new ChatDtos.OpenChatSessionResponse(
				session.getId(), session.getCreatedAt(), session.getUpdatedAt(),
				capability.createToken(session, jwtProperties.signingKey()), existing.isPresent(),
				messagesOf(session.getId()), recommendationsOf(session.getId()));
	}

	/**
	 * Lịch sử hội thoại của một phiên chat (#95).
	 *
	 * <p>Trước PR này bảng {@code chat_messages} có sẵn trong migration nhưng bản Java không ghi
	 * vào, nên endpoint này không có gì để đọc — khách tải lại trang là mất sạch hội thoại.
	 */
	@Transactional(readOnly = true)
	public ChatDtos.ChatHistoryResponse listMessages(String chatSessionId, String suppliedToken) {
		ChatSessionEntity session = requireSession(chatSessionId, suppliedToken);
		return new ChatDtos.ChatHistoryResponse(
				session.getId(), session.getCreatedAt(), session.getUpdatedAt(),
				messagesOf(session.getId()), recommendationsOf(session.getId()));
	}

	@Transactional
	public ChatDtos.SendChatMessageResponse sendMessage(
			String chatSessionId, ChatDtos.SendChatMessageRequest request, String suppliedToken) {
		ChatSessionEntity session = requireSession(chatSessionId, suppliedToken);
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

		// Hạn mức tính SAU khi token đã hợp lệ và TRƯỚC khi lưu gì — đúng chỗ bản .NET đặt.
		// Sau xác thực: người lạ đoán mã phiên không đốt được hạn mức của khách đang ngồi ở bàn.
		// Trước khi lưu: một lượt bị chặn không được để lại tin nhắn mồ côi không có ai trả lời.
		if (!rateLimiter.tryAcquire(session.getId())) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "CHAT_RATE_LIMITED",
					"Too many messages. Please wait a moment before sending again.");
		}

		// Lưu câu hỏi TRƯỚC khi gọi dịch vụ AI (#95). Gọi xong mới lưu thì một lần AI chết sẽ làm
		// mất luôn câu khách vừa gõ, và họ phải nhớ mình đã hỏi gì để gõ lại.
		ChatMessageEntity userMessage = saveMessage(session.getId(), "user", question, List.of());

		Optional<ChatDtos.AiChatResponse> answer = aiChatClient.ask(question, session.getSessionState());
		if (answer.isEmpty()) {
			ChatMessageEntity assistant =
					saveMessage(session.getId(), "assistant", AiChatClient.FALLBACK_TEXT, List.of());
			return new ChatDtos.SendChatMessageResponse(
					toResponse(userMessage), toResponse(assistant), List.of(),
					List.of("AI_PROVIDER_UNAVAILABLE"), true);
		}
		ChatDtos.AiChatResponse ai = answer.get();
		List<ChatDtos.SuggestedCartActionResponse> actions = toCartActions(ai.suggestedCartActions());
		ChatMessageEntity assistant = saveMessage(session.getId(), "assistant", ai.content(), actions);

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
				toResponse(userMessage), toResponse(assistant), actions,
				ai.guardrailFlags() == null ? List.of() : ai.guardrailFlags(),
				Boolean.TRUE.equals(ai.suggestStaffHandoff()));
	}

	/**
	 * Khách bấm chấp nhận / bỏ qua / đã thêm vào giỏ một thẻ gợi ý (#95).
	 *
	 * <p>Trả về TOÀN BỘ danh sách chứ không riêng dòng vừa đổi, vì frontend gán thẳng kết quả vào
	 * trạng thái của nó ({@code updateRecommendation} trả {@code ChatRecommendation[]}).
	 */
	@Transactional
	public List<ChatDtos.ChatRecommendationResponse> updateRecommendation(
			String chatSessionId, ChatDtos.UpdateRecommendationRequest request, String suppliedToken) {
		if (request == null || request.menuItemId() == null || request.menuItemId().isBlank()
				|| request.status() == null || request.status().isBlank()) {
			throw ApiException.badRequest("REQUEST_INVALID", "menuItemId and status are required.");
		}
		String status = request.status().trim().toLowerCase(java.util.Locale.ROOT);
		if (!ALLOWED_RECOMMENDATION_STATUSES.contains(status)) {
			throw ApiException.badRequest("RECOMMENDATION_STATUS_INVALID",
					"Status must be rejected, accepted, or added_to_cart.");
		}

		ChatSessionEntity session = requireSession(chatSessionId, suppliedToken);
		String menuItemId = request.menuItemId().trim();
		OffsetDateTime now = OffsetDateTime.now();

		// Bấm lại cùng một trạng thái là chuyện thường (mạng chập chờn, khách bấm hai lần), và chỉ
		// số duy nhất (chat_session_id, menu_item_id, status) sẽ từ chối dòng thứ hai. Tra trước rồi
		// mới quyết định thêm hay dời mốc thời gian, để lần bấm lặp không thành lỗi 500.
		chatRecommendationRepository
				.findByChatSessionIdAndMenuItemIdAndStatus(session.getId(), menuItemId, status)
				.ifPresentOrElse(
						existing -> {
							existing.touch(request.turnId(), now);
							chatRecommendationRepository.save(existing);
						},
						() -> chatRecommendationRepository.save(new ChatRecommendationEntity(
								"rec_" + UUID.randomUUID().toString().replace("-", ""), session.getId(),
								menuItemId, status, request.turnId(), now)));

		return recommendationsOf(session.getId());
	}

	/** Khách chấm một câu trả lời hay/dở (#95). */
	@Transactional
	public void submitFeedback(
			String chatSessionId, ChatDtos.ChatFeedbackRequest request, String suppliedToken) {
		if (request == null || request.messageId() == null || request.messageId().isBlank()
				|| request.rating() == null || request.rating().isBlank()) {
			throw ApiException.badRequest("REQUEST_INVALID", "messageId and rating are required.");
		}

		ChatSessionEntity session = requireSession(chatSessionId, suppliedToken);

		// Khoá ngoại chat_feedback -> chat_messages tồn tại trong V1, nên một messageId lạ sẽ nổ ở
		// tầng cơ sở dữ liệu thành 500. Kiểm ở đây để khách nhận đúng 404, và để một phiên không
		// chấm điểm được tin nhắn của phiên khác.
		ChatMessageEntity message = chatMessageRepository.findById(request.messageId().trim())
				.filter(m -> m.getChatSessionId().equals(session.getId()))
				.orElseThrow(() -> ApiException.notFound(
						"CHAT_MESSAGE_NOT_FOUND", "Chat message was not found in this session."));

		chatFeedbackRepository.save(new ChatFeedbackEntity(
				"fb_" + UUID.randomUUID().toString().replace("-", ""), session.getId(), message.getId(),
				request.rating().trim().toLowerCase(java.util.Locale.ROOT), request.reason(),
				OffsetDateTime.now()));
	}

	/**
	 * Khách nhờ nhân viên ra bàn từ trong khung chat (#95).
	 *
	 * <p>Không đặt ghi chú mặc định như {@code TableSessionActivityService}: bản .NET chuyển
	 * {@code request?.Note} nguyên trạng ở đường này. Ghi chú rỗng ở đây có nghĩa "khách không nói
	 * gì thêm", và bịa một câu thay họ sẽ hiện lên màn hình nhân viên như thể khách đã gõ.
	 */
	@Transactional(readOnly = true)
	public String requestAssistance(
			String chatSessionId, ChatDtos.AssistanceRequestBody request, String suppliedToken) {
		ChatSessionEntity session = requireSession(chatSessionId, suppliedToken);
		String tableCode = session.getTableCode() == null || session.getTableCode().isBlank()
				? "unknown" : session.getTableCode();
		String note = request == null || request.note() == null || request.note().isBlank()
				? null : request.note().trim();

		realtimeNotifier.assistanceRequested(new RealtimeDtos.AssistanceRequestedEvent(
				tableCode, session.getTableSessionId(), note, OffsetDateTime.now()));
		return tableCode;
	}

	/** Danh sách phản hồi cho quản trị (#95). {@code take} chặn trong [1, 200] như bản .NET — một
	 * client gõ {@code take=100000} không được phép kéo cả bảng về. */
	@Transactional(readOnly = true)
	public List<ChatDtos.AdminChatFeedbackResponse> listFeedbackForAdmin(String rating, int take) {
		String normalized = rating == null || rating.isBlank()
				? null : rating.trim().toLowerCase(java.util.Locale.ROOT);
		return chatFeedbackRepository
				.listForAdmin(normalized, PageRequest.of(0, Math.clamp(take, 1, 200))).stream()
				.map(ChatDtos.AdminChatFeedbackRow::toResponse)
				.toList();
	}

	// --- helper -----------------------------------------------------------------------------------

	private static String trimToNull(String s) {
		return s == null || s.isBlank() ? null : s.trim();
	}

	/** Mọi endpoint của khách đều qua đây: phiên phải tồn tại VÀ token phải hợp lệ. Gộp lại một chỗ
	 * để không endpoint nào lỡ quên một trong hai vế. */
	private ChatSessionEntity requireSession(String chatSessionId, String suppliedToken) {
		ChatSessionEntity session = chatSessionRepository.findById(chatSessionId.trim())
				.orElseThrow(() -> ApiException.notFound("CHAT_SESSION_NOT_FOUND", "Chat session was not found."));
		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED,
					"CHAT_SESSION_TOKEN_INVALID", "A valid chat session token is required.");
		}
		return session;
	}

	private List<ChatDtos.ChatMessageResponse> messagesOf(String chatSessionId) {
		return chatMessageRepository.findByChatSessionIdOrderByCreatedAtAsc(chatSessionId).stream()
				.map(ChatService::toResponse)
				.toList();
	}

	private List<ChatDtos.ChatRecommendationResponse> recommendationsOf(String chatSessionId) {
		return chatRecommendationRepository.findByChatSessionIdOrderByCreatedAtAsc(chatSessionId).stream()
				.map(r -> new ChatDtos.ChatRecommendationResponse(
						r.getMenuItemId(), r.getStatus(), r.getTurnId(), r.getUpdatedAt()))
				.toList();
	}

	private static ChatDtos.ChatMessageResponse toResponse(ChatMessageEntity message) {
		return new ChatDtos.ChatMessageResponse(
				message.getId(), message.getRole(), message.getContent(), message.getCreatedAt(),
				message.getSuggestedCartActions() == null ? List.of() : message.getSuggestedCartActions());
	}

	private ChatMessageEntity saveMessage(
			String chatSessionId, String role, String content,
			List<ChatDtos.SuggestedCartActionResponse> actions) {
		return chatMessageRepository.save(new ChatMessageEntity(
				"msg_" + UUID.randomUUID().toString().replace("-", ""), chatSessionId, role,
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
