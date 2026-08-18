package com.cmc.restaurant.counter;

import com.cmc.restaurant.counter.domain.CounterShiftStatus;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CounterShiftRepository extends JpaRepository<CounterShiftEntity, String> {

	Optional<CounterShiftEntity> findFirstByStatusOrderByOpenedAtDesc(CounterShiftStatus status);
}
