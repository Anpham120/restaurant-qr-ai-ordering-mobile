package com.cmc.restaurant.orders.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cmc.restaurant.cart.CartService;
import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.menu.MenuOptionGroup;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderPersistenceAdapter;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderRepository;
import com.cmc.restaurant.orders.adapter.out.persistence.OrderStatusHistoryRepository;
import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.orders.domain.OrderType;
import com.cmc.restaurant.payments.PaymentEntity;
import com.cmc.restaurant.payments.PaymentRepository;
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

/**
 * Luật đặt món của quán, cho đơn mang về.
 *
 * <p>Các ca về giao tận nhà, tài xế và COD giao hàng đã bỏ cùng phạm vi — xem
 * {@code docs/pm/CHOT_NGHIEP_VU_QUAN_P0.md} §1.
 */
class ShopOrderServiceTest {
	private final OrderRepository orders = mock(OrderRepository.class);
	private final PaymentRepository payments = mock(PaymentRepository.class);
	private final MenuItemRepository menu = mock(MenuItemRepository.class);
	private final OrderItemRepository items = mock(OrderItemRepository.class);
	private final OrderStatusHistoryRepository history = mock(OrderStatusHistoryRepository.class);
	private final OrderRealtimeNotifier realtime = mock(OrderRealtimeNotifier.class);
	private final OffsetDateTime now = OffsetDateTime.now();
	private OrderService service;
	private OrderEntity order;
	private PaymentEntity payment;

	@BeforeEach
	void setup() {
		OrderItemEstimationService estimation = mock(OrderItemEstimationService.class);
		when(estimation.chupTaiBep()).thenReturn(new OrderItemEstimationService.TaiBep(Map.of(), 0));
		OrderPersistenceAdapter persistence = new OrderPersistenceAdapter(orders, items, history);
		service = new OrderService(orders, items, history, payments, menu, mock(RestaurantTableRepository.class),
				mock(TableSessionRepository.class), estimation, realtime, persistence, mock(CartService.class),
				mock(PromotionService.class), mock(ApplicationEventPublisher.class));
		order = new OrderEntity("order", "ORD-1", OrderType.Takeaway, null, null, null, "secret", "key", "fp", null, now);
		order.addItem(new OrderItemEntity("line", "matcha", "Matcha", new BigDecimal("45000"), 1, now));
		order.setSubtotalAmount(new BigDecimal("45000"));
		order.setTotalAmount(new BigDecimal("45000"));
		payment = new PaymentEntity("pay", "order", now);
		payment.setAmount(order.getTotalAmount());
		when(orders.findForUpdateByOrderCode("ORD-1")).thenReturn(Optional.of(order));
		when(orders.findByOrderCode("ORD-1")).thenReturn(Optional.of(order));
		when(orders.findById("order")).thenReturn(Optional.of(order));
		when(payments.findByOrderId("order")).thenReturn(Optional.of(payment));
	}

	/**
	 * Hai ly cùng món khác cỡ phải ra HAI dòng, và mỗi dòng chụp lại giá đã tính phụ thu.
	 *
	 * <p>Đây là hình dạng đơn phổ biến nhất của quán nước. Kèm luôn phép kiểm giá đã đổi: khách
	 * gửi tổng cũ thì đơn bị từ chối, chứ không âm thầm thu theo giá mới.
	 */
	@Test
	void haiCoKhacNhauRaHaiDongVaChupLaiGia() {
		MenuItemEntity item = new MenuItemEntity("matcha", "shop_matcha", "Matcha", "", new BigDecimal("45000"),
				null, true, List.of(), now);
		item.setOptionGroups(List.of(new MenuOptionGroup("size", "Cỡ", 1, 1, List.of(
				new MenuOptionGroup.Option("m", "M", BigDecimal.ZERO, true),
				new MenuOptionGroup.Option("l", "L", new BigDecimal("10000"), true)))));
		when(menu.findById("matcha")).thenReturn(Optional.of(item));
		when(orders.nextOrderCodeNumber()).thenReturn(2L);

		OrderDtos.CreateOrderRequest request = new OrderDtos.CreateOrderRequest("Takeaway", null, null, null,
				List.of(new OrderDtos.CreateOrderItemRequest("matcha", 2, List.of("m"), null),
						new OrderDtos.CreateOrderItemRequest("matcha", 1, List.of("l"), "Ít ngọt")), null, null,
				new OrderDtos.RecipientDetails("An", "0901234567"));
		OrderDtos.CreateOrderResponse response = service.createOrder(request, "new-key", "fp", ActorContext.CUSTOMER);

		assertThat(response.subtotalAmount()).isEqualByComparingTo("145000");
		assertThat(response.totalAmount()).isEqualByComparingTo("145000");
		assertThat(response.items().get(1).note()).isEqualTo("Cỡ: L · Ít ngọt");
		assertThat(response.recipient().recipientName()).isEqualTo("An");

		ArgumentCaptor<PaymentEntity> savedPayment = ArgumentCaptor.forClass(PaymentEntity.class);
		verify(payments).save(savedPayment.capture());
		assertThat(savedPayment.getValue().getAmount()).isEqualByComparingTo("145000");

		OrderDtos.CreateOrderRequest stalePrice = new OrderDtos.CreateOrderRequest(request.orderType(), null, null,
				null, request.items(), null, null, request.recipient(), new BigDecimal("1"));
		assertThatThrownBy(() -> service.createOrder(stalePrice, "stale-key", "fp2", ActorContext.CUSTOMER))
				.isInstanceOfSatisfying(ApiException.class,
						error -> assertThat(error.getCode()).isEqualTo("ORDER_TOTAL_CHANGED"));
		verify(payments).save(any());
	}

	/** Đơn mang về chưa thu đủ tiền thì không được vào hàng chuẩn bị. */
	@Test
	void mangVeChuaTraTienThiKhongDuocLam() {
		payment.setStatus(PaymentStatus.Pending);
		assertThatThrownBy(() -> service.updateOrderStatus("ORD-1", OrderStatus.Preparing, ActorContext.CUSTOMER))
				.isInstanceOf(ApiException.class);

		payment.setStatus(PaymentStatus.Paid);
		assertThat(service.updateOrderStatus("ORD-1", OrderStatus.Preparing,
				new ActorContext("counter", "CounterStaff")).status()).isEqualTo("Preparing");
	}

	/** Đơn đang thanh toán hoặc đã thu tiền thì khách không tự huỷ, và tổng tiền không đổi. */
	@Test
	void khongChoHuyKhiDangThanhToanVaGiuNguyenTongTien() {
		for (PaymentStatus status : List.of(PaymentStatus.Pending, PaymentStatus.Confirmed, PaymentStatus.Paid)) {
			payment.setStatus(status);
			assertThatThrownBy(() -> service.cancelOrderItemAsCustomer("ORD-1", "line", "secret"))
					.isInstanceOf(ApiException.class);
			assertThat(order.getTotalAmount()).isEqualByComparingTo("45000");
		}
	}
}
