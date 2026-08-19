package com.cmc.restaurant.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.function.BiConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Đọc SSE từ {@code POST /v1/chat/stream} của dịch vụ AI (#95).
 *
 * <p><b>Đọc theo dòng {@code event:}, không theo dòng {@code data:}.</b> Đây không phải chi tiết
 * phong cách — chính {@code ai/app/service.py} ghi lại sự cố: bản đầu của dịch vụ phát
 * {@code data:} mà KHÔNG có dòng {@code event:}, backend bỏ qua mọi {@code data:} khi chưa thấy tên
 * khung, nên <b>toàn bộ stream bị huỷ</b> và khách nhận "Xin lỗi, hệ thống hơi chậm." trên đường
 * chính — vì frontend gọi stream trước rồi mới lùi về gọi thường.
 *
 * <p>Không tập test nào bắt được, vì cả hai bên đều tự nhất quán với chính mình: test của dịch vụ
 * kiểm theo khung nó tự định, test hợp đồng của backend kiểm theo khung backend chờ, và không tập
 * nào nối hai bên lại.
 *
 * <p>Ba tên khung là hợp đồng: {@code token} (có {@code data.text}), {@code final} (cả payload),
 * {@code done}.
 *
 * <p>Dùng {@link HttpClient} của JDK chứ không dùng {@code RestClient}: cần đọc thân phản hồi theo
 * dòng NGAY KHI tới, còn {@code RestClient} thiên về đọc trọn body rồi mới trả về.
 */
@Component
public class AiChatStreamClient {

	private static final Logger log = LoggerFactory.getLogger(AiChatStreamClient.class);

	private final ChatProperties properties;
	private final HttpClient httpClient;
	private final ObjectMapper objectMapper;

	public AiChatStreamClient(ChatProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder()
				// BẮT BUỘC ghim HTTP/1.1. Mặc định của HttpClient là HTTP_2, và với URL http:// nó
				// gửi kèm "Upgrade: h2c" + "Connection: Upgrade" để thử nâng cấp. Uvicorn không nói
				// h2c: thấy Connection: Upgrade là nó không giao thân yêu cầu cho FastAPI, FastAPI
				// thấy thiếu trường "question" và trả 422 — tức chat rơi vào câu xin lỗi dù dịch vụ
				// AI vẫn khoẻ. Đã dựng lại bằng socket thô: cùng body, chỉ thêm dòng Upgrade là
				// 200 thành 422. RestClient ở AiChatClient không dính vì nó không thử nâng cấp.
				.version(HttpClient.Version.HTTP_1_1)
				.connectTimeout(Duration.ofSeconds(5))
				.build();
	}

	/**
	 * Gọi dịch vụ và đẩy từng khung ra {@code onFrame} theo đúng thứ tự nhận được.
	 *
	 * @param onFrame nhận (tên khung, JSON thô của dòng {@code data:})
	 * @return true nếu đã nhận được khung {@code final}; false nghĩa là nơi gọi phải tự dựng câu
	 *         trả lời dự phòng
	 */
	public boolean stream(String question, Map<String, Object> sessionState, BiConsumer<String, String> onFrame) {
		if (properties.serviceUrl() == null || properties.serviceUrl().isBlank()) {
			log.warn("AI_SERVICE_URL is not configured; chat stream is falling back.");
			return false;
		}
		if (properties.internalToken() == null || properties.internalToken().isBlank()) {
			log.error("AI_INTERNAL_TOKEN is missing; refusing an unauthenticated AI stream request.");
			return false;
		}

		String endpoint = properties.serviceUrl().replaceAll("/+$", "") + "/v1/chat/stream";
		boolean sawFinal = false;
		try {
			String body = objectMapper.writeValueAsString(
					new ChatDtos.AiChatRequest(question, sessionState, true));
			HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
					.timeout(Duration.ofSeconds(properties.timeoutSeconds()))
					.header("Content-Type", "application/json")
					.header("Accept", "text/event-stream")
					.header("Authorization", "Bearer " + properties.internalToken().trim())
					.POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
					.build();

			HttpResponse<InputStream> response =
					httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
			if (response.statusCode() / 100 != 2) {
				// Ghi kèm thân lỗi: chỉ có mã trạng thái thì một lỗi 422 nhìn giống hệt mọi lỗi 422
				// khác, còn FastAPI đã nói sẵn trường nào sai ngay trong thân. Cắt ngắn vì đây là
				// dòng log, không phải nơi chứa cả phản hồi.
				String detail = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
				log.warn("AI stream returned HTTP {}; chat is falling back. Detail: {}",
						response.statusCode(), detail.length() > 500 ? detail.substring(0, 500) : detail);
				return false;
			}

			try (BufferedReader reader = new BufferedReader(
					new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
				String eventName = null;
				String line;
				while ((line = reader.readLine()) != null) {
					if (line.startsWith("event:")) {
						eventName = line.substring("event:".length()).trim();
					} else if (line.startsWith("data:")) {
						// Bỏ qua data khi chưa thấy tên khung — chính là hành vi của bộ đọc .NET, và
						// giữ nguyên để hai bản backend hỏng GIỐNG nhau nếu dịch vụ lại phát sai khung.
						if (eventName == null) {
							continue;
						}
						String data = line.substring("data:".length()).trim();
						onFrame.accept(eventName, data);
						if ("final".equals(eventName)) {
							sawFinal = true;
						}
						eventName = null;
					}
				}
			}
			return sawFinal;
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			log.warn("AI stream interrupted; chat is falling back.");
			return false;
		} catch (Exception e) {
			log.warn("AI stream failed ({}); chat is falling back.", e.getClass().getSimpleName(), e);
			return false;
		}
	}
}
