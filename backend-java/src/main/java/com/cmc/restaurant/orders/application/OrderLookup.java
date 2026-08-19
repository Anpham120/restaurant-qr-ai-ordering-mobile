package com.cmc.restaurant.orders.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Cổng đọc dữ liệu đơn hàng dành cho các module KHÁC (Payments, Realtime, Tables, Reports).
 *
 * <p>Lý do tồn tại (issue #80): trước đó bốn module gọi thẳng {@code OrderRepository} và
 * {@code OrderEntity} — tức tầng persistence của Orders. Cấu trúc hexagonal ở #76 làm điều đó lộ
 * ra trong chính dòng import: {@code orders.adapter.out.persistence.OrderEntity}. Một module không
 * được biết module khác lưu trữ ra sao; nó chỉ được biết module kia trả lời được câu hỏi gì.
 *
 * <p>Hai hệ quả cụ thể, không phải chuyện thẩm mỹ:
 * <ul>
 *   <li>{@code customerAccessToken} <b>không</b> nằm trong bất kỳ kiểu trả về nào. Cả ba nơi từng
 *       đọc nó đều làm đúng một việc: so sánh với token khách gửi lên. Nên cổng lộ
 *       {@link #matchesCustomerToken} thay vì lộ bí mật. Phép so sánh thời gian hằng giờ chỉ còn ở
 *       một chỗ, thay vì ba chỗ tự gọi lại.</li>
 *   <li>Kiểu trả về là record phẳng, không phải entity JPA. Nơi gọi vì thế không thể vô tình đi
 *       tiếp sang quan hệ lazy và dính {@code LazyInitializationException} ngoài transaction —
 *       đúng lỗi đã xảy ra ở #77.</li>
 * </ul>
 */
public interface OrderLookup {

	/** Thông tin đơn mà module khác thật sự cần. Cố ý không có thêm trường nào. */
	record OrderSummary(String id, String orderCode, String tableCode, String customerPhoneNumber) {
	}

	/** Một lượt gọi món của phiên bàn (V14). Đã loại đơn huỷ. */
	record OrderRound(String orderCode, String status, BigDecimal subtotalAmount, OffsetDateTime createdAt) {
	}

	/** Món tính tiền được của phiên bàn (V19). Đã loại món huỷ và món thuộc đơn huỷ. */
	record BillableItem(String menuItemId, String menuItemName, BigDecimal unitPrice, int quantity) {
	}

	Optional<OrderSummary> findByOrderCode(String orderCode);

	/**
	 * So token khách gửi lên với token đã cấp cho đơn, theo thời gian hằng.
	 *
	 * <p>Trả {@code false} khi đơn không tồn tại — nơi gọi không phân biệt được "sai token" với
	 * "không có đơn", đúng như hành vi cũ và cũng là điều nên thế.
	 */
	boolean matchesCustomerToken(String orderCode, String suppliedToken);

	List<OrderRound> findRoundsForTableSession(String tableSessionId);

	List<BillableItem> findBillableItemsForTableSession(String tableSessionId);

	/** Trạng thái của mọi đơn trong phiên, kể cả đơn đã huỷ. */
	List<String> findStatusesForTableSession(String tableSessionId);

	/** Đếm đơn tạo trong khoảng nửa mở {@code [from, to)}. */
	long countCreatedBetween(OffsetDateTime fromInclusive, OffsetDateTime toExclusive);

	/**
	 * Số đơn CÒN HOẠT ĐỘNG của từng phiên bàn — bỏ đơn {@code Completed} và {@code Cancelled} (#91).
	 *
	 * <p>Trả về map thay vì hỏi từng phiên một: màn quản trị liệt kê hàng chục phiên cùng lúc, hỏi
	 * lẻ là N+1. Phiên không có đơn nào thì KHÔNG xuất hiện trong map — nơi gọi hiểu là 0.
	 */
	Map<String, Integer> countActiveOrdersByTableSession();
}
