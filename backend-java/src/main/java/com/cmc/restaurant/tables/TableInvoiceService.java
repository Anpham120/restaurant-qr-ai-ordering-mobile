package com.cmc.restaurant.tables;

import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableInvoiceDtos.InvoiceResponse;
import com.cmc.restaurant.tables.TableInvoiceDtos.LineResponse;
import com.cmc.restaurant.tables.TableInvoiceDtos.OrderRoundResponse;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Mirrors {@code GetTableSessionInvoice} in {@code TableInvoiceEndpoints.cs} (.NET) — V14 (many
 * Order Rounds aggregate into one Table Invoice) and V19 (item sales aggregate all non-cancelled
 * Order Rounds).
 *
 * <p>Dữ liệu đơn hàng lấy qua cổng {@code OrderLookup} (#80). Trước #78 chỗ này nối bảng của
 * Orders bằng SQL viết tay; #78 đưa câu về repository của Orders; #80 bọc nốt sau cổng, nên lớp
 * này không còn biết Orders lưu trữ bằng gì.
 */
@Service
public class TableInvoiceService {

	private final TableSessionRepository sessionRepository;
	private final RestaurantTableRepository tableRepository;
	private final TableInvoiceRepository invoiceRepository;
	private final TableSessionCapability capability;
	private final com.cmc.restaurant.auth.JwtProperties jwtProperties;
	private final OrderLookup orderLookup;

	public TableInvoiceService(
			TableSessionRepository sessionRepository, RestaurantTableRepository tableRepository,
			TableInvoiceRepository invoiceRepository, TableSessionCapability capability,
			com.cmc.restaurant.auth.JwtProperties jwtProperties, OrderLookup orderLookup) {
		this.sessionRepository = sessionRepository;
		this.tableRepository = tableRepository;
		this.invoiceRepository = invoiceRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.orderLookup = orderLookup;
	}

	public InvoiceResponse getInvoice(String sessionId, String suppliedToken) {
		TableSessionEntity session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> ApiException.notFound("TABLE_SESSION_NOT_FOUND", "Table session was not found."));

		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED,
					"TABLE_SESSION_TOKEN_INVALID", "A valid table session token is required.");
		}

		List<OrderRoundResponse> orderRounds = orderLookup.findRoundsForTableSession(sessionId).stream()
				.map(r -> new OrderRoundResponse(
						r.orderCode(), r.status(), r.subtotalAmount(), r.createdAt()))
				.toList();

		List<OrderLookup.BillableItem> itemRows = orderLookup.findBillableItemsForTableSession(sessionId);

		Map<String, LineResponse> grouped = new LinkedHashMap<>();
		for (OrderLookup.BillableItem row : itemRows) {
			String key = row.menuItemId() + "|" + row.menuItemName() + "|" + row.unitPrice();
			LineResponse existing = grouped.get(key);
			int quantity = row.quantity() + (existing == null ? 0 : existing.quantity());
			BigDecimal lineTotal = row.unitPrice().multiply(BigDecimal.valueOf(quantity));
			grouped.put(key, new LineResponse(row.menuItemId(), row.menuItemName(), row.unitPrice(), quantity, lineTotal));
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
