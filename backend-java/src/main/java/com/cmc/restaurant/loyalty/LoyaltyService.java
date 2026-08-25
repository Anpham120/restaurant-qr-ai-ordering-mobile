package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.domain.LoyaltyMember;
import com.cmc.restaurant.loyalty.domain.MemberTier;
import com.cmc.restaurant.loyalty.domain.PhoneNumber;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Mirrors {@code LoyaltyService.cs} + the lookup endpoint (.NET). */
@Service
public class LoyaltyService {

	private final LoyaltyMemberRepository members;
	private final LoyaltyRewardRepository rewards;
	private final LoyaltyLedgerRepository soDiem;
	private final LoyaltyRedemptionRepository phieu;

	public LoyaltyService(
			LoyaltyMemberRepository members, LoyaltyRewardRepository rewards,
			LoyaltyLedgerRepository soDiem, LoyaltyRedemptionRepository phieu) {
		this.members = members;
		this.rewards = rewards;
		this.soDiem = soDiem;
		this.phieu = phieu;
	}

	/**
	 * Adds the points for a settled bill. Returns empty when there is nothing to record — no phone
	 * given, or a bill too small to earn a point.
	 *
	 * <p>Creating the account on first accrual (rather than requiring sign-up) is deliberate and
	 * matches .NET: the customer types their phone at checkout, and that is the whole enrolment.
	 */
	@Transactional
	public Optional<LoyaltyMember> accrue(String phoneNumber, BigDecimal totalAmount, OffsetDateTime now) {
		String phone = PhoneNumber.normalize(phoneNumber);
		if (phone == null || LoyaltyMember.pointsFor(totalAmount) <= 0) {
			return Optional.empty();
		}

		LoyaltyMemberEntity entity = members.findByPhoneNumber(phone)
				.orElseGet(() -> members.save(new LoyaltyMemberEntity(
						"loy_" + UUID.randomUUID().toString().replace("-", ""), phone, now)));

		// Tích theo hệ số của hạng ĐANG CÓ, không phải hạng sau khi cộng. Khách chi một hoá đơn to
		// vừa đủ lên hạng thì hoá đơn đó vẫn tính theo hạng cũ — hệ số mới áp từ lần sau. Tính
		// ngược lại sẽ cho phép một hoá đơn tự nâng hệ số của chính nó.
		MemberTier hangCu = entity.getTier();
		LoyaltyMember member = entity.toDomain();
		int diemVuaTich = member.accrue(totalAmount, now, hangCu);
		entity.applyFrom(member);

		// Cửa sổ 12 tháng: cộng vào rồi xét lại hạng. Việc TRỪ các hoá đơn đã rơi ra khỏi cửa sổ
		// là của job xét hạng hằng tháng, không phải của luồng thanh toán.
		entity.setSpend12m(entity.getSpend12m().add(totalAmount));
		entity.setTier(MemberTier.theoChiTieu(entity.getSpend12m()));
		entity.setLastActivityAt(now);

		// Ghi sổ: số dư ở trên chỉ nói khách ĐANG có bao nhiêu, sổ nói khách đã chi bao nhiêu và
		// khi nào — hai thứ mà tác vụ xét hạng và tác vụ xoá điểm quá hạn đều cần.
		soDiem.save(LoyaltyLedgerEntity.tich(
				"lgr_" + UUID.randomUUID().toString().replace("-", ""),
				entity.getId(), diemVuaTich, totalAmount, now));

		members.save(entity);
		return Optional.of(member);
	}

