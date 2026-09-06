package com.cmc.restaurant.orders.domain;

import java.math.BigDecimal;

/** Legal courier transitions and cash collection invariants. */
public final class DeliveryPolicy {
	private DeliveryPolicy() {
	}

	public static void requireTransition(String current, String next, String note) {
		boolean allowed = "Assigned".equals(current) && "OutForDelivery".equals(next)
				|| "OutForDelivery".equals(current) && ("Delivered".equals(next) || "Failed".equals(next));
		if (!allowed) {
			throw new OrderRuleViolation("DELIVERY_STATUS_INVALID", "Trạng thái giao hàng không hợp lệ.");
		}
		if (("Failed".equals(next) && (note == null || note.isBlank())) || (note != null && note.length() > 500)) {
			throw new OrderRuleViolation("DELIVERY_NOTE_REQUIRED", "Giao thất bại cần lý do, tối đa 500 ký tự.");
		}
	}

	public static void requireExactCollection(BigDecimal total, BigDecimal received) {
		if (received == null || received.compareTo(total) != 0) {
			throw new OrderRuleViolation("COD_AMOUNT_MISMATCH", "Tiền đã thu phải bằng tổng đơn, gồm phí giao hàng.");
		}
	}
}
