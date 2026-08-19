package com.cmc.restaurant.orders;

import org.springframework.data.jpa.repository.JpaRepository;

/** See {@link OrderItemRepository} — history is loaded with the order. */
public interface OrderStatusHistoryRepository extends JpaRepository<OrderStatusHistoryEntity, String> {
}
