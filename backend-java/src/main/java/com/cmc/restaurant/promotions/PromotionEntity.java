package com.cmc.restaurant.promotions;

import com.cmc.restaurant.promotions.domain.Promotion;
import com.cmc.restaurant.promotions.domain.PromotionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Maps the existing {@code promotions} table. */
@Entity
@Table(name = "promotions")
public class PromotionEntity {

	@Id
	private String id;

	@Column(nullable = false, unique = true)
	private String code;

	@Column(nullable = false)
	private String name;

	@Column
	private String description;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private PromotionType type;

	@Column(name = "discount_value", nullable = false)
	private BigDecimal discountValue;

	@Column(name = "min_order_amount")
	private BigDecimal minOrderAmount;

	@Column(name = "max_discount_amount")
	private BigDecimal maxDiscountAmount;

	@Column(name = "is_flash_sale", nullable = false)
	private boolean flashSale;

	@Column(name = "starts_at")
	private OffsetDateTime startsAt;

	@Column(name = "ends_at")
	private OffsetDateTime endsAt;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected PromotionEntity() {
	}

	/** Khuyến mãi do quản trị viên tạo (#93). */
	PromotionEntity(String id, OffsetDateTime now) {
		this.id = id;
		this.createdAt = now;
		this.updatedAt = now;
	}

	/**
	 * Ghi toàn bộ phần quản trị viên nhập được.
	 *
	 * <p>Một hàm cho cả 11 trường thay vì 11 setter rời: tạo và sửa dùng chung đúng tập trường
	 * này, nên tách lẻ sẽ mở ra khả năng một đường ghi thiếu trường mà không có gì báo. Bản .NET
	 * cũng gán liền một mạch ở cả hai endpoint.
	 *
	 * <p>Package-private: chỉ {@code AdminPromotionService} — nơi đã gọi
	 * {@code Promotion.validateDefinition} — được phép ghi.
	 */
	void applyDefinition(
			String code, String name, String description, PromotionType type, BigDecimal discountValue,
			BigDecimal minOrderAmount, BigDecimal maxDiscountAmount, boolean flashSale,
			OffsetDateTime startsAt, OffsetDateTime endsAt, boolean active, OffsetDateTime now) {
		this.code = code;
		this.name = name;
		this.description = description;
		this.type = type;
		this.discountValue = discountValue;
		this.minOrderAmount = minOrderAmount;
		this.maxDiscountAmount = maxDiscountAmount;
		this.flashSale = flashSale;
		this.startsAt = startsAt;
		this.endsAt = endsAt;
		this.active = active;
		this.updatedAt = now;
	}

	public Promotion toDomain() {
		return new Promotion(id, code, name, type, discountValue, minOrderAmount, maxDiscountAmount,
				startsAt, endsAt, active);
	}

	public String getCode() {
		return code;
	}

	public String getName() {
		return name;
	}

	public String getDescription() {
		return description;
	}

	public boolean isFlashSale() {
		return flashSale;
	}

	// --- đọc cho màn quản trị (#93) --------------------------------------------------------------

	public String getId() {
		return id;
	}

	public PromotionType getType() {
		return type;
	}

	public BigDecimal getDiscountValue() {
		return discountValue;
	}

	public BigDecimal getMinOrderAmount() {
		return minOrderAmount;
	}

	public BigDecimal getMaxDiscountAmount() {
		return maxDiscountAmount;
	}

	public OffsetDateTime getStartsAt() {
		return startsAt;
	}

	public OffsetDateTime getEndsAt() {
		return endsAt;
	}

	public boolean isActive() {
		return active;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}
}
