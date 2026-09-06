package com.cmc.restaurant.orders.domain;

/** Payment gate shared by whole-order and item-level preparation commands. */
public final class PreparationPaymentPolicy {

	private PreparationPaymentPolicy() {
	}

	public static boolean allowsPreparation(OrderType orderType, boolean paymentSettled) {
		return !orderType.requiresPrepayment() || paymentSettled;
	}
}
