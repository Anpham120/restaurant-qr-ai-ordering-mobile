package com.cmc.restaurant.payments;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<PaymentEntity, String> {

	Optional<PaymentEntity> findByOrderId(String orderId);

	/**
	 * Nạp thanh toán của NHIỀU đơn trong một câu — dùng cho mọi đường trả về DANH SÁCH đơn.
	 *
	 * <p>Tra theo từng đơn ở đó là N+1: đo trên cơ sở dữ liệu thật, {@code GET /api/orders} tốn
	 * đúng một câu thừa mỗi đơn. Danh sách vận hành lấy tới 100 đơn và màn hình bếp/quầy hỏi lại
	 * liên tục, nên chi phí đó nhân lên theo thời gian chứ không phải một lần.
	 */
	List<PaymentEntity> findByOrderIdIn(Collection<String> orderIds);

	/** Khoản thanh toán của một hoá đơn bàn (#96). */
	Optional<PaymentEntity> findByTableInvoiceId(String tableInvoiceId);
}
