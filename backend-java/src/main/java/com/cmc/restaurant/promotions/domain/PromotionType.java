package com.cmc.restaurant.promotions.domain;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.PromotionType} (.NET). Names match the database
 * strings so {@code @Enumerated(STRING)} needs no migration. */
public enum PromotionType {
	Percentage,
	FixedAmount
}
