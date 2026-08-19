package com.cmc.restaurant.reports;

import com.cmc.restaurant.reports.domain.ReportRange;
import com.cmc.restaurant.reports.domain.RevenueLedger;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Mirrors {@code ReportEndpoints.cs} (.NET) — the admin revenue summary.
 *
 * <p>Reads go through {@link JdbcTemplate} rather than JPA on purpose, and this is the one module
 * where that is the right call rather than a shortcut: a report joins across orders, order items,
 * invoices and payments purely to aggregate, and loading those as managed entities would build an
 * object graph the report immediately reduces to numbers. The queries here return exactly the
 * columns the report sums.
 *
 * <p>Which rows count at all is decided by {@link RevenueLedger}, not here.
 */
@Service
public class ReportService {

	private static final int TOP_ITEM_LIMIT = 10;

	private final JdbcTemplate jdbcTemplate;

	public ReportService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public ReportDtos.SummaryResponse summary(OffsetDateTime from, OffsetDateTime to) {
		ReportRange range = ReportRange.resolve(from, to, OffsetDateTime.now());

		// 1. Table invoices settled in the window (the current V14 shape).
		List<RevenueLedger.Settlement> invoiceSettlements = jdbcTemplate.query(
				"select p.paid_at, i.subtotal_amount, i.discount_amount, i.total_amount "
						+ "from table_invoices i join payments p on p.table_invoice_id = i.id "
						+ "where p.paid_at >= ? and p.paid_at < ? and i.status in ('Paid', 'Confirmed')",
				(rs, n) -> new RevenueLedger.Settlement(
						rs.getObject("paid_at", OffsetDateTime.class), rs.getBigDecimal("subtotal_amount"),
						rs.getBigDecimal("discount_amount"), rs.getBigDecimal("total_amount")),
				range.from(), range.to());

		Set<String> paidSessionIds = new HashSet<>(jdbcTemplate.queryForList(
				"select i.table_session_id from table_invoices i join payments p on p.table_invoice_id = i.id "
						+ "where p.paid_at >= ? and p.paid_at < ? and i.status in ('Paid', 'Confirmed') "
						+ "and i.table_session_id is not null",
				String.class, range.from(), range.to()));

		// 2. Per-order payments (the older shape, still present in historical rows).
		List<RevenueLedger.Settlement> orderSettlements = new ArrayList<>();
		List<String> orderSessionIds = new ArrayList<>();
		jdbcTemplate.query(
				"select o.table_session_id, coalesce(p.paid_at, o.updated_at) as paid_at, "
						+ "o.subtotal_amount, o.discount_amount, o.total_amount "
						+ "from orders o join payments p on p.order_id = o.id "
						+ "where p.status in ('Paid', 'Confirmed') "
						+ "and coalesce(p.paid_at, o.updated_at) >= ? and coalesce(p.paid_at, o.updated_at) < ?",
				rs -> {
					orderSessionIds.add(rs.getString("table_session_id"));
					orderSettlements.add(new RevenueLedger.Settlement(
							rs.getObject("paid_at", OffsetDateTime.class), rs.getBigDecimal("subtotal_amount"),
							rs.getBigDecimal("discount_amount"), rs.getBigDecimal("total_amount")));
				},
				range.from(), range.to());

		List<RevenueLedger.Settlement> legacySettlements =
				RevenueLedger.excludeAlreadyInvoiced(orderSettlements, orderSessionIds, paidSessionIds);

		List<RevenueLedger.Settlement> revenue = new ArrayList<>(invoiceSettlements);
		revenue.addAll(legacySettlements);

		// 3. Items sold on any order that contributed revenue.
		List<RevenueLedger.SoldItem> soldItems = jdbcTemplate.query(
				"select oi.menu_item_id, oi.menu_item_name, oi.quantity, "
						+ "(oi.unit_price * oi.quantity) as line_total "
						+ "from order_items oi join orders o on o.id = oi.order_id "
						+ "left join payments p on p.order_id = o.id "
						+ "where oi.status <> 'Cancelled' and ("
						+ "  (o.table_session_id is not null and o.table_session_id in "
						+ "     (select i.table_session_id from table_invoices i "
						+ "      join payments ip on ip.table_invoice_id = i.id "
						+ "      where ip.paid_at >= ? and ip.paid_at < ? and i.status in ('Paid','Confirmed'))) "
						+ "  or (p.status in ('Paid','Confirmed') and coalesce(p.paid_at, o.updated_at) >= ? "
						+ "      and coalesce(p.paid_at, o.updated_at) < ?))",
				(rs, n) -> new RevenueLedger.SoldItem(
						rs.getString("menu_item_id"), rs.getString("menu_item_name"),
						rs.getInt("quantity"), rs.getBigDecimal("line_total")),
				range.from(), range.to(), range.from(), range.to());

		Integer totalOrders = jdbcTemplate.queryForObject(
				"select count(*) from orders where created_at >= ? and created_at < ?",
				Integer.class, range.from(), range.to());

		List<ReportDtos.TopItemResponse> topItems = RevenueLedger.topItems(soldItems, TOP_ITEM_LIMIT).stream()
				.map(t -> new ReportDtos.TopItemResponse(t.menuItemId(), t.name(), t.quantitySold(), t.revenue()))
				.toList();
		List<ReportDtos.DailyRevenueResponse> daily = RevenueLedger.perDay(revenue).stream()
				.map(d -> new ReportDtos.DailyRevenueResponse(d.date(), d.orderCount(), d.revenue()))
				.toList();

		return new ReportDtos.SummaryResponse(
				range.from(), range.to(),
				totalOrders == null ? 0 : totalOrders,
				revenue.size(),
				RevenueLedger.sum(revenue, RevenueLedger.Settlement::subtotal),
				RevenueLedger.sum(revenue, RevenueLedger.Settlement::discount),
				RevenueLedger.sum(revenue, RevenueLedger.Settlement::total),
				topItems, daily);
	}
}
