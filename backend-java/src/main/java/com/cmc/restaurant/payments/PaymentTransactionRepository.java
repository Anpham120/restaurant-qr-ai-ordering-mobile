package com.cmc.restaurant.payments;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransactionEntity, String> {

	Optional<PaymentTransactionEntity> findByIdempotencyKey(String idempotencyKey);

	List<PaymentTransactionEntity> findByPaymentIdOrderByCreatedAtAsc(String paymentId);

	/** Idempotency lookup for the Casso webhook (hạn chế #3) — scoped by provider because
	 * {@code provider_transaction_id} also holds VietQR transfer content on request rows. */
	Optional<PaymentTransactionEntity> findByProviderAndProviderTransactionId(
			String provider, String providerTransactionId);
}
