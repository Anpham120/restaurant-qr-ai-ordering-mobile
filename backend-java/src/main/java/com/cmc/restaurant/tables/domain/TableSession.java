package com.cmc.restaurant.tables.domain;

import com.cmc.restaurant.tables.TableSessionStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

/**
 * The table-session aggregate: the QR "sitting at a table" lifecycle, and the resume state a
 * returning customer lands in (invariants V51–V52).
 *
 * <p>Given the hexagonal split at Orders (issue #61) the same question was asked of every module in
 * issue #62, and answered with counts rather than uniformly. Tables earned a domain model — 25
 * rule-bearing lines, a five-way resume-state machine, expiry, and a one-open-session-per-table
 * constraint. Menu (6 rules, all field validation) and Auth (2) did not; see the PR for that call.
 *
 * <p>As with {@code Order}, nothing here imports Spring, JPA or HTTP, so the lifecycle and the
 * resume rules are testable with {@code new TableSession(...)} alone.
 */
public class TableSession {

	/** An order that still keeps the table "in progress". Mirrors the .NET resolver exactly. */
	private static final Set<String> IN_PROGRESS_ORDER_STATUSES =
			Set.of("Draft", "Placed", "Confirmed", "Preparing", "Ready");

	private final String id;
	private final String restaurantTableId;
	private final String tableCode;
	private final OffsetDateTime expiresAt;
	private TableSessionStatus status;
	private OffsetDateTime closedAt;
	private OffsetDateTime updatedAt;

	public TableSession(
			String id, String restaurantTableId, String tableCode, TableSessionStatus status,
			OffsetDateTime expiresAt, OffsetDateTime closedAt, OffsetDateTime updatedAt) {
		this.id = id;
		this.restaurantTableId = restaurantTableId;
		this.tableCode = tableCode;
		this.status = status;
		this.expiresAt = expiresAt;
		this.closedAt = closedAt;
		this.updatedAt = updatedAt;
	}

	// --- lifecycle ---------------------------------------------------------------------------

	/** Usable right now: still open, not closed, not past its expiry. */
	public boolean isActiveAt(OffsetDateTime now) {
		return status == TableSessionStatus.Open && closedAt == null && expiresAt.isAfter(now);
	}

	/**
	 * Past its expiry, whether or not anyone has written that down yet. Deliberately separate from
	 * {@link #isActiveAt}: a session whose row still says {@code Open} but whose {@code expiresAt}
	 * has passed is already expired in every sense that matters to the customer, and answering
	 * "still open" because a sweeper has not run yet would be wrong.
	 */
	public boolean isExpiredAt(OffsetDateTime now) {
		return status == TableSessionStatus.Expired
				|| (status == TableSessionStatus.Open && !expiresAt.isAfter(now));
	}

	/** Writes the expiry down. Returns whether it actually transitioned, so the caller only
	 * persists when something changed. */
	public boolean expireIfPast(OffsetDateTime now) {
		if (!isExpiredAt(now) || status != TableSessionStatus.Open) {
			return false;
		}
		status = TableSessionStatus.Expired;
		closedAt = now;
		updatedAt = now;
		return true;
	}

	/** Staff closing the table. Closing an already-closed session is a no-op rather than an error:
	 * two staff pressing the same button must not produce a failure for the second one. */
	public boolean close(OffsetDateTime now) {
		if (status != TableSessionStatus.Open) {
			return false;
		}
		status = TableSessionStatus.Closed;
		closedAt = now;
		updatedAt = now;
		return true;
	}

	public void touch(OffsetDateTime now) {
		updatedAt = now;
	}

	// --- resume state (V51-V52) ---------------------------------------------------------------

	/**
	 * Where a customer who re-scans the QR should land. Ported from
	 * {@code TableSessionResumeStateResolver.Resolve} (.NET).
	 *
	 * <p>Order matters and is not arbitrary: a settled invoice wins over anything still in the
	 * cart, and a payment in progress wins over order state, because sending a customer back to
	 * "add more dishes" while their payment is pending is how a table ends up paying twice.
	 */
	public static TableSessionResumeState resolveResumeState(
			long cartItemCount, List<String> orderStatuses, String invoiceStatus) {
		if ("Paid".equals(invoiceStatus) || "Confirmed".equals(invoiceStatus)) {
			return TableSessionResumeState.Paid;
		}
		if ("Pending".equals(invoiceStatus)) {
			return TableSessionResumeState.PaymentPending;
		}

		List<String> activeOrders = orderStatuses.stream().filter(s -> !"Cancelled".equals(s)).toList();
		if (activeOrders.isEmpty()) {
			return cartItemCount > 0 ? TableSessionResumeState.CartPending : TableSessionResumeState.New;
		}
		return activeOrders.stream().anyMatch(IN_PROGRESS_ORDER_STATUSES::contains)
				? TableSessionResumeState.OrderInProgress
				: TableSessionResumeState.ReadyForPayment;
	}

	// --- state -------------------------------------------------------------------------------

	public String id() {
		return id;
	}

	public String restaurantTableId() {
		return restaurantTableId;
	}

	public String tableCode() {
		return tableCode;
	}

	public TableSessionStatus status() {
		return status;
	}

	public OffsetDateTime expiresAt() {
		return expiresAt;
	}

	public OffsetDateTime closedAt() {
		return closedAt;
	}

	public OffsetDateTime updatedAt() {
		return updatedAt;
	}
}
