package com.cmc.restaurant.cart;

import com.cmc.restaurant.orders.application.OrderService;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Maps {@code table_session_cart_items}. The table already existed in the baseline schema — until
 * issue #52 the Java backend only ever deleted from it (in {@code OrderService}, by raw SQL, after
 * an order was placed) because the Cart module itself was still on .NET. */
@Entity
@Table(name = "table_session_cart_items")
public class CartItemEntity {

	@Id
	private String id;

	@Column(name = "table_session_id", nullable = false)
	private String tableSessionId;

	@Column(name = "menu_item_id", nullable = false)
	private String menuItemId;

	@Column(nullable = false)
	private int quantity;

	@Column
	private String note;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected CartItemEntity() {
	}

	public CartItemEntity(String id, String tableSessionId, String menuItemId, int quantity, String note,
			OffsetDateTime updatedAt) {
		this.id = id;
		this.tableSessionId = tableSessionId;
		this.menuItemId = menuItemId;
		this.quantity = quantity;
		this.note = note;
		this.updatedAt = updatedAt;
	}

	public String getId() {
		return id;
	}

	public String getMenuItemId() {
		return menuItemId;
	}

	public int getQuantity() {
		return quantity;
	}

	public void setQuantity(int quantity) {
		this.quantity = quantity;
	}

	public String getNote() {
		return note;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}
}
