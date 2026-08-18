package com.cmc.restaurant.cart.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The server-side cart of one table session.
 *
 * <p>Its rules are stateful rather than mere field checks — quantities accumulate across requests,
 * and whether a line may be added at all depends on another aggregate (the table invoice). That is
 * the reason Cart gets a domain model while Menu did not, under the same criterion applied in
 * issues #62 and #63.
 *
 * <p>The cart lives on the server, not in the browser, so that a customer who reloads the page or
 * switches phone mid-meal still sees what they picked. That also makes it the thing two devices at
 * the same table can edit at once, which is why quantity is expressed as a <em>delta</em>: "+1" from
 * two phones must end at 2, whereas "set quantity to 1" twice would end at 1 and silently lose an
 * order.
 */
public class Cart {

	private static final int MAX_QUANTITY_PER_ITEM = 99;

	private final String tableSessionId;
	private final List<CartLine> lines;

	public Cart(String tableSessionId, List<CartLine> lines) {
		this.tableSessionId = tableSessionId;
		this.lines = new ArrayList<>(lines);
	}

	/**
	 * Applies a relative change to one menu item and returns the resulting line, or empty when the
	 * line is now gone.
	 *
	 * @param settledState the table invoice's state, so the cart can refuse to grow after the table
	 *     has started paying; {@code null} when no invoice exists yet
	 */
	public Optional<CartLine> applyDelta(String menuItemId, int delta, String note, InvoiceState settledState) {
		if (menuItemId == null || menuItemId.isBlank()) {
			throw new CartRuleViolation("REQUEST_INVALID", "menuItemId is required.");
		}
		if (delta == 0) {
			throw new CartRuleViolation("CART_DELTA_INVALID", "delta must not be zero.");
		}

		// Only growing the cart is blocked. Removing a dish must keep working while payment is
		// pending — otherwise a customer who added something by mistake is stuck paying for it.
		if (delta > 0) {
			if (settledState == InvoiceState.PaymentPending) {
				throw new CartRuleViolation("TABLE_INVOICE_PAYMENT_PENDING",
						"New cart items are disabled while payment is pending for the table invoice.");
			}
			if (settledState == InvoiceState.Settled) {
				throw new CartRuleViolation("TABLE_SESSION_SETTLED",
						"New cart items are disabled after the table invoice is settled.");
			}
		}

		String id = menuItemId.trim();
		Optional<CartLine> existing = find(id);
		int nextQuantity = existing.map(CartLine::quantity).orElse(0) + delta;

		if (nextQuantity <= 0) {
			existing.ifPresent(lines::remove);
			return Optional.empty();
		}
		if (nextQuantity > MAX_QUANTITY_PER_ITEM) {
			throw new CartRuleViolation("CART_ITEM_QUANTITY_INVALID",
					"Cart item quantity must be between 1 and " + MAX_QUANTITY_PER_ITEM + ".");
		}

		CartLine updated = existing
				.map(line -> line.withQuantity(nextQuantity))
				.orElseGet(() -> new CartLine(id, nextQuantity, note));
		existing.ifPresent(lines::remove);
		lines.add(updated);
		return Optional.of(updated);
	}

	public void clear() {
		lines.clear();
	}

	public Optional<CartLine> find(String menuItemId) {
		return lines.stream().filter(line -> line.menuItemId().equals(menuItemId)).findFirst();
	}

	public List<CartLine> lines() {
		return List.copyOf(lines);
	}

	public String tableSessionId() {
		return tableSessionId;
	}

	public int itemCount() {
		return lines.stream().mapToInt(CartLine::quantity).sum();
	}

	/** What the table invoice says about money, reduced to the three cases the cart cares about. */
	public enum InvoiceState {
		None,
		PaymentPending,
		Settled
	}
}
