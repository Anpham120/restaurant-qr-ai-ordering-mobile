package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.domain.LoyaltyMember;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import com.cmc.restaurant.loyalty.domain.MemberTier;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Maps the existing {@code loyalty_members} table. */
@Entity
@Table(name = "loyalty_members")
public class LoyaltyMemberEntity {

	@Id
	private String id;

	@Column(name = "phone_number", nullable = false, unique = true)
	private String phoneNumber;

	@Column(name = "full_name")
	private String fullName;

	@Column(nullable = false)
	private int points;

	@Column(name = "lifetime_spend", nullable = false)
	private BigDecimal lifetimeSpend;

	/**
	 * Hạng thành viên, lưu dạng tên hằng của {@link MemberTier}.
	 *
	 * <p>Lưu thay vì tính lại mỗi lần đọc vì hạng phải ỔN ĐỊNH: khách xem app lúc 8h thấy hạng
	 * Vàng thì 9h vẫn phải là Vàng, kể cả khi một hoá đơn cũ vừa rơi ra khỏi cửa sổ 12 tháng giữa
	 * hai lần xem. Job xét hạng là nơi duy nhất đổi cột này.
	 */
	@Column(nullable = false)
	private String tier;

	/**
	 * Chi tiêu 12 tháng gần nhất — CƠ SỞ DUY NHẤT để xếp hạng.
	 *
	 * <p>Khác {@code lifetimeSpend} ở chỗ nó GIẢM được. Xem javadoc của {@link MemberTier}.
	 */
	@Column(name = "spend_12m", nullable = false)
	private BigDecimal spend12m;

	/** Lần phát sinh giao dịch cuối — mốc đếm hạn điểm. */
	@Column(name = "last_activity_at")
	private OffsetDateTime lastActivityAt;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected LoyaltyMemberEntity() {
	}

	public LoyaltyMemberEntity(String id, String phoneNumber, OffsetDateTime now) {
		this.id = id;
		this.phoneNumber = phoneNumber;
		this.points = 0;
		this.lifetimeSpend = BigDecimal.ZERO;
		this.tier = MemberTier.BAC.name();
		this.spend12m = BigDecimal.ZERO;
		this.lastActivityAt = now;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public LoyaltyMember toDomain() {
		return new LoyaltyMember(id, phoneNumber, fullName, points, lifetimeSpend, updatedAt);
	}

	public void applyFrom(LoyaltyMember member) {
		this.points = member.points();
		this.lifetimeSpend = member.lifetimeSpend();
		this.updatedAt = member.updatedAt();
	}

	/**
	 * Quản trị viên sửa hồ sơ thành viên (#94).
	 *
	 * <p>CỐ Ý không đụng {@code lifetimeSpend}: đó là tổng tiền khách đã tiêu, do luồng thanh toán
	 * cộng dồn, không phải thứ quản trị viên nhập tay. Bản .NET cũng chỉ gán ba trường này ở
	 * endpoint sửa. Điểm thưởng thì sửa được — dùng để bù trừ khi có khiếu nại.
	 */
	void applyAdminEdit(String phoneNumber, String fullName, int points, OffsetDateTime now) {
		this.phoneNumber = phoneNumber;
		this.fullName = fullName;
		this.points = points;
		this.updatedAt = now;
	}

	void setFullName(String fullName) {
		this.fullName = fullName;
	}

	void setPoints(int points) {
		this.points = points;
	}

	public String getId() {
		return id;
	}

	public String getPhoneNumber() {
		return phoneNumber;
	}

	public String getFullName() {
		return fullName;
	}

	public int getPoints() {
		return points;
	}

	public MemberTier getTier() {
		// Đọc phòng thủ: một giá trị lạ trong cột (nhập tay, migration hỏng) không được làm sập
		// màn hình điểm thưởng của khách — coi như hạng thấp nhất là hướng an toàn.
		try {
			return tier == null ? MemberTier.BAC : MemberTier.valueOf(tier);
		} catch (IllegalArgumentException e) {
			return MemberTier.BAC;
		}
	}

	void setTier(MemberTier value) {
		this.tier = value.name();
	}

	public BigDecimal getSpend12m() {
		return spend12m == null ? BigDecimal.ZERO : spend12m;
	}

	void setSpend12m(BigDecimal value) {
		this.spend12m = value;
	}

	public OffsetDateTime getLastActivityAt() {
		return lastActivityAt;
	}

	void setLastActivityAt(OffsetDateTime value) {
		this.lastActivityAt = value;
	}

	public BigDecimal getLifetimeSpend() {
		return lifetimeSpend;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}
}
