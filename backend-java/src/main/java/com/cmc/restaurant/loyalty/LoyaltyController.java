package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.shared.RequestIdempotency;
import jakarta.servlet.http.HttpServletRequest;
import java.time.OffsetDateTime;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors {@code GET /api/loyalty/lookup} (.NET), including its authorization: staff-only, because
 * anyone able to call it could enumerate which phone numbers are customers and how much they
 * spend. Admin CRUD for members/rewards stays out of scope. */
@RestController
public class LoyaltyController {

	private final LoyaltyService loyaltyService;
	private final MyLoyaltyService myLoyaltyService;

	public LoyaltyController(LoyaltyService loyaltyService, MyLoyaltyService myLoyaltyService) {
		this.loyaltyService = loyaltyService;
		this.myLoyaltyService = myLoyaltyService;
	}

	/**
	 * Điểm của chính khách đang đăng nhập (§9.10 M1 mục 3).
	 *
	 * <p>{@code Customer} và CHỈ {@code Customer}: nhân viên đã có {@code /lookup} mạnh hơn, và
	 * cho vai nhân viên dùng đường này chỉ tạo thêm một lối vào cùng dữ liệu.
	 *
	 * <p>Không nhận tham số số điện thoại — số lấy từ chính tài khoản. Xem {@link MyLoyaltyService}.
	 */
	@GetMapping("/api/loyalty/me")
	@PreAuthorize("hasRole('Customer')")
	public LoyaltyDtos.MyLoyaltyResponse me(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return myLoyaltyService.me(principal.userId());
	}

	/** Nối số điện thoại vào tài khoản — chỉ được khi số đó chưa có hồ sơ tích điểm. */
	@PostMapping("/api/loyalty/me/phone")
	@PreAuthorize("hasRole('Customer')")
	public LoyaltyDtos.MyLoyaltyResponse linkPhone(
			@AuthenticationPrincipal AuthenticatedPrincipal principal,
			@RequestBody(required = false) LoyaltyDtos.LinkPhoneRequest request) {
		return myLoyaltyService.linkPhone(principal.userId(), request == null ? null : request.phone());
	}

	/**
	 * Đổi điểm lấy ưu đãi (#34).
	 *
	 * <p>BẮT BUỘC {@code Idempotency-Key}, cùng lý do với {@code POST /api/orders}: bấm hai lần
	 * lúc mạng chập chờn ở đây tiêu điểm THẬT của khách. Thiếu header là 400, không phải im lặng
	 * cho qua.
	 */
	@PostMapping("/api/loyalty/me/redeem")
	@PreAuthorize("hasRole('Customer')")
	public LoyaltyDtos.RedeemResponse redeem(
			@AuthenticationPrincipal AuthenticatedPrincipal principal,
			@RequestBody(required = false) LoyaltyDtos.RedeemRequest request,
			HttpServletRequest httpRequest) {
		String key = RequestIdempotency.readValid(httpRequest);
		if (key == null) {
			boolean coHeader = httpRequest.getHeader(RequestIdempotency.HEADER_NAME) != null;
			throw ApiException.badRequest(
					coHeader ? "IDEMPOTENCY_KEY_INVALID" : "IDEMPOTENCY_KEY_REQUIRED",
					"A valid Idempotency-Key header is required.");
		}
		if (request == null || request.rewardId() == null || request.rewardId().isBlank()) {
			throw ApiException.badRequest("LOYALTY_REWARD_REQUIRED", "rewardId is required.");
		}
		return myLoyaltyService.redeem(
				principal.userId(), request.rewardId().trim(), request.orderCode(), key);
	}

	/**
	 * Quầy đánh dấu đã phát phiếu.
	 *
	 * <p>Cùng nhóm quyền với {@code /lookup}: ai tra được điểm của khách thì cũng là người đứng
	 * quầy phát món. Khách KHÔNG được tự thu phiếu của mình — đó là lý do đường này nằm ngoài
	 * {@code /api/loyalty/me}.
	 */
	@PostMapping("/api/loyalty/redemptions/{redemptionId}/honour")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public LoyaltyDtos.VoucherResponse thuPhieu(
			@AuthenticationPrincipal AuthenticatedPrincipal principal,
			@PathVariable String redemptionId) {
		return loyaltyService.thuPhieu(redemptionId, principal.userId(), OffsetDateTime.now());
	}

	/**
	 * Quầy đổi thưởng HỘ khách chỉ dùng web.
	 *
	 * <p>Khách quét QR dùng web không đăng nhập, nên hệ thống không biết họ là ai và họ không tự
	 * đổi được. Nhưng điểm của họ vẫn tích — màn thanh toán bắt điền số điện thoại. Trước bản này
	 * KHÔNG có đường nào cho quầy tạo một lần đổi, nghĩa là cả nhóm khách đó kiếm được điểm mà
	 * không bao giờ tiêu được.
	 *
	 * <p>BẮT BUỘC {@code Idempotency-Key}, cùng lý do với đường của app: bấm hai lần lúc mạng chập
	 * chờn ở đây tiêu điểm THẬT của khách. Ở quầy còn nặng hơn — người bấm không phải người mất
	 * điểm.
	 */
	@PostMapping("/api/loyalty/counter/redeem")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public LoyaltyDtos.CounterRedeemResponse doiHoTaiQuay(
			@AuthenticationPrincipal AuthenticatedPrincipal principal,
			@RequestBody(required = false) LoyaltyDtos.CounterRedeemRequest request,
			HttpServletRequest httpRequest) {
		String key = RequestIdempotency.readValid(httpRequest);
		if (key == null) {
			boolean coHeader = httpRequest.getHeader(RequestIdempotency.HEADER_NAME) != null;
			throw ApiException.badRequest(
					coHeader ? "IDEMPOTENCY_KEY_INVALID" : "IDEMPOTENCY_KEY_REQUIRED",
					"A valid Idempotency-Key header is required.");
		}
		if (request == null || request.rewardId() == null || request.rewardId().isBlank()) {
			throw ApiException.badRequest("LOYALTY_REWARD_REQUIRED", "rewardId is required.");
		}
		return myLoyaltyService.doiHoTaiQuay(
				request.phone(), request.rewardId().trim(), request.orderCode(),
				principal.userId(), key);
	}

	/** Khách xin mã để đọc ở quầy. */
	@PostMapping("/api/loyalty/me/link-code")
	@PreAuthorize("hasRole('Customer')")
	public LoyaltyDtos.LinkCodeResponse xinMaNoiSo(
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return myLoyaltyService.xinMaNoiSo(principal.userId());
	}

	/**
	 * Quầy nối số đã có hồ sơ vào tài khoản khách.
	 *
	 * <p>Cùng nhóm quyền với {@code /lookup} và {@code /honour}: ai đứng quầy thì làm được.
	 */
	@PostMapping("/api/loyalty/link")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public LoyaltyDtos.MyLoyaltyResponse noiSoTaiQuay(
			@AuthenticationPrincipal AuthenticatedPrincipal principal,
			@RequestBody(required = false) LoyaltyDtos.StaffLinkRequest request) {
		if (request == null || request.code() == null || request.code().isBlank()) {
			throw ApiException.badRequest("LOYALTY_LINK_CODE_REQUIRED", "Nhập mã khách đọc.");
		}
		return myLoyaltyService.noiSoTaiQuay(request.code(), request.phone(), principal.userId());
	}

	@GetMapping("/api/loyalty/lookup")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public LoyaltyDtos.LookupResponse lookup(@RequestParam(required = false) String phone) {
		return loyaltyService.lookup(phone);
	}
}
