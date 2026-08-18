package com.cmc.restaurant.menu;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MenuItemRepository extends JpaRepository<MenuItemEntity, String> {

	List<MenuItemEntity> findByCategoryIdInAndAvailableTrue(List<String> categoryIds);

	List<MenuItemEntity> findByCategoryIdInOrderByNameAsc(List<String> categoryIds);

	List<MenuItemEntity> findAllByOrderByNameAsc();
}
