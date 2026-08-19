package com.cmc.restaurant.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Một lượt hội thoại đã lưu (#95).
 *
 * <p>Bảng {@code chat_messages} có sẵn trong migration V1 từ đầu, nhưng bản Java chưa bao giờ ghi
 * vào: {@code ChatService.sendMessage} chỉ chuyển tiếp câu hỏi sang dịch vụ AI rồi trả lời, không
 * lưu gì. Hệ quả là {@code GET /api/chat/sessions/&#123;id&#125;/messages} không có gì để đọc —
 * khách tải lại trang là mất sạch hội thoại.
 */
@Entity
@Table(name = "chat_messages")
public class ChatMessageEntity {

	@Id
	private String id;

	@Column(name = "chat_session_id", nullable = false)
	private String chatSessionId;

	/** {@code user} hoặc {@code assistant} — đúng hai giá trị {@code ChatRole} của bản .NET. */
	@Column(nullable = false)
	private String role;

	@Column(nullable = false)
	private String content;

	/**
	 * Gợi ý thêm món đi kèm câu trả lời, lưu nguyên khối JSON.
	 *
	 * <p>Lưu cùng tin nhắn chứ không bảng riêng vì chúng chỉ có nghĩa trong ngữ cảnh của đúng câu
	 * trả lời đó — tách ra sẽ phải tự ghép lại ở mọi chỗ đọc.
	 */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "suggested_cart_actions_json")
	private List<ChatDtos.SuggestedCartActionResponse> suggestedCartActions;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected ChatMessageEntity() {
		// JPA
	}

	public ChatMessageEntity(
			String id, String chatSessionId, String role, String content,
			List<ChatDtos.SuggestedCartActionResponse> suggestedCartActions, OffsetDateTime createdAt) {
		this.id = id;
		this.chatSessionId = chatSessionId;
		this.role = role;
		this.content = content;
		this.suggestedCartActions = suggestedCartActions;
		this.createdAt = createdAt;
	}

	public String getId() {
		return id;
	}

	public String getChatSessionId() {
		return chatSessionId;
	}

	public String getRole() {
		return role;
	}

	public String getContent() {
		return content;
	}

	public List<ChatDtos.SuggestedCartActionResponse> getSuggestedCartActions() {
		return suggestedCartActions;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}
}
