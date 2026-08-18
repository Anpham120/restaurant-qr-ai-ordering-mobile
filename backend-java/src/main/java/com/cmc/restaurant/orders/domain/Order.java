package com.cmc.restaurant.orders.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The Order aggregate — every rule about how an order may change lives here.
 *
 * <p>Before issue #61 this class did not exist: {@code OrderEntity} was 20 getters and setters, and
 * the rules sat in {@code static} helpers on {@code OrderService} that read and wrote those setters
 * from outside. That is transaction script — a faithful copy of {@code OrderStore.cs}, and the
 * reason the plan (§5.3) asked for this separation in the first place.
 *
 * <p>Two consequences are the point of the change:
 * <ul>
 *   <li>{@code status} has no public setter. The only ways to move an order are
 *       {@link #transitionTo}, {@link #updateItemStatus} and {@link #cancelItemAsCustomer}, so no
 *       caller can put the aggregate in a state its own rules forbid.</li>
 *   <li>Nothing here imports Spring, JPA or HTTP, so the whole state machine is testable with
 *       {@code new Order(...)} and no database — which is exactly what §5.3 promised.</li>
 * </ul>
 */
public class Order {

	private static final Set<OrderStatus> KITCHEN_IN_FLIGHT =
			EnumSet.of(OrderStatus.Placed, OrderStatus.Confirmed, OrderStatus.Preparing);
	private static final Set<OrderItemStatus> ITEM_DONE =
			EnumSet.of(OrderItemStatus.Ready, OrderItemStatus.Served);
	private static final Set<OrderItemStatus> ITEM_STARTED =
			EnumSet.of(OrderItemStatus.Preparing, OrderItemStatus.Ready, OrderItemStatus.Served);
	private static final Set<OrderStatus> CANCEL_LOCKED = EnumSet.of(
			OrderStatus.Preparing, OrderStatus.Ready, OrderStatus.Served, OrderStatus.Completed);

	private final String id;
	private final String orderCode;
	private final String tableCode;
	private final String tableSessionId;
	private final String customerAccessToken;
	private OrderStatus status;
	private OffsetDateTime updatedAt;
	private final List<OrderItem> items;
	private final List<StatusChange> newChanges = new ArrayList<>();

	public Order(
			String id, String orderCode, String tableCode, String tableSessionId, String customerAccessToken,
			OrderStatus status, OffsetDateTime updatedAt, List<OrderItem> items) {
		this.id = id;
		this.orderCode = orderCode;
		this.tableCode = tableCode;
		this.tableSessionId = tableSessionId;
		this.customerAccessToken = customerAccessToken;
		this.status = status;
		this.updatedAt = updatedAt;
		this.items = new ArrayList<>(items);
	}

	// --- rules -------------------------------------------------------------------------------

	/**
	 * Staff/kitchen moving the whole order. Throws {@link OrderRuleViolation} with the same error
	 * codes the API already returns, so the web adapter only has to choose a status code.
	 */
	public void transitionTo(OrderStatus next, Actor actor, OffsetDateTime now) {
		if (next == OrderStatus.Cancelled && isCancellationLocked()) {
			throw new OrderRuleViolation("ORDER_CANCEL_NOT_ALLOWED",
					"Order cannot be cancelled after it or any item reaches Preparing.");
		}
		if (!canTransitionTo(next)) {
			throw new OrderRuleViolation("ORDER_STATUS_TRANSITION_INVALID",
					"Order status transition is not allowed.");
		}

		OrderStatus from = status;
		status = next;
		updatedAt = now;
		newChanges.add(new StatusChange(from, next, StatusChange.SOURCE_STATUS, actor, null, now));

		// Cancelling the order cancels its still-pending items so item state never contradicts the
		// order. Cancellation is locked once any item passed Pending, so only Pending items remain.
		if (next == OrderStatus.Cancelled) {
			items.stream().filter(i -> i.status() == OrderItemStatus.Pending)
					.forEach(i -> i.moveTo(OrderItemStatus.Cancelled, now));
		}
		// Serving from the board is one atomic step: the order and every non-cancelled item agree.
		if (next == OrderStatus.Served) {
			items.stream().filter(OrderItem::isActive).forEach(i -> i.moveTo(OrderItemStatus.Served, now));
		}
	}

	/** Kitchen/staff moving one dish. The order's own status follows from its items. */
	public OrderItem updateItemStatus(String orderItemId, OrderItemStatus next, Actor actor, OffsetDateTime now) {
		if (status == OrderStatus.Completed || status == OrderStatus.Cancelled) {
			throw new OrderRuleViolation("ORDER_STATUS_TERMINAL", "Completed or cancelled orders cannot be changed.");
		}
		OrderItem item = requireItem(orderItemId);
		if (!item.canTransitionTo(next)) {
			throw new OrderRuleViolation("ORDER_ITEM_STATUS_TRANSITION_INVALID",
					"Order item status transition is not allowed.");
		}
		item.moveTo(next, now);
		reconcileWithItems(actor, now);
		return item;
	}

	/**
	 * Hạn chế #11 — the customer cancelling their own dish. Stricter than the staff path on
	 * purpose: staff may still cancel a {@code Preparing} item, a customer may not, because by then
	 * the kitchen has committed ingredients. Locked per item, not per order — a customer can cancel
	 * their untouched dish even when a different dish on the same order is already cooking.
	 */
	public OrderItem cancelItemAsCustomer(String orderItemId, OffsetDateTime now) {
		OrderItem item = requireItem(orderItemId);
		if (item.status() != OrderItemStatus.Pending) {
			throw new OrderRuleViolation("ORDER_ITEM_CANCEL_NOT_ALLOWED",
					"This item can no longer be cancelled once the kitchen has started preparing it.");
		}
		item.moveTo(OrderItemStatus.Cancelled, now);
		reconcileWithItems(Actor.CUSTOMER, now);
		return item;
	}

	/** Records a payment event against the order without changing its status — mirrors
	 * {@code OrderStore.RecordPaymentStatusEvent} (.NET), where from and to are both the current
	 * status. */
	public void recordPaymentEvent(Actor actor, String note, OffsetDateTime now) {
		newChanges.add(new StatusChange(status, status, StatusChange.SOURCE_PAYMENT, actor, note, now));
	}

	/** Derives the order's status from its items after one of them moved, and records the change if
	 * the order actually moved. */
	private void reconcileWithItems(Actor actor, OffsetDateTime now) {
		OrderStatus derived = deriveFromItems();
		if (derived != status) {
			OrderStatus from = status;
			status = derived;
			newChanges.add(new StatusChange(from, derived, StatusChange.SOURCE_STATUS, actor, null, now));
		}
		updatedAt = now;
	}

	private OrderStatus deriveFromItems() {
		List<OrderItem> active = items.stream().filter(OrderItem::isActive).toList();
		if (active.isEmpty()) {
			return status;
		}
		if (KITCHEN_IN_FLIGHT.contains(status) && active.stream().allMatch(i -> ITEM_DONE.contains(i.status()))) {
			return OrderStatus.Ready;
		}
		if (status == OrderStatus.Ready && active.stream().allMatch(i -> i.status() == OrderItemStatus.Served)) {
			return OrderStatus.Served;
		}
		boolean notStarted = status == OrderStatus.Placed || status == OrderStatus.Confirmed;
		if (notStarted && active.stream().anyMatch(i -> ITEM_STARTED.contains(i.status()))) {
			return OrderStatus.Preparing;
		}
		return status;
	}

	private boolean canTransitionTo(OrderStatus next) {
		if (next == OrderStatus.Cancelled) {
			return status == OrderStatus.Placed || status == OrderStatus.Confirmed;
		}
		return switch (status) {
			case Placed -> next == OrderStatus.Confirmed || next == OrderStatus.Preparing;
			case Confirmed -> next == OrderStatus.Preparing;
			case Preparing -> next == OrderStatus.Ready;
			case Ready -> next == OrderStatus.Served;
			case Served -> next == OrderStatus.Completed;
			default -> false;
		};
	}

	private boolean isCancellationLocked() {
		return CANCEL_LOCKED.contains(status)
				|| items.stream().anyMatch(i -> ITEM_STARTED.contains(i.status()));
	}

	private OrderItem requireItem(String orderItemId) {
		return findItem(orderItemId).orElseThrow(
				() -> new OrderRuleViolation("ORDER_ITEM_NOT_FOUND", "Order item was not found."));
	}

	public Optional<OrderItem> findItem(String orderItemId) {
		return items.stream().filter(i -> i.id().equalsIgnoreCase(orderItemId)).findFirst();
	}

	/** True when the supplied per-order token matches, compared in constant time so a wrong token
	 * cannot be discovered character by character. */
	public boolean matchesCustomerToken(String supplied) {
		if (customerAccessToken == null || customerAccessToken.isEmpty() || supplied == null || supplied.isEmpty()) {
			return false;
		}
		byte[] a = customerAccessToken.getBytes(java.nio.charset.StandardCharsets.UTF_8);
		byte[] b = supplied.getBytes(java.nio.charset.StandardCharsets.UTF_8);
		if (a.length != b.length) {
			return false;
		}
		int diff = 0;
		for (int i = 0; i < a.length; i++) {
			diff |= a[i] ^ b[i];
		}
		return diff == 0;
	}

	// --- state -------------------------------------------------------------------------------

	public String id() {
		return id;
	}

	public String orderCode() {
		return orderCode;
	}

	public String tableCode() {
		return tableCode;
	}

	public String tableSessionId() {
		return tableSessionId;
	}

	public String customerAccessToken() {
		return customerAccessToken;
	}

	public OrderStatus status() {
		return status;
	}

	public OffsetDateTime updatedAt() {
		return updatedAt;
	}

	public List<OrderItem> items() {
		return Collections.unmodifiableList(items);
	}

	public BigDecimal subtotal() {
		return items.stream().filter(OrderItem::isActive)
				.map(OrderItem::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	/** Changes made since this aggregate was loaded, for the persistence adapter to append. Cleared
	 * once taken so a second save cannot duplicate the audit trail. */
	public List<StatusChange> takeNewChanges() {
		List<StatusChange> taken = List.copyOf(newChanges);
		newChanges.clear();
		return taken;
	}
}
