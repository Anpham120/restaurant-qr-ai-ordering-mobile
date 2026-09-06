package com.cmc.restaurant.orders.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.cart.CartService;
import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.menu.MenuOptionGroup;
import com.cmc.restaurant.menu.ShopConfig;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderPersistenceAdapter;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderStatusHistoryRepository;
import com.cmc.restaurant.orders.domain.OrderRuleViolation;
import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.orders.domain.OrderType;
import com.cmc.restaurant.payments.PaymentEntity;
import com.cmc.restaurant.payments.PaymentRepository;
import com.cmc.restaurant.payments.PaymentTransactionRepository;
import com.cmc.restaurant.payments.domain.PaymentMethod;
import com.cmc.restaurant.payments.domain.PaymentStatus;
import com.cmc.restaurant.promotions.PromotionService;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.RestaurantTableRepository;
import com.cmc.restaurant.tables.TableSessionRepository;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

class ShopOrderServiceTest {
	private final OrderRepository orders = mock(OrderRepository.class);
	private final PaymentRepository payments = mock(PaymentRepository.class);
	private final MenuItemRepository menu = mock(MenuItemRepository.class);
	private final UserRepository users = mock(UserRepository.class);
	private final PaymentTransactionRepository transactions = mock(PaymentTransactionRepository.class);
	private final ShopConfig config = mock(ShopConfig.class);
	private final OrderItemRepository items = mock(OrderItemRepository.class);
	private final OrderStatusHistoryRepository history = mock(OrderStatusHistoryRepository.class);
	private final OrderRealtimeNotifier realtime = mock(OrderRealtimeNotifier.class);
	private final OffsetDateTime now = OffsetDateTime.now();
	private OrderService service;
	private DeliveryService delivery;
	private OrderEntity order;
	private PaymentEntity payment;

	@BeforeEach
	void setup() {
		OrderItemEstimationService estimation = mock(OrderItemEstimationService.class);
		when(estimation.chupTaiBep()).thenReturn(new OrderItemEstimationService.TaiBep(Map.of(), 0));
		OrderPersistenceAdapter persistence = new OrderPersistenceAdapter(orders, items, history);
		service = new OrderService(orders, items, history, payments, menu, mock(RestaurantTableRepository.class),
				mock(TableSessionRepository.class), estimation, realtime, persistence, mock(CartService.class),
				mock(PromotionService.class), mock(ApplicationEventPublisher.class), config);
		delivery = new DeliveryService(orders, service, persistence, payments, transactions, users, realtime);
		order = new OrderEntity("order", "ORD-1", OrderType.Delivery, null, null, null, "secret", "key", "fp", null, now);
		order.addItem(new OrderItemEntity("line", "matcha", "Matcha", new BigDecimal("45000"), 1, now));
		order.setSubtotalAmount(new BigDecimal("45000"));
		order.setTotalAmount(new BigDecimal("49000"));
		payment = new PaymentEntity("pay", "order", now);
		payment.setAmount(order.getTotalAmount());
		when(orders.findForUpdateByOrderCode("ORD-1")).thenReturn(Optional.of(order));
		when(orders.findByOrderCode("ORD-1")).thenReturn(Optional.of(order));
		when(orders.findById("order")).thenReturn(Optional.of(order));
		when(payments.findByOrderId("order")).thenReturn(Optional.of(payment));
		when(config.response()).thenReturn(ShopConfig.defaults());
	}

