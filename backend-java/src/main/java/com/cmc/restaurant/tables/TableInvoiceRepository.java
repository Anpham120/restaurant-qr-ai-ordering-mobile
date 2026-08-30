package com.cmc.restaurant.tables;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TableInvoiceRepository extends JpaRepository<TableInvoiceEntity, String> {

	Optional<TableInvoiceEntity> findByTableSessionId(String tableSessionId);

	/**
	 * Tra hoá đơn theo mã in trên mã QR — đường vào của đối soát tự động.
	 *
	 * <p>Ngân hàng chỉ gửi lại nội dung chuyển khoản, tức chuỗi {@code CMC INV-yyyyMMdd-XXXXXXXX}.
	 * Không có cách nào khác đi từ một khoản tiền về ngược lại đúng hoá đơn đã sinh ra nó.
	 */
	Optional<TableInvoiceEntity> findByInvoiceCode(String invoiceCode);

	/**
	 * Bàn này còn hoá đơn đang chờ thanh toán không (#91).
	 *
	 * <p>Nối qua phiên bàn vì hoá đơn gắn với PHIÊN chứ không gắn thẳng với bàn. Đi từ bàn sang
	 * hoá đơn phải qua đúng cây quan hệ đó, không có đường tắt.
	 */
	@Query("select count(i) > 0 from TableInvoiceEntity i, TableSessionEntity s "
			+ "where i.tableSessionId = s.id and s.restaurantTableId = :tableId and i.status = 'Pending'")
	boolean existsPendingForTable(@Param("tableId") String tableId);

	/** Danh sách cho quầy, mới cập nhật trước (#96). */
	List<TableInvoiceEntity> findAllByOrderByUpdatedAtDesc();

	List<TableInvoiceEntity> findByStatusOrderByUpdatedAtDesc(String status);
}
