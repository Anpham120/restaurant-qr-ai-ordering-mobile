package com.cmc.restaurant.promotions;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PromotionRepository extends JpaRepository<PromotionEntity, String> {

	Optional<PromotionEntity> findByCode(String code);
}
