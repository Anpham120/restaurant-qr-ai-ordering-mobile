package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.orders.application.OrderLoyaltyPort;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Hiện thực {@link OrderLoyaltyPort} trên bảng {@code orders}. */
@Component
public class OrderLoyaltyAdapter implements OrderLoyaltyPort {

	private final OrderRepository orders;
	private final MenuItemRepository menuItems;
	private final OrderRealtimeNotifier thongBao;

	public OrderLoyaltyAdapter(
			OrderRepository orders, MenuItemRepository menuItems, OrderRealtimeNotifier thongBao) {
		this.orders = orders;
		this.menuItems = menuItems;
		this.thongBao = thongBao;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<HoaDon> timHoaDon(String orderCode) {
		return orders.findByOrderCode(orderCode).map(o -> new HoaDon(
				o.getOrderCode(), o.getStatus().name(), o.getSubtotalAmount(), o.getDiscountAmount()));
	}

	@Override
	@Transactional
	public String themMonTang(String orderCode, String menuItemId) {
		OrderEntity order = orders.findByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		MenuItemEntity mon = menuItems.findById(menuItemId)
				.orElseThrow(() -> ApiException.badRequest("MENU_ITEM_UNAVAILABLE",
						"Món của ưu đãi này không còn trong thực đơn."));

		// Món hết hàng thì từ chối TRƯỚC khi trừ điểm ở nơi gọi. Gắn vào đơn rồi để bếp phát hiện
		// là đẩy lời từ chối xuống tận lúc khách đang chờ món.
		if (!mon.isAvailable()) {
			throw ApiException.badRequest("MENU_ITEM_UNAVAILABLE", "Món này đang hết.");
		}

		// Ghi rõ "(đổi điểm)" vào tên dòng. Một dòng 0đ không kèm lời giải thích trông như lỗi giá
		// với cả bếp lẫn khách đọc hoá đơn, và người thấy nó sẽ đi hỏi thay vì làm món. Tên dòng
		// vốn đã là BẢN SAO tại thời điểm đặt (cùng lý do với reward_name), nên sửa ở đây không
		// ảnh hưởng gì tới thực đơn — món vẫn tra được qua menu_item_id.
		OffsetDateTime now = OffsetDateTime.now();
		String orderItemId = "oi_" + UUID.randomUUID().toString().replace("-", "");
		// Một biến, dùng cho cả dòng đơn lẫn sự kiện báo bếp. Tính riêng hai lần là cách hai chỗ
		// lệch nhau: bảng bếp hiện "Gỏi cuốn chay" trong khi phiếu in ra "Gỏi cuốn chay (đổi điểm)".
		String tenDong = mon.getName() + " (đổi điểm)";
		order.addItem(new OrderItemEntity(
				orderItemId, mon.getId(), tenDong, BigDecimal.ZERO, 1, now));
		orders.save(order);

		// Báo bếp. Mọi thay đổi khác của đơn đều đi qua đường này; bỏ sót đúng chỗ thêm món tặng sẽ
		// để món nằm im tới lượt bếp tự tải lại — tối đa 5 giây, nhưng cũng là chỗ duy nhất trong
		// hệ thống mà một thay đổi của đơn không tự báo đi.
		//
		// Dùng lại sự kiện "món đổi trạng thái" chứ không thêm loại sự kiện mới: món này VỪA sang
		// Pending, nên câu đó đúng nghĩa đen, và mọi client đang nghe đều tải lại danh sách khi
		// nhận bất kỳ sự kiện nào — thứ thật sự làm món hiện ra.
		thongBao.orderItemStatusChanged(
				new RealtimeDtos.OrderItemStatusChangedEvent(
						order.getId(), order.getOrderCode(), orderItemId,
						tenDong, OrderItemStatus.Pending.name(), now),
				order.getTableCode());
		return orderItemId;
	}
}
