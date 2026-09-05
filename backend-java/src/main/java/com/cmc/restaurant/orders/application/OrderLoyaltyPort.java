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
 * <p>Người dùng duy nhất là Loyalty, và cổng này gom đúng hai việc Loyalty được phép làm với một
 * đơn: trừ tiền, và thêm một món tặng. Trước khi có nó, đổi ưu đãi chỉ ghi một dòng
 * {@code loyalty_redemptions} rồi thôi — điểm bị trừ mà không đồng nào được giảm, món tặng thì bếp
 * không bao giờ nghe thấy.
 */
public interface OrderLoyaltyPort {

	/**
	 * Phần tiền của đơn mà bên ngoài cần để tính được khoản giảm.
	 *
	 * <p>Có {@code discountAmount} vì nơi gọi phải biết đơn ĐÃ được giảm bao nhiêu — một mã khuyến
	 * mãi áp lúc đặt món cộng thêm một khoản đổi điểm có thể vượt quá giá trị đơn.
	 */
	record HoaDon(String orderCode, String status, BigDecimal subtotalAmount, BigDecimal discountAmount) {
	}

	/**
	 * Tìm theo MÃ ĐƠN, không phải khoá chính.
	 *
	 * Mã đơn ("ORD-1042") là thứ khách nhìn thấy và là thứ toàn bộ bề mặt API dành cho khách đã
	 * dùng sẵn. Khoá chính là chi tiết lưu trữ của Orders; bắt module khác cầm nó là làm rò đúng
	 * thứ mà {@link OrderLookup} sinh ra để che.
	 */
	Optional<HoaDon> timHoaDon(String orderCode);

	/**
	 * Thêm một dòng món tặng vào đơn, đơn giá 0đ.
	 *
	 * <p>Đơn giá 0 chứ không phải giá gốc kèm một khoản giảm bằng đúng giá đó: món tặng KHÔNG phải
	 * doanh thu, và ghi nó thành doanh thu rồi trừ đi sẽ thổi cả doanh thu lẫn chiết khấu trong báo
	 * cáo. Quán chỉ chịu giá vốn, và giá vốn không nằm ở bảng này.
	 *
	 * <p>Vì đơn giá bằng 0, dòng này không làm đổi tạm tính hay tổng đơn — nó chỉ nói cho bếp biết
	 * phải làm thêm món gì.
	 *
	 * @return id của dòng đơn vừa tạo — nơi gọi phải giữ lại để biết dòng nào ứng với lần đổi nào
	 *         khi khách huỷ đúng món đó
	 */
	String themMonTang(String orderCode, String menuItemId);
}
