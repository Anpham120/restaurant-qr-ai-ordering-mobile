package com.cmc.restaurant.orders;

import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "order_status_history")
public class OrderStatusHistoryEntity {

	@Id
	private String id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "order_id", nullable = false)
	private OrderEntity order;

	@Column(name = "from_status")
	private String fromStatus;

	@Column(name = "to_status", nullable = false)
	private String toStatus;

	@Column(nullable = false)
	private String source;

	@Column(name = "changed_by_user_id")
	private String changedByUserId;

	@Column(name = "changed_by_role")
	private String changedByRole;

	@Column
	private String note;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected OrderStatusHistoryEntity() {
		// JPA
	}

	public OrderStatusHistoryEntity(String id, String fromStatus, String toStatus, String source,
			String changedByUserId, String changedByRole, String note, OffsetDateTime createdAt) {
		this.id = id;
		this.fromStatus = fromStatus;
		this.toStatus = toStatus;
		this.source = source;
		this.changedByUserId = changedByUserId;
		this.changedByRole = changedByRole;
		this.note = note;
		this.createdAt = createdAt;
	}

	void setOrder(OrderEntity order) {
		this.order = order;
	}

	public String getToStatus() {
		return toStatus;
	}

	public String getSource() {
		return source;
	}

	public String getChangedByRole() {
		return changedByRole;
	}

	public String getNote() {
		return note;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}
}
