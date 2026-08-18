package com.cmc.restaurant.menu;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "categories")
public class CategoryEntity {

	@Id
	private String id;

	@Column(nullable = false)
	private String name;

	@Column(name = "display_order", nullable = false)
	private int displayOrder;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected CategoryEntity() {
		// JPA
	}

	public CategoryEntity(String id, String name, int displayOrder, boolean active, OffsetDateTime now) {
		this.id = id;
		this.name = name;
		this.displayOrder = displayOrder;
		this.active = active;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public int getDisplayOrder() {
		return displayOrder;
	}

	public void setDisplayOrder(int displayOrder) {
		this.displayOrder = displayOrder;
	}

	public boolean isActive() {
		return active;
	}

	public void setActive(boolean active) {
		this.active = active;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}
}
