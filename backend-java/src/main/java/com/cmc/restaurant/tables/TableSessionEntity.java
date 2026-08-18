package com.cmc.restaurant.tables;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.OffsetDateTime;

/** Mirrors {@code RestaurantQrAiOrdering.Entities.TableSession} (.NET), including its domain
 * methods {@code IsActiveAt}/{@code ExpireIfPast}. Adds {@code memberId} (§9.4, migration V3) and
 * {@code version} (migration V4, issue #7) — two fields the .NET entity does not have. */
@Entity
@Table(name = "table_sessions")
public class TableSessionEntity {

	@Id
	private String id;

	@Column(name = "restaurant_table_id")
	private String restaurantTableId;

	@ManyToOne
	@jakarta.persistence.JoinColumn(name = "restaurant_table_id", insertable = false, updatable = false)
	private RestaurantTableEntity restaurantTable;

	@Column(name = "table_code")
	private String tableCode;

	@Column(name = "qr_token")
	private String qrToken;

	@Column(name = "order_type", nullable = false)
	private String orderType;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TableSessionStatus status;

	@Column(name = "opened_at", nullable = false)
	private OffsetDateTime openedAt;

	@Column(name = "expires_at", nullable = false)
	private OffsetDateTime expiresAt;

	@Column(name = "closed_at")
	private OffsetDateTime closedAt;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "member_id")
	private String memberId;

	@Version
	@Column(nullable = false)
	private long version;

	protected TableSessionEntity() {
		// JPA
	}

	public TableSessionEntity(String id, String restaurantTableId, String tableCode, String qrToken,
			OffsetDateTime openedAt, OffsetDateTime expiresAt) {
		this.id = id;
		this.restaurantTableId = restaurantTableId;
		this.tableCode = tableCode;
		this.qrToken = qrToken;
		this.orderType = "DineIn";
		this.status = TableSessionStatus.Open;
		this.openedAt = openedAt;
		this.expiresAt = expiresAt;
		this.createdAt = openedAt;
		this.updatedAt = openedAt;
	}

	public boolean isActiveAt(OffsetDateTime now) {
		return status == TableSessionStatus.Open && closedAt == null && expiresAt.isAfter(now);
	}

	/** Returns true (and mutates state to Expired) only if it actually transitioned. */
	public boolean expireIfPast(OffsetDateTime now) {
		if (status != TableSessionStatus.Open || closedAt != null || expiresAt.isAfter(now)) {
			return false;
		}
		this.status = TableSessionStatus.Expired;
		this.closedAt = now;
		this.updatedAt = now;
		return true;
	}

	public boolean isExpired(OffsetDateTime now) {
		return status == TableSessionStatus.Expired
				|| (status == TableSessionStatus.Open && !expiresAt.isAfter(now));
	}

	public String getId() {
		return id;
	}

	public String getRestaurantTableId() {
		return restaurantTableId;
	}

	public RestaurantTableEntity getRestaurantTable() {
		return restaurantTable;
	}

	public String getTableCode() {
		return tableCode;
	}

	public String getOrderType() {
		return orderType;
	}

	public TableSessionStatus getStatus() {
		return status;
	}

	public OffsetDateTime getOpenedAt() {
		return openedAt;
	}

	public OffsetDateTime getExpiresAt() {
		return expiresAt;
	}

	public OffsetDateTime getClosedAt() {
		return closedAt;
	}

	public void setStatus(TableSessionStatus status) {
		this.status = status;
	}

	public void setClosedAt(OffsetDateTime closedAt) {
		this.closedAt = closedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}

	public String getMemberId() {
		return memberId;
	}

	public void setMemberId(String memberId) {
		this.memberId = memberId;
	}
}
