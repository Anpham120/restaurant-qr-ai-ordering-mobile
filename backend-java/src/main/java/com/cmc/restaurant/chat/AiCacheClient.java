package com.cmc.restaurant.chat;

import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Báo cho dịch vụ AI biết thực đơn vừa đổi, qua {@code POST /v1/cache/invalidate} (#92).
 *
 * <p><b>Best-effort có chủ đích.</b> Bản .NET bọc lời gọi này trong {@code try/catch} rỗng với chú
 * thích "ignore cache invalidate failures", và đó là quyết định đúng: bếp báo hết món là thao tác
 * phải thành công kể cả khi dịch vụ AI đang chết. Cái giá của thất bại ở đây là AI gợi ý nhầm một
 * món đã hết trong vài phút; cái giá của việc để nó làm hỏng cả yêu cầu là bếp không tắt được món.
 *
 * <p>Đặt trong {@code chat} vì đây là nơi đang giữ thông tin kết nối tới dịch vụ AI
 * ({@link ChatProperties}: {@code AI_SERVICE_URL}, {@code AI_INTERNAL_TOKEN}). Đặt bản sao cấu hình
 * thứ hai ở {@code menu} sẽ tạo đúng loại trôi lệch mà {@code EmailRule} ở #90 vừa dọn — hai nơi
 * cùng khai một biến môi trường rồi lệch nhau.
 */
@Component
public class AiCacheClient {

	private static final Logger log = LoggerFactory.getLogger(AiCacheClient.class);

	private final RestClient restClient;
	private final ChatProperties properties;

	public AiCacheClient(RestClient.Builder builder, ChatProperties properties) {
		this.properties = properties;
		// 3 giây, đúng như `client.Timeout = TimeSpan.FromSeconds(3)` của bản .NET. Ngắn hơn hẳn
		// timeout của chat: đây là việc phụ, không được giữ luồng xử lý của bếp.
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout((int) Duration.ofSeconds(3).toMillis());
		factory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
		this.restClient = builder.requestFactory(factory).build();
	}

	/** Không bao giờ ném. Thất bại chỉ được ghi log. */
	public void invalidateMenuAvailability(String menuItemId) {
		String url = properties.serviceUrl();
		if (url == null || url.isBlank()) {
			return;
		}
		if (properties.internalToken() == null || properties.internalToken().isBlank()) {
			// Cùng quy tắc với AiChatClient: không bao giờ gọi dịch vụ AI mà không có bí mật chung.
			log.warn("AI_INTERNAL_TOKEN is missing; skipping AI cache invalidation.");
			return;
		}
		try {
			restClient.post()
					.uri(url.replaceAll("/+$", "") + "/v1/cache/invalidate")
					.header("Authorization", "Bearer " + properties.internalToken())
					.contentType(MediaType.APPLICATION_JSON)
					.body(Map.of("reason", "menu_availability_changed", "menu_item_id", menuItemId))
					.retrieve()
					.toBodilessEntity();
		} catch (RuntimeException e) {
			log.warn("AI cache invalidation failed for {}; the AI may suggest this item until its "
					+ "own cache expires.", menuItemId, e);
		}
	}
}
