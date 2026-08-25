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

	/** Điểm đã tiêu và đã bị xoá, cộng dồn từ trước tới nay. Trả về số DƯƠNG. */
	@Query("""
			select coalesce(-sum(l.delta), 0) from LoyaltyLedgerEntity l
			where l.memberId = :memberId and l.reason in ('REDEEM', 'EXPIRE')
			""")
	int diemDaTieu(@Param("memberId") String memberId);
}
