package com.cmc.restaurant.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Khách chấm một câu trả lời hay/dở (#95). Quản trị đọc lại ở {@code GET /api/admin/chat/feedback}
 * để biết trợ lý đang sai ở đâu. */
@Entity
@Table(name = "chat_feedback")
public class ChatFeedbackEntity {

	@Id
	private String id;

	@Column(name = "chat_session_id", nullable = false)
	private String chatSessionId;

	@Column(name = "message_id", nullable = false)
	private String messageId;

	@Column(nullable = false)
	private String rating;

	@Column
	private String reason;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected ChatFeedbackEntity() {
		// JPA
	}

	public ChatFeedbackEntity(
			String id, String chatSessionId, String messageId, String rating, String reason,
			OffsetDateTime createdAt) {
		this.id = id;
		this.chatSessionId = chatSessionId;
		this.messageId = messageId;
		this.rating = rating;
		this.reason = reason;
		this.createdAt = createdAt;
	}
}
