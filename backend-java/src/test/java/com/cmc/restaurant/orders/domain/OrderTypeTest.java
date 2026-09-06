package com.cmc.restaurant.orders.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class OrderTypeTest {

	@Test
	void parsesAllSupportedTypesWithoutBreakingLegacyCase() {
		assertThat(OrderType.parse("DineIn")).contains(OrderType.DineIn);
		assertThat(OrderType.parse("pickup")).contains(OrderType.Pickup);
		assertThat(OrderType.parse(" Delivery ")).contains(OrderType.Delivery);
		assertThat(OrderType.parse("Ship")).isEmpty();
	}

	@Test
	void dineInMayPrepareBeforePayment() {
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.DineIn, false)).isTrue();
	}

	@Test
	void pickupAndDeliveryRequireSettledPayment() {
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.Pickup, false)).isFalse();
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.Delivery, false)).isFalse();
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.Pickup, true)).isTrue();
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.Delivery, true)).isTrue();
	}
}
