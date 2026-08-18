package com.cmc.restaurant.orders;

import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.RestaurantTableEntity;
import com.cmc.restaurant.tables.RestaurantTableRepository;
import com.cmc.restaurant.tables.TableSessionEntity;
import com.cmc.restaurant.tables.TableSessionRepository;
import com.cmc.restaurant.tables.TableSessionStatus;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors {@code OrderStore}/{@code OrderEndpoints.CreateOrder} (.NET) — dine-in order creation
 * and the Order/OrderItem state machine. Promotion/discount application, Table Invoice payment-
 * pending guards, and realtime notification are out of scope here (Promotions stays on .NET;
 * Table Invoice is issue #7; Realtime is issue #13) — see PR description.
 */
@Service
public class OrderService {

	private static final int MAX_ITEM_LINES = 50;
	private static final int MAX_QUANTITY_PER_ITEM = 99;

	private final OrderRepository orderRepository;
	private final OrderItemRepository orderItemRepository;
	private final OrderStatusHistoryRepository orderStatusHistoryRepository;
	private final PaymentRepository paymentRepository;
	private final MenuItemRepository menuItemRepository;
	private final RestaurantTableRepository tableRepository;
	private final TableSessionRepository tableSessionRepository;
	private final JdbcTemplate jdbcTemplate;
	private final OrderItemEstimationService estimationService;

	public OrderService(
			OrderRepository orderRepository, OrderItemRepository orderItemRepository,
			OrderStatusHistoryRepository orderStatusHistoryRepository, PaymentRepository paymentRepository,
			MenuItemRepository menuItemRepository, RestaurantTableRepository tableRepository,
			TableSessionRepository tableSessionRepository, JdbcTemplate jdbcTemplate,
			OrderItemEstimationService estimationService) {
		this.orderRepository = orderRepository;
		this.orderItemRepository = orderItemRepository;
		this.orderStatusHistoryRepository = orderStatusHistoryRepository;
		this.paymentRepository = paymentRepository;
		this.menuItemRepository = menuItemRepository;
		this.tableRepository = tableRepository;
		this.tableSessionRepository = tableSessionRepository;
		this.jdbcTemplate = jdbcTemplate;
		this.estimationService = estimationService;
	}

	@Transactional
	public OrderDtos.CreateOrderResponse createOrder(
			OrderDtos.CreateOrderRequest request, String idempotencyKey, String requestFingerprint,
			ActorContext actor) {
		Optional<OrderEntity> existing = orderRepository.findByIdempotencyKey(idempotencyKey);
		if (existing.isPresent()) {
			if (!requestFingerprint.equals(existing.get().getRequestFingerprint())) {
				throw ApiException.conflict("IDEMPOTENCY_KEY_REUSED",
						"Idempotency key was already used with a different request.");
			}
			return toCreateResponse(populateChildren(existing.get()));
		}

		validateCreateRequest(request);

		String normalizedTableCode = request.tableCode().trim().toUpperCase(Locale.ROOT);
		RestaurantTableEntity table = tableRepository.findByTableCodeAndActiveTrue(normalizedTableCode)
				.orElseThrow(() -> ApiException.badRequest("TABLE_CODE_INVALID", "Table code must match format T01."));

		OffsetDateTime now = OffsetDateTime.now();
		TableSessionEntity session = tableSessionRepository.findById(request.tableSessionId().trim())
				.filter(s -> s.getRestaurantTableId().equals(table.getId()))
				.filter(s -> TableSessionStatus.OPEN.equals(s.getStatus()))
				.filter(s -> s.getExpiresAt().isAfter(now))
				.orElseThrow(() -> new ApiException(HttpStatus.GONE, "TABLE_SESSION_EXPIRED",
						"Table session has expired. Please scan QR again."));

		// V16: touch the shared session row (mirrors .NET's comment verbatim) so an Order Round
		// being created and a settlement starting concurrently cannot both commit — whichever
		// writes second sees a stale @Version and fails here instead of silently corrupting state.
		session.setUpdatedAt(now);
		try {
			tableSessionRepository.saveAndFlush(session);
		} catch (org.springframework.orm.ObjectOptimisticLockingFailureException e) {
			throw ApiException.conflict("TABLE_SESSION_CONFLICT",
					"The table session changed while this order was being submitted. Reload and try again.");
		}

		String orderId = "ord_" + UUID.randomUUID().toString().replace("-", "");
		String orderCode = "ORD-" + jdbcTemplate.queryForObject(
				"select nextval('orders_order_code_seq')", Long.class);

		OrderEntity order = new OrderEntity(
				orderId, orderCode, "DineIn", table.getId(), table.getTableCode(), session.getId(),
				generateAccessToken(), idempotencyKey, requestFingerprint,
				normalizeOptional(request.customerPhoneNumber()), now);

		BigDecimal subtotal = BigDecimal.ZERO;
		for (OrderDtos.CreateOrderItemRequest requestItem : request.items()) {
			MenuItemEntity menuItem = menuItemRepository.findById(requestItem.menuItemId().trim())
					.orElseThrow(() -> ApiException.badRequest("MENU_ITEM_UNAVAILABLE", "Menu item is unavailable."));

			OrderItemEntity item = new OrderItemEntity(
					"oi_" + UUID.randomUUID().toString().replace("-", ""), menuItem.getId(), menuItem.getName(),
					menuItem.getPrice(), requestItem.quantity(), now);
			item.setOrderId(orderId);
			order.getItems().add(item);
			subtotal = subtotal.add(item.lineTotal());
		}
		order.setSubtotalAmount(subtotal);
		order.setTotalAmount(subtotal);

		OrderStatusHistoryEntity initialEvent = new OrderStatusHistoryEntity(
				"osh_" + UUID.randomUUID().toString().replace("-", ""), null, OrderStatus.PLACED, "Status",
				actor.userId(), actor.role(), null, now);
		initialEvent.setOrderId(orderId);
		order.getStatusHistory().add(initialEvent);

		orderRepository.save(order);
		orderItemRepository.saveAll(order.getItems());
		orderStatusHistoryRepository.save(initialEvent);

		PaymentEntity payment = new PaymentEntity("pay_" + UUID.randomUUID().toString().replace("-", ""), orderId, now);
		payment.setAmount(order.getTotalAmount());
		paymentRepository.save(payment);

		jdbcTemplate.update("delete from table_session_cart_items where table_session_id = ?", session.getId());

		return toCreateResponse(order);
	}

	/** Fills the {@code @Transient} items/statusHistory lists (see {@link OrderEntity}) — call
	 * after any {@code orderRepository.findBy...} before reading those lists. */
	private OrderEntity populateChildren(OrderEntity order) {
		order.getItems().clear();
		order.getItems().addAll(orderItemRepository.findByOrderId(order.getId()));
		order.getStatusHistory().clear();
		order.getStatusHistory().addAll(orderStatusHistoryRepository.findByOrderIdOrderByCreatedAtAsc(order.getId()));
		return order;
	}

	public OrderDtos.OrderResponse getOrder(String orderCode, String suppliedAccessToken, boolean isOperator) {
		OrderEntity order = populateChildren(orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.")));

		if (!isOperator && !hasCustomerToken(order.getCustomerAccessToken(), suppliedAccessToken)) {
			throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
		}

		return toResponse(order);
	}

	public OrderDtos.OrderListResponse listOrders(String status, String tableCode, OffsetDateTime updatedSince) {
		List<OrderEntity> orders = orderRepository.search(
				status, tableCode, updatedSince, org.springframework.data.domain.PageRequest.of(0, 100));
		List<OrderDtos.OrderResponse> response = orders.stream()
				.map(this::populateChildren)
				.map(this::toResponse)
				.toList();
		return new OrderDtos.OrderListResponse(response, response.size());
	}

	@Transactional
	public OrderDtos.OrderResponse updateOrderStatus(String orderCode, String status, ActorContext actor) {
		OrderEntity order = populateChildren(orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.")));

		if (OrderStatus.CANCELLED.equals(status) && isCancellationLocked(order)) {
			throw ApiException.badRequest("ORDER_CANCEL_NOT_ALLOWED",
					"Order cannot be cancelled after it or any item reaches Preparing.");
		}

		if (!canTransitionOrder(order.getStatus(), status)) {
			throw ApiException.badRequest("ORDER_STATUS_TRANSITION_INVALID", "Order status transition is not allowed.");
		}

		if (OrderStatus.COMPLETED.equals(status)) {
			String paymentStatus = paymentRepository.findByOrderId(order.getId()).map(PaymentEntity::getStatus).orElse(null);
			if (!"Confirmed".equals(paymentStatus) && !"Paid".equals(paymentStatus)) {
				throw ApiException.badRequest("ORDER_COMPLETE_REQUIRES_PAYMENT",
						"Order cannot be completed until its payment is confirmed.");
			}
		}

		OffsetDateTime now = OffsetDateTime.now();
		String fromStatus = order.getStatus();
		order.setStatus(status);
		order.setUpdatedAt(now);
		appendHistory(order, fromStatus, status, actor, null, now);

		List<OrderItemEntity> items = itemsOf(order);
		if (OrderStatus.CANCELLED.equals(status)) {
			for (OrderItemEntity item : items) {
				if (OrderItemStatus.PENDING.equals(item.getStatus())) {
					item.setStatus(OrderItemStatus.CANCELLED);
					item.setUpdatedAt(now);
					orderItemRepository.save(item);
				}
			}
		}
		if (OrderStatus.SERVED.equals(status)) {
			for (OrderItemEntity item : items) {
				if (!OrderItemStatus.CANCELLED.equals(item.getStatus())) {
					item.setStatus(OrderItemStatus.SERVED);
					item.setUpdatedAt(now);
					orderItemRepository.save(item);
				}
			}
		}
		if (OrderStatus.COMPLETED.equals(status) && order.getTableSessionId() != null) {
			closeTableSessionIfLastActiveOrder(order, now);
		}

		orderRepository.save(order);
		return toResponse(order);
	}

	@Transactional
	public OrderDtos.OrderResponse updateOrderItemStatus(
			String orderCode, String orderItemId, String status, ActorContext actor) {
		OrderEntity order = populateChildren(orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.")));

		List<OrderItemEntity> items = itemsOf(order);
		OrderItemEntity item = items.stream().filter(i -> i.getId().equalsIgnoreCase(orderItemId)).findFirst()
				.orElseThrow(() -> ApiException.notFound("ORDER_ITEM_NOT_FOUND", "Order item was not found."));

		if (OrderStatus.COMPLETED.equals(order.getStatus()) || OrderStatus.CANCELLED.equals(order.getStatus())) {
			throw new ApiException(HttpStatus.CONFLICT, "ORDER_STATUS_TERMINAL",
					"Completed or cancelled orders cannot be changed.");
		}

		if (!canTransitionItem(item.getStatus(), status)) {
			throw ApiException.badRequest(
					"ORDER_ITEM_STATUS_TRANSITION_INVALID", "Order item status transition is not allowed.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		String previousOrderStatus = order.getStatus();
		item.setStatus(status);
		item.setUpdatedAt(now);
		if (OrderItemStatus.READY.equals(status) && item.getReadyAt() == null) {
			item.setReadyAt(now);
		}
		orderItemRepository.save(item);

		String aggregateStatus = deriveAggregateKitchenStatus(order.getStatus(), items);
		if (!aggregateStatus.equals(order.getStatus())) {
			order.setStatus(aggregateStatus);
			appendHistory(order, previousOrderStatus, aggregateStatus, actor, null, now);
		}
		order.setUpdatedAt(now);
		orderRepository.save(order);

		return toResponse(order);
	}

	/** Hạn chế #11 — customer self-cancel. No .NET equivalent exists; ported straight into Java
	 * per the plan. Auth is the per-order {@code X-Order-Token} (same capability token already used
	 * by {@link #getOrder}), not a staff role. Unlike the staff transition (which also allows
	 * cancelling a Preparing item via {@link #canTransitionItem}), a customer may only cancel while
	 * the item is still Pending — locked the moment the kitchen starts on that item, regardless of
	 * the order's aggregate status (other items in the same order may already be Preparing). */
	@Transactional
	public OrderDtos.OrderResponse cancelOrderItemAsCustomer(
			String orderCode, String orderItemId, String suppliedAccessToken) {
		OrderEntity order = populateChildren(orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.")));

		if (!hasCustomerToken(order.getCustomerAccessToken(), suppliedAccessToken)) {
			throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
		}

		List<OrderItemEntity> items = itemsOf(order);
		OrderItemEntity item = items.stream().filter(i -> i.getId().equalsIgnoreCase(orderItemId)).findFirst()
				.orElseThrow(() -> ApiException.notFound("ORDER_ITEM_NOT_FOUND", "Order item was not found."));

		if (!OrderItemStatus.PENDING.equals(item.getStatus())) {
			throw ApiException.badRequest("ORDER_ITEM_CANCEL_NOT_ALLOWED",
					"This item can no longer be cancelled once the kitchen has started preparing it.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		String previousOrderStatus = order.getStatus();
		item.setStatus(OrderItemStatus.CANCELLED);
		item.setUpdatedAt(now);
		orderItemRepository.save(item);

		String aggregateStatus = deriveAggregateKitchenStatus(order.getStatus(), items);
		if (!aggregateStatus.equals(order.getStatus())) {
			order.setStatus(aggregateStatus);
			appendHistory(order, previousOrderStatus, aggregateStatus, ActorContext.CUSTOMER, null, now);
		}
		order.setUpdatedAt(now);
		orderRepository.save(order);

		return toResponse(order);
	}

	// --- state machine ---------------------------------------------------------------------

	static boolean canTransitionOrder(String current, String next) {
		if (OrderStatus.CANCELLED.equals(next)) {
			return current.equals(OrderStatus.PLACED) || current.equals(OrderStatus.CONFIRMED);
		}
		return switch (current) {
			case "Placed" -> next.equals(OrderStatus.CONFIRMED) || next.equals(OrderStatus.PREPARING);
			case "Confirmed" -> next.equals(OrderStatus.PREPARING);
			case "Preparing" -> next.equals(OrderStatus.READY);
			case "Ready" -> next.equals(OrderStatus.SERVED);
			case "Served" -> next.equals(OrderStatus.COMPLETED);
			default -> false;
		};
	}

	static boolean canTransitionItem(String current, String next) {
		if (OrderItemStatus.CANCELLED.equals(next)) {
			return current.equals(OrderItemStatus.PENDING) || current.equals(OrderItemStatus.PREPARING);
		}
		return switch (current) {
			case "Pending" -> next.equals(OrderItemStatus.PREPARING) || next.equals(OrderItemStatus.READY)
					|| next.equals(OrderItemStatus.SERVED);
			case "Preparing" -> next.equals(OrderItemStatus.READY) || next.equals(OrderItemStatus.SERVED);
			case "Ready" -> next.equals(OrderItemStatus.SERVED);
			default -> false;
		};
	}

	private static final Set<String> IN_PROGRESS_ITEM = Set.of(OrderItemStatus.PREPARING, OrderItemStatus.READY);

	static String deriveAggregateKitchenStatus(String orderStatus, List<OrderItemEntity> items) {
		List<OrderItemEntity> activeItems = items.stream()
				.filter(i -> !OrderItemStatus.CANCELLED.equals(i.getStatus())).toList();
		if (activeItems.isEmpty()) {
			return orderStatus;
		}

		boolean placedOrConfirmedOrPreparing =
				orderStatus.equals("Placed") || orderStatus.equals("Confirmed") || orderStatus.equals("Preparing");
		if (placedOrConfirmedOrPreparing && activeItems.stream()
				.allMatch(i -> i.getStatus().equals(OrderItemStatus.READY) || i.getStatus().equals(OrderItemStatus.SERVED))) {
			return OrderStatus.READY;
		}

		if (orderStatus.equals("Ready") && activeItems.stream().allMatch(i -> i.getStatus().equals(OrderItemStatus.SERVED))) {
			return OrderStatus.SERVED;
		}

		boolean placedOrConfirmed = orderStatus.equals("Placed") || orderStatus.equals("Confirmed");
		if (placedOrConfirmed && activeItems.stream().anyMatch(i ->
				IN_PROGRESS_ITEM.contains(i.getStatus()) || i.getStatus().equals(OrderItemStatus.SERVED))) {
			return OrderStatus.PREPARING;
		}

		return orderStatus;
	}

	private static boolean isCancellationLocked(OrderEntity order) {
		Set<String> lockedOrderStatuses =
				Set.of(OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED, OrderStatus.COMPLETED);
		if (lockedOrderStatuses.contains(order.getStatus())) {
			return true;
		}
		Set<String> lockedItemStatuses =
				Set.of(OrderItemStatus.PREPARING, OrderItemStatus.READY, OrderItemStatus.SERVED);
		return order.getItems().stream().anyMatch(i -> lockedItemStatuses.contains(i.getStatus()));
	}

	private void closeTableSessionIfLastActiveOrder(OrderEntity order, OffsetDateTime now) {
		boolean hasOtherActive = !orderRepository.findOtherActiveOrders(order.getTableSessionId(), order.getId()).isEmpty();
		if (hasOtherActive) {
			return;
		}
		tableSessionRepository.findById(order.getTableSessionId())
				.filter(s -> TableSessionStatus.OPEN.equals(s.getStatus()))
				.ifPresent(session -> {
					session.setStatus(TableSessionStatus.CLOSED);
					session.setClosedAt(now);
					session.setUpdatedAt(now);
					tableSessionRepository.save(session);
				});
	}

	// --- validation / helpers ---------------------------------------------------------------

	private void validateCreateRequest(OrderDtos.CreateOrderRequest request) {
		if (!"DineIn".equalsIgnoreCase(request.orderType())) {
			throw ApiException.badRequest("ORDER_TYPE_INVALID", "Order type is invalid.");
		}
		if (request.items() == null || request.items().isEmpty()) {
			throw ApiException.badRequest("ORDER_ITEMS_REQUIRED", "Order must contain at least one item.");
		}
		if (request.items().size() > MAX_ITEM_LINES) {
			throw ApiException.badRequest("ORDER_ITEMS_TOO_MANY",
					"Order cannot contain more than " + MAX_ITEM_LINES + " item lines.");
		}
		for (OrderDtos.CreateOrderItemRequest item : request.items()) {
			if (item.quantity() < 1 || item.quantity() > MAX_QUANTITY_PER_ITEM) {
				throw ApiException.badRequest("ORDER_ITEM_QUANTITY_INVALID",
						"Order item quantity must be between 1 and " + MAX_QUANTITY_PER_ITEM + ".");
			}
		}
		Set<String> seen = new HashSet<>();
		for (OrderDtos.CreateOrderItemRequest item : request.items()) {
			if (item.menuItemId() == null || !seen.add(item.menuItemId().trim().toLowerCase(Locale.ROOT))) {
				throw ApiException.badRequest("ORDER_ITEM_DUPLICATE",
						"Each menu item can appear only once per order; combine quantities instead.");
			}
		}
		if (request.tableCode() == null || request.tableCode().isBlank()) {
			throw ApiException.badRequest("DINE_IN_TABLE_REQUIRED", "Dine-in orders require a table code.");
		}
		if (request.qrToken() == null || request.qrToken().isBlank()) {
			throw ApiException.badRequest("QR_TOKEN_INVALID",
					"Dine-in orders require the table QR token. Please scan the table QR to order.");
		}
		if (request.tableSessionId() == null || request.tableSessionId().isBlank()) {
			throw ApiException.badRequest("TABLE_SESSION_REQUIRED",
					"Dine-in orders require an active table session. Please scan the table QR to start ordering.");
		}
	}

	private List<OrderItemEntity> itemsOf(OrderEntity order) {
		return order.getItems();
	}

	private void appendHistory(
			OrderEntity order, String fromStatus, String toStatus, ActorContext actor, String note, OffsetDateTime now) {
		OrderStatusHistoryEntity event = new OrderStatusHistoryEntity(
				"osh_" + UUID.randomUUID().toString().replace("-", ""), fromStatus, toStatus, "Status",
				actor.userId(), actor.role(), note, now);
		event.setOrderId(order.getId());
		order.getStatusHistory().add(event);
		orderStatusHistoryRepository.save(event);
	}

	private static boolean hasCustomerToken(String accessToken, String provided) {
		if (accessToken == null || accessToken.isEmpty() || provided == null || provided.isEmpty()) {
			return false;
		}
		byte[] a = accessToken.getBytes(StandardCharsets.UTF_8);
		byte[] b = provided.getBytes(StandardCharsets.UTF_8);
		if (a.length != b.length) {
			return false;
		}
		int diff = 0;
		for (int i = 0; i < a.length; i++) {
			diff |= a[i] ^ b[i];
		}
		return diff == 0;
	}

	private static String generateAccessToken() {
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private static String normalizeOptional(String value) {
		return (value == null || value.isBlank()) ? null : value.trim();
	}

	// --- response mapping --------------------------------------------------------------------

	private OrderDtos.OrderResponse toResponse(OrderEntity order) {
		PaymentEntity payment = paymentRepository.findByOrderId(order.getId()).orElse(null);
		return new OrderDtos.OrderResponse(
				order.getId(), order.getOrderCode(), order.getOrderType(), order.getTableCode(),
				order.getTableSessionId(), order.getStatus(),
				payment == null ? "NotRequested" : payment.getStatus(),
				payment == null ? "Unselected" : payment.getMethod(),
				order.getSubtotalAmount(), order.getDiscountAmount(), order.getTotalAmount(),
				order.getCreatedAt(), order.getUpdatedAt(),
				order.getItems().stream().map(this::toItemResponse).toList(),
				order.getStatusHistory().stream().map(this::toEventResponse).toList());
	}

	private OrderDtos.CreateOrderResponse toCreateResponse(OrderEntity order) {
		OrderDtos.OrderResponse base = toResponse(order);
		return new OrderDtos.CreateOrderResponse(
				base.orderId(), base.orderCode(), base.orderType(), base.tableCode(), base.tableSessionId(),
				base.status(), base.paymentStatus(), base.paymentMethod(), base.subtotalAmount(),
				base.discountAmount(), base.totalAmount(), base.createdAt(), base.updatedAt(), base.items(),
				base.events(), order.getCustomerAccessToken());
	}

	private static final Set<String> AWAITING_ESTIMATE_STATUS =
			Set.of(OrderItemStatus.PENDING, OrderItemStatus.PREPARING);

	private OrderDtos.OrderItemResponse toItemResponse(OrderItemEntity item) {
		OrderItemEstimationService.Estimate estimate = AWAITING_ESTIMATE_STATUS.contains(item.getStatus())
				? estimationService.estimate(item.getMenuItemId()).orElse(null)
				: null;
		return new OrderDtos.OrderItemResponse(
				item.getId(), item.getMenuItemId(), item.getMenuItemName(), item.getUnitPrice(), item.getQuantity(),
				item.getStatus(), item.lineTotal(), item.getUpdatedAt(),
				estimate == null ? null : estimate.lowMinutes(), estimate == null ? null : estimate.highMinutes());
	}

	private OrderDtos.OrderStatusEventResponse toEventResponse(OrderStatusHistoryEntity event) {
		return new OrderDtos.OrderStatusEventResponse(
				event.getToStatus(), event.getSource(), event.getChangedByRole(), event.getNote(), event.getCreatedAt());
	}
}
