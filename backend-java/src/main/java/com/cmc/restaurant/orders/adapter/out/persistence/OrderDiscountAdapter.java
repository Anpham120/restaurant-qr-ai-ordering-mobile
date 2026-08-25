package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.orders.application.OrderDiscountPort;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Hiện thực {@link OrderDiscountPort} trên bảng {@code orders}. */
@Component
public class OrderDiscountAdapter implements OrderDiscountPort {

	private final OrderRepository orders;

	public OrderDiscountAdapter(OrderRepository orders) {
		this.orders = orders;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<HoaDon> timHoaDon(String orderId) {
		return orders.findById(orderId).map(o -> new HoaDon(
				o.getId(), o.getStatus().name(), o.getSubtotalAmount(), o.getDiscountAmount()));
	}

	@Override
	@Transactional
	public void congThemGiamGia(String orderId, BigDecimal themGiam) {
		OrderEntity order = orders.findById(orderId)
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
}
