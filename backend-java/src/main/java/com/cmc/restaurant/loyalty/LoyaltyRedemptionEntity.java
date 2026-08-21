package com.cmc.restaurant.loyalty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Một lần khách đổi điểm lấy ưu đãi (#34, V10). */
@Entity
@Table(name = "loyalty_redemptions")
public class LoyaltyRedemptionEntity {

	@Id
	private String id;

	@Column(name = "member_id", nullable = false)
	private String memberId;

	@Column(name = "reward_id", nullable = false)
	private String rewardId;

	/**
	 * Bản sao tên ưu đãi TẠI THỜI ĐIỂM ĐỔI.
	 *
	 * <p>Quán đổi tên hay ngừng một ưu đãi là chuyện thường. Sổ phải kể đúng thứ khách đã nhận lúc
	 * đó, không phải thứ khoá ngoại trỏ tới hôm nay — cùng lý do với việc hoá đơn lưu tên món.
	 */
	@Column(name = "reward_name", nullable = false)
	private String rewardName;

	/** Số điểm đã trừ tại thời điểm đổi — {@code points_required} của ưu đãi có thể đổi về sau. */
	@Column(name = "points_spent", nullable = false)
	private int pointsSpent;

	@Column(name = "idempotency_key", nullable = false)
	private String idempotencyKey;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected LoyaltyRedemptionEntity() {
	}

	public LoyaltyRedemptionEntity(String id, String memberId, LoyaltyRewardEntity reward,
			String idempotencyKey, OffsetDateTime now) {
		this.id = id;
		this.memberId = memberId;
		this.rewardId = reward.getId();
		this.rewardName = reward.getName();
		this.pointsSpent = reward.getPointsRequired();
		this.idempotencyKey = idempotencyKey;
		this.createdAt = now;
	}

	public String getId() {
		return id;
	}

	public String getRewardId() {
		return rewardId;
	}

	public String getRewardName() {
		return rewardName;
	}

	public int getPointsSpent() {
		return pointsSpent;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}
}
