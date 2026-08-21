package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.loyalty.domain.PhoneNumber;
import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Điểm thưởng của CHÍNH tài khoản đang đăng nhập (§9.10 M1 mục 3, #27).
 *
 * <p>Tách khỏi {@link LoyaltyService} vì hai bên trả lời hai câu hỏi khác nhau và cho hai đối
 * tượng khác nhau: bên kia là công cụ của quầy ("số này có bao nhiêu điểm"), bên này là màn hình
 * của khách ("TÔI có bao nhiêu điểm"). Gộp lại thì luật uỷ quyền của hai câu hỏi sẽ nằm chung một
 * chỗ và rất dễ nới rộng nhầm.
 *
 * <p><b>Không nhận số điện thoại làm tham số ở đâu cả trong đường đọc.</b> Đó là toàn bộ lý do
 * lớp này tồn tại. {@code GET /api/loyalty/lookup?phone=} chỉ dành cho nhân viên có chủ ý, vì ai
 * gọi được cũng đếm được số nào là khách và tiêu bao nhiêu; mở nó cho khách là mở lại đúng lỗ
 * hổng đó. Ở đây số điện thoại lấy từ chính tài khoản, không lấy từ request.
 */
@Service
public class MyLoyaltyService {

	private final UserRepository users;
	private final LoyaltyMemberRepository members;
	private final LoyaltyService loyaltyService;
	private final LoyaltyRewardRepository rewards;
	private final LoyaltyRedemptionRepository redemptions;

	public MyLoyaltyService(
			UserRepository users, LoyaltyMemberRepository members, LoyaltyService loyaltyService,
			LoyaltyRewardRepository rewards, LoyaltyRedemptionRepository redemptions) {
		this.users = users;
		this.members = members;
		this.loyaltyService = loyaltyService;
		this.rewards = rewards;
		this.redemptions = redemptions;
	}

	/**
	 * Liên kết số điện thoại vào tài khoản.
	 *
	 * <p><b>CHỈ cho liên kết khi số đó CHƯA có hồ sơ tích điểm.</b> Đây là luật giữ cho tính năng
	 * không biến thành đường đọc điểm của người khác: nếu cho khai số bất kỳ, ai cũng khai số của
	 * người khác rồi đọc điểm của họ.
	 *
	 * <p>Đánh đổi phải nói thẳng, không giấu:
	 *
	 * <ul>
	 *   <li><b>Khách cũ tự liên kết không được.</b> Ai đã từng tiêu tiền ở quán thì đã có hồ sơ,
	 *       nên phải nhờ nhân viên nối hộ tại quầy. Đây là cái giá của việc không lộ điểm.
	 *   <li><b>Lời từ chối vẫn tiết lộ "số này là thành viên".</b> Một bit, không phải số điểm —
	 *       nhưng vẫn là một bit. Không có cách nào đóng hẳn nếu không xác thực được số (OTP), và
	 *       hệ thống chưa có SMS. Giới hạn số lần thử theo tài khoản KHÔNG giúp gì: ai cũng đăng
	 *       ký được tài khoản mới miễn phí, nên đó sẽ là màn kịch an ninh chứ không phải phòng thủ.
	 *   <li><b>Còn một khe hẹp:</b> khai trước số của người CHƯA từng đến quán, chờ họ tới ăn rồi
	 *       đọc điểm. Cần biết trước số của đúng một người chưa từng là khách — hẹp, nhưng có
	 *       thật, và chỉ OTP mới đóng được.
	 * </ul>
	 */
	@Transactional
	public LoyaltyDtos.MyLoyaltyResponse linkPhone(String userId, String rawPhone) {
		String phone = PhoneNumber.normalize(rawPhone);
		if (phone == null) {
			throw ApiException.badRequest("LOYALTY_PHONE_REQUIRED", "Phone number is required.");
		}
		if (phone.length() < 9 || phone.length() > 15) {
			// Chặn ở đây thay vì để tạo ra một liên kết không bao giờ khớp hồ sơ nào.
			throw ApiException.badRequest("LOYALTY_PHONE_INVALID", "Phone number is invalid.");
		}

		UserEntity user = users.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User was not found."));

		if (phone.equals(user.getPhoneNumber())) {
			// Gọi lại với cùng số không phải lỗi — mạng chậm khiến app gửi hai lần là chuyện thường.
			return read(user);
		}

		if (members.findByPhoneNumber(phone).isPresent()) {
			throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,
					"LOYALTY_PHONE_ALREADY_MEMBER",
					"This phone number already has a loyalty profile. Ask staff at the counter to link it.");
		}
		if (users.existsByPhoneNumberAndIdNot(phone, userId)) {
			throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,
					"LOYALTY_PHONE_TAKEN", "This phone number is linked to another account.");
		}

		user.setPhoneNumber(phone);
		users.save(user);
		return read(user);
	}

	/**
	 * Đổi điểm lấy ưu đãi (#34, §9.10 M3 mục 10).
	 *
	 * <p>Ba lớp bảo vệ, mỗi lớp chặn một chuyện khác nhau:
	 *
	 * <ol>
	 *   <li><b>Khoá idempotency</b> — bấm hai lần lúc mạng chập chờn không tiêu điểm hai lần. Lần
	 *       gọi lại với cùng khoá trả về chính lần đổi cũ.
	 *   <li><b>UPDATE có điều kiện</b> ({@code where points >= :chiPhi}) — hai request SONG SONG
	 *       không thể cùng trừ. Đây là khoá chống tranh chấp mà DoD của #34 yêu cầu.
	 *   <li><b>Ràng buộc UNIQUE trên {@code idempotency_key}</b> — chốt cuối ở tầng cơ sở dữ liệu,
	 *       vẫn giữ được ngay cả khi hai tiến trình khác nhau cùng chạy phép kiểm ở lớp 1 và cùng
	 *       thấy "chưa có".
	 * </ol>
	 *
	 * <p>Thứ tự cố ý: TRỪ ĐIỂM TRƯỚC, ghi sổ sau. Ghi sổ trước rồi trừ điểm thất bại sẽ để lại một
	 * dòng sổ cho lần đổi không xảy ra — tệ hơn nhiều so với chiều ngược lại, vốn được
	 * {@code @Transactional} cuộn ngược.
	 */
	@Transactional
	public LoyaltyDtos.RedeemResponse redeem(String userId, String rewardId, String idempotencyKey) {
		LoyaltyRedemptionEntity daCo = redemptions.findByIdempotencyKey(idempotencyKey).orElse(null);
		if (daCo != null) {
			return new LoyaltyDtos.RedeemResponse(
					daCo.getId(), daCo.getRewardId(), daCo.getRewardName(), daCo.getPointsSpent(),
					daCo.getCreatedAt(), me(userId));
		}

		UserEntity user = users.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User was not found."));
		String phone = user.getPhoneNumber();
		if (phone == null) {
			throw ApiException.badRequest("LOYALTY_NOT_LINKED",
					"Link a phone number before redeeming rewards.");
		}

		LoyaltyMemberEntity member = members.findByPhoneNumber(phone)
				.orElseThrow(() -> ApiException.badRequest("LOYALTY_NO_POINTS",
						"This account has no loyalty points yet."));

		LoyaltyRewardEntity reward = rewards.findById(rewardId)
				.orElseThrow(() -> ApiException.notFound("LOYALTY_REWARD_NOT_FOUND",
						"Reward was not found."));
		if (!reward.isActive()) {
			throw ApiException.badRequest("LOYALTY_REWARD_INACTIVE",
					"This reward is no longer available.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		int daTru = members.truDiemNeuDu(member.getId(), reward.getPointsRequired(), now);
		if (daTru == 0) {
			// Không phân biệt "không đủ điểm" với "thua tranh chấp": với khách hai thứ nói cùng
			// một điều, và số dư đọc lại bên dưới mới là con số thật.
			throw ApiException.badRequest("LOYALTY_NOT_ENOUGH_POINTS",
					"Not enough points for this reward.");
		}

		LoyaltyRedemptionEntity ghi = redemptions.save(new LoyaltyRedemptionEntity(
				"red_" + UUID.randomUUID().toString().replace("-", ""),
				member.getId(), reward, idempotencyKey, now));

		return new LoyaltyDtos.RedeemResponse(
				ghi.getId(), ghi.getRewardId(), ghi.getRewardName(), ghi.getPointsSpent(),
				ghi.getCreatedAt(), me(userId));
	}

	/** Điểm và ưu đãi đủ điều kiện của tài khoản này. */
	@Transactional(readOnly = true)
	public LoyaltyDtos.MyLoyaltyResponse me(String userId) {
		return read(users.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User was not found.")));
	}

	private LoyaltyDtos.MyLoyaltyResponse read(UserEntity user) {
		String phone = user.getPhoneNumber();
		if (phone == null) {
			// Chưa liên kết KHÔNG phải lỗi: đó là trạng thái của mọi tài khoản mới. App hiện lời
			// mời liên kết, không hiện màn hình lỗi.
			return new LoyaltyDtos.MyLoyaltyResponse(false, null, 0, java.util.List.of());
		}
		LoyaltyDtos.LookupResponse lookup = loyaltyService.lookup(phone);
		return new LoyaltyDtos.MyLoyaltyResponse(
				true, phone, lookup.points(), lookup.availableRewards());
	}
}
