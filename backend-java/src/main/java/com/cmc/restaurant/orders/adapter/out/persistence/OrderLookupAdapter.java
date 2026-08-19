package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.shared.CustomerTokenGuard;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hiện thực {@link OrderLookup} — chỗ duy nhất còn dịch từ entity JPA sang kiểu mà module khác
 * nhìn thấy.
 *
 * <p>Chiều phụ thuộc ở đây là điểm chính của hexagonal: adapter phụ thuộc vào application (nó
 * implement interface ở đó), không bao giờ ngược lại. Nhờ vậy Payments, Realtime, Tables và
 * Reports chỉ cần biết {@code orders.application}, không cần biết Orders dùng JPA hay gì khác.
 *
 * <p>{@code @Transactional(readOnly = true)} vì mọi phương thức đều chỉ đọc, và vì entity phải
 * được chuyển sang record TRƯỚC khi transaction đóng — sau đó chúng detached và mọi quan hệ lazy
 * sẽ ném {@code LazyInitializationException}.
 */
@Component
@Transactional(readOnly = true)
public class OrderLookupAdapter implements OrderLookup {

	private final OrderRepository orderRepository;
	private final OrderItemRepository orderItemRepository;

	public OrderLookupAdapter(OrderRepository orderRepository, OrderItemRepository orderItemRepository) {
		this.orderRepository = orderRepository;
		this.orderItemRepository = orderItemRepository;
	}

	@Override
	public Optional<OrderSummary> findByOrderCode(String orderCode) {
		return orderRepository.findByOrderCode(orderCode.trim())
				.map(o -> new OrderSummary(
						o.getId(), o.getOrderCode(), o.getTableCode(), o.getCustomerPhoneNumber()));
	}

	@Override
	public boolean matchesCustomerToken(String orderCode, String suppliedToken) {
		return orderRepository.findByOrderCode(orderCode.trim())
				.map(OrderEntity::getCustomerAccessToken)
				.map(stored -> CustomerTokenGuard.hasCustomerToken(stored, suppliedToken))
				.orElse(false);
	}

	@Override
	public List<OrderRound> findRoundsForTableSession(String tableSessionId) {
		return orderRepository
				.findByTableSessionIdAndStatusNotOrderByCreatedAtAsc(tableSessionId, OrderStatus.Cancelled)
				.stream()
				.map(o -> new OrderRound(
						o.getOrderCode(), o.getStatus().name(), o.getSubtotalAmount(), o.getCreatedAt()))
				.toList();
	}

	@Override
	public List<BillableItem> findBillableItemsForTableSession(String tableSessionId) {
		return orderItemRepository
				.findBillableByTableSession(tableSessionId, OrderStatus.Cancelled, OrderItemStatus.Cancelled)
				.stream()
				.map(i -> new BillableItem(
						i.getMenuItemId(), i.getMenuItemName(), i.getUnitPrice(), i.getQuantity()))
				.toList();
	}

	@Override
	public List<String> findStatusesForTableSession(String tableSessionId) {
		return orderRepository.findStatusesByTableSessionId(tableSessionId)
				.stream().map(OrderStatus::name).toList();
	}

	@Override
	public long countCreatedBetween(OffsetDateTime fromInclusive, OffsetDateTime toExclusive) {
		return orderRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(fromInclusive, toExclusive);
	}
}
