package com.cmc.restaurant.tables;

import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import java.util.List;
import java.util.Set;

/** Mirrors {@code TableSessionResumeStateResolver.Resolve} (.NET) exactly — invariants V51/V52. */
public final class TableSessionResumeStateResolver {

	private static final Set<String> IN_PROGRESS_ORDER_STATUSES =
			Set.of("Draft", "Placed", "Confirmed", "Preparing", "Ready");

	private TableSessionResumeStateResolver() {
	}

	public static TableSessionResumeState resolve(
			long cartItemCount, List<String> orderStatuses, String invoiceStatus) {
		if ("Paid".equals(invoiceStatus) || "Confirmed".equals(invoiceStatus)) {
			return TableSessionResumeState.Paid;
		}

		if ("Pending".equals(invoiceStatus)) {
			return TableSessionResumeState.PaymentPending;
		}

		List<String> activeOrderStatuses = orderStatuses.stream()
				.filter(status -> !"Cancelled".equals(status))
				.toList();

		if (activeOrderStatuses.isEmpty()) {
			return cartItemCount > 0 ? TableSessionResumeState.CartPending : TableSessionResumeState.New;
		}

		boolean anyInProgress = activeOrderStatuses.stream().anyMatch(IN_PROGRESS_ORDER_STATUSES::contains);
		return anyInProgress ? TableSessionResumeState.OrderInProgress : TableSessionResumeState.ReadyForPayment;
	}
}