	/** What a customer can see and redeem right now. */
	public LoyaltyDtos.LookupResponse lookup(String phoneNumber) {
		String phone = PhoneNumber.normalize(phoneNumber);
		if (phone == null) {
			throw ApiException.badRequest("LOYALTY_PHONE_REQUIRED", "Phone number is required.");
		}

		// An unknown phone is answered with a zero-point account rather than 404: the counter asks
		// "how many points does this number have" and "none yet" is a valid answer, not an error.
		Optional<LoyaltyMemberEntity> member = members.findByPhoneNumber(phone);
		int points = member.map(LoyaltyMemberEntity::getPoints).orElse(0);
		BigDecimal lifetimeSpend = member.map(LoyaltyMemberEntity::getLifetimeSpend).orElse(BigDecimal.ZERO);
		BigDecimal spend12m = member.map(LoyaltyMemberEntity::getSpend12m).orElse(BigDecimal.ZERO);

		// Đủ điểm CHƯA đủ để đổi: ưu đãi còn gắn hạng tối thiểu. Lọc ở đây để danh sách "đổi được
		// ngay" đúng nghĩa — app không phải đoán, và khách không thấy nút bấm rồi bị từ chối.
		MemberTier hang = member.map(LoyaltyMemberEntity::getTier).orElse(MemberTier.BAC);
		List<LoyaltyDtos.RewardResponse> available = rewards
				.findByActiveTrueAndPointsRequiredLessThanEqualOrderByPointsRequiredAsc(points).stream()
				.filter(r -> hang.datToiThieu(r.getMinTier()))
				.map(LoyaltyService::moTa)
				.toList();

		// Phiếu chưa dùng của CHÍNH thành viên này. Số này chưa có hồ sơ thì không có phiếu nào —
		// không phải lỗi, chỉ là chưa từng đổi gì.
		List<LoyaltyDtos.VoucherResponse> conHan = member
				.map(m -> phieuChuaDung(m.getId()))
				.orElseGet(List::of);

		return new LoyaltyDtos.LookupResponse(
				phone, points, lifetimeSpend, spend12m, hang.name(), hang.tenHienThi(),
				available, conHan);
	}

	/** Phiếu còn dùng được của một thành viên. */
	List<LoyaltyDtos.VoucherResponse> phieuChuaDung(String memberId) {
		return phieu.findByMemberIdAndHonouredAtIsNullAndReversedAtIsNullOrderByCreatedAtAsc(memberId)
				.stream()
				.map(LoyaltyService::moTaPhieu)
				.toList();
	}

	static LoyaltyDtos.VoucherResponse moTaPhieu(LoyaltyRedemptionEntity r) {
		return new LoyaltyDtos.VoucherResponse(
				r.getId(), r.getRewardName(), r.getPointsSpent(), r.getCreatedAt(), r.getHonouredAt());
	}

	/**
	 * Nhân viên đánh dấu đã phát phiếu cho khách.
	 *
	 * <p>Không nhận số điện thoại: phiếu đã định danh chủ của nó. Nhận thêm số ở đây chỉ mở ra khả
	 * năng thu nhầm phiếu của người khác vì gõ sai một chữ số.
	 *
	 * <p>Phiếu đã phát rồi thì trả lỗi chứ KHÔNG im lặng coi như thành công. Với quầy hai chuyện
	 * khác hẳn nhau: "vừa phát xong" nghĩa là đưa món ra, còn "phiếu này dùng rồi" nghĩa là đừng
	 * đưa. Trả về giống nhau là mời quán mất món.
	 */
	@Transactional
	public LoyaltyDtos.VoucherResponse thuPhieu(String redemptionId, String nhanVienId, OffsetDateTime now) {
		LoyaltyRedemptionEntity r = phieu.findById(redemptionId)
				.orElseThrow(() -> ApiException.notFound("LOYALTY_VOUCHER_NOT_FOUND",
						"Không tìm thấy phiếu này."));

		if (phieu.thuPhieuNeuChuaDung(redemptionId, now, nhanVienId) == 0) {
			throw ApiException.conflict("LOYALTY_VOUCHER_ALREADY_USED",
					"Phiếu này đã được dùng rồi.");
		}

		// Đọc lại sau khi ghi: 'thuPhieuNeuChuaDung' xoá sạch persistence context, nên thực thể r
		// ở trên vẫn mang giá trị cũ và trả về nó là báo cho quầy một phiếu chưa dùng.
		return moTaPhieu(phieu.findById(redemptionId).orElseThrow());
	}

	static LoyaltyDtos.RewardResponse moTa(LoyaltyRewardEntity r) {
		return new LoyaltyDtos.RewardResponse(
				r.getId(), r.getName(), r.getDescription(), r.getPointsRequired(), r.isActive(),
				r.getCreatedAt(), r.getUpdatedAt(),
				r.getRewardType(), r.getMenuItemId(), r.getDiscountAmount(), r.getMinTier().name());
	}
}
