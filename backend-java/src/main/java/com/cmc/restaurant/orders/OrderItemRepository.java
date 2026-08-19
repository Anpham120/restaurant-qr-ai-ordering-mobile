package com.cmc.restaurant.orders;

import org.springframework.data.jpa.repository.JpaRepository;

/** Order lines are reached through {@link OrderEntity#getItems()} since issue #77 — the child is
 * part of the order aggregate, not something looked up on its own. The old
 * {@code findByOrderId} derived query was removed with the plain {@code orderId} field it read. */
public interface OrderItemRepository extends JpaRepository<OrderItemEntity, String> {
}
