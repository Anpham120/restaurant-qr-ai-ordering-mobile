package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.domain.LoyaltyMember;
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

	public LoyaltyService(LoyaltyMemberRepository members, LoyaltyRewardRepository rewards) {
		this.members = members;
		this.rewards = rewards;
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

		LoyaltyMember member = entity.toDomain();
		member.accrue(totalAmount, now);
		entity.applyFrom(member);
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

		List<LoyaltyDtos.RewardResponse> available = rewards
				.findByActiveTrueAndPointsRequiredLessThanEqualOrderByPointsRequiredAsc(points).stream()
				.map(r -> new LoyaltyDtos.RewardResponse(
						r.getId(), r.getName(), r.getDescription(), r.getPointsRequired(), r.isActive(),
						r.getCreatedAt(), r.getUpdatedAt()))
				.toList();

		return new LoyaltyDtos.LookupResponse(phone, points, lifetimeSpend, available);
	}
}
