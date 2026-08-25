package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.shared.RequestIdempotency;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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

	@GetMapping("/api/loyalty/lookup")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public LoyaltyDtos.LookupResponse lookup(@RequestParam(required = false) String phone) {
		return loyaltyService.lookup(phone);
	}
}
