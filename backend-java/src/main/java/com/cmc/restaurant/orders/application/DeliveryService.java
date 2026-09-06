package com.cmc.restaurant.orders.application;

import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.auth.UserRole;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderPersistenceAdapter;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderStatusHistoryEntity;
import com.cmc.restaurant.orders.domain.DeliveryPolicy;
import com.cmc.restaurant.orders.domain.Order;
import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.orders.domain.OrderType;
import com.cmc.restaurant.payments.PaymentEntity;
import com.cmc.restaurant.payments.PaymentRepository;
import com.cmc.restaurant.payments.PaymentTransactionEntity;
import com.cmc.restaurant.payments.PaymentTransactionRepository;
import com.cmc.restaurant.payments.domain.Payment;
import com.cmc.restaurant.payments.domain.PaymentMethod;
import com.cmc.restaurant.payments.domain.PaymentStatus;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryService {
	private final OrderRepository orders;
	private final OrderService orderService;
	private final OrderPersistenceAdapter persistence;
	private final PaymentRepository payments;
	private final PaymentTransactionRepository transactions;
	private final UserRepository users;
	private final OrderRealtimeNotifier realtime;

	public DeliveryService(OrderRepository orders, OrderService orderService, OrderPersistenceAdapter persistence,
			PaymentRepository payments, PaymentTransactionRepository transactions, UserRepository users,
			OrderRealtimeNotifier realtime) {
		this.orders = orders;
		this.orderService = orderService;
		this.persistence = persistence;
		this.payments = payments;
		this.transactions = transactions;
		this.users = users;
		this.realtime = realtime;
	}

	@Transactional(readOnly = true)
	public OrderDtos.OrderListResponse assignedOrders(String courierId) {
		List<OrderEntity> assigned = orders.findTop100ByCourierIdOrderByUpdatedAtDesc(courierId);
		return new OrderDtos.OrderListResponse(orderService.toResponses(assigned), assigned.size());
	}

	@Transactional(readOnly = true)
	public CourierList couriers() {
		return new CourierList(users.findByRoleOrderByFullNameAsc(UserRole.COURIER).stream()
				.map(user -> new Courier(user.getId(), user.getFullName())).toList());
	}

	@Transactional
	public OrderDtos.OrderResponse acceptCod(String code, ActorContext actor) {
		OrderEntity order = lock(code);
		PaymentEntity payment = requirePayment(order);
		if (order.getOrderTypeValue() == OrderType.DineIn || !pendingCod(payment)
				|| (order.getStatus() != OrderStatus.Placed && order.getStatus() != OrderStatus.Confirmed)) {
			throw ApiException.badRequest("COD_ACCEPT_NOT_ALLOWED", "Chỉ chấp nhận đơn COD đang chờ chuẩn bị.");
		}
		if (!order.isCodAccepted()) {
			OffsetDateTime now = OffsetDateTime.now();
			order.acceptCod(now);
			audit(order, "Quầy chấp nhận COD.", actor, now);
			orders.save(order);
			notifyChanged(order);
		}
		return orderService.toResponse(order);
	}

	@Transactional
	public OrderDtos.OrderResponse dispatch(String code, String courierId, ActorContext actor) {
		OrderEntity order = lock(code);
		if (order.getOrderTypeValue() != OrderType.Delivery || order.getStatus() != OrderStatus.Ready
				|| !("ReadyForDispatch".equals(order.getFulfillmentStatus()) || "Failed".equals(order.getFulfillmentStatus()))) {
			throw ApiException.badRequest("DELIVERY_DISPATCH_NOT_ALLOWED", "Đơn chưa sẵn sàng giao hoặc đang được giao.");
		}
		PaymentEntity payment = requirePayment(order);
		if (!payment.toDomain().isSettled() && !(order.isCodAccepted() && pendingCod(payment))) {
			throw ApiException.badRequest("DELIVERY_PAYMENT_REQUIRED", "Đơn cần thanh toán hoặc được quầy chấp nhận COD.");
		}
		if (courierId == null || users.findById(courierId).filter(user -> UserRole.COURIER.equals(user.getRole())).isEmpty()) {
			throw ApiException.badRequest("COURIER_INVALID", "Vui lòng chọn nhân viên giao hàng hợp lệ.");
		}
		OffsetDateTime now = OffsetDateTime.now();
		order.assignCourier(courierId, now);
		audit(order, "Phân công giao hàng: " + courierId, actor, now);
		orders.save(order);
		notifyChanged(order);
		return orderService.toResponse(order);
	}

	@Transactional
	public OrderDtos.OrderResponse update(String code, UpdateRequest request, ActorContext actor) {
		OrderEntity order = lock(code);
		if (actor.userId() == null || !Objects.equals(order.getCourierId(), actor.userId())) {
			throw ApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
		}
		if (order.getOrderTypeValue() != OrderType.Delivery || request == null) {
			throw ApiException.badRequest("DELIVERY_STATUS_INVALID", "Đơn giao hàng không hợp lệ.");
		}
		if (Objects.equals(order.getFulfillmentStatus(), request.status())) {
			return orderService.toResponse(order);
		}
		DeliveryPolicy.requireTransition(order.getFulfillmentStatus(), request.status(), request.note());
		OffsetDateTime now = OffsetDateTime.now();
		if ("Delivered".equals(request.status())) {
			PaymentEntity entity = requirePayment(order);
			Payment payment = entity.toDomain();
			if (!payment.isSettled()) {
				if (!order.isCodAccepted() || !pendingCod(entity)) {
					throw ApiException.badRequest("DELIVERY_PAYMENT_REQUIRED", "Đơn chưa đủ điều kiện thanh toán.");
				}
				DeliveryPolicy.requireExactCollection(order.getTotalAmount(), request.amountCollected());
				payment.confirmManually("COD:" + order.getOrderCode(), now);
				entity.applyFrom(payment);
				payments.saveAndFlush(entity);
				transactions.save(new PaymentTransactionEntity("ptx_" + UUID.randomUUID().toString().replace("-", ""),
						entity.getId(), "COD", "Confirmed", entity.getAmount(), "COD", payment.providerTransactionId(),
						"Nhân viên " + actor.userId() + " thu COD khi giao hàng.", now, null, null));
				audit(order, "Đã thu COD: " + request.amountCollected(), actor, now);
			}
			Order domain = persistence.toDomain(order);
			domain.completeOnDelivery(actor.toDomain(), now);
			persistence.save(domain);
		}
		order.setFulfillmentStatus(request.status(), now);
		audit(order, request.status() + (request.note() == null ? "" : ": " + request.note().trim()), actor, now);
		orders.save(order);
		notifyChanged(order);
		return orderService.toResponse(order);
	}

	private OrderEntity lock(String code) {
		return orders.findForUpdateByOrderCode(code.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));
	}

	private PaymentEntity requirePayment(OrderEntity order) {
		return payments.findByOrderId(order.getId())
				.orElseThrow(() -> ApiException.badRequest("PAYMENT_NOT_FOUND", "Không tìm thấy thanh toán."));
	}

	private static boolean pendingCod(PaymentEntity payment) {
		return payment.getMethod() == PaymentMethod.COD && payment.getStatus() == PaymentStatus.Pending;
	}

	private void audit(OrderEntity order, String note, ActorContext actor, OffsetDateTime now) {
		order.addStatusChange(new OrderStatusHistoryEntity("osh_" + UUID.randomUUID().toString().replace("-", ""),
				order.getStatus().name(), order.getStatus().name(), "Delivery", actor.userId(), actor.role(), note, now));
	}

	private void notifyChanged(OrderEntity order) {
		realtime.orderStatusChanged(new RealtimeDtos.OrderStatusChangedEvent(order.getId(), order.getOrderCode(),
				order.getStatus().name(), order.getUpdatedAt()), order.getTableCode());
	}

	public record UpdateRequest(String status, String note, BigDecimal amountCollected) {
	}
	public record DispatchRequest(String courierId) {
	}
	public record Courier(String userId, String fullName) {
	}
	public record CourierList(List<Courier> users) {
	}
}
