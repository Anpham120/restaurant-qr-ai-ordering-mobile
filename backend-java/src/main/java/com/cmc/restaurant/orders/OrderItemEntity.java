package com.cmc.restaurant.orders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "order_items")
public class OrderItemEntity {

	@Id
	private String id;

	@Column(name = "order_id", nullable = false)
	private String orderId;

	@Column(name = "menu_item_id", nullable = false)
	private String menuItemId;

	@Column(name = "menu_item_name", nullable = false)
	private String menuItemName;

	@Column(name = "unit_price", nullable = false)
	private BigDecimal unitPrice;

	@Column(nullable = false)
	private int quantity;

	@Column(nullable = false)
	private String status;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "ready_at")
	private OffsetDateTime readyAt;

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
		this.status = OrderItemStatus.PENDING;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getOrderId() {
		return orderId;
	}

	public void setOrderId(String orderId) {
		this.orderId = orderId;
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

	public String getStatus() {
		return status;
	}

	public void setStatus(String status) {
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
