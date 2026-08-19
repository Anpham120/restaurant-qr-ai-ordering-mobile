package com.cmc.restaurant.loyalty;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyRewardRepository extends JpaRepository<LoyaltyRewardEntity, String> {

	List<LoyaltyRewardEntity> findByActiveTrueAndPointsRequiredLessThanEqualOrderByPointsRequiredAsc(int points);

	/** Màn quản trị: TẤT CẢ ưu đãi kể cả đang tắt, sắp theo điểm cần đổi. */
	List<LoyaltyRewardEntity> findAllByOrderByPointsRequiredAsc();
}
