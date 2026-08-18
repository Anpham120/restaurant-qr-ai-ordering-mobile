package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.domain.LoyaltyMember;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Maps the existing {@code loyalty_members} table. */
@Entity
@Table(name = "loyalty_members")
public class LoyaltyMemberEntity {

	@Id
	private String id;

	@Column(name = "phone_number", nullable = false, unique = true)
	private String phoneNumber;

	@Column(name = "full_name")
	private String fullName;

	@Column(nullable = false)
	private int points;

	@Column(name = "lifetime_spend", nullable = false)
	private BigDecimal lifetimeSpend;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected LoyaltyMemberEntity() {
	}

	public LoyaltyMemberEntity(String id, String phoneNumber, OffsetDateTime now) {
		this.id = id;
		this.phoneNumber = phoneNumber;
		this.points = 0;
		this.lifetimeSpend = BigDecimal.ZERO;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public LoyaltyMember toDomain() {
		return new LoyaltyMember(id, phoneNumber, fullName, points, lifetimeSpend, updatedAt);
	}

	public void applyFrom(LoyaltyMember member) {
		this.points = member.points();
		this.lifetimeSpend = member.lifetimeSpend();
		this.updatedAt = member.updatedAt();
	}

	public String getId() {
		return id;
	}

	public String getPhoneNumber() {
		return phoneNumber;
	}

	public String getFullName() {
		return fullName;
	}

	public int getPoints() {
		return points;
	}

	public BigDecimal getLifetimeSpend() {
		return lifetimeSpend;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}
}
