package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.orders.domain.OrderItemStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "order_items")
public class OrderItemEntity {

	@Id
	private String id;

	// The child owns the FK. Issue #6 hit a NOT NULL violation by mapping order_id from BOTH the
	// parent (@OneToMany @JoinColumn) and here as a plain @Column, so Hibernate inserted the row
	// before the FK was set. The fix is a proper bidirectional mapping — one owning side — not
	// dropping the relationship, which is what issue #61 left behind and #77 undoes.
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "order_id", nullable = false)
	private OrderEntity order;

	@Column(name = "menu_item_id", nullable = false)
	private String menuItemId;

	@Column(name = "menu_item_name", nullable = false)
	private String menuItemName;

	@Column(name = "unit_price", nullable = false)
	private BigDecimal unitPrice;

	@Column(nullable = false)
	private int quantity;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private OrderItemStatus status;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "ready_at")
	private OffsetDateTime readyAt;

	@Column(name = "selection_note", columnDefinition = "text")
	private String note;

	protected OrderItemEntity() {
		// JPA
	}

	public OrderItemEntity(String id, String menuItemId, String menuItemName, BigDecimal unitPrice, int quantity,
			OffsetDateTime now) {
		this.id = id;
		this.menuItemId = menuItemId;
		this.menuItemName = menuItemName;
		this.unitPrice = unitPrice;
		this.quantity = quantity;
		this.status = OrderItemStatus.Pending;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getNote() {
		return note;
	}

	public void setNote(String note) {
		this.note = note;
	}

	public OrderEntity getOrder() {
		return order;
	}

	/** Set by {@link OrderEntity#addItem}; keeping it package-private stops a caller from attaching
	 * a line to one order while the other order still lists it. */
	void setOrder(OrderEntity order) {
		this.order = order;
	}

	public String getMenuItemId() {
		return menuItemId;
	}

	public String getMenuItemName() {
		return menuItemName;
	}

	public BigDecimal getUnitPrice() {
		return unitPrice;
	}

	public int getQuantity() {
		return quantity;
	}

	public OrderItemStatus getStatus() {
		return status;
	}

	public void setStatus(OrderItemStatus status) {
		this.status = status;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}

	public OffsetDateTime getReadyAt() {
		return readyAt;
	}

	public void setReadyAt(OffsetDateTime readyAt) {
		this.readyAt = readyAt;
	}

	public BigDecimal lineTotal() {
		return unitPrice.multiply(BigDecimal.valueOf(quantity));
	}
}
