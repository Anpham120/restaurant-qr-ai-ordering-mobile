package com.cmc.restaurant.orders;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderItemRepository extends JpaRepository<OrderItemEntity, String> {

	List<OrderItemEntity> findByOrderId(String orderId);
}
