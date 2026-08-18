package com.cmc.restaurant.menu;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<CategoryEntity, String> {

	List<CategoryEntity> findByActiveTrueOrderByDisplayOrderAscNameAsc();

	List<CategoryEntity> findAllByOrderByDisplayOrderAscNameAsc();
}
