package com.cmc.restaurant.orders;

import com.cmc.restaurant.orders.adapter.out.persistence.OrderPersistenceAdapter;
import com.cmc.restaurant.orders.domain.Order;
import com.cmc.restaurant.orders.domain.OrderItem;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.payments.PaymentEntity;
import com.cmc.restaurant.payments.PaymentRepository;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.shared.CustomerTokenGuard;
import com.cmc.restaurant.tables.RestaurantTableEntity;
import com.cmc.restaurant.tables.RestaurantTableRepository;
import com.cmc.restaurant.tables.TableSessionEntity;
import com.cmc.restaurant.tables.TableSessionRepository;
import com.cmc.restaurant.tables.TableSessionStatus;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.EnumSet;
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
	private final OrderRealtimeNotifier realtimeNotifier;
	private final OrderPersistenceAdapter persistence;

	public OrderService(
			OrderRepository orderRepository, OrderItemRepository orderItemRepository,
			OrderStatusHistoryRepository orderStatusHistoryRepository, PaymentRepository paymentRepository,
			MenuItemRepository menuItemRepository, RestaurantTableRepository tableRepository,
			TableSessionRepository tableSessionRepository, JdbcTemplate jdbcTemplate,
			OrderItemEstimationService estimationService, OrderRealtimeNotifier realtimeNotifier,
			OrderPersistenceAdapter persistence) {
		this.realtimeNotifier = realtimeNotifier;
		this.persistence = persistence;
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
				.filter(s -> s.getStatus() == TableSessionStatus.Open)
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
				"osh_" + UUID.randomUUID().toString().replace("-", ""), null, OrderStatus.Placed.name(), "Status",
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

		// DoD của issue #13: bếp nhận order.created qua WebSocket.
		realtimeNotifier.orderCreated(new RealtimeDtos.OrderCreatedEvent(
				order.getId(), order.getOrderCode(), order.getOrderType(), order.getTableCode(),
				order.getStatus().name(), order.getCreatedAt()));

		return toCreateResponse(order);
	}

	/** Re-reads the entity view after the aggregate saved, so the response DTO keeps reporting the
	 * columns the aggregate does not own (payment status, amounts, full history). */
	private OrderEntity reload(String orderCode) {
		return populateChildren(orderRepository.findByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.")));
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

		if (!isOperator && !CustomerTokenGuard.hasCustomerToken(order.getCustomerAccessToken(), suppliedAccessToken)) {
			throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
		}

		return toResponse(order);
	}

	public OrderDtos.OrderListResponse listOrders(OrderStatus status, String tableCode, OffsetDateTime updatedSince) {
		List<OrderEntity> orders = orderRepository.search(
				status, tableCode, updatedSince, org.springframework.data.domain.PageRequest.of(0, 100));
		List<OrderDtos.OrderResponse> response = orders.stream()
				.map(this::populateChildren)
				.map(this::toResponse)
				.toList();
		return new OrderDtos.OrderListResponse(response, response.size());
	}

	@Transactional
	public OrderDtos.OrderResponse updateOrderStatus(String orderCode, OrderStatus status, ActorContext actor) {
		Order order = persistence.loadByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		// Payment settlement is not the aggregate's business — it belongs to another module, so the
		// use case checks it and the domain stays free of that dependency.
		if (status == OrderStatus.Completed) {
			String paymentStatus = paymentRepository.findByOrderId(order.id())
					.map(PaymentEntity::getStatus).orElse(null);
			if (!"Confirmed".equals(paymentStatus) && !"Paid".equals(paymentStatus)) {
				throw ApiException.badRequest("ORDER_COMPLETE_REQUIRES_PAYMENT",
						"Order cannot be completed until its payment is confirmed.");
			}
		}

		OffsetDateTime now = OffsetDateTime.now();
		// Every rule about whether this move is legal, and every cascade it triggers, lives in the
		// aggregate — this method no longer decides any of it.
		order.transitionTo(status, actor.toDomain(), now);
		persistence.save(order);

		if (status == OrderStatus.Completed && order.tableSessionId() != null) {
			closeTableSessionIfLastActiveOrder(order.id(), order.tableSessionId(), now);
		}

		realtimeNotifier.orderStatusChanged(
				new RealtimeDtos.OrderStatusChangedEvent(
						order.id(), order.orderCode(), order.status().name(), order.updatedAt()),
				order.tableCode());
		return toResponse(reload(order.orderCode()));
	}

	@Transactional
	public OrderDtos.OrderResponse updateOrderItemStatus(
			String orderCode, String orderItemId, OrderItemStatus status, ActorContext actor) {
		Order order = persistence.loadByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		OffsetDateTime now = OffsetDateTime.now();
		OrderStatus previousOrderStatus = order.status();
		OrderItem item = order.updateItemStatus(orderItemId, status, actor.toDomain(), now);
		persistence.save(order);

		publishItemStatusChanged(order, item, previousOrderStatus);
		return toResponse(reload(order.orderCode()));
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
		Order order = persistence.loadByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		// Wrong token is reported as "not found", never "forbidden": the order codes are sequential,
		// so confirming that ORD-1002 exists would already leak information.
		if (!order.matchesCustomerToken(suppliedAccessToken)) {
			throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		OrderStatus previousOrderStatus = order.status();
		OrderItem item = order.cancelItemAsCustomer(orderItemId, now);
		persistence.save(order);

		// A customer cancelling a dish must reach the kitchen board as fast as a staff change would
		// — that is the whole point of hạn chế #11.
		publishItemStatusChanged(order, item, previousOrderStatus);
		return toResponse(reload(order.orderCode()));
	}

	/** Emits the item event, plus an order event when the item change rolled the order's aggregate
	 * status forward — matching {@code OrderEndpoints}, which fires both when {@code
	 * OrderStatusChanged} is true. */
	private void publishItemStatusChanged(Order order, OrderItem item, OrderStatus previousOrderStatus) {
		realtimeNotifier.orderItemStatusChanged(
				new RealtimeDtos.OrderItemStatusChangedEvent(
						order.id(), order.orderCode(), item.id(), item.menuItemName(),
						item.status().name(), item.updatedAt()),
				order.tableCode());
		if (order.status() != previousOrderStatus) {
			realtimeNotifier.orderStatusChanged(
					new RealtimeDtos.OrderStatusChangedEvent(
							order.id(), order.orderCode(), order.status().name(), order.updatedAt()),
					order.tableCode());
		}
	}

	// --- state machine ---------------------------------------------------------------------

	// The state machine used to live here as static helpers operating on entities from the outside.
	// It now lives in com.cmc.restaurant.orders.domain.Order, which is the only place that decides
	// whether a move is legal — keeping a second copy here is how the two would drift apart.

	private void closeTableSessionIfLastActiveOrder(String orderId, String tableSessionId, OffsetDateTime now) {
		boolean hasOtherActive = !orderRepository.findOtherActiveOrders(tableSessionId, orderId).isEmpty();
		if (hasOtherActive) {
			return;
		}
		tableSessionRepository.findById(tableSessionId)
				.filter(session -> session.getStatus() == TableSessionStatus.Open)
				.ifPresent(session -> {
					session.setStatus(TableSessionStatus.Closed);
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
			OrderEntity order, OrderStatus fromStatus, OrderStatus toStatus, ActorContext actor, String note,
			OffsetDateTime now) {
		appendHistory(order, fromStatus, toStatus, "Status", actor, note, now);
	}

	private void appendHistory(
			OrderEntity order, OrderStatus fromStatus, OrderStatus toStatus, String source, ActorContext actor, String note,
			OffsetDateTime now) {
		OrderStatusHistoryEntity event = new OrderStatusHistoryEntity(
				"osh_" + UUID.randomUUID().toString().replace("-", ""),
				fromStatus == null ? null : fromStatus.name(), toStatus.name(), source,
				actor.userId(), actor.role(), note, now);
		event.setOrderId(order.getId());
		order.getStatusHistory().add(event);
		orderStatusHistoryRepository.save(event);
	}

	/** Mirrors {@code OrderStore.RecordPaymentStatusEvent} (.NET) — called by
	 * {@code PaymentService} (issue #10) after a payment status change, to audit-trail it on the
	 * order's status-history alongside real order-status transitions. Doesn't change the order's
	 * status itself (from == to == current status), matching the .NET original. */
	@Transactional
	public void recordPaymentStatusEvent(String orderCode, ActorContext actor, String note) {
		OrderEntity order = orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));
		appendHistory(order, order.getStatus(), order.getStatus(), "Payment", actor, note, OffsetDateTime.now());
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
				order.getTableSessionId(), order.getStatus().name(),
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

	private static final Set<OrderItemStatus> AWAITING_ESTIMATE_STATUS =
			EnumSet.of(OrderItemStatus.Pending, OrderItemStatus.Preparing);

	private OrderDtos.OrderItemResponse toItemResponse(OrderItemEntity item) {
		OrderItemEstimationService.Estimate estimate = AWAITING_ESTIMATE_STATUS.contains(item.getStatus())
				? estimationService.estimate(item.getMenuItemId()).orElse(null)
				: null;
		return new OrderDtos.OrderItemResponse(
				item.getId(), item.getMenuItemId(), item.getMenuItemName(), item.getUnitPrice(), item.getQuantity(),
				item.getStatus().name(), item.lineTotal(), item.getUpdatedAt(),
				estimate == null ? null : estimate.lowMinutes(), estimate == null ? null : estimate.highMinutes());
	}

	private OrderDtos.OrderStatusEventResponse toEventResponse(OrderStatusHistoryEntity event) {
		return new OrderDtos.OrderStatusEventResponse(
				event.getToStatus(), event.getSource(), event.getChangedByRole(), event.getNote(), event.getCreatedAt());
	}
}
