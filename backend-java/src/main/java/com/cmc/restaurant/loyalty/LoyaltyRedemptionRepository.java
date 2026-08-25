package com.cmc.restaurant.loyalty;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface LoyaltyRedemptionRepository extends JpaRepository<LoyaltyRedemptionEntity, String> {

	/** Lần đổi đã ghi cho khoá này chưa — dùng để trả lại kết quả cũ thay vì tiêu điểm lần hai. */
	Optional<LoyaltyRedemptionEntity> findByIdempotencyKey(String idempotencyKey);

	List<LoyaltyRedemptionEntity> findByMemberIdOrderByCreatedAtDesc(String memberId);

	/**
	 * Phiếu còn dùng được, cũ nhất lên trước — phiếu đổi lâu rồi thì nên dùng trước.
	 *
	 * <p>Loại luôn phiếu đã hoàn: điểm đã trả về ví khách rồi, nên phiếu không còn giá trị. Không
	 * loại thì một lần đổi bị huỷ theo đơn sẽ vừa trả lại điểm vừa để lại phiếu dùng được.
	 */
	List<LoyaltyRedemptionEntity>
			findByMemberIdAndHonouredAtIsNullAndReversedAtIsNullOrderByCreatedAtAsc(String memberId);

	/** Các lần đổi đã bám vào đơn này và chưa được hoàn. */
	List<LoyaltyRedemptionEntity> findByOrderCodeAndReversedAtIsNull(String orderCode);

	/** Lần đổi sinh ra đúng dòng đơn này và chưa được hoàn. */
	List<LoyaltyRedemptionEntity> findByOrderItemIdAndReversedAtIsNull(String orderItemId);

	/**
	 * Đánh dấu đã phát, CHỈ KHI phiếu còn dùng được.
	 *
	 * <p>Cùng khuôn với {@code truDiemNeuDu}: điều kiện nằm trong mệnh đề {@code where} chứ không
	 * nằm ở một phép đọc rồi ghi trong mã Java. Hai nhân viên cùng bấm "đã phát" trên hai máy — hoặc
	 * một người bấm hai lần lúc mạng chậm — sẽ có đúng một lượt thắng. Kiểm bằng if trước rồi mới
	 * update thì cả hai đều thấy "chưa dùng" và cả hai đều ghi đè.
	 *
	 * @return 1 nếu vừa thu được, 0 nếu phiếu đã dùng rồi hoặc không tồn tại
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update LoyaltyRedemptionEntity r set r.honouredAt = :now, r.honouredBy = :boi "
			+ "where r.id = :id and r.honouredAt is null")
	int thuPhieuNeuChuaDung(String id, OffsetDateTime now, String boi);
}
