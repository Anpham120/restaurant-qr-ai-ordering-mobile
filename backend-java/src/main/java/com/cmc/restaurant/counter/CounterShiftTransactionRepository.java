package com.cmc.restaurant.counter;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CounterShiftTransactionRepository
		extends JpaRepository<CounterShiftTransactionEntity, String> {

	boolean existsByCreatedByUserId(String createdByUserId);

	List<CounterShiftTransactionEntity> findByCreatedByUserId(String createdByUserId);
}
