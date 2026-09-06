package com.cmc.restaurant.orders.application;

import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.menu.MenuSelection;
import com.cmc.restaurant.menu.ShopConfig;
import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderPersistenceAdapter;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderStatusHistoryEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderStatusHistoryRepository;
import com.cmc.restaurant.orders.domain.Order;
import com.cmc.restaurant.orders.domain.OrderItem;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.orders.domain.OrderType;
import com.cmc.restaurant.orders.domain.PreparationPaymentPolicy;
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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors {@code OrderStore}/{@code OrderEndpoints.CreateOrder} (.NET) — dine-in order creation
 * and the Order/OrderItem state machine. Promotion application was wired in at issue #70;
 * realtime notification at issue #13. Table Invoice payment-pending guards remain out of scope.
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
	private final OrderItemEstimationService estimationService;
	private final OrderRealtimeNotifier realtimeNotifier;
	private final OrderPersistenceAdapter persistence;
	private final com.cmc.restaurant.cart.CartService cartService;
	private final com.cmc.restaurant.promotions.PromotionService promotionService;
	private final ShopConfig shopConfig;

	private final org.springframework.context.ApplicationEventPublisher suKien;

	public OrderService(
			OrderRepository orderRepository, OrderItemRepository orderItemRepository,
			OrderStatusHistoryRepository orderStatusHistoryRepository, PaymentRepository paymentRepository,
			MenuItemRepository menuItemRepository, RestaurantTableRepository tableRepository,
			TableSessionRepository tableSessionRepository,
			OrderItemEstimationService estimationService, OrderRealtimeNotifier realtimeNotifier,
			OrderPersistenceAdapter persistence, com.cmc.restaurant.cart.CartService cartService,
			com.cmc.restaurant.promotions.PromotionService promotionService,
			org.springframework.context.ApplicationEventPublisher suKien, ShopConfig shopConfig) {
		this.shopConfig = shopConfig;
		this.suKien = suKien;
		this.cartService = cartService;
		this.promotionService = promotionService;
		this.realtimeNotifier = realtimeNotifier;
		this.persistence = persistence;
		this.orderRepository = orderRepository;
		this.orderItemRepository = orderItemRepository;
		this.orderStatusHistoryRepository = orderStatusHistoryRepository;
		this.paymentRepository = paymentRepository;
		this.menuItemRepository = menuItemRepository;
		this.tableRepository = tableRepository;
		this.tableSessionRepository = tableSessionRepository;
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
			return toCreateResponse(existing.get());
		}

		OrderType orderType = validateCreateRequest(request);
		OffsetDateTime now = OffsetDateTime.now();
		RestaurantTableEntity table = null;
		TableSessionEntity session = null;
		if (orderType == OrderType.DineIn) {
			String normalizedTableCode = request.tableCode().trim().toUpperCase(Locale.ROOT);
			table = tableRepository.findByTableCodeAndActiveTrue(normalizedTableCode)
					.orElseThrow(() -> ApiException.badRequest("TABLE_CODE_INVALID", "Table code must match format T01."));
			RestaurantTableEntity dineInTable = table;
			session = tableSessionRepository.findById(request.tableSessionId().trim())
					.filter(s -> s.getRestaurantTableId().equals(dineInTable.getId()))
					.filter(s -> s.getStatus() == TableSessionStatus.Open)
					.filter(s -> s.getExpiresAt().isAfter(now))
					.orElseThrow(() -> new ApiException(HttpStatus.GONE, "TABLE_SESSION_EXPIRED",
							"Table session has expired. Please scan QR again."));
			session.setUpdatedAt(now);
			try {
				tableSessionRepository.saveAndFlush(session);
			} catch (org.springframework.orm.ObjectOptimisticLockingFailureException e) {
				throw ApiException.conflict("TABLE_SESSION_CONFLICT",
						"The table session changed while this order was being submitted. Reload and try again.");
			}
		}

		String orderId = "ord_" + UUID.randomUUID().toString().replace("-", "");
		String orderCode = "ORD-" + orderRepository.nextOrderCodeNumber();

		OrderEntity order = new OrderEntity(
				orderId, orderCode, orderType, table == null ? null : table.getId(),
				table == null ? null : table.getTableCode(), session == null ? null : session.getId(),
				generateAccessToken(), idempotencyKey, requestFingerprint,
				normalizeOptional(request.customerPhoneNumber()), now);
		OrderDtos.DeliveryDetails details = request.deliveryDetails();
		ShopConfig.Quote quote = orderType == OrderType.Delivery
				? shopConfig.quote(details.latitude(), details.longitude()) : null;
		BigDecimal deliveryFee = quote == null ? BigDecimal.ZERO : quote.deliveryFee();
		if ("Customer".equals(actor.role())) {
			order.setCustomerUserId(actor.userId());
		}
		if (orderType != OrderType.DineIn) {
			order.setFulfillmentDetails(
					normalizeOptional(details.recipientName()), normalizeOptional(details.phoneNumber()),
					orderType == OrderType.Delivery ? normalizeOptional(details.address()) : null,
					normalizeOptional(details.note()), deliveryFee);
			if (quote != null) {
				order.setDeliveryCoordinates(details.latitude(), details.longitude(), quote.distanceKm());
			}
		}

		BigDecimal subtotal = BigDecimal.ZERO;
		for (OrderDtos.CreateOrderItemRequest requestItem : request.items()) {
			MenuItemEntity menuItem = menuItemRepository.findById(requestItem.menuItemId().trim())
					.filter(MenuItemEntity::isAvailable)
					.orElseThrow(() -> ApiException.badRequest("MENU_ITEM_UNAVAILABLE", "Menu item is unavailable."));

			MenuSelection selection = MenuSelection.price(menuItem, requestItem.optionIds(), requestItem.note());
			OrderItemEntity item = new OrderItemEntity(
					"oi_" + UUID.randomUUID().toString().replace("-", ""), menuItem.getId(), menuItem.getName(),
					selection.unitPrice(), requestItem.quantity(), now);
			item.setNote(selection.note());
			order.addItem(item);
			subtotal = subtotal.add(item.lineTotal());
		}
		final BigDecimal orderSubtotal = subtotal;
		if (orderType == OrderType.Delivery && subtotal.compareTo(shopConfig.response().minimumOrder()) < 0) {
			throw ApiException.badRequest("ORDER_MINIMUM_REQUIRED", "Đơn chưa đạt giá trị tối thiểu để giao hàng.");
		}
		order.setSubtotalAmount(orderSubtotal);

		// Applied at order time, not at preview time. Until issue #70 the customer could validate a
		// code, be shown a discount, and then be charged the full price — the order simply never
		// looked at promotionCode. A code that is present but unusable fails the whole order rather
		// than being dropped silently: quietly charging more than the customer just agreed to is
		// worse than making them fix the code.
		promotionService.tryApply(request.promotionCode(), orderSubtotal, now).ifPresent(
				discount -> {
					order.setDiscountAmount(discount.discountAmount());
					order.applyPromotion(
							com.cmc.restaurant.promotions.domain.Promotion.normalizeCode(request.promotionCode()),
							discount.promotionId());
				});
		order.setTotalAmount(orderSubtotal.subtract(order.getDiscountAmount()).add(deliveryFee));
		if (request.expectedTotalAmount() != null && request.expectedTotalAmount().compareTo(order.getTotalAmount()) != 0) {
			throw ApiException.conflict("ORDER_TOTAL_CHANGED", "Giá món hoặc phí giao đã thay đổi. Vui lòng xem lại tổng tiền.");
		}

		OrderStatusHistoryEntity initialEvent = new OrderStatusHistoryEntity(
				"osh_" + UUID.randomUUID().toString().replace("-", ""), null, OrderStatus.Placed.name(), "Status",
				actor.userId(), actor.role(), null, now);
		order.addStatusChange(initialEvent);

		// One save. Cascade writes the lines and the first history row in the same unit of work,
		// so there is no window where an order exists without its items.
		orderRepository.save(order);

		PaymentEntity payment = new PaymentEntity("pay_" + UUID.randomUUID().toString().replace("-", ""), orderId, now);
		payment.setAmount(order.getTotalAmount());
		paymentRepository.save(payment);

		// Was a raw DELETE while Cart still lived on .NET (issue #7). Now the Cart module owns its
		// own table, so Orders asks it instead of reaching into another module.s rows.
		if (session != null) {
			cartService.clearAfterOrderPlaced(session.getId());
		}

		// DoD của issue #13: bếp nhận order.created qua WebSocket.
		realtimeNotifier.orderCreated(new RealtimeDtos.OrderCreatedEvent(
				order.getId(), order.getOrderCode(), order.getOrderType(), order.getTableCode(),
				order.getStatus().name(), order.getCreatedAt()));

		return toCreateResponse(order);
	}

	/** Re-reads the entity view after the aggregate saved, so the response DTO keeps reporting the
	 * columns the aggregate does not own (payment status, amounts, full history). */
	private OrderEntity reload(String orderCode) {
		return orderRepository.findByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));
	}

	/** readOnly transaction, not open-in-view: the lines are lazy, and the DTO is built here while
	 * the session is still open. Leaving open-in-view on would make every controller able to
	 * trigger queries during JSON serialisation, which is how lazy loading turns into a mystery. */
	@Transactional(readOnly = true)
	public OrderDtos.OrderResponse getOrder(String orderCode, String suppliedAccessToken, boolean isOperator) {
		OrderEntity order = orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		if (!isOperator && !CustomerTokenGuard.hasCustomerToken(order.getCustomerAccessToken(), suppliedAccessToken)) {
			throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
		}

		return toResponse(order);
	}

	/**
	 * Mọi đơn của một phiên bàn, mới nhất trước (#96).
	 *
	 * <p>Đặt ở đây chứ không để module Tables tự truy vấn: {@code orders.application} là bề mặt duy
	 * nhất module khác được phép chạm tới, và luật ArchUnit từ #80 sẽ đỏ nếu Tables đọc thẳng
	 * repository của Orders.
	 */
	@Transactional(readOnly = true)
	public OrderDtos.OrderListResponse listOrdersForTableSession(String tableSessionId) {
		List<OrderEntity> orders = orderRepository.findByTableSessionIdOrderByCreatedAtDesc(tableSessionId);
		return new OrderDtos.OrderListResponse(toResponses(orders), orders.size());
	}

	/**
	 * Hoàn tất mọi đơn chưa xong của một phiên bàn khi hoá đơn được tất toán (#96).
	 *
	 * <p>Luật "bỏ qua máy trạng thái" nằm trong {@link Order#completeOnSettlement}, không ở đây —
	 * lý do ghi tại chỗ định nghĩa. Hàm này chỉ nạp, gọi, lưu, và trả về những đơn THẬT SỰ đổi
	 * trạng thái, để nơi gọi bắn realtime đúng số lần thay vì bắn cho cả đơn đã xong từ trước.
	 */
	@Transactional
	public List<OrderDtos.OrderResponse> completeOrdersForTableSession(
			String tableSessionId, ActorContext actor) {
		OffsetDateTime now = OffsetDateTime.now();
		List<OrderDtos.OrderResponse> changed = new java.util.ArrayList<>();
		for (OrderEntity entity : orderRepository.findByTableSessionIdOrderByCreatedAtDesc(tableSessionId)) {
			Order order = persistence.toDomain(entity);
			if (order.completeOnSettlement(actor.toDomain(), now)) {
				persistence.save(order);
				changed.add(toResponse(orderRepository.findById(entity.getId()).orElseThrow()));
			}
		}
		return changed;
	}

	@Transactional(readOnly = true)
	/**
	 * Lịch sử đơn của CHÍNH khách đang đăng nhập, qua nhiều lần ghé (#33).
	 *
	 * <p>Không nhận tham số định danh nào từ request — {@code memberId} đến từ JWT, giống hệt luật
	 * ở {@code /api/loyalty/me}. Nếu một ngày ai đó thêm {@code ?memberId=} cho tiện thì đây thành
	 * đường đọc lịch sử ăn uống của người khác.
	 */
	public OrderDtos.OrderListResponse listOrdersForMember(String memberId) {
		List<OrderEntity> orders = orderRepository.findRecentForMember(memberId, GIOI_HAN_LICH_SU);
		return new OrderDtos.OrderListResponse(toResponses(orders), orders.size());
	}

	/**
	 * Món khách hay gọi nhất, qua nhiều lần ghé (#35).
	 *
	 * <p>Cùng luật uỷ quyền với {@link #listOrdersForMember}: không nhận tham số định danh nào,
	 * {@code memberId} đến từ JWT.
	 */
	public OrderDtos.FavouriteItemListResponse listFavouriteItemsForMember(String memberId) {
		return new OrderDtos.FavouriteItemListResponse(
				orderRepository.findTopItemsForMember(memberId, GIOI_HAN_MON_HAY_GOI).stream()
						.map(r -> new OrderDtos.FavouriteItemResponse(
								r.getMenuItemId(), r.getMenuItemName(), r.getSoLan(), r.getTongSoLuong()))
						.toList());
	}

	/** Số món "hay gọi" trả về — đủ để gợi lại thói quen, không đủ để thành một thực đơn thứ hai. */
	private static final int GIOI_HAN_MON_HAY_GOI = 10;

	/** Số đơn tối đa trả về cho màn hình lịch sử — khách quen có thể có hàng trăm. */
	private static final int GIOI_HAN_LICH_SU = 50;

	/**
	 * Danh sách đơn cho Bảng Bếp và màn hình vận hành.
	 *
	 * <p>{@code @Transactional} ở đây KHÔNG phải để ghi mà để giữ phiên Hibernate mở suốt lúc dựng
	 * phản hồi. Dự án đặt {@code open-in-view: false}, nên ngoài giao dịch thì bộ sưu tập
	 * {@code items} tải lười không đọc được nữa.
	 *
	 * <p>Thiếu dòng này, endpoint trả 200 khi không có đơn nào và trả 500 ngay khi có đơn đầu tiên
	 * — tức nó xanh trên máy trống và đỏ trên quán đang bán. Mọi hàm cùng loại trong lớp này đều
	 * đã có; riêng nó bị bỏ sót từ lúc tách bố cục hexagonal.
	 */
	@Transactional(readOnly = true)
	public OrderDtos.OrderListResponse listOrders(OrderStatus status, String tableCode, OffsetDateTime updatedSince) {
		List<OrderEntity> orders = orderRepository.search(
				status, tableCode, updatedSince, org.springframework.data.domain.PageRequest.of(0, 100));
		List<OrderDtos.OrderResponse> response = toResponses(orders);
		return new OrderDtos.OrderListResponse(response, response.size());
	}

	@Transactional
	public OrderDtos.OrderResponse updateOrderStatus(String orderCode, OrderStatus status, ActorContext actor) {
		OrderEntity entity = lockOrder(orderCode);
		if (entity.getOrderTypeValue() == OrderType.Delivery
				&& (status == OrderStatus.Served || status == OrderStatus.Completed)) {
			throw ApiException.badRequest("DELIVERY_TRANSITION_REQUIRED", "Đơn giao hàng phải hoàn tất qua nhân viên giao hàng.");
		}
		if (status == OrderStatus.Cancelled) {
			requireCancellablePayment(entity);
		}
		Order order = persistence.loadByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));
		if (status == OrderStatus.Preparing) {
			requirePrepaymentBeforePreparation(orderCode);
		}

		// Payment settlement is not the aggregate's business — it belongs to another module, so the
		// use case checks it and the domain stays free of that dependency.
		if (status == OrderStatus.Completed) {
			// "Has the money arrived?" is the Payment aggregate's question, not a string comparison
			// repeated here — Paid and Confirmed both count, and only that class should decide so.
			boolean settled = paymentRepository.findByOrderId(order.id())
					.map(PaymentEntity::toDomain)
					.map(com.cmc.restaurant.payments.domain.Payment::isSettled)
					.orElse(false);
			if (!settled) {
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

		if (status == OrderStatus.Cancelled) {
			// Công bố TRƯỚC khi trả lời, và trong cùng transaction: người nghe hoàn điểm cho khách,
			// và một lệnh huỷ thành công trong khi điểm vẫn mất là kết quả tệ hơn cả hai bên cùng
			// hỏng.
			suKien.publishEvent(new DonBiHuyEvent(order.orderCode(), now));
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
		OrderEntity entity = lockOrder(orderCode);
		if (entity.getOrderTypeValue() == OrderType.Delivery && status == OrderItemStatus.Served) {
			throw ApiException.badRequest("DELIVERY_TRANSITION_REQUIRED", "Món giao hàng được bàn giao qua điều phối.");
		}
		if (status == OrderItemStatus.Cancelled) {
			requireCancellablePayment(entity);
		}
		Order order = persistence.loadByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));
		if (status == OrderItemStatus.Preparing || status == OrderItemStatus.Ready
				|| status == OrderItemStatus.Served) {
			requirePrepaymentBeforePreparation(orderCode);
		}

		OffsetDateTime now = OffsetDateTime.now();
		OrderStatus previousOrderStatus = order.status();
		OrderItem item = order.updateItemStatus(orderItemId, status, actor.toDomain(), now);
		persistence.save(order);
		if (status == OrderItemStatus.Cancelled) {
			refreshCancelledAmounts(entity, order);
		}

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
		OrderEntity entity = lockOrder(orderCode);
		Order order = persistence.loadByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		// Wrong token is reported as "not found", never "forbidden": the order codes are sequential,
		// so confirming that ORD-1002 exists would already leak information.
		if (!order.matchesCustomerToken(suppliedAccessToken)) {
			throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
		}
		requireCancellablePayment(entity);

		OffsetDateTime now = OffsetDateTime.now();
		OrderStatus previousOrderStatus = order.status();
		OrderItem item = order.cancelItemAsCustomer(orderItemId, now);
		persistence.save(order);
		refreshCancelledAmounts(entity, order);

		// A customer cancelling a dish must reach the kitchen board as fast as a staff change would
		// — that is the whole point of hạn chế #11.
		publishItemStatusChanged(order, item, previousOrderStatus);
		return toResponse(reload(order.orderCode()));
	}

	/** Emits the item event, plus an order event when the item change rolled the order's aggregate
	 * status forward — matching {@code OrderEndpoints}, which fires both when {@code
	 * OrderStatusChanged} is true. */
	private void publishItemStatusChanged(Order order, OrderItem item, OrderStatus previousOrderStatus) {
		// Chỗ hội tụ duy nhất của hai đường huỷ món: nhân viên đổi trạng thái, và khách tự huỷ.
		// Công bố ở đây thay vì ở hai nơi gọi, vì một trong hai nơi bị bỏ sót là loại lỗi im lặng —
		// khách huỷ được món tặng mà không lấy lại điểm, và không có gì báo động.
		if (item.status() == OrderItemStatus.Cancelled) {
			suKien.publishEvent(new MonBiHuyEvent(order.orderCode(), item.id(), item.updatedAt()));
		}

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

	private OrderType validateCreateRequest(OrderDtos.CreateOrderRequest request) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		OrderType orderType = OrderType.parse(request.orderType())
				.orElseThrow(() -> ApiException.badRequest("ORDER_TYPE_INVALID", "Order type is invalid."));
		if (request.items() == null || request.items().isEmpty()) {
			throw ApiException.badRequest("ORDER_ITEMS_REQUIRED", "Order must contain at least one item.");
		}
		if (request.items().size() > MAX_ITEM_LINES) {
			throw ApiException.badRequest("ORDER_ITEMS_TOO_MANY",
					"Order cannot contain more than " + MAX_ITEM_LINES + " item lines.");
		}
		for (OrderDtos.CreateOrderItemRequest item : request.items()) {
			if (item == null || item.quantity() < 1 || item.quantity() > MAX_QUANTITY_PER_ITEM) {
				throw ApiException.badRequest("ORDER_ITEM_QUANTITY_INVALID",
						"Order item quantity must be between 1 and " + MAX_QUANTITY_PER_ITEM + ".");
			}
		}
		Set<String> seen = new HashSet<>();
		for (OrderDtos.CreateOrderItemRequest item : request.items()) {
			if (item.menuItemId() == null || item.menuItemId().isBlank()) {
				throw ApiException.badRequest("MENU_ITEM_UNAVAILABLE", "Menu item is required.");
			}
			List<String> optionIds = item.optionIds() == null ? List.of() : item.optionIds();
			if (optionIds.stream().anyMatch(java.util.Objects::isNull)) {
				throw ApiException.badRequest("MENU_OPTIONS_INVALID", "Tùy chọn không hợp lệ.");
			}
			String identity = item.menuItemId().trim() + "|" + optionIds.stream().sorted().toList()
					+ "|" + (item.note() == null ? "" : item.note().trim());
			if (!seen.add(identity)) {
				throw ApiException.badRequest("ORDER_ITEM_DUPLICATE",
						"Gộp số lượng cho các món có cùng tùy chọn và ghi chú.");
			}
		}
		if (orderType == OrderType.DineIn) {
			if (request.tableCode() == null || request.tableCode().isBlank()) {
				throw ApiException.badRequest("DINE_IN_TABLE_REQUIRED", "Dine-in orders require a table code.");
			}
			if (request.qrToken() == null || request.qrToken().isBlank()) {
				throw ApiException.badRequest("QR_TOKEN_INVALID",
						"Dine-in orders require the table QR token. Please scan the table QR to order.");
			}
			if (request.tableSessionId() == null || request.tableSessionId().isBlank()) {
				throw ApiException.badRequest("TABLE_SESSION_REQUIRED",
						"Dine-in orders require an active table session. Please scan QR again.");
			}
			return orderType;
		}

		OrderDtos.DeliveryDetails details = request.deliveryDetails();
		if (details == null || details.recipientName() == null || details.recipientName().isBlank()
				|| details.phoneNumber() == null || details.phoneNumber().isBlank()) {
			throw ApiException.badRequest("FULFILLMENT_DETAILS_REQUIRED",
					"Pickup and delivery orders require a recipient name and phone number.");
		}
		if (orderType == OrderType.Delivery
				&& (details.address() == null || details.address().isBlank())) {
			throw ApiException.badRequest("DELIVERY_ADDRESS_REQUIRED", "Delivery orders require an address.");
		}
		if (details.note() != null && details.note().trim().length() > 500) {
			throw ApiException.badRequest("DELIVERY_NOTE_TOO_LONG", "Delivery note must be 500 characters or fewer.");
		}
		if (details.recipientName().trim().length() > 200
				|| !details.phoneNumber().trim().matches("[+0-9 ()-]{8,20}")
				|| (details.address() != null && details.address().trim().length() > 1000)) {
			throw ApiException.badRequest("FULFILLMENT_DETAILS_INVALID", "Thông tin người nhận không hợp lệ.");
		}
		return orderType;
	}

	private void requirePrepaymentBeforePreparation(String orderCode) {
		OrderEntity entity = orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));
		PaymentEntity payment = paymentRepository.findByOrderId(entity.getId()).orElse(null);
		boolean settled = payment != null && (payment.toDomain().isSettled()
				|| (entity.isCodAccepted() && payment.getMethod() == com.cmc.restaurant.payments.domain.PaymentMethod.COD
						&& payment.getStatus() == com.cmc.restaurant.payments.domain.PaymentStatus.Pending));
		if (!PreparationPaymentPolicy.allowsPreparation(entity.getOrderTypeValue(), settled)) {
			throw ApiException.badRequest("ORDER_PREPARATION_REQUIRES_PAYMENT",
					"Đơn cần thanh toán hoặc được quầy chấp nhận COD trước khi chuẩn bị.");
		}
	}

	private OrderEntity lockOrder(String orderCode) {
		return orderRepository.findForUpdateByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));
	}

	@Transactional
	public void requirePayableOrder(String orderCode) {
		OrderEntity order = lockOrder(orderCode);
		if (order.getStatus() == OrderStatus.Cancelled || order.getStatus() == OrderStatus.Completed) {
			throw ApiException.badRequest("ORDER_NOT_PAYABLE", "Đơn đã đóng, không thể yêu cầu thanh toán.");
		}
	}

	@Transactional
	public void requirePaymentMethodAllowed(String orderCode, String method) {
		OrderEntity order = lockOrder(orderCode);
		if ("COD".equals(method) && order.getOrderTypeValue() == OrderType.Delivery && !shopConfig.response().allowCod()) {
			throw ApiException.badRequest("COD_UNAVAILABLE", "Quán tạm ngừng nhận thanh toán COD cho giao hàng.");
		}
	}

	private void requireCancellablePayment(OrderEntity order) {
		PaymentEntity payment = paymentRepository.findByOrderId(order.getId()).orElse(null);
		if (payment != null && (payment.toDomain().isSettled()
				|| payment.getStatus() == com.cmc.restaurant.payments.domain.PaymentStatus.Pending
				|| payment.getStatus() == com.cmc.restaurant.payments.domain.PaymentStatus.Refunded)) {
			throw ApiException.conflict("ORDER_CANCEL_PAYMENT_LOCKED",
					"Đơn đang thanh toán hoặc đã thu tiền. Nhân viên cần xử lý thanh toán trước khi hủy.");
		}
	}

	private void refreshCancelledAmounts(OrderEntity entity, Order order) {
		BigDecimal subtotal = order.subtotal();
		entity.setSubtotalAmount(subtotal);
		entity.setDiscountAmount(entity.getDiscountAmount().min(subtotal));
		entity.setTotalAmount(subtotal.subtract(entity.getDiscountAmount()).add(entity.getDeliveryFee()));
		paymentRepository.findByOrderId(entity.getId()).ifPresent(payment -> {
			payment.setAmount(entity.getTotalAmount());
			paymentRepository.save(payment);
		});
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
		order.addStatusChange(event);
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

	OrderDtos.OrderResponse toResponse(OrderEntity order) {
		return toResponse(
				order, paymentRepository.findByOrderId(order.getId()).orElse(null),
				estimationService.chupTaiBep());
	}

	/**
	 * Dựng danh sách đơn với thanh toán đã nạp SẴN theo lô.
	 *
	 * <p>Bản trước gọi {@code toResponse(order)} cho từng đơn, tức một câu tra thanh toán mỗi đơn.
	 * Đo trên cơ sở dữ liệu thật: {@code GET /api/orders} với 7 đơn tốn 7 câu thừa, và danh sách này
	 * lấy tới 100 đơn.
	 *
	 * <p>Không đổi {@code toResponse(order)} một-đơn: ở đó đúng là cần một lượt tra, và ép nó đi qua
	 * đường lô sẽ làm mã khó đọc hơn để đổi lấy không gì.
	 */
	List<OrderDtos.OrderResponse> toResponses(List<OrderEntity> orders) {
		if (orders.isEmpty()) {
			return List.of();
		}
		Map<String, PaymentEntity> theoDon = paymentRepository
				.findByOrderIdIn(orders.stream().map(OrderEntity::getId).toList()).stream()
				// Một đơn chỉ có một thanh toán (`findByOrderId` trả Optional), nhưng nếu dữ liệu cũ
				// có hai dòng thì `toMap` sẽ ném lỗi khoá trùng. Giữ dòng đầu để một bản ghi hỏng
				// không làm cả màn hình vận hành trắng.
				.collect(Collectors.toMap(PaymentEntity::getOrderId, p -> p, (a, b) -> a));
		// Cùng lý do với việc gộp truy vấn thanh toán ở trên: tải bếp giống hệt nhau cho mọi món
		// của mọi đơn trong lượt trả này, nên hỏi một lần.
		OrderItemEstimationService.TaiBep tai = estimationService.chupTaiBep();
		return orders.stream().map(o -> toResponse(o, theoDon.get(o.getId()), tai)).toList();
	}

	private OrderDtos.OrderResponse toResponse(
			OrderEntity order, PaymentEntity payment, OrderItemEstimationService.TaiBep tai) {
		return new OrderDtos.OrderResponse(
				order.getId(), order.getOrderCode(), order.getOrderType(), order.getTableCode(),
				order.getTableSessionId(), order.getStatus().name(),
				payment == null ? "NotRequested" : payment.getStatus().name(),
				payment == null ? "Unselected" : payment.getMethod().name(),
				order.getSubtotalAmount(), order.getDiscountAmount(), order.getDeliveryFee(), order.getTotalAmount(),
				order.getFulfillmentStatus(), fulfillmentDetails(order), order.getCourierId(), order.isCodAccepted(),
				order.getCreatedAt(), order.getUpdatedAt(),
				order.getItems().stream().map(item -> toItemResponse(item, tai)).toList(),
				order.getStatusHistory().stream().map(this::toEventResponse).toList());
	}

	private OrderDtos.CreateOrderResponse toCreateResponse(OrderEntity order) {
		OrderDtos.OrderResponse base = toResponse(order);
		return new OrderDtos.CreateOrderResponse(
				base.orderId(), base.orderCode(), base.orderType(), base.tableCode(), base.tableSessionId(),
				base.status(), base.paymentStatus(), base.paymentMethod(), base.subtotalAmount(),
				base.discountAmount(), base.deliveryFee(), base.totalAmount(), base.fulfillmentStatus(),
				base.deliveryDetails(), base.courierId(), base.codAccepted(), base.createdAt(), base.updatedAt(), base.items(),
				base.events(), order.getCustomerAccessToken());
	}

	private OrderDtos.DeliveryDetails fulfillmentDetails(OrderEntity order) {
		if (order.getOrderTypeValue() == OrderType.DineIn) {
			return null;
		}
		return new OrderDtos.DeliveryDetails(
				order.getRecipientName(), order.getRecipientPhone(), order.getDeliveryAddress(),
				order.getDeliveryNote(), order.getDeliveryLatitude(), order.getDeliveryLongitude());
	}

	private static final Set<OrderItemStatus> AWAITING_ESTIMATE_STATUS =
			EnumSet.of(OrderItemStatus.Pending, OrderItemStatus.Preparing);

	private OrderDtos.OrderItemResponse toItemResponse(
			OrderItemEntity item, OrderItemEstimationService.TaiBep tai) {
		OrderItemEstimationService.Estimate estimate = AWAITING_ESTIMATE_STATUS.contains(item.getStatus())
				? estimationService.estimate(item.getMenuItemId(), tai).orElse(null)
				: null;
		return new OrderDtos.OrderItemResponse(
				item.getId(), item.getMenuItemId(), item.getMenuItemName(), item.getUnitPrice(), item.getQuantity(),
				item.getStatus().name(), item.lineTotal(), item.getUpdatedAt(),
				estimate == null ? null : estimate.lowMinutes(),
				estimate == null ? null : estimate.highMinutes(),
				estimate != null && estimate.bepDong(), item.getNote());
	}

	private OrderDtos.OrderStatusEventResponse toEventResponse(OrderStatusHistoryEntity event) {
		return new OrderDtos.OrderStatusEventResponse(
				event.getToStatus(), event.getSource(), event.getChangedByRole(), event.getNote(), event.getCreatedAt());
	}
}
