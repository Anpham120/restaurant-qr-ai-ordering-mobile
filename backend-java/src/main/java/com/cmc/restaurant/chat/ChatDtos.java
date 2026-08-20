package com.cmc.restaurant.chat;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Two contracts meet in this file, and keeping them apart is the point of the whole issue.
 *
 * <p><b>Customer-facing</b> ({@code OpenChatSession*}, {@code SendChatMessage*}) mirrors
 * {@code ChatContracts.cs} (.NET) so the existing web client sees the same shape.
 *
 * <p><b>Upstream</b> ({@code AiChatRequest}/{@code AiChatResponse}) mirrors
 * {@code ai/contracts/ai-chat-v1.schema.json} — snake_case, and only the three request fields the
 * Python service actually reads. The .NET provider still sends its legacy 24-field payload; this
 * port follows the contract instead, because the schema's own description says carrying fields the
 * service ignores only "làm hợp đồng nói sai về thứ nó dùng".
 */
public final class ChatDtos {

	private ChatDtos() {
	}

	// --- customer-facing -----------------------------------------------------------------------

	public record OpenChatSessionRequest(String tableSessionId) {
	}

	/**
	 * Mở phiên chat — hình dạng theo {@code CreateChatSessionResponse} của frontend (#95).
	 *
	 * <p>Trường token tên là {@code accessToken}, KHÔNG phải {@code chatSessionToken}. Bản Java
	 * trước đây đặt tên sau, và {@code ChatbotPage.tsx} đọc {@code session.accessToken} — nên nó
	 * nhận {@code undefined} và MỌI lời gọi chat tiếp theo trả 401. Không test nào bắt được vì test
	 * của backend đọc đúng cái tên backend tự đặt; đúng cái bẫy "hai bên tự nhất quán với chính
	 * mình" mà {@code ai/app/service.py} ghi lại.
	 *
	 * <p>{@code reused} cho frontend biết đây là phiên cũ mở lại hay phiên mới, còn
	 * {@code messages}/{@code recommendations} để nó dựng lại hội thoại ngay mà không cần gọi thêm.
	 */
	public record OpenChatSessionResponse(
			String chatSessionId, java.time.OffsetDateTime createdAt, java.time.OffsetDateTime updatedAt,
			String accessToken, boolean reused, List<ChatMessageResponse> messages,
			List<ChatRecommendationResponse> recommendations) {
	}

	public record SendChatMessageRequest(String content) {
	}

	/** Khách đã làm gì với một thẻ gợi ý — {@code ChatRecommendation} của frontend. */
	public record ChatRecommendationResponse(
			String menuItemId, String status, String turnId, java.time.OffsetDateTime updatedAt) {
	}

	public record UpdateRecommendationRequest(String menuItemId, String status, String turnId) {
	}

	public record ChatFeedbackRequest(String messageId, String rating, String reason) {
	}

	public record AssistanceRequestBody(String note) {
	}

	public record SuggestedCartActionResponse(
			String menuItemId, String name, BigDecimal price, int quantity, String reason,
			boolean requiresCustomerConfirmation, List<String> evidenceIds) {
	}

	/** Một tin nhắn đã lưu, dạng frontend đọc (#95). */
	public record ChatMessageResponse(
			String id, String role, String content, java.time.OffsetDateTime createdAt,
			List<SuggestedCartActionResponse> suggestedCartActions) {
	}

	/** Lịch sử hội thoại — {@code ChatHistoryResponse} của frontend. */
	public record ChatHistoryResponse(
			String chatSessionId, java.time.OffsetDateTime createdAt, java.time.OffsetDateTime updatedAt,
			List<ChatMessageResponse> messages, List<ChatRecommendationResponse> recommendations) {
	}

	/**
	 * Deliberately has no {@code decision} field. {@code ai/app/service.py} states that the backend
	 * must not forward it: it is an operator log trace that carries internal exception types and
	 * error reference codes. Leaving the field out means a future edit cannot leak it by accident.
	 *
	 * <p>Trả về CẢ HAI tin nhắn chứ không chỉ nội dung câu trả lời:
	 * {@code appendCommittedExchange} của frontend đọc {@code response.userMessage} và
	 * {@code response.message}. Bản Java trước đây trả một trường {@code content}, nên cả hai đều
	 * {@code undefined} và hội thoại vỡ ngay lượt đầu.
	 *
	 * <p>CỐ Ý không có {@code followUp}: frontend khai nó là tuỳ chọn và không đọc ở đâu, còn dịch
	 * vụ Python không phát trường nào tương ứng. Thêm vào chỉ để "cho giống .NET" là dựng một
	 * trường luôn rỗng.
	 */
	public record SendChatMessageResponse(
			ChatMessageResponse userMessage, ChatMessageResponse message,
			List<SuggestedCartActionResponse> suggestedCartActions,
			List<String> guardrailFlags, boolean suggestStaffHandoff) {
	}

	/** Một dòng phản hồi cho trang quản trị, đã nối sẵn với câu trả lời bị chấm. */
	public record AdminChatFeedbackRow(
			String id, String chatSessionId, String messageId, String rating, String reason,
			java.time.OffsetDateTime createdAt, String messageRole, String messageContent) {

		/** Bản .NET cắt còn 240 ký tự. Trang quản trị chỉ cần đủ nhận ra câu nào, không cần cả bài. */
		public AdminChatFeedbackResponse toResponse() {
			return new AdminChatFeedbackResponse(id, chatSessionId, messageId, rating, reason, createdAt,
					messageRole,
					messageContent != null && messageContent.length() > 240
							? messageContent.substring(0, 240) : messageContent);
		}
	}

	public record AdminChatFeedbackResponse(
			String id, String chatSessionId, String messageId, String rating, String reason,
			java.time.OffsetDateTime createdAt, String messageRole, String messagePreview) {
	}

	// --- upstream (ai-chat-v1.schema.json) -----------------------------------------------------

	public record AiChatRequest(
			String question,
			@JsonProperty("session_state") Map<String, Object> sessionState,
			@JsonProperty("use_model") boolean useModel) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record AiChatResponse(
			Boolean ok,
			@JsonProperty("provider_available") Boolean providerAvailable,
			String content,
			@JsonProperty("suggested_cart_actions") List<AiSuggestedCartAction> suggestedCartActions,
			@JsonProperty("guardrail_flags") List<String> guardrailFlags,
			@JsonProperty("suggest_staff_handoff") Boolean suggestStaffHandoff,
			@JsonProperty("session_updates") AiSessionUpdates sessionUpdates) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record AiSuggestedCartAction(
			@JsonProperty("menu_item_id") String menuItemId,
			String name,
			BigDecimal price,
			Integer quantity,
			String reason,
			@JsonProperty("evidence_ids") List<String> evidenceIds,
			@JsonProperty("requires_customer_confirmation") Boolean requiresCustomerConfirmation) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record AiSessionUpdates(
			@JsonProperty("session_state") Map<String, Object> sessionState,
			@JsonProperty("rolling_summary") String rollingSummary,
			@JsonProperty("memory_version") String memoryVersion) {
	}
}
