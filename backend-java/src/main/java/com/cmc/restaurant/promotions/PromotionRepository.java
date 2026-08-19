package com.cmc.restaurant.promotions;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PromotionRepository extends JpaRepository<PromotionEntity, String> {

	Optional<PromotionEntity> findByCode(String code);

	// --- quản trị khuyến mãi (#93) ---------------------------------------------------------------

	/** Flash sale lên đầu rồi tới mã thường, mỗi nhóm sắp theo mã — đúng thứ tự bản .NET. */
	List<PromotionEntity> findAllByOrderByFlashSaleDescCodeAsc();

	boolean existsByCode(String code);

	/** Trùng mã với một khuyến mãi KHÁC — dùng khi sửa, để không tự báo trùng với chính nó. */
	boolean existsByCodeAndIdNot(String code, String id);
}
