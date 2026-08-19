package com.cmc.restaurant.payments;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<PaymentEntity, String> {

	Optional<PaymentEntity> findByOrderId(String orderId);

	/** Khoản thanh toán của một hoá đơn bàn (#96). */
	Optional<PaymentEntity> findByTableInvoiceId(String tableInvoiceId);
}
