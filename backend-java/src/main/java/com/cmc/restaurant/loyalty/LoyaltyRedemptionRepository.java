package com.cmc.restaurant.loyalty;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyRedemptionRepository extends JpaRepository<LoyaltyRedemptionEntity, String> {

	/** Lần đổi đã ghi cho khoá này chưa — dùng để trả lại kết quả cũ thay vì tiêu điểm lần hai. */
	Optional<LoyaltyRedemptionEntity> findByIdempotencyKey(String idempotencyKey);

	List<LoyaltyRedemptionEntity> findByMemberIdOrderByCreatedAtDesc(String memberId);
}
