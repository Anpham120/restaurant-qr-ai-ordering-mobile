package com.cmc.restaurant.loyalty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Một dòng sổ điểm. Chỉ ghi vào, không sửa.
 *
 * <p>{@code loyalty_members.points} vẫn là số dư có thẩm quyền — sổ này không thay thế nó. Sổ tồn
 * tại để trả lời hai câu hỏi mà một số dư không trả lời được: khách đã chi bao nhiêu trong 12 tháng
 * qua (để xét hạng), và bao nhiêu điểm đã quá hạn (để xoá).
 */
@Entity
@Table(name = "loyalty_point_ledger")
public class LoyaltyLedgerEntity {

	@Id
	private String id;

	@Column(name = "member_id", nullable = false)
	private String memberId;

	/** Dương khi tích, âm khi tiêu hoặc hết hạn. */
	@Column(nullable = false)
	private int delta;

	@Column(nullable = false)
	private String reason;

	@Column(name = "order_code")
	private String orderCode;

	@Column(name = "expires_at")
	private OffsetDateTime expiresAt;

	@Column(name = "amount_vnd")
	private BigDecimal amountVnd;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected LoyaltyLedgerEntity() {
	}

	private LoyaltyLedgerEntity(
			String id, String memberId, int delta, String reason, BigDecimal amountVnd,
			OffsetDateTime expiresAt, OffsetDateTime now) {
		this.id = id;
		this.memberId = memberId;
		this.delta = delta;
		this.reason = reason;
		this.amountVnd = amountVnd;
		this.expiresAt = expiresAt;
		this.createdAt = now;
	}

	/** Tích điểm từ một hoá đơn. Hạn dùng 12 tháng kể từ lúc tích. */
	public static LoyaltyLedgerEntity tich(
			String id, String memberId, int diem, BigDecimal soTien, OffsetDateTime now) {
		return new LoyaltyLedgerEntity(id, memberId, diem, "ACCRUE", soTien, now.plusMonths(12), now);
	}

	/** Đổi điểm lấy ưu đãi. */
	public static LoyaltyLedgerEntity doi(String id, String memberId, int diem, OffsetDateTime now) {
		return new LoyaltyLedgerEntity(id, memberId, -Math.abs(diem), "REDEEM", null, null, now);
	}

	/** Xoá điểm quá hạn. */
	public static LoyaltyLedgerEntity hetHan(String id, String memberId, int diem, OffsetDateTime now) {
		return new LoyaltyLedgerEntity(id, memberId, -Math.abs(diem), "EXPIRE", null, null, now);
	}

	public String getId() {
		return id;
	}

	public int getDelta() {
		return delta;
	}

	public String getReason() {
		return reason;
	}
}
