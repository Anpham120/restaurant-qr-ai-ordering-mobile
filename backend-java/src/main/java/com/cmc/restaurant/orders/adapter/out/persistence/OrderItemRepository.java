package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.OrderStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Order lines are reached through {@link OrderEntity#getItems()} since issue #77 — the child is
 * part of the order aggregate, not something looked up on its own. The queries below are the
 * exception: none of them loads a line to change it.
 */
public interface OrderItemRepository extends JpaRepository<OrderItemEntity, String> {

	/** Kitchen queue depth, for {@code OrderItemEstimationService}. */
	long countByStatusIn(Collection<OrderItemStatus> statuses);

	/**
	 * TỔNG thời gian khai báo của mọi món bếp đang phải làm — tải thật của bếp lúc này.
	 *
	 * <p>Khác hẳn {@link #countByStatusIn}: đếm ĐẦU MÓN coi mọi món như nhau, nên 10 đĩa gỏi cuốn
	 * và 10 con gà quay ra cùng một con số. Cộng {@code prep_minutes} mới phản ánh việc bếp thật
	 * sự phải làm bao lâu.
	 *
	 * <p>Món chưa khai {@code prep_minutes} tính bằng 0 — không đoán hộ. Hệ quả phải biết: nếu
	 * phần lớn thực đơn chưa khai thì tải bếp bị báo thấp hơn thực tế, và đó là lý do
	 * {@code prep_minutes} cần được bếp điền cho đủ.
	 *
	 * <p>Native SQL vì cần nối sang bảng {@code menu_items} của module Menu — cùng đánh đổi đã ghi
	 * ở {@code OrderRepository.findRecentForMember}: ràng buộc vào SCHEMA, không vào MÃ.
	 */
	@Query(value = """
			select coalesce(sum(m.prep_minutes), 0)
			from order_items oi
			join menu_items m on m.id = oi.menu_item_id
			where oi.status in ('Pending', 'Preparing')
			""", nativeQuery = true)
	long sumPrepMinutesInKitchenQueue();

	/**
	 * Thời gian lên món do bếp khai, hoặc rỗng khi chưa khai / món không tồn tại (#10).
	 *
	 * <p>Đặt ở ĐÂY chứ không ở một repository riêng: bản đầu tôi tách thành
	 * {@code MenuItemPrepTimeLookup extends Repository<Object, String>} cho gọn nghĩa, và Spring
	 * từ chối khởi động — {@code Not a managed type: class java.lang.Object}. Spring Data đòi một
	 * entity JPA thật làm tham số kiểu, kể cả khi mọi truy vấn đều là SQL native.
	 *
	 * <p>Câu này đọc bảng {@code menu_items} của module Menu — cùng đánh đổi đã ghi ở
	 * {@link #sumPrepMinutesInKitchenQueue}: ràng buộc vào SCHEMA, không vào MÃ.
	 */
	@Query(value = "select m.prep_minutes from menu_items m where m.id = :menuItemId",
			nativeQuery = true)
	Optional<Integer> findPrepMinutes(String menuItemId);

	/**
	 * Thời gian chuẩn bị (giây) của những phần đã xong gần nhất cho một món.
	 *
	 * <p>SQL thuần, và đây là lý do kỹ thuật chứ không phải tiện tay: JPQL không có hàm nào lấy
	 * được số giây của một khoảng thời gian. Cách duy nhất bằng JPA là nạp cả hàng lên rồi trừ
	 * trong Java — tức kéo tới 200 entity về chỉ để tính hai phân vị. Ở đây mỗi hàng trả về đúng
	 * một số.
	 */
	@Query(value = "select extract(epoch from (ready_at - created_at)) from order_items "
			+ "where menu_item_id = ?1 and ready_at is not null order by ready_at desc limit ?2",
			nativeQuery = true)
	List<Double> findRecentPrepSeconds(String menuItemId, int limit);

	/** Như trên nhưng cho toàn bộ thực đơn — dùng làm trung vị nền khi ước lượng hàng chờ. */
	@Query(value = "select extract(epoch from (ready_at - created_at)) from order_items "
			+ "where ready_at is not null order by ready_at desc limit ?1",
			nativeQuery = true)
	List<Double> findRecentPrepSecondsAcrossMenu(int limit);

	/**
	 * Các món tính tiền được của một phiên bàn: bỏ món đã huỷ và món thuộc đơn đã huỷ (V19).
	 *
	 * <p>Đi qua {@code i.order} nên ràng buộc "cùng phiên bàn" do JPA sinh join, không phải do
	 * chuỗi SQL viết tay trong module Tables tự nối bảng {@code orders} của module khác.
	 */
	@Query("select i from OrderItemEntity i where i.order.tableSessionId = :sessionId "
			+ "and i.order.status <> :cancelledOrder and i.status <> :cancelledItem")
	List<OrderItemEntity> findBillableByTableSession(
			@Param("sessionId") String tableSessionId,
			@Param("cancelledOrder") OrderStatus cancelledOrder,
			@Param("cancelledItem") OrderItemStatus cancelledItem);
}
