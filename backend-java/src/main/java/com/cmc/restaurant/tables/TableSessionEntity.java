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

	/** Lifecycle rules live in {@link com.cmc.restaurant.tables.domain.TableSession} since issue
	 * #62; these delegate so there is exactly one copy of them. The entity keeps them as methods
	 * rather than forcing every caller to build a domain object for a yes/no question. */
	private com.cmc.restaurant.tables.domain.TableSession asDomain() {
		return new com.cmc.restaurant.tables.domain.TableSession(
				id, restaurantTableId, tableCode, status, expiresAt, closedAt, updatedAt);
	}

	public boolean isActiveAt(OffsetDateTime now) {
		return asDomain().isActiveAt(now);
	}

	public boolean isExpired(OffsetDateTime now) {
		return asDomain().isExpiredAt(now);
	}

	/**
	 * Đóng phiên vì hoá đơn vừa được tất toán (#96).
	 *
	 * <p>Tách khỏi {@link #expireIfPast}: hết hạn là phiên tự chết vì quá giờ, còn đây là khách đã
	 * trả tiền và rời bàn. Hai lý do khác nhau, và cột {@code status} ghi lại đúng lý do nào — báo
	 * cáo phân biệt được bàn bỏ dở với bàn thanh toán xong.
	 */
	void closeAt(OffsetDateTime now) {
		this.status = TableSessionStatus.Closed;
		this.closedAt = now;
		this.updatedAt = now;
	}

	/** Returns true (and mutates state to Expired) only if it actually transitioned. */
	public boolean expireIfPast(OffsetDateTime now) {
		com.cmc.restaurant.tables.domain.TableSession session = asDomain();
		if (!session.expireIfPast(now)) {
			return false;
		}
		this.status = session.status();
		this.closedAt = session.closedAt();
		this.updatedAt = session.updatedAt();
		return true;
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
