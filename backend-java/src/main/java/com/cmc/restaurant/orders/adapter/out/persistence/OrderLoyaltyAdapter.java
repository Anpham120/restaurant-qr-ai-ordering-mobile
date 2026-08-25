package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.orders.application.OrderLoyaltyPort;
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

	public OrderLoyaltyAdapter(OrderRepository orders, MenuItemRepository menuItems) {
		this.orders = orders;
		this.menuItems = menuItems;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<HoaDon> timHoaDon(String orderCode) {
		return orders.findByOrderCode(orderCode).map(o -> new HoaDon(
				o.getOrderCode(), o.getStatus().name(), o.getSubtotalAmount(), o.getDiscountAmount()));
	}

	@Override
	@Transactional
	public void congThemGiamGia(String orderCode, BigDecimal themGiam) {
		OrderEntity order = orders.findByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		BigDecimal giamMoi = order.getDiscountAmount().add(themGiam);
		if (giamMoi.compareTo(order.getSubtotalAmount()) > 0) {
			// Nơi gọi đã phải kiểm trần trước khi tới đây. Chặn lần nữa ở sát chỗ ghi vì đây là nơi
			// duy nhất còn thấy được cả hai con số — một tổng âm sẽ chảy thẳng vào bảng thanh toán.
			throw ApiException.badRequest("ORDER_DISCOUNT_EXCEEDS_TOTAL",
					"Tổng giảm giá vượt quá giá trị đơn hàng.");
		}
		order.setDiscountAmount(giamMoi);
		order.setTotalAmount(order.getSubtotalAmount().subtract(giamMoi));
		orders.save(order);
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
		order.addItem(new OrderItemEntity(
				"oi_" + UUID.randomUUID().toString().replace("-", ""),
				mon.getId(), mon.getName() + " (đổi điểm)", BigDecimal.ZERO, 1, now));
		orders.save(order);
		return mon.getName();
	}
}
