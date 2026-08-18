package com.cmc.restaurant.payments;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransactionEntity, String> {

	Optional<PaymentTransactionEntity> findByIdempotencyKey(String idempotencyKey);

	List<PaymentTransactionEntity> findByPaymentIdOrderByCreatedAtAsc(String paymentId);
}
