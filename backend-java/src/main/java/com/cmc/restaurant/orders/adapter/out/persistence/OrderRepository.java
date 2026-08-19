package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
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

	List<OrderEntity> findByTableSessionIdAndStatusNotIn(String tableSessionId, List<OrderStatus> statuses);

	// updatedSince uses coalesce instead of the ":param is null or ..." idiom used by the other two.
	// With that idiom the parameter appears once on its own ("$5 is null"), giving PostgreSQL nothing
	// to infer a type from, and the whole statement fails to prepare with
	// "could not determine data type of parameter $5" — so GET /api/orders returned 500 on every
	// call. Text parameters survive it (unknown defaults to text); a timestamptz does not.
	// coalesce takes the type from o.updatedAt, and since that column is NOT NULL the condition is
	// exactly equivalent to the original.
	@Query("select o from OrderEntity o where "
			+ "(:status is null or o.status = :status) and "
			+ "(:tableCode is null or o.tableCode = :tableCode) and "
			+ "(o.updatedAt >= coalesce(:updatedSince, o.updatedAt)) "
			+ "order by o.updatedAt desc, o.createdAt desc")
	List<OrderEntity> search(
			@Param("status") OrderStatus status,
			@Param("tableCode") String tableCode,
			@Param("updatedSince") OffsetDateTime updatedSince,
			Pageable pageable);

	default List<OrderEntity> findOtherActiveOrders(String tableSessionId, String excludeOrderId) {
		return findByTableSessionIdAndStatusNotIn(
				tableSessionId, List.of(OrderStatus.Completed, OrderStatus.Cancelled))
				.stream()
				.filter(order -> !order.getId().equals(excludeOrderId))
				.toList();
	}
}
