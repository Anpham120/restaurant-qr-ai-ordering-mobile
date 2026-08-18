package com.cmc.restaurant.orders;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<PaymentEntity, String> {

	Optional<PaymentEntity> findByOrderId(String orderId);
}
