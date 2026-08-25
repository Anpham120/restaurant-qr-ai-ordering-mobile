package com.cmc.restaurant.orders.application;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Cổng để module khác trừ một khoản giảm giá vào đơn đã đặt.
 *
 * <p>Tách khỏi {@link OrderLookup} vì đây là cổng GHI. Gộp chung sẽ khiến bốn module chỉ đọc
 * (Payments, Realtime, Tables, Reports) nhìn thấy một phương thức đổi được tiền của đơn — thứ
 * chúng không có việc gì phải biết.
 *
 * <p>Người dùng đầu tiên là Loyalty: ưu đãi kiểu {@code DISCOUNT} chỉ có nghĩa khi bám vào một hoá
 * đơn thật. Trước khi có cổng này, đổi một ưu đãi giảm tiền chỉ ghi một dòng
 * {@code loyalty_redemptions} rồi thôi — điểm bị trừ mà không đồng nào được giảm.
 */
public interface OrderDiscountPort {

	/**
	 * Phần tiền của đơn mà bên ngoài cần để tính được khoản giảm.
	 *
	 * <p>Có {@code discountAmount} vì nơi gọi phải biết đơn ĐÃ được giảm bao nhiêu — một mã khuyến
	 * mãi áp lúc đặt món cộng thêm một khoản đổi điểm có thể vượt quá giá trị đơn.
	 */
	record HoaDon(String orderId, String status, BigDecimal subtotalAmount, BigDecimal discountAmount) {
	}

	Optional<HoaDon> timHoaDon(String orderId);

	/**
	 * Cộng thêm {@code themGiam} vào khoản giảm của đơn và tính lại tổng.
	 *
	 * <p>Cộng dồn chứ không ghi đè: đơn có thể đã mang sẵn giảm giá từ mã khuyến mãi, và ghi đè sẽ
	 * âm thầm xoá khoản đó đi.
	 */
	void congThemGiamGia(String orderId, BigDecimal themGiam);
}
