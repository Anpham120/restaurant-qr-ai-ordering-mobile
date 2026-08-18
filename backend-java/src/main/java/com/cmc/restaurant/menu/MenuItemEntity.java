package com.cmc.restaurant.menu;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "menu_items")
public class MenuItemEntity {

	@Id
	private String id;

	@Column(name = "category_id", nullable = false)
	private String categoryId;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false)
	private String description;

	@Column(nullable = false, precision = 18, scale = 2)
	private BigDecimal price;

	@Column(name = "image_url")
	private String imageUrl;

	@Column(name = "is_available", nullable = false)
	private boolean available;

	@JdbcTypeCode(SqlTypes.ARRAY)
	@Column(nullable = false, columnDefinition = "text[]")
	private List<String> tags;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected MenuItemEntity() {
		// JPA
	}

	public MenuItemEntity(String id, String categoryId, String name, String description, BigDecimal price,
			String imageUrl, boolean available, List<String> tags, OffsetDateTime now) {
		this.id = id;
		this.categoryId = categoryId;
		this.name = name;
		this.description = description;
		this.price = price;
		this.imageUrl = imageUrl;
		this.available = available;
		this.tags = tags;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getCategoryId() {
		return categoryId;
	}

	public void setCategoryId(String categoryId) {
		this.categoryId = categoryId;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public BigDecimal getPrice() {
		return price;
	}

	public void setPrice(BigDecimal price) {
		this.price = price;
	}

	public String getImageUrl() {
		return imageUrl;
	}

	public void setImageUrl(String imageUrl) {
		this.imageUrl = imageUrl;
	}

	public boolean isAvailable() {
		return available;
	}

	public void setAvailable(boolean available) {
		this.available = available;
	}

	public List<String> getTags() {
		return tags;
	}

	public void setTags(List<String> tags) {
		this.tags = tags;
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
