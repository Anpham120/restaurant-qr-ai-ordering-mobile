package com.cmc.restaurant.orders;

import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderStatusHistoryRepository extends JpaRepository<OrderStatusHistoryEntity, String> {

	List<OrderStatusHistoryEntity> findByOrderIdOrderByCreatedAtAsc(String orderId);
}
