package com.cmc.restaurant.tables;

import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderRepository;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
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
 * <p>Issue #78: hai câu SQL thô đọc bảng của Orders đã thay bằng repository của chính module
 * Orders, nên tên bảng và tên cột chỉ tồn tại ở một nơi. Việc module Tables còn gọi thẳng
 * repository của Orders là phần còn lại — #80 sẽ bọc sau một cổng ở tầng application.
 */
@Service
public class TableInvoiceService {

	private final TableSessionRepository sessionRepository;
	private final RestaurantTableRepository tableRepository;
	private final TableInvoiceRepository invoiceRepository;
	private final TableSessionCapability capability;
	private final com.cmc.restaurant.auth.JwtProperties jwtProperties;
	private final OrderRepository orderRepository;
	private final OrderItemRepository orderItemRepository;

	public TableInvoiceService(
			TableSessionRepository sessionRepository, RestaurantTableRepository tableRepository,
			TableInvoiceRepository invoiceRepository, TableSessionCapability capability,
			com.cmc.restaurant.auth.JwtProperties jwtProperties, OrderRepository orderRepository,
			OrderItemRepository orderItemRepository) {
		this.sessionRepository = sessionRepository;
		this.tableRepository = tableRepository;
		this.invoiceRepository = invoiceRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.orderRepository = orderRepository;
		this.orderItemRepository = orderItemRepository;
	}

	public InvoiceResponse getInvoice(String sessionId, String suppliedToken) {
		TableSessionEntity session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> ApiException.notFound("TABLE_SESSION_NOT_FOUND", "Table session was not found."));

		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED,
					"TABLE_SESSION_TOKEN_INVALID", "A valid table session token is required.");
		}

		List<OrderRoundResponse> orderRounds = orderRepository
				.findByTableSessionIdAndStatusNotOrderByCreatedAtAsc(sessionId, OrderStatus.Cancelled)
				.stream()
				.map(o -> new OrderRoundResponse(
						o.getOrderCode(), o.getStatus().name(), o.getSubtotalAmount(), o.getCreatedAt()))
				.toList();

		record ItemRow(String menuItemId, String name, BigDecimal unitPrice, int quantity) {
		}
		List<ItemRow> itemRows = orderItemRepository
				.findBillableByTableSession(sessionId, OrderStatus.Cancelled, OrderItemStatus.Cancelled)
				.stream()
				.map(i -> new ItemRow(
						i.getMenuItemId(), i.getMenuItemName(), i.getUnitPrice(), i.getQuantity()))
				.toList();

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
