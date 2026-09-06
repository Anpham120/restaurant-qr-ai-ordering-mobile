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


	/** Một dòng hàng đợi: đủ thứ cần để biết món thuộc TRẠM nào và nặng bao nhiêu. */
	interface DongHangDoi {
		String getNhan();

		String getMaDanhMuc();

		long getTongPhut();
	}

	/**
	 * Việc đang chờ, gộp theo món.
	 *
	 * <p>Thay cho một truy vấn cũ trả MỘT con số cho cả quán — con số đó bắt ly bia xếp sau toàn
	 * bộ việc bếp. Câu này trả đủ dữ kiện để chia theo trạm.
	 *
	 * <p><b>NHÂN VỚI SỐ LƯỢNG.</b> Bản trước cộng {@code prep_minutes} một lần cho mỗi DÒNG món,
	 * nên một bàn gọi 30 phần trong một dòng đè lên bếp đúng bằng một phần. Đo trên máy chủ đang
	 * chạy: chất 30 phần cháo lòng (6 phút/phần, tức 180 phút việc) làm ước lượng nhích từ 45–75
	 * lên 48–79 phút — cộng BA phút thay vì cộng ba mươi. Thấp hơn mười lần.
	 *
	 * <p>Đo lại sau khi sửa, cùng phép đo: 102–170 lên 126–210 phút.
	 *
	 * <p>Sai theo hướng NGUY nhất: hứa nhanh rồi giao chậm, và sai to nhất đúng lúc quán đông có
	 * đoàn khách gọi nhiều phần cùng món. Lỗi có từ #141, sống sót vì mọi phép kiểm trước đây đều
	 * đặt số lượng 1.
	 *
	 * <p>Trả {@code tags} dạng chuỗi nối bằng dấu phẩy chứ không dạng mảng: ánh xạ {@code text[]}
	 * qua projection của Spring Data là chỗ dễ vỡ, còn luật chia trạm thì nằm ở Java
	 * ({@code TramChuanBi}) — nơi kiểm được mà không cần cơ sở dữ liệu.
	 *
	 * <p>Gộp theo món nên số dòng bị chặn bởi số MÓN KHÁC NHAU đang chờ, không phải số phần.
	 */
	@Query(value = """
			select array_to_string(m.tags, ',') as nhan,
			       m.category_id as maDanhMuc,
			       coalesce(sum(m.prep_minutes * oi.quantity), 0) as tongPhut
			from order_items oi
			join menu_items m on m.id = oi.menu_item_id
			join orders o on o.id = oi.order_id
			where oi.status in ('Pending', 'Preparing')
			  and o.status not in ('Completed', 'Cancelled')
			  and (o.order_type = 'DineIn' or exists (
			      select 1 from payments p where p.order_id = o.id
			      and (p.status in ('Paid', 'Confirmed') or
			           (o.cod_accepted = true and p.method = 'COD' and p.status = 'Pending'))))
			group by m.id, m.tags, m.category_id
			""", nativeQuery = true)
	List<DongHangDoi> hangDoiTheoMon();

	/**
	 * Thời gian lên món do bếp khai, hoặc rỗng khi chưa khai / món không tồn tại (#10).
	 *
	 * <p>Đặt ở ĐÂY chứ không ở một repository riêng: bản đầu tôi tách thành
	 * {@code MenuItemPrepTimeLookup extends Repository<Object, String>} cho gọn nghĩa, và Spring
	 * từ chối khởi động — {@code Not a managed type: class java.lang.Object}. Spring Data đòi một
	 * entity JPA thật làm tham số kiểu, kể cả khi mọi truy vấn đều là SQL native.
	 *
	 * <p>Câu này đọc bảng {@code menu_items} của module Menu — cùng đánh đổi đã ghi ở
	 * {@link #hangDoiTheoMon}: ràng buộc vào SCHEMA, không vào MÃ.
	 */
	@Query(value = "select m.prep_minutes from menu_items m where m.id = :menuItemId",
			nativeQuery = true)
	Optional<Integer> findPrepMinutes(String menuItemId);

	/** Nhãn và danh mục của một món, để biết nó thuộc trạm nào. */
	interface NhanDanhMuc {
		String getNhan();

		String getMaDanhMuc();
	}

	@Query(value = """
			select array_to_string(m.tags, ',') as nhan, m.category_id as maDanhMuc
			from menu_items m where m.id = :menuItemId
			""", nativeQuery = true)
	Optional<NhanDanhMuc> timNhanDanhMuc(String menuItemId);

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
