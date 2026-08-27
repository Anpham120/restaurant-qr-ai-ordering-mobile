package com.cmc.restaurant.loyalty;

import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface LoyaltyLinkCodeRepository extends JpaRepository<LoyaltyLinkCodeEntity, String> {

	/**
	 * Xoá mọi mã cũ của tài khoản trước khi cấp mã mới.
	 *
	 * <p>Hai mã cùng sống nghĩa là một mã khách tưởng đã bỏ đi vẫn nối được — và khách không có
	 * cách nào biết mã cũ còn hiệu lực.
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("delete from LoyaltyLinkCodeEntity c where c.userId = :userId")
	void xoaMaCuCua(String userId);

	/**
	 * Đánh dấu đã dùng, CHỈ KHI mã còn dùng được.
	 *
	 * <p>Điều kiện nằm trong mệnh đề where chứ không ở một phép đọc-rồi-ghi: hai nhân viên cùng gõ
	 * một mã trên hai máy sẽ có đúng một lượt thắng.
	 *
	 * @return 1 nếu vừa dùng được, 0 nếu mã đã dùng hoặc đã hết hạn
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update LoyaltyLinkCodeEntity c set c.usedAt = :now, c.usedBy = :boi "
			+ "where c.code = :code and c.usedAt is null and c.expiresAt > :now")
	int dungMaNeuConHieuLuc(String code, OffsetDateTime now, String boi);

	Optional<LoyaltyLinkCodeEntity> findByCode(String code);
}
