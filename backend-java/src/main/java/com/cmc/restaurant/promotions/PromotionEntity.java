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
}
