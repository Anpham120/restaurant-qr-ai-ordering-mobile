package com.cmc.restaurant.tables;

import com.cmc.restaurant.tables.domain.TableSessionResumeState;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Reads {@code table_session_cart_items}, {@code orders}, {@code table_invoices} directly by SQL
 * instead of through JPA repositories, because those tables belong to modules not ported yet
 * (Orders: issues #6-9; Table Invoice: issue #7). This is a deliberate, narrow bridge — once
 * those modules exist, their own repositories are the better source and this class can shrink to
 * just the cart-item count (which genuinely belongs here, in Tables).
 */
@Service
public class ResumeStateQueryService {

	private final JdbcTemplate jdbcTemplate;

	public ResumeStateQueryService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public TableSessionResumeState resolve(String tableSessionId) {
		Long cartItemCount = jdbcTemplate.queryForObject(
				"select count(*) from table_session_cart_items where table_session_id = ? and quantity > 0",
				Long.class, tableSessionId);

		List<String> orderStatuses = jdbcTemplate.queryForList(
				"select status from orders where table_session_id = ?", String.class, tableSessionId);

		List<String> invoiceStatuses = jdbcTemplate.queryForList(
				"select status from table_invoices where table_session_id = ? limit 1",
				String.class, tableSessionId);
		String invoiceStatus = invoiceStatuses.isEmpty() ? null : invoiceStatuses.get(0);

		return TableSessionResumeStateResolver.resolve(
				cartItemCount == null ? 0 : cartItemCount, orderStatuses, invoiceStatus);
	}
}
