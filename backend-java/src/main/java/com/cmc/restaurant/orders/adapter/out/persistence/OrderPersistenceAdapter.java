package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.orders.domain.Order;
import com.cmc.restaurant.orders.domain.OrderItem;
import com.cmc.restaurant.orders.domain.StatusChange;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Translates between the {@link Order} aggregate and the JPA rows.
 *
 * <p>This class exists so the domain can stay free of Hibernate. It is the only place that knows an
 * order is three tables; {@code Order} itself just knows it has items and a list of changes.
 *
 * <p>Note what {@link #save} does with {@code takeNewChanges()}: the aggregate accumulates the audit
 * entries it produced, and the adapter appends exactly those. Before this, {@code OrderService}
 * wrote history at each call site, which is how it stayed possible to change a status and forget
 * the audit row.
 */
@Component
public class OrderPersistenceAdapter {

	private final OrderRepository orderRepository;
	private final OrderItemRepository orderItemRepository;
	private final OrderStatusHistoryRepository historyRepository;

	public OrderPersistenceAdapter(
			OrderRepository orderRepository, OrderItemRepository orderItemRepository,
			OrderStatusHistoryRepository historyRepository) {
		this.orderRepository = orderRepository;
		this.orderItemRepository = orderItemRepository;
		this.historyRepository = historyRepository;
	}

	public Optional<Order> loadByOrderCode(String orderCode) {
		return orderRepository.findByOrderCode(orderCode.trim()).map(this::toDomain);
	}

	public Order toDomain(OrderEntity entity) {
		// Items come with the order now (mappedBy + cascade, issue #77); no second query, and no
		// caller that can forget to run one.
		List<OrderItem> items = entity.getItems().stream()
				.map(i -> new OrderItem(
						i.getId(), i.getMenuItemId(), i.getMenuItemName(), i.getUnitPrice(), i.getQuantity(),
						i.getStatus(), i.getUpdatedAt(), i.getReadyAt()))
				.toList();
		return new Order(
				entity.getId(), entity.getOrderCode(), entity.getTableCode(), entity.getTableSessionId(),
				entity.getCustomerAccessToken(), entity.getStatus(), entity.getUpdatedAt(), items);
	}

	/** Writes back only what the aggregate actually changed, then appends its audit entries. */
	public void save(Order order) {
		OrderEntity entity = orderRepository.findById(order.id()).orElseThrow(
				() -> new IllegalStateException("Order disappeared while being saved: " + order.id()));
		entity.setStatus(order.status());
		entity.setUpdatedAt(order.updatedAt());

		Map<String, OrderItem> byId = order.items().stream()
				.collect(Collectors.toMap(OrderItem::id, Function.identity()));
		for (OrderItemEntity itemEntity : entity.getItems()) {
			OrderItem item = byId.get(itemEntity.getId());
			if (item == null) {
				continue;
			}
			// Compared before writing so an untouched line is not rewritten with an identical row —
			// that would bump updated_at and make the kitchen board look like it changed.
			if (itemEntity.getStatus() != item.status()) {
				itemEntity.setStatus(item.status());
				itemEntity.setUpdatedAt(item.updatedAt());
				itemEntity.setReadyAt(item.readyAt());
				orderItemRepository.save(itemEntity);
			}
		}

		// Appended to the aggregate; cascade persists them with the order below.
		for (StatusChange change : order.takeNewChanges()) {
			OrderStatusHistoryEntity event = new OrderStatusHistoryEntity(
					"osh_" + UUID.randomUUID().toString().replace("-", ""),
					change.fromStatus() == null ? null : change.fromStatus().name(),
					change.toStatus().name(), change.source(),
					change.actor().userId(), change.actor().role(), change.note(), change.occurredAt());
			entity.addStatusChange(event);
		}

		orderRepository.save(entity);
	}
}
