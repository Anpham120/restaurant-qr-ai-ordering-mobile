package com.cmc.restaurant.orders.adapter.out.persistence;

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

	/**
	 * Đơn của MỘT tài khoản khách qua nhiều lần ghé (§9.10 M3 mục 9, #33).
	 *
	 * <p>Không có cột {@code member_id} trên {@code orders}. Đường nối là
	 * {@code orders → table_sessions.member_id}, thứ mà #26 dựng lên — và §9.4 đã nói trước rằng
	 * chính nó mở khoá lịch sử đơn theo tài khoản.
	 *
	 * <p><b>Native SQL, và đây là một đánh đổi có ý thức.</b> Viết JPQL sẽ phải import
	 * {@code TableSessionEntity} vào tầng persistence của Orders — tức Orders biết module Tables
	 * lưu trữ bằng lớp nào. Cách còn lại là dựng một cổng mới chỉ để hỏi "phiên nào thuộc thành
	 * viên này", tức ba tệp cho đúng một câu truy vấn.
	 *
	 * <p>Chọn native: nó ràng buộc Orders vào SCHEMA của Tables (tên bảng, tên cột), không ràng
	 * buộc vào MÃ. ArchUnit không bắt được kiểu ràng buộc này — nên nó được ghi ra đây thay vì để
	 * người sau tự phát hiện. Nếu {@code table_sessions.member_id} đổi tên, chỗ này hỏng lúc chạy
	 * chứ không hỏng lúc biên dịch.
	 *
	 * <p>{@code LIMIT} bắt buộc: một khách quen có thể có hàng trăm đơn, và màn hình lịch sử
	 * không có lý do tải hết.
	 */
	@Query(value = """
			select o.* from orders o
			join table_sessions s on s.id = o.table_session_id
			where s.member_id = :memberId
			order by o.created_at desc
			limit :gioiHan
			""", nativeQuery = true)
	List<OrderEntity> findRecentForMember(String memberId, int gioiHan);

	/** Một dòng "món tôi hay gọi". */
	interface MonHayGoi {
		String getMenuItemId();

		String getMenuItemName();

		long getSoLan();

		long getTongSoLuong();
	}

	/**
	 * Món khách gọi nhiều nhất qua nhiều lần ghé (#35, §9.8).
	 *
	 * <p>§9.8 nói thẳng rằng phần này KHÔNG cần cơ chế mới: chỉ là truy vấn lịch sử {@code Order}
	 * theo {@code MemberId}, thứ đã có từ #26/#33. Đây là chỗ lời hứa đó được đổi thành mã.
	 *
	 * <p>Sắp theo SỐ LẦN GỌI trước, tổng số lượng sau. Một người gọi phở tám lần, mỗi lần một bát,
	 * "hay gọi" phở hơn người từng gọi mười bát chè trong đúng một bữa liên hoan. Sắp theo tổng số
	 * lượng sẽ cho ra danh sách của bữa tiệc đó, không phải thói quen của khách.
	 *
	 * <p>LOẠI món đã huỷ và đơn đã huỷ: khách chủ động bỏ chúng, nên chúng không nói gì về sở
	 * thích. Giữ lại sẽ khiến "món hay gọi" gồm cả món khách hay đổi ý.
	 *
	 * <p>Native SQL cùng lý do đã ghi ở {@link #findRecentForMember} — ràng buộc vào schema của
	 * Tables, không vào mã.
	 */
	@Query(value = """
			select oi.menu_item_id as menuItemId,
			       max(oi.menu_item_name) as menuItemName,
			       count(*) as soLan,
			       sum(oi.quantity) as tongSoLuong
			from order_items oi
			join orders o on o.id = oi.order_id
			join table_sessions s on s.id = o.table_session_id
			where s.member_id = :memberId
			  and oi.status <> 'Cancelled'
			  and o.status <> 'Cancelled'
			group by oi.menu_item_id
			order by count(*) desc, sum(oi.quantity) desc
			limit :gioiHan
			""", nativeQuery = true)
	List<MonHayGoi> findTopItemsForMember(String memberId, int gioiHan);

	/** Mọi đơn của một phiên bàn, mới nhất trước (#96). */
	List<OrderEntity> findByTableSessionIdOrderByCreatedAtDesc(String tableSessionId);

	/** Đếm đơn tạo trong một khoảng nửa mở [from, to) — cho báo cáo doanh thu. */
	long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(OffsetDateTime from, OffsetDateTime to);

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

	/** Chỉ lấy cột trạng thái — nơi gọi (`ResumeStateQueryService`) chỉ cần bấy nhiêu. */
	@Query("select o.status from OrderEntity o where o.tableSessionId = :sessionId")
	List<OrderStatus> findStatusesByTableSessionId(@Param("sessionId") String tableSessionId);

	/** Các lượt gọi món của một phiên bàn, bỏ đơn đã huỷ (V14). */
	List<OrderEntity> findByTableSessionIdAndStatusNotOrderByCreatedAtAsc(
			String tableSessionId, OrderStatus status);

	/**
	 * Số thứ tự kế tiếp cho mã đơn.
	 *
	 * <p>SQL thuần vì JPQL không gọi được sequence của PostgreSQL. Không dùng @GeneratedValue được:
	 * mã đơn là chuỗi "ORD-" ghép với số, không phải khoá chính. Điểm đáng nói là câu này giờ nằm
	 * trong tầng persistence — trước đó nó nằm thẳng trong OrderService, tức tầng use case biết tên
	 * một sequence trong CSDL.
	 */
	@Query(value = "select nextval('orders_order_code_seq')", nativeQuery = true)
	long nextOrderCodeNumber();

	/** Projection cho {@link #countActiveByTableSession()} — tránh trả về {@code Object[]} phải ép kiểu. */
	interface TableSessionOrderCount {
		String getTableSessionId();

		int getActiveCount();
	}

	/**
	 * Đếm đơn còn hoạt động theo từng phiên bàn, một truy vấn cho tất cả (#91).
	 *
	 * <p>Bỏ phiên null: đơn mang về (không gắn bàn) không thuộc phiên nào.
	 */
	@Query("select o.tableSessionId as tableSessionId, count(o) as activeCount from OrderEntity o "
			+ "where o.tableSessionId is not null "
			+ "and o.status <> com.cmc.restaurant.orders.domain.OrderStatus.Completed "
			+ "and o.status <> com.cmc.restaurant.orders.domain.OrderStatus.Cancelled "
			+ "group by o.tableSessionId")
	List<TableSessionOrderCount> countActiveByTableSession();

	default List<OrderEntity> findOtherActiveOrders(String tableSessionId, String excludeOrderId) {
		return findByTableSessionIdAndStatusNotIn(
				tableSessionId, List.of(OrderStatus.Completed, OrderStatus.Cancelled))
				.stream()
				.filter(order -> !order.getId().equals(excludeOrderId))
				.toList();
	}
}
