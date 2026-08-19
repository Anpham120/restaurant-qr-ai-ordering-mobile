package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.domain.PhoneNumber;
import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors {@code MapAdminMembers} + {@code MapAdminRewards} trong {@code LoyaltyEndpoints.cs}
 * (.NET) — issue #94.
 *
 * <p>Số điện thoại luôn đi qua {@link PhoneNumber#normalize} trước khi so hay lưu. Bản .NET dùng
 * {@code PromotionCalculator.NormalizePhone} ở cùng những chỗ này. So chuỗi thô sẽ coi
 * {@code "0900 000 001"} và {@code "0900000001"} là hai thành viên khác nhau, và khách gọi điện
 * hỏi điểm sẽ không tra ra hồ sơ của chính mình.
 */
@Service
public class AdminLoyaltyService {

	private final LoyaltyMemberRepository memberRepository;
	private final LoyaltyRewardRepository rewardRepository;

	public AdminLoyaltyService(
			LoyaltyMemberRepository memberRepository, LoyaltyRewardRepository rewardRepository) {
		this.memberRepository = memberRepository;
		this.rewardRepository = rewardRepository;
	}

	// --- thành viên -----------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public List<LoyaltyMemberEntity> listMembers() {
		return memberRepository.findAllByOrderByPointsDescPhoneNumberAsc();
	}

	@Transactional(readOnly = true)
	public LoyaltyMemberEntity getMember(String memberId) {
		return memberRepository.findById(memberId).orElseThrow(AdminLoyaltyService::memberNotFound);
	}

	@Transactional
	public LoyaltyMemberEntity createMember(AdminLoyaltyDtos.LoyaltyMemberRequest request) {
		String phone = requirePhone(request);
		requirePoints(request.points());

		if (memberRepository.existsByPhoneNumber(phone)) {
			throw ApiException.conflict("LOYALTY_PHONE_EXISTS",
					"A member with this phone number already exists.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		LoyaltyMemberEntity member = new LoyaltyMemberEntity(
				"loy_" + UUID.randomUUID().toString().replace("-", ""), phone, now);
		member.applyAdminEdit(phone, normalizeOptional(request.fullName()), request.points(), now);
		return memberRepository.save(member);
	}

	@Transactional
	public LoyaltyMemberEntity updateMember(String memberId, AdminLoyaltyDtos.LoyaltyMemberRequest request) {
		String phone = requirePhone(request);
		requirePoints(request.points());

		LoyaltyMemberEntity member = memberRepository.findById(memberId)
				.orElseThrow(AdminLoyaltyService::memberNotFound);

		if (memberRepository.existsByPhoneNumberAndIdNot(phone, memberId)) {
			throw ApiException.conflict("LOYALTY_PHONE_EXISTS",
					"A member with this phone number already exists.");
		}

		member.applyAdminEdit(
				phone, normalizeOptional(request.fullName()), request.points(), OffsetDateTime.now());
		return memberRepository.save(member);
	}

	@Transactional
	public void deleteMember(String memberId) {
		LoyaltyMemberEntity member = memberRepository.findById(memberId)
				.orElseThrow(AdminLoyaltyService::memberNotFound);
		memberRepository.delete(member);
	}

	// --- ưu đãi ---------------------------------------------------------------------------------

	@Transactional(readOnly = true)
	public List<LoyaltyRewardEntity> listRewards() {
		return rewardRepository.findAllByOrderByPointsRequiredAsc();
	}

	@Transactional
	public LoyaltyRewardEntity createReward(AdminLoyaltyDtos.LoyaltyRewardRequest request) {
		validateReward(request);
		OffsetDateTime now = OffsetDateTime.now();
		LoyaltyRewardEntity reward = new LoyaltyRewardEntity(
				"rwd_" + UUID.randomUUID().toString().replace("-", ""), now);
		writeReward(reward, request, now);
		return rewardRepository.save(reward);
	}

	@Transactional
	public LoyaltyRewardEntity updateReward(String rewardId, AdminLoyaltyDtos.LoyaltyRewardRequest request) {
		validateReward(request);
		LoyaltyRewardEntity reward = rewardRepository.findById(rewardId)
				.orElseThrow(AdminLoyaltyService::rewardNotFound);
		writeReward(reward, request, OffsetDateTime.now());
		return rewardRepository.save(reward);
	}

	@Transactional
	public void deleteReward(String rewardId) {
		LoyaltyRewardEntity reward = rewardRepository.findById(rewardId)
				.orElseThrow(AdminLoyaltyService::rewardNotFound);
		rewardRepository.delete(reward);
	}

	// --- helper ---------------------------------------------------------------------------------

	private static String requirePhone(AdminLoyaltyDtos.LoyaltyMemberRequest request) {
		String phone = PhoneNumber.normalize(request == null ? null : request.phoneNumber());
		if (phone == null) {
			throw ApiException.badRequest("LOYALTY_PHONE_REQUIRED", "Phone number is required.");
		}
		return phone;
	}

	private static void requirePoints(int points) {
		if (points < 0) {
			throw ApiException.badRequest("LOYALTY_POINTS_INVALID", "Points must be zero or greater.");
		}
	}

	private static void validateReward(AdminLoyaltyDtos.LoyaltyRewardRequest request) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		if (request.name() == null || request.name().isBlank()) {
			throw ApiException.badRequest("LOYALTY_REWARD_NAME_REQUIRED", "Reward name is required.");
		}
		// Ưu đãi 0 điểm nghĩa là ai cũng đổi được vô hạn — bản .NET đòi > 0, không phải >= 0.
		if (request.pointsRequired() <= 0) {
			throw ApiException.badRequest("LOYALTY_REWARD_POINTS_INVALID",
					"Points required must be greater than zero.");
		}
	}

	private static void writeReward(
			LoyaltyRewardEntity reward, AdminLoyaltyDtos.LoyaltyRewardRequest request, OffsetDateTime now) {
		reward.applyDefinition(
				request.name().trim(), normalizeOptional(request.description()), request.pointsRequired(),
				Boolean.TRUE.equals(request.isActive()), now);
	}

	private static String normalizeOptional(String value) {
		if (value == null) {
			return null;
		}
		String trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}

	private static ApiException memberNotFound() {
		return ApiException.notFound("LOYALTY_MEMBER_NOT_FOUND", "Loyalty member was not found.");
	}

	private static ApiException rewardNotFound() {
		return ApiException.notFound("LOYALTY_REWARD_NOT_FOUND", "Loyalty reward was not found.");
	}

	public static AdminLoyaltyDtos.LoyaltyMemberResponse toResponse(LoyaltyMemberEntity member) {
		return new AdminLoyaltyDtos.LoyaltyMemberResponse(
				member.getId(), member.getPhoneNumber(), member.getFullName(), member.getPoints(),
				member.getLifetimeSpend(), member.getCreatedAt(), member.getUpdatedAt());
	}

	public static AdminLoyaltyDtos.LoyaltyRewardResponse toResponse(LoyaltyRewardEntity reward) {
		return new AdminLoyaltyDtos.LoyaltyRewardResponse(
				reward.getId(), reward.getName(), reward.getDescription(), reward.getPointsRequired(),
				reward.isActive(), reward.getCreatedAt(), reward.getUpdatedAt());
	}
}
