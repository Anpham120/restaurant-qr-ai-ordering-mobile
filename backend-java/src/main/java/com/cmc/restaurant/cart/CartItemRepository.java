package com.cmc.restaurant.cart;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface CartItemRepository extends JpaRepository<CartItemEntity, String> {

	List<CartItemEntity> findByTableSessionId(String tableSessionId);

	Optional<CartItemEntity> findByTableSessionIdAndMenuItemId(String tableSessionId, String menuItemId);

	/** Số dòng giỏ còn hiệu lực — ResumeStateQueryService chỉ cần con số, không cần dòng. */
	long countByTableSessionIdAndQuantityGreaterThan(String tableSessionId, int quantity);

	@Transactional
	void deleteByTableSessionId(String tableSessionId);
}
