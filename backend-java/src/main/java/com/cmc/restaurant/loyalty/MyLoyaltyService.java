package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.domain.MaNoiSo;
import com.cmc.restaurant.loyalty.domain.MaUuDai;
import com.cmc.restaurant.loyalty.domain.MemberTier;
import com.cmc.restaurant.auth.UserEntity;
import com.cmc.restaurant.auth.UserRepository;
import com.cmc.restaurant.loyalty.domain.PhoneNumber;
import com.cmc.restaurant.orders.application.OrderLoyaltyPort;
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
	private final OrderLoyaltyPort donHang;
	private final LoyaltyLedgerRepository soDiem;
	private final LoyaltyLinkCodeRepository maNoiSo;

	public MyLoyaltyService(
			UserRepository users, LoyaltyMemberRepository members, LoyaltyService loyaltyService,
			LoyaltyRewardRepository rewards, LoyaltyRedemptionRepository redemptions,
			OrderLoyaltyPort donHang, LoyaltyLedgerRepository soDiem,
			LoyaltyLinkCodeRepository maNoiSo) {
		this.donHang = donHang;
		this.soDiem = soDiem;
		this.maNoiSo = maNoiSo;
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
	/**
	 * Cấp cho khách một mã để đọc ở quầy.
	 *
	 * <p>Xoá mã cũ trước: hai mã cùng sống nghĩa là một mã khách tưởng đã bỏ đi vẫn nối được, và
	 * khách không có cách nào biết điều đó.
	 */
	@Transactional
	public LoyaltyDtos.LinkCodeResponse xinMaNoiSo(String userId) {
		users.findById(userId)
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User was not found."));
		maNoiSo.xoaMaCuCua(userId);
		LoyaltyLinkCodeEntity ma = maNoiSo.save(new LoyaltyLinkCodeEntity(
				MaNoiSo.sinh(), userId, OffsetDateTime.now(), MaNoiSo.PHUT_SONG));
		return new LoyaltyDtos.LinkCodeResponse(ma.getCode(), ma.getExpiresAt());
	}

	/**
	 * Nhân viên nối một số ĐÃ CÓ HỒ SƠ vào tài khoản app của khách.
	 *
	 * <p>Đây là đường vòng duy nhất cho khách quen cũ. Hồ sơ tích điểm sinh ra ở quầy trước khi
	 * khách cài app, nên {@link #linkPhone} từ chối số đó — đúng, vì không có bước xác minh nào thì
	 * gõ số người khác là cướp điểm. Ở đây bước xác minh là: khách đang đứng trước mặt nhân viên và
	 * đọc được mã đang hiện trên app của chính mình.
	 *
	 * <p>Ghi lại nhân viên nào nối, để đối chiếu nếu về sau có tranh chấp.
	 */
	@Transactional
	public LoyaltyDtos.MyLoyaltyResponse noiSoTaiQuay(String ma, String rawPhone, String nhanVienId) {
		String code = MaNoiSo.chuanHoa(ma);
		LoyaltyLinkCodeEntity ban = maNoiSo.findByCode(code)
				.orElseThrow(() -> ApiException.badRequest("LOYALTY_LINK_CODE_INVALID",
						"Mã không đúng. Nhờ khách mở lại màn hình để lấy mã mới."));

		OffsetDateTime now = OffsetDateTime.now();
		if (maNoiSo.dungMaNeuConHieuLuc(code, now, nhanVienId) == 0) {
			// Không phân biệt "hết hạn" với "đã dùng": với quầy hai thứ nói cùng một điều — bảo
			// khách lấy mã mới.
			throw ApiException.conflict("LOYALTY_LINK_CODE_EXPIRED",
					"Mã đã hết hạn hoặc đã dùng. Nhờ khách lấy mã mới.");
		}

		String phone = PhoneNumber.normalize(rawPhone);
		if (phone == null || phone.length() < 9 || phone.length() > 15) {
			throw ApiException.badRequest("LOYALTY_PHONE_INVALID", "Số điện thoại không hợp lệ.");
		}

		UserEntity user = users.findById(ban.getUserId())
				.orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User was not found."));

		// Số đang thuộc tài khoản KHÁC thì vẫn chặn. Mã chỉ chứng minh khách sở hữu TÀI KHOẢN, nó
		// không chứng minh gì về số — nên luật "một số một tài khoản" phải giữ nguyên.
		if (users.existsByPhoneNumberAndIdNot(phone, user.getId())) {
			throw ApiException.conflict("LOYALTY_PHONE_TAKEN",
					"Số này đang gắn với một tài khoản khác.");
		}

		user.setPhoneNumber(phone);
		users.save(user);
		// Hồ sơ điểm này CÓ SẴN từ trước — đó chính là lý do khách phải ra quầy — và cho tới giờ vẫn
		// vô danh. Nay đã biết nó thuộc về ai thì điền tên luôn, đừng đợi hoá đơn kế tiếp.
		loyaltyService.datTenNeuThieu(phone);
		return read(user);
	}

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
	public LoyaltyDtos.RedeemResponse redeem(
			String userId, String rewardId, String orderCode, String idempotencyKey) {
		LoyaltyRedemptionEntity daCo = redemptions.findByIdempotencyKey(idempotencyKey).orElse(null);
		if (daCo != null) {
			return new LoyaltyDtos.RedeemResponse(
					daCo.getId(), daCo.getRewardId(), daCo.getRewardName(), daCo.getPointsSpent(),
					daCo.getCreatedAt(), daCo.getCode(), me(userId));
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

		// Chặn hạng ở ĐÂY chứ không chỉ ở danh sách: danh sách là gợi ý hiển thị, còn đây là nơi
		// điểm thật bị trừ. Một client tự gọi thẳng API với rewardId chép được vẫn phải bị từ chối.
		MemberTier hang = member.getTier();
		MemberTier canCo = reward.getMinTier();
		if (!hang.datToiThieu(canCo)) {
			throw ApiException.badRequest("LOYALTY_TIER_TOO_LOW",
					"Ưu đãi này dành cho hạng " + canCo.tenHienThi() + " trở lên.");
		}

		// Hai loại ưu đãi đi hai đường khác hẳn nhau.
		//
		// GIẢM TIỀN: sinh ra một MÃ, không chạm vào đơn hàng nào. Mã đó nhập ở bước tất toán, cùng
		// ô với mã khuyến mãi của quán, và trừ vào `table_invoices` — nơi tiền thật sự được chốt.
		//
		// Trước đây nó ghi vào `orders.discount_amount`, mà hoá đơn bàn tính lại tạm tính từ dòng
		// món rồi chỉ trừ cấp hoá đơn — nên khách mất điểm và vẫn trả đủ tiền. Đó là lý do cấp đơn
		// hàng bị bỏ hẳn ở đây thay vì chỉ sửa chỗ đọc.
		//
		// TẶNG MÓN: có đơn thì gắn món vào đơn để bếp làm ngay; không có đơn thì phiếu nằm chờ và
		// quầy phát bằng tay. Cả hai đều hợp lệ — khách ngồi tại bàn muốn ăn luôn, khách đổi ở nhà
		// muốn để dành.
		boolean laGiamTien = "DISCOUNT".equals(reward.getRewardType());
		boolean coDon = orderCode != null && !orderCode.isBlank();
		boolean ganMonVaoDon = !laGiamTien && coDon;

		OrderLoyaltyPort.HoaDon hoaDon = null;
		if (ganMonVaoDon) {
			hoaDon = kiemDonConMo(orderCode);
			if (reward.getMenuItemId() == null) {
				// Ưu đãi tặng món mà không trỏ tới món nào là dữ liệu hỏng, không phải trạng thái
				// bình thường. Từ chối trước khi trừ điểm.
				throw ApiException.badRequest("LOYALTY_REWARD_NO_ITEM",
						"Ưu đãi này chưa gắn món. Nhờ nhân viên tại quầy đổi giúp.");
			}
		}

		OffsetDateTime now = OffsetDateTime.now();
		String maDongDon = null;
		int daTru = members.truDiemNeuDu(member.getId(), reward.getPointsRequired(), now);
		if (daTru == 0) {
			// Không phân biệt "không đủ điểm" với "thua tranh chấp": với khách hai thứ nói cùng
			// một điều, và số dư đọc lại bên dưới mới là con số thật.
			throw ApiException.badRequest("LOYALTY_NOT_ENOUGH_POINTS",
					"Not enough points for this reward.");
		}

		// Sau khi điểm đã trừ thành công. Cùng một @Transactional, nên nếu bước này ném lỗi thì
		// điểm cũng được trả lại.
		if (ganMonVaoDon) {
			maDongDon = donHang.themMonTang(hoaDon.orderCode(), reward.getMenuItemId());
		}

		soDiem.save(LoyaltyLedgerEntity.doi(
				"lgr_" + UUID.randomUUID().toString().replace("-", ""),
				member.getId(), reward.getPointsRequired(), now));

		LoyaltyRedemptionEntity ghi = new LoyaltyRedemptionEntity(
				"red_" + UUID.randomUUID().toString().replace("-", ""),
				member.getId(), reward, idempotencyKey, now);
		if (ganMonVaoDon) {
			// Món đã vào đơn thì phiếu tiêu xong ngay tại đây. Để nó ở trạng thái chờ sẽ cho khách
			// chìa lại phiếu ở quầy và nhận món lần thứ hai.
			ghi.heThongGanVaoDon(hoaDon.orderCode(), maDongDon, now);
		} else if (laGiamTien) {
			// Giảm tiền thì CHƯA tiêu: khách cầm mã, tiêu lúc tất toán. Phiếu ở trạng thái chờ là
			// đúng — nó vẫn là thứ khách đang cầm và dùng được.
			ghi.capMa(MaUuDai.sinh(), reward.getDiscountAmount());
		}
		redemptions.save(ghi);

		return new LoyaltyDtos.RedeemResponse(
				ghi.getId(), ghi.getRewardId(), ghi.getRewardName(), ghi.getPointsSpent(),
				ghi.getCreatedAt(), ghi.getCode(), me(userId));
	}

	/**
	 * Hoá đơn có nhận được khoản giảm này không.
	 *
	 * <p>Kiểm TRƯỚC khi trừ điểm. Trừ trước rồi mới phát hiện đơn đã thanh toán sẽ phải hoàn điểm,
	 * và đường hoàn điểm là đường ít được chạy nhất nên cũng là đường dễ sai nhất.
	 */

	/**
	 * Đơn còn nhận thêm được không.
	 *
	 * <p>Chỉ ưu đãi TẶNG MÓN đi qua đây. Ưu đãi giảm tiền không chạm vào đơn nữa — nó sinh ra một
	 * mã, và mã đó trừ ở cấp hoá đơn lúc tất toán.
	 */
	private OrderLoyaltyPort.HoaDon kiemDonConMo(String orderCode) {
		OrderLoyaltyPort.HoaDon hoaDon = donHang.timHoaDon(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("ORDER_NOT_FOUND", "Order was not found."));

		// Đơn đã xong hoặc đã huỷ thì tiền đã chốt; thêm vào đó chỉ làm lệch sổ.
		if ("Completed".equals(hoaDon.status()) || "Cancelled".equals(hoaDon.status())) {
			throw ApiException.badRequest("LOYALTY_ORDER_CLOSED",
					"Đơn hàng này đã kết thúc, không áp dụng ưu đãi được nữa.");
		}
		return hoaDon;
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
			return new LoyaltyDtos.MyLoyaltyResponse(
					false, false, null, 0, java.util.List.of(),
					MemberTier.BAC.name(), MemberTier.BAC.tenHienThi(), java.math.BigDecimal.ZERO,
					MemberTier.BAC.ke().tenHienThi(), MemberTier.BAC.ke().nguong(),
					java.util.List.of());
		}
		LoyaltyDtos.LookupResponse lookup = loyaltyService.lookup(phone);
		// Khách phải xem được phiếu mình đã đổi. Không có màn hình này thì điểm biến mất mà không
		// để lại gì nhìn thấy được, và khách không có cách nào biết mình còn phiếu chưa dùng.
		java.math.BigDecimal chiTieu = lookup.spend12m();
		MemberTier hang = MemberTier.theoChiTieu(chiTieu);
		MemberTier ke = hang.ke();
		return new LoyaltyDtos.MyLoyaltyResponse(
				true, lookup.hasProfile(), phone, lookup.points(), lookup.availableRewards(),
				hang.name(), hang.tenHienThi(), chiTieu,
				ke == null ? null : ke.tenHienThi(),
				MemberTier.conThieuDeLenHang(chiTieu),
				lookup.pendingVouchers());
	}
}
