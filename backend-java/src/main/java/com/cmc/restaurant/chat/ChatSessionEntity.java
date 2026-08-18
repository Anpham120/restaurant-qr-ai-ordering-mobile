package com.cmc.restaurant.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Minimal mapping of the existing {@code chat_sessions} table. Only the columns the proxy needs:
 * message history, facts, recommendations and feedback stay on .NET (the plan scopes Chat to
 * "chỉ proxy"). {@code constraints_json} is reused as the chat memory store because that is where
 * {@code DbChatStore} already persists it. */
@Entity
@Table(name = "chat_sessions")
public class ChatSessionEntity {

	@Id
	private String id;

	@Column(name = "restaurant_table_id")
	private String restaurantTableId;

	@Column(name = "table_code")
	private String tableCode;

	@Column(name = "table_session_id")
	private String tableSessionId;

	@Column(name = "is_closed", nullable = false)
	private boolean closed;

	// Native Hibernate 6 JSON mapping — same technique the menu module uses for text[], so no extra
	// JSON-type library is pulled in just for this one column.
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "constraints_json")
	private Map<String, Object> sessionState;

	@Column(name = "memory_version", nullable = false)
	private String memoryVersion;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected ChatSessionEntity() {
		// JPA
	}

	public ChatSessionEntity(
			String id, String restaurantTableId, String tableCode, String tableSessionId, OffsetDateTime now) {
		this.id = id;
		this.restaurantTableId = restaurantTableId;
		this.tableCode = tableCode;
		this.tableSessionId = tableSessionId;
		this.closed = false;
		this.memoryVersion = "v1";
		this.createdAt = now;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getTableCode() {
		return tableCode;
	}

	public String getTableSessionId() {
		return tableSessionId;
	}

	public boolean isClosed() {
		return closed;
	}

	public Map<String, Object> getSessionState() {
		return sessionState;
	}

	public void setSessionState(Map<String, Object> sessionState) {
		this.sessionState = sessionState;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}
}
