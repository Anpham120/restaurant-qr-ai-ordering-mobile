package com.cmc.restaurant.tables;

import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableInvoiceDtos.InvoiceResponse;
import com.cmc.restaurant.tables.TableInvoiceDtos.LineResponse;
import com.cmc.restaurant.tables.TableInvoiceDtos.OrderRoundResponse;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Mirrors {@code GetTableSessionInvoice} in {@code TableInvoiceEndpoints.cs} (.NET) — V14 (many
 * Order Rounds aggregate into one Table Invoice) and V19 (item sales aggregate all non-cancelled
 * Order Rounds). Reads Orders via JdbcTemplate, same reasoning as {@code ResumeStateQueryService}
 * (issue #5): Orders is a different module's table, avoid a duplicate/conflicting entity mapping.
 */
@Service
public class TableInvoiceService {

	private final TableSessionRepository sessionRepository;
	private final RestaurantTableRepository tableRepository;
	private final TableInvoiceRepository invoiceRepository;
	private final TableSessionCapability capability;
	private final com.cmc.restaurant.auth.JwtProperties jwtProperties;
	private final JdbcTemplate jdbcTemplate;

	public TableInvoiceService(
			TableSessionRepository sessionRepository, RestaurantTableRepository tableRepository,
			TableInvoiceRepository invoiceRepository, TableSessionCapability capability,
			com.cmc.restaurant.auth.JwtProperties jwtProperties, JdbcTemplate jdbcTemplate) {
		this.sessionRepository = sessionRepository;
		this.tableRepository = tableRepository;
		this.invoiceRepository = invoiceRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.jdbcTemplate = jdbcTemplate;
	}

	public InvoiceResponse getInvoice(String sessionId, String suppliedToken) {
		TableSessionEntity session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> ApiException.notFound("TABLE_SESSION_NOT_FOUND", "Table session was not found."));

		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED,
					"TABLE_SESSION_TOKEN_INVALID", "A valid table session token is required.");
		}

		List<OrderRoundResponse> orderRounds = jdbcTemplate.query(
				"select order_code, status, subtotal_amount, created_at from orders "
						+ "where table_session_id = ? and status <> 'Cancelled' order by created_at",
				(rs, rowNum) -> new OrderRoundResponse(
						rs.getString("order_code"), rs.getString("status"), rs.getBigDecimal("subtotal_amount"),
						rs.getObject("created_at", OffsetDateTime.class)),
				sessionId);

		record ItemRow(String menuItemId, String name, BigDecimal unitPrice, int quantity) {
		}
		List<ItemRow> itemRows = jdbcTemplate.query(
				"select oi.menu_item_id, oi.menu_item_name, oi.unit_price, oi.quantity "
						+ "from order_items oi join orders o on o.id = oi.order_id "
						+ "where o.table_session_id = ? and o.status <> 'Cancelled' and oi.status <> 'Cancelled'",
				(rs, rowNum) -> new ItemRow(
						rs.getString("menu_item_id"), rs.getString("menu_item_name"), rs.getBigDecimal("unit_price"),
						rs.getInt("quantity")),
				sessionId);

		Map<String, LineResponse> grouped = new LinkedHashMap<>();
		for (ItemRow row : itemRows) {
			String key = row.menuItemId() + "|" + row.name() + "|" + row.unitPrice();
			LineResponse existing = grouped.get(key);
			int quantity = row.quantity() + (existing == null ? 0 : existing.quantity());
			BigDecimal lineTotal = row.unitPrice().multiply(BigDecimal.valueOf(quantity));
			grouped.put(key, new LineResponse(row.menuItemId(), row.name(), row.unitPrice(), quantity, lineTotal));
		}
		List<LineResponse> items = grouped.values().stream().sorted((a, b) -> a.name().compareTo(b.name())).toList();

		BigDecimal subtotal = items.stream().map(LineResponse::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);

		TableInvoiceEntity invoice = invoiceRepository.findByTableSessionId(sessionId).orElse(null);
		BigDecimal discount = invoice == null ? BigDecimal.ZERO : invoice.getDiscountAmount();
		String tableCode = tableRepository.findById(session.getRestaurantTableId())
				.map(RestaurantTableEntity::getTableCode).orElse(session.getTableCode());

		return new InvoiceResponse(
				sessionId, invoice == null ? null : invoice.getInvoiceCode(), tableCode,
				invoice == null ? "NotRequested" : invoice.getStatus(), subtotal, discount,
				subtotal.subtract(discount).max(BigDecimal.ZERO),
				invoice == null ? null : invoice.getPromotionCode(),
				invoice == null ? null : invoice.getCustomerPhoneNumber(),
				invoice == null ? "Unselected" : invoice.getMethod(), orderRounds, items);
	}
}
