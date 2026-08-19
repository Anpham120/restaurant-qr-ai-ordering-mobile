package com.cmc.restaurant.counter;

import com.cmc.restaurant.counter.domain.CounterShiftStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CounterShiftRepository extends JpaRepository<CounterShiftEntity, String> {

	Optional<CounterShiftEntity> findFirstByStatusOrderByOpenedAtDesc(CounterShiftStatus status);

	// Dùng khi xoá tài khoản: lịch sử ca phải được gán lại chứ không mất. Xem CounterUserReferences.
	boolean existsByOpenedByUserIdOrClosedByUserId(String openedByUserId, String closedByUserId);

	List<CounterShiftEntity> findByOpenedByUserId(String openedByUserId);

	List<CounterShiftEntity> findByClosedByUserId(String closedByUserId);
}
