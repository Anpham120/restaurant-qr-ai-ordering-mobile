package com.cmc.restaurant.tables;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "restaurant_tables")
public class RestaurantTableEntity {

	@Id
	private String id;

	@Column(name = "table_code", nullable = false)
	private String tableCode;

	@Column(name = "display_name", nullable = false)
	private String displayName;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	@Column(name = "qr_token")
	private String qrToken;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected RestaurantTableEntity() {
		// JPA
	}

	public String getId() {
		return id;
	}

	public String getTableCode() {
		return tableCode;
	}

	public String getDisplayName() {
		return displayName;
	}

	public boolean isActive() {
		return active;
	}

	public String getQrToken() {
		return qrToken;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}
}
