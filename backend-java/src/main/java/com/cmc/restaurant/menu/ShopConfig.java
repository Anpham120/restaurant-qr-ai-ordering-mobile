package com.cmc.restaurant.menu;

import com.cmc.restaurant.shared.ApiException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Thông tin quán mà khách nhìn thấy: tên, địa chỉ, số điện thoại, và khoảng thời gian dự kiến.
 *
 * <p>Phần biểu phí giao hàng — bán kính miễn phí, phí mỗi km, toạ độ quán, đơn tối thiểu, COD —
 * đã gỡ cùng phạm vi giao tận nhà. Xem {@code docs/pm/CHOT_NGHIEP_VU_QUAN_P0.md} §1.
 */
@Service
public class ShopConfig {
	private final ShopSettingsRepository settings;
	private final ObjectMapper json;

	public ShopConfig(ShopSettingsRepository settings, ObjectMapper json) {
		this.settings = settings;
		this.json = json;
	}

	@Transactional(readOnly = true)
	public Response response() {
		return settings.findById("main").map(row -> {
			try {
				return json.readValue(row.getSettingsJson(), Response.class);
			} catch (JsonProcessingException e) {
				throw new IllegalStateException("Invalid shop settings", e);
			}
		}).orElseGet(ShopConfig::defaults);
	}

	public static Response defaults() {
		return new Response("Mây",
				"Đại học CMC cơ sở 2, tòa nhà Vạn Phúc, Tố Hữu, Hà Đông, Hà Nội", "", 25, 40);
	}

	@Transactional
	public Response update(Response request) {
		if (request == null || request.name() == null || request.name().isBlank() || request.name().length() > 200
				|| request.address() == null || request.address().length() > 1000
				|| request.phone() == null || request.phone().length() > 30
				|| request.estimatedMinutesLow() < 1
				|| request.estimatedMinutesHigh() < request.estimatedMinutesLow()) {
			throw ApiException.badRequest("SHOP_CONFIG_INVALID", "Cấu hình quán không hợp lệ.");
		}
		Response normalized = new Response(request.name().trim(), request.address().trim(),
				request.phone().trim(), request.estimatedMinutesLow(), request.estimatedMinutesHigh());
		try {
			settings.save(new ShopSettingsEntity(json.writeValueAsString(normalized)));
		} catch (JsonProcessingException e) {
			throw new IllegalStateException(e);
		}
		return normalized;
	}

	/**
	 * {@code ignoreUnknown} có chủ ý: hàng {@code shop_settings} đã lưu còn mang các khoá của biểu
	 * phí giao hàng cũ. Bỏ cờ này là một bản ghi cũ làm hỏng cả endpoint cấu hình.
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Response(String name, String address, String phone,
			int estimatedMinutesLow, int estimatedMinutesHigh) {
	}
}
