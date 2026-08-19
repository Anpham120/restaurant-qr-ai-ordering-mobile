package com.cmc.restaurant.loyalty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Maps the existing {@code loyalty_rewards} table. */
@Entity
@Table(name = "loyalty_rewards")
public class LoyaltyRewardEntity {

	@Id
	private String id;

	@Column(nullable = false)
	private String name;

	@Column
	private String description;

	@Column(name = "points_required", nullable = false)
	private int pointsRequired;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected LoyaltyRewardEntity() {
	}

	/** Ưu đãi do quản trị viên tạo (#94). */
	LoyaltyRewardEntity(String id, OffsetDateTime now) {
		this.id = id;
		this.createdAt = now;
		this.updatedAt = now;
	}

	/** Ghi toàn bộ phần quản trị viên nhập được — cùng tập trường cho cả tạo và sửa. */
	void applyDefinition(
			String name, String description, int pointsRequired, boolean active, OffsetDateTime now) {
		this.name = name;
		this.description = description;
		this.pointsRequired = pointsRequired;
		this.active = active;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getDescription() {
		return description;
	}

	public int getPointsRequired() {
		return pointsRequired;
	}

	public boolean isActive() {
		return active;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}
}
