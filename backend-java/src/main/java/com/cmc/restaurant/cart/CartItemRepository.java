package com.cmc.restaurant.cart;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface CartItemRepository extends JpaRepository<CartItemEntity, String> {

	List<CartItemEntity> findByTableSessionId(String tableSessionId);

	Optional<CartItemEntity> findByTableSessionIdAndMenuItemId(String tableSessionId, String menuItemId);

	@Transactional
	void deleteByTableSessionId(String tableSessionId);
}
