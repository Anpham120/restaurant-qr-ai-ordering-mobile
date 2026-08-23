package com.cmc.restaurant.orders.adapter.in.web;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.orders.application.KitchenDelayService;
import com.cmc.restaurant.shared.ApiException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Bếp tự khai độ trễ lúc quá tải (#142).
 *
 * <p>Chỉ Kitchen/Staff/Admin gọi được. Khách <b>không</b> có endpoint nào để đọc con số này trực
 * tiếp — họ thấy nó đã hoà vào ước lượng của chính món mình gọi, kèm một dòng giải thích. Phơi nó
 * ra thành một chỉ số riêng chỉ tạo thêm một thứ để khách soi mà không giúp họ quyết định gì.
 */
@RestController
public class KitchenDelayController {

	private final KitchenDelayService kitchenDelayService;

	public KitchenDelayController(KitchenDelayService kitchenDelayService) {
		this.kitchenDelayService = kitchenDelayService;
	}

	/** @param delayMinutes 0 để tắt, tối đa {@link KitchenDelayService#TRAN_PHUT} */
	public record SetKitchenDelayRequest(Integer delayMinutes) {
	}

	@GetMapping("/api/kitchen/delay")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'Admin')")
	public KitchenDelayService.KitchenDelayView get() {
		return kitchenDelayService.xem();
	}

	@PutMapping("/api/kitchen/delay")
	@PreAuthorize("hasAnyRole('Kitchen', 'Staff', 'Admin')")
	public KitchenDelayService.KitchenDelayView set(
			@RequestBody SetKitchenDelayRequest request,
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		if (request == null || request.delayMinutes() == null) {
			throw ApiException.badRequest("DELAY_MINUTES_REQUIRED", "Thiếu delayMinutes.");
		}
		try {
			return kitchenDelayService.dat(request.delayMinutes(), tenNguoiBam(principal));
		} catch (IllegalArgumentException e) {
			// Đổi thành 400 có mã. Để nguyên thì Spring trả 500, và người trực bếp bấm nhầm sẽ
			// thấy "lỗi hệ thống" thay vì biết mình vừa nhập sai — hai kết luận rất khác nhau về
			// việc có nên gọi kỹ thuật lúc nửa đêm hay không.
			throw ApiException.badRequest("DELAY_MINUTES_OUT_OF_RANGE", e.getMessage());
		}
	}

	private static String tenNguoiBam(AuthenticatedPrincipal principal) {
		if (principal == null) {
			return null;
		}
		return principal.fullName() != null ? principal.fullName() : principal.email();
	}
}
