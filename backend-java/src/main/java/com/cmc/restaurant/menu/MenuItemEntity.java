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

	/**
	 * Phút từ lúc bếp nhận món tới lúc món sẵn sàng. {@code null} = chưa khai.
	 *
	 * <p>V11 tạo cột này và điền giá trị khởi tạo suy từ nhãn {@code method:}, kèm lời hứa "bếp sửa
	 * lại qua PATCH khi thấy sai". Lời hứa đó chưa bao giờ thành: entity KHÔNG ánh xạ cột, DTO không
	 * có trường, giao diện không có ô. Suốt từ V11 tới nay chỉ migration ghi được con số mà mọi ước
	 * lượng thời gian lên món đều dựa vào.
	 *
	 * <p>ĐÂY LÀ THỜI GIAN LÊN MÓN, KHÔNG PHẢI THỜI GIAN NẤU. Phở ninh nước dùng cả đêm nhưng múc ra
	 * bát chỉ vài phút.
	 */
	@Column(name = "prep_minutes")
	private Integer prepMinutes;

	@jakarta.persistence.Convert(converter = MenuOptionsConverter.class)
	@Column(name = "option_groups_json", nullable = false, columnDefinition = "text")
	private List<MenuOptionGroup> optionGroups = List.of();

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

	public Integer getPrepMinutes() {
		return prepMinutes;
	}

	public List<MenuOptionGroup> getOptionGroups() {
		return optionGroups == null ? List.of() : optionGroups;
	}

	public void setOptionGroups(List<MenuOptionGroup> optionGroups) {
		this.optionGroups = optionGroups;
	}

	public void setPrepMinutes(Integer prepMinutes) {
		this.prepMinutes = prepMinutes;
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
