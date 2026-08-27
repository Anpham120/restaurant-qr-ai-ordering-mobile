package com.cmc.restaurant.loyalty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/** Mã sáu chữ số khách đọc cho nhân viên để nối số điện thoại vào tài khoản app. */
@Entity
@Table(name = "loyalty_link_codes")
public class LoyaltyLinkCodeEntity {

	@Id
	private String code;

	@Column(name = "user_id", nullable = false)
	private String userId;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "expires_at", nullable = false)
	private OffsetDateTime expiresAt;

	@Column(name = "used_at")
	private OffsetDateTime usedAt;

	@Column(name = "used_by")
	private String usedBy;

	protected LoyaltyLinkCodeEntity() {
	}

	public LoyaltyLinkCodeEntity(String code, String userId, OffsetDateTime now, int phutSong) {
		this.code = code;
		this.userId = userId;
		this.createdAt = now;
		this.expiresAt = now.plusMinutes(phutSong);
	}

	public String getCode() {
		return code;
	}

	public String getUserId() {
		return userId;
	}

	public OffsetDateTime getExpiresAt() {
		return expiresAt;
	}

	/** Còn dùng được không — chưa dùng VÀ chưa hết hạn. */
	public boolean conDungDuoc(OffsetDateTime luc) {
		return usedAt == null && expiresAt.isAfter(luc);
	}

	void danhDauDaDung(OffsetDateTime now, String nhanVienId) {
		this.usedAt = now;
		this.usedBy = nhanVienId;
	}
}
