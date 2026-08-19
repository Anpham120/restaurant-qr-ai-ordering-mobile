package com.cmc.restaurant.tables;

import com.cmc.restaurant.cart.CartItemRepository;
import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.tables.domain.TableSessionResumeState;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Dựng lại trạng thái "khách quay lại phiên bàn" từ ba nguồn: giỏ hàng, các đơn đã đặt, và hoá đơn
 * bàn.
 *
 * <p>Trước issue #78 cả ba đọc bằng SQL thô, với lý do ghi ngay trong file: "những bảng đó thuộc
 * module chưa được port (Orders: #6-9; Table Invoice: #7)". Lý do đó nay không còn đúng — cả hai
 * module đều đã port. Mỗi câu truy vấn giờ nằm ở repository của module SỞ HỮU bảng, nên tên bảng
 * và tên cột chỉ được viết ra đúng một nơi.
 *
 * <p>Việc lớp này vẫn gọi thẳng repository của Cart và Orders là phần còn lại, và có issue riêng:
 * #80 sẽ bọc chúng sau một cổng (port) ở tầng application thay vì để mỗi module tự với sang
 * persistence của module khác.
 */
@Service
public class ResumeStateQueryService {

	private final CartItemRepository cartItemRepository;
	private final OrderLookup orderLookup;
	private final TableInvoiceRepository invoiceRepository;

	public ResumeStateQueryService(
			CartItemRepository cartItemRepository, OrderLookup orderLookup,
			TableInvoiceRepository invoiceRepository) {
		this.cartItemRepository = cartItemRepository;
		this.orderLookup = orderLookup;
		this.invoiceRepository = invoiceRepository;
	}

	public TableSessionResumeState resolve(String tableSessionId) {
		long cartItemCount =
				cartItemRepository.countByTableSessionIdAndQuantityGreaterThan(tableSessionId, 0);

		List<String> orderStatuses = orderLookup.findStatusesForTableSession(tableSessionId);

		String invoiceStatus = invoiceRepository.findByTableSessionId(tableSessionId)
				.map(TableInvoiceEntity::getStatus).orElse(null);

		return TableSessionResumeStateResolver.resolve(cartItemCount, orderStatuses, invoiceStatus);
	}
}