	@Test
	void creatingDifferentSizesSnapshotsOptionsAndIncludesServerFee() {
		MenuItemEntity item = new MenuItemEntity("matcha", "shop_matcha", "Matcha", "", new BigDecimal("45000"),
				null, true, List.of(), now);
		item.setOptionGroups(List.of(new MenuOptionGroup("size", "Cỡ", 1, 1, List.of(
				new MenuOptionGroup.Option("m", "M", BigDecimal.ZERO, true),
				new MenuOptionGroup.Option("l", "L", new BigDecimal("10000"), true)))));
		when(menu.findById("matcha")).thenReturn(Optional.of(item));
		when(config.quote(21.0, 105.8)).thenReturn(new ShopConfig.Quote(new BigDecimal("6"), new BigDecimal("4000")));
		when(orders.nextOrderCodeNumber()).thenReturn(2L);
		OrderDtos.CreateOrderRequest request = new OrderDtos.CreateOrderRequest("Delivery", null, null, null,
				List.of(new OrderDtos.CreateOrderItemRequest("matcha", 2, List.of("m"), null),
						new OrderDtos.CreateOrderItemRequest("matcha", 1, List.of("l"), "Ít ngọt")), null, null,
				new OrderDtos.DeliveryDetails("An", "0901234567", "Hà Nội", null, 21.0, 105.8));
		OrderDtos.CreateOrderResponse response = service.createOrder(request, "new-key", "fp", ActorContext.CUSTOMER);
		assertThat(response.subtotalAmount()).isEqualByComparingTo("145000");
		assertThat(response.deliveryFee()).isEqualByComparingTo("4000");
		assertThat(response.totalAmount()).isEqualByComparingTo("149000");
		assertThat(response.items().get(1).note()).isEqualTo("Cỡ: L · Ít ngọt");
		ArgumentCaptor<PaymentEntity> savedPayment = ArgumentCaptor.forClass(PaymentEntity.class);
		verify(payments).save(savedPayment.capture());
		assertThat(savedPayment.getValue().getAmount()).isEqualByComparingTo("149000");
		OrderDtos.CreateOrderRequest stalePrice = new OrderDtos.CreateOrderRequest(request.orderType(), null, null, null,
				request.items(), null, null, request.deliveryDetails(), new BigDecimal("1"));
		assertThatThrownBy(() -> service.createOrder(stalePrice, "stale-key", "fp2", ActorContext.CUSTOMER))
				.isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getCode()).isEqualTo("ORDER_TOTAL_CHANGED"));
		verify(payments).save(any());
	}

	@Test
	void codNeedsCounterAcceptanceBeforePreparation() {
		payment.setMethod(PaymentMethod.COD);
		payment.setStatus(PaymentStatus.Pending);
		assertThatThrownBy(() -> service.updateOrderStatus("ORD-1", OrderStatus.Preparing, ActorContext.CUSTOMER))
				.isInstanceOf(ApiException.class).hasMessageContaining("COD");
		delivery.acceptCod("ORD-1", new ActorContext("counter", "CounterStaff"));
		assertThat(service.updateOrderStatus("ORD-1", OrderStatus.Preparing, new ActorContext("counter", "CounterStaff"))
				.status()).isEqualTo("Preparing");
	}

	@Test
	void rejectsPaidAndPendingCancellationWithoutChangingTotals() {
		for (PaymentStatus status : List.of(PaymentStatus.Pending, PaymentStatus.Confirmed, PaymentStatus.Paid)) {
			payment.setStatus(status);
			assertThatThrownBy(() -> service.cancelOrderItemAsCustomer("ORD-1", "line", "secret"))
					.isInstanceOf(ApiException.class);
			assertThat(order.getTotalAmount()).isEqualByComparingTo("49000");
		}
	}

	@Test
	void courierCannotReadOtherAssignmentsOrCompleteThroughGenericRoute() {
		order.setStatus(OrderStatus.Ready);
		order.assignCourier("courier-1", now);
		assertThatThrownBy(() -> delivery.update("ORD-1", new DeliveryService.UpdateRequest("OutForDelivery", null, null),
				new ActorContext("courier-2", "Courier"))).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.updateOrderStatus("ORD-1", OrderStatus.Completed,
				new ActorContext("counter", "CounterStaff"))).isInstanceOf(ApiException.class);
		assertThat(order.getFulfillmentStatus()).isEqualTo("Assigned");
	}

	@Test
	void codDeliveryConfirmsExactCashAndCompletesOrderAtomically() {
		order.setStatus(OrderStatus.Ready);
		order.acceptCod(now);
		payment.setMethod(PaymentMethod.COD);
		payment.setStatus(PaymentStatus.Pending);
		when(users.findById("courier")).thenReturn(Optional.of(new UserEntity("courier", "c@example.com", "Minh", "hash", "Courier", now)));
		delivery.dispatch("ORD-1", "courier", new ActorContext("counter", "CounterStaff"));
		ActorContext courier = new ActorContext("courier", "Courier");
		delivery.update("ORD-1", new DeliveryService.UpdateRequest("OutForDelivery", null, null), courier);
		assertThatThrownBy(() -> delivery.update("ORD-1", new DeliveryService.UpdateRequest("Delivered", null,
				new BigDecimal("45000")), courier)).isInstanceOf(OrderRuleViolation.class);
		assertThat(payment.getStatus()).isEqualTo(PaymentStatus.Pending);
		assertThat(order.getStatus()).isEqualTo(OrderStatus.Ready);
		OrderDtos.OrderResponse response = delivery.update("ORD-1", new DeliveryService.UpdateRequest("Delivered", null,
				new BigDecimal("49000")), courier);
		assertThat(response.status()).isEqualTo("Completed");
		assertThat(response.fulfillmentStatus()).isEqualTo("Delivered");
		assertThat(response.paymentStatus()).isEqualTo("Confirmed");
		verify(transactions).save(any());
	}

	@Test
	void failedDeliveryRequiresReasonAndPreservesUncollectedPayment() {
		order.setStatus(OrderStatus.Ready);
		order.assignCourier("courier", now);
		order.setFulfillmentStatus("OutForDelivery", now);
		payment.setMethod(PaymentMethod.COD);
		payment.setStatus(PaymentStatus.Pending);
		ActorContext courier = new ActorContext("courier", "Courier");
		assertThatThrownBy(() -> delivery.update("ORD-1", new DeliveryService.UpdateRequest("Failed", "", null), courier))
				.isInstanceOf(OrderRuleViolation.class);
		assertThat(delivery.update("ORD-1", new DeliveryService.UpdateRequest("Failed", "Khách không nghe máy", null), courier)
				.fulfillmentStatus()).isEqualTo("Failed");
		assertThat(payment.getStatus()).isEqualTo(PaymentStatus.Pending);
	}
}
