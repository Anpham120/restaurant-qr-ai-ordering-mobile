package com.cmc.restaurant.counter;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CounterShiftTransactionRepository
		extends JpaRepository<CounterShiftTransactionEntity, String> {
}
