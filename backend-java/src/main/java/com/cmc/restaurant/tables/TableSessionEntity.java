package com.cmc.restaurant.tables;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Mirrors {@code RestaurantQrAiOrdering.Entities.TableSession} (.NET), including its domain
 * methods {@code IsActiveAt}/{@code ExpireIfPast}. Adds {@code memberId} (§9.4, migration V3) —
 * the one field the .NET entity does not have. */
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

	@Column(nullable = false)
	private String status;

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
		this.status = TableSessionStatus.OPEN;
		this.openedAt = openedAt;
		this.expiresAt = expiresAt;
		this.createdAt = openedAt;
		this.updatedAt = openedAt;
	}

	public boolean isActiveAt(OffsetDateTime now) {
		return TableSessionStatus.OPEN.equals(status) && closedAt == null && expiresAt.isAfter(now);
	}

	/** Returns true (and mutates state to Expired) only if it actually transitioned. */
	public boolean expireIfPast(OffsetDateTime now) {
		if (!TableSessionStatus.OPEN.equals(status) || closedAt != null || expiresAt.isAfter(now)) {
			return false;
		}
		this.status = TableSessionStatus.EXPIRED;
		this.closedAt = now;
		this.updatedAt = now;
		return true;
	}

	public boolean isExpired(OffsetDateTime now) {
		return TableSessionStatus.EXPIRED.equals(status)
				|| (TableSessionStatus.OPEN.equals(status) && !expiresAt.isAfter(now));
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

	public String getStatus() {
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

	public void setStatus(String status) {
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
