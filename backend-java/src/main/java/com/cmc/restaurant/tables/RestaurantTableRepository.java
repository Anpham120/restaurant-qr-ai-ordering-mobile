package com.cmc.restaurant.tables;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RestaurantTableRepository extends JpaRepository<RestaurantTableEntity, String> {

	Optional<RestaurantTableEntity> findByTableCodeAndActiveTrue(String tableCode);

	Optional<RestaurantTableEntity> findByQrTokenAndActiveTrue(String qrToken);
}
