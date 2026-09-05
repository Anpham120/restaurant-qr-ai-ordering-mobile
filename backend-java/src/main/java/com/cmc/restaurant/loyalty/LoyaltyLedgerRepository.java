package com.cmc.restaurant.loyalty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LoyaltyLedgerRepository extends JpaRepository<LoyaltyLedgerEntity, String> {

	/** Tiền đã chi trong cửa sổ 12 tháng — cơ sở xếp hạng. */
	@Query("""
			select coalesce(sum(l.amountVnd), 0) from LoyaltyLedgerEntity l
			where l.memberId = :memberId and l.reason = 'ACCRUE' and l.createdAt >= :tu
			""")
	BigDecimal chiTieuTu(@Param("memberId") String memberId, @Param("tu") OffsetDateTime tu);

	/** Điểm tích từ các lô đã quá hạn. */
	@Query("""
			select coalesce(sum(l.delta), 0) from LoyaltyLedgerEntity l
			where l.memberId = :memberId and l.reason = 'ACCRUE' and l.expiresAt <= :moc
			""")
	int diemTichQuaHan(@Param("memberId") String memberId, @Param("moc") OffsetDateTime moc);

	/**
	 * Điểm đã tiêu RÒNG, cộng dồn từ trước tới nay. Trả về số DƯƠNG.
	 *
	 * <p>Tính cả REVERSE, và đó là điểm mấu chốt. Một lần đổi bị huỷ theo đơn để lại hai dòng
	 * ngược chiều nhau (REDEEM âm, REVERSE dương); bỏ dòng REVERSE ra ngoài sẽ đếm số điểm đó là
	 * đã tiêu trong khi khách vẫn đang cầm, và {@link com.cmc.restaurant.loyalty.domain.HetHanDiem}
	 * sẽ tưởng các lô cũ đã bị tiêu hết nên không xoá gì.
	 *
	 * <p>Dấu trừ ngoài tổng làm việc này tự nhiên: REDEEM âm thành dương, REVERSE dương thành âm,
	 * và hai dòng khử nhau đúng bằng 0.
	 */
	@Query("""
			select coalesce(-sum(l.delta), 0) from LoyaltyLedgerEntity l
			where l.memberId = :memberId and l.reason in ('REDEEM', 'EXPIRE', 'REVERSE')
			""")
	int diemDaTieu(@Param("memberId") String memberId);
}
