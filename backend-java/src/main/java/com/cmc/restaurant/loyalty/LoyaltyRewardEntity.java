package com.cmc.restaurant.loyalty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

import com.cmc.restaurant.loyalty.domain.MemberTier;

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

	@Column(name = "reward_type", nullable = false)
	private String rewardType;

	@Column(name = "menu_item_id")
	private String menuItemId;

	@Column(name = "discount_amount")
	private BigDecimal discountAmount;

	/** Hạng tối thiểu để THẤY và đổi được ưu đãi này. */
	@Column(name = "min_tier", nullable = false)
	private String minTier;

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

	public String getRewardType() {
		return rewardType;
	}

	public String getMenuItemId() {
		return menuItemId;
	}

	public BigDecimal getDiscountAmount() {
		return discountAmount;
	}

	/**
	 * Hạng tối thiểu. Đọc phòng thủ như {@code LoyaltyMemberEntity#getTier()}: một giá trị lạ trong
	 * cột — do sửa tay hay do migration tương lai — phải làm ưu đãi KHÓ đổi hơn, không phải dễ hơn,
	 * nên rơi về hạng CAO NHẤT chứ không phải hạng thấp nhất.
	 */
	public MemberTier getMinTier() {
		if (minTier == null) {
			return MemberTier.BAC;
		}
		try {
			return MemberTier.valueOf(minTier);
		} catch (IllegalArgumentException e) {
			MemberTier[] tatCa = MemberTier.values();
			return tatCa[tatCa.length - 1];
		}
	}
}
