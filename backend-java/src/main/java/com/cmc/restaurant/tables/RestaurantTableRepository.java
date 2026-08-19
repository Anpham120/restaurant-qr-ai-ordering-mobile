package com.cmc.restaurant.tables;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RestaurantTableRepository extends JpaRepository<RestaurantTableEntity, String> {

	Optional<RestaurantTableEntity> findByTableCodeAndActiveTrue(String tableCode);

	Optional<RestaurantTableEntity> findByQrTokenAndActiveTrue(String qrToken);

	// --- quản trị bàn (#91) ---------------------------------------------------------------------

	List<RestaurantTableEntity> findAllByOrderByTableCodeAsc();

	/** KHÔNG lọc `active`: quản trị viên phải sửa được cả bàn đang tắt. */
	Optional<RestaurantTableEntity> findByTableCode(String tableCode);

	boolean existsByTableCode(String tableCode);
}
