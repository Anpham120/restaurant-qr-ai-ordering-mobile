package com.cmc.restaurant.orders;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<OrderEntity, String> {

	Optional<OrderEntity> findByOrderCode(String orderCode);

	Optional<OrderEntity> findByIdempotencyKey(String idempotencyKey);

	List<OrderEntity> findByTableSessionIdAndStatusNotIn(String tableSessionId, List<String> statuses);

	@Query("select o from OrderEntity o where "
			+ "(:status is null or o.status = :status) and "
			+ "(:tableCode is null or o.tableCode = :tableCode) and "
			+ "(:updatedSince is null or o.updatedAt >= :updatedSince) "
			+ "order by o.updatedAt desc, o.createdAt desc")
	List<OrderEntity> search(
			@Param("status") String status,
			@Param("tableCode") String tableCode,
			@Param("updatedSince") OffsetDateTime updatedSince,
			Pageable pageable);

	default List<OrderEntity> findOtherActiveOrders(String tableSessionId, String excludeOrderId) {
		return findByTableSessionIdAndStatusNotIn(
				tableSessionId, List.of(OrderStatus.COMPLETED, OrderStatus.CANCELLED))
				.stream()
				.filter(order -> !order.getId().equals(excludeOrderId))
				.toList();
	}
}
