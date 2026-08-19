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

	public record OpenChatSessionResponse(String chatSessionId, String tableCode, String chatSessionToken) {
	}

	public record SendChatMessageRequest(String content) {
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

	public record ChatMessageListResponse(List<ChatMessageResponse> messages) {
	}

	/** Deliberately has no {@code decision} field. {@code ai/app/service.py} states that the backend
	 * must not forward it: it is an operator log trace that carries internal exception types and
	 * error reference codes. Leaving the field out means a future edit cannot leak it by accident. */
	public record SendChatMessageResponse(
			String content, List<SuggestedCartActionResponse> suggestedCartActions,
			List<String> guardrailFlags, boolean suggestStaffHandoff, boolean providerAvailable) {
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
