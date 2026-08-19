package com.cmc.restaurant.tables;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TableInvoiceRepository extends JpaRepository<TableInvoiceEntity, String> {

	Optional<TableInvoiceEntity> findByTableSessionId(String tableSessionId);

	/**
	 * Bàn này còn hoá đơn đang chờ thanh toán không (#91).
	 *
	 * <p>Nối qua phiên bàn vì hoá đơn gắn với PHIÊN chứ không gắn thẳng với bàn. Đi từ bàn sang
	 * hoá đơn phải qua đúng cây quan hệ đó, không có đường tắt.
	 */
	@Query("select count(i) > 0 from TableInvoiceEntity i, TableSessionEntity s "
			+ "where i.tableSessionId = s.id and s.restaurantTableId = :tableId and i.status = 'Pending'")
	boolean existsPendingForTable(@Param("tableId") String tableId);
}
