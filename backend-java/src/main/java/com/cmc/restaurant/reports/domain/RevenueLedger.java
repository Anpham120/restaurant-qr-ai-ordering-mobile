package com.cmc.restaurant.reports.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Decides <em>which</em> money counts as revenue, once.
 *
 * <p>Reports is otherwise a read-only aggregation and would not earn a domain class under the
 * criterion used since issue #62. This one rule does: the system settles money in two different
 * shapes, and adding them up naively double-counts.
 *
 * <ul>
 *   <li><b>Table invoice</b> — the current model (V14): many order rounds at one table settle
 *       together in a single invoice.</li>
 *   <li><b>Per-order payment</b> — the older shape, still present in historical rows, where each
 *       order carried its own payment.</li>
 * </ul>
 *
 * <p>An order that belongs to a settled table session is <em>already</em> inside that invoice's
 * total. Counting its own payment as well reports revenue the restaurant never took — the kind of
 * error nobody notices until the numbers are compared against the bank.
 */
public final class RevenueLedger {

	private RevenueLedger() {
	}

	/** One settled amount, whichever shape it came from. */
	public record Settlement(OffsetDateTime paidAt, BigDecimal subtotal, BigDecimal discount, BigDecimal total) {
	}

	/** An order line that counts towards "top selling items". */
	public record SoldItem(String menuItemId, String name, int quantity, BigDecimal lineTotal) {
	}

	public record TopItem(String menuItemId, String name, int quantitySold, BigDecimal revenue) {
	}

	public record DailyRevenue(String date, int orderCount, BigDecimal revenue) {
	}

	/**
	 * Keeps only the per-order payments that are NOT already represented by a settled table invoice.
	 *
	 * @param paidSessionIds sessions whose invoice is already counted
	 */
	public static List<Settlement> excludeAlreadyInvoiced(
			List<Settlement> perOrderSettlements, List<String> orderSessionIds, Set<String> paidSessionIds) {
		List<Settlement> kept = new ArrayList<>();
		for (int i = 0; i < perOrderSettlements.size(); i++) {
			String sessionId = i < orderSessionIds.size() ? orderSessionIds.get(i) : null;
			if (sessionId == null || !paidSessionIds.contains(sessionId)) {
				kept.add(perOrderSettlements.get(i));
			}
		}
		return kept;
	}

	/** Top sellers by quantity, then by revenue. Cancelled lines are excluded by the caller. */
	public static List<TopItem> topItems(List<SoldItem> items, int limit) {
		Map<String, TopItem> grouped = new LinkedHashMap<>();
		for (SoldItem item : items) {
			String key = item.menuItemId() + "|" + item.name();
			TopItem existing = grouped.get(key);
			if (existing == null) {
				grouped.put(key, new TopItem(item.menuItemId(), item.name(), item.quantity(), item.lineTotal()));
			} else {
				grouped.put(key, new TopItem(existing.menuItemId(), existing.name(),
						existing.quantitySold() + item.quantity(),
						existing.revenue().add(item.lineTotal())));
			}
		}
		return grouped.values().stream()
				.sorted(Comparator.comparingInt(TopItem::quantitySold).reversed()
						.thenComparing(TopItem::revenue, Comparator.reverseOrder()))
				.limit(limit)
				.toList();
	}

	/** Revenue per calendar day (UTC), oldest first. */
	public static List<DailyRevenue> perDay(List<Settlement> settlements) {
		Map<String, DailyRevenue> byDay = new LinkedHashMap<>();
		for (Settlement s : settlements) {
			String day = s.paidAt().atZoneSameInstant(ZoneOffset.UTC).toLocalDate().toString();
			DailyRevenue existing = byDay.get(day);
			byDay.put(day, existing == null
					? new DailyRevenue(day, 1, s.total())
					: new DailyRevenue(day, existing.orderCount() + 1, existing.revenue().add(s.total())));
		}
		return byDay.values().stream().sorted(Comparator.comparing(DailyRevenue::date)).toList();
	}

	public static BigDecimal sum(List<Settlement> settlements, java.util.function.Function<Settlement, BigDecimal> field) {
		return settlements.stream().map(field).reduce(BigDecimal.ZERO, BigDecimal::add);
	}
}
