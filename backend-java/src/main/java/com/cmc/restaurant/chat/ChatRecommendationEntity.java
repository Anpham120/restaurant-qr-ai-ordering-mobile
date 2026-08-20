package com.cmc.restaurant.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/**
 * Khách đã làm gì với một thẻ gợi ý món (#95).
 *
 * <p>Bảng này giữ trạng thái qua lần tải lại trang: khách bấm "bỏ qua" một món, đóng tab, mở lại,
 * thẻ đó vẫn phải ở trạng thái đã bỏ qua chứ không hiện lại như mới.
 *
 * <p>CỐ Ý không lưu trạng thái {@code suggested}. Bản .NET có lưu, nhưng frontend ánh xạ nó thành
 * {@code null} ({@code mapRecommendationStatus} chỉ nhận accepted/added_to_cart/rejected), nên lưu
 * thêm một trạng thái không ai đọc chỉ làm bảng to ra. Endpoint cũng chỉ nhận đúng ba trạng thái
 * kia — giống {@code AllowedRecommendationStatuses} của bản .NET.
 */
@Entity
@Table(name = "chat_recommendations")
public class ChatRecommendationEntity {

	@Id
	private String id;

	@Column(name = "chat_session_id", nullable = false)
	private String chatSessionId;

	@Column(name = "menu_item_id", nullable = false)
	private String menuItemId;

	@Column(nullable = false)
	private String status;

	@Column(name = "turn_id")
	private String turnId;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected ChatRecommendationEntity() {
		// JPA
	}

	public ChatRecommendationEntity(
			String id, String chatSessionId, String menuItemId, String status, String turnId,
			OffsetDateTime now) {
		this.id = id;
		this.chatSessionId = chatSessionId;
		this.menuItemId = menuItemId;
		this.status = status;
		this.turnId = turnId;
		this.createdAt = now;
		this.updatedAt = now;
	}

	/** Bấm lại cùng một trạng thái thì chỉ dời mốc thời gian; {@code turnId} mới ghi đè cái cũ,
	 * còn {@code null} thì giữ nguyên — đúng cách {@code UpsertRecommendationInternal} làm. */
	public void touch(String newTurnId, OffsetDateTime now) {
		if (newTurnId != null) {
			this.turnId = newTurnId;
		}
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getMenuItemId() {
		return menuItemId;
	}

	public String getStatus() {
		return status;
	}

	public String getTurnId() {
		return turnId;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}
}
