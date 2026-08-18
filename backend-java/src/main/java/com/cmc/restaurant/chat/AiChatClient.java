package com.cmc.restaurant.chat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Calls the existing Python service at {@code POST /v1/chat} (hợp đồng
 * {@code ai/contracts/ai-chat-v1.schema.json}). Nothing here reasons about the menu or builds an
 * answer — the plan scopes Chat to "chỉ proxy, không viết lại RAG".
 *
 * <p>Sends exactly the three fields the contract defines. The .NET provider still posts its legacy
 * 24-field {@code ChatRequestV2Payload}; the schema records that the extra fields are always empty
 * and that carrying them makes the contract lie about what it uses, so this port does not copy them.
 *
 * <p>Note on the field name: the service declares {@code question} with {@code alias="message"}.
 * Its own comments document a real outage where the backend sent one name and the service accepted
 * only the other, returning 422 — invisible to every test because the tests all sent the name the
 * service wanted. That is why the verification for this issue calls the real service rather than a
 * stub.
 */
@Component
public class AiChatClient {

	private static final Logger log = LoggerFactory.getLogger(AiChatClient.class);

	private final RestClient restClient;
	private final ChatProperties properties;

	public AiChatClient(RestClient.Builder builder, ChatProperties properties) {
		this.properties = properties;
		// Timeouts are the whole reason this builds its own request factory: without them a hung AI
		// service would pin the request thread indefinitely, and the customer's chat would hang
		// instead of falling back. Mirrors BACKEND_AI_TIMEOUT_SECONDS on the .NET side.
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
		factory.setReadTimeout((int) Duration.ofSeconds(properties.timeoutSeconds()).toMillis());
		this.restClient = builder.requestFactory(factory).build();
	}

	/** Empty when the service is unreachable, unauthenticated, or too slow — the caller turns that
	 * into a usable sentence rather than an error page. */
	public Optional<ChatDtos.AiChatResponse> ask(String question, Map<String, Object> sessionState) {
		if (properties.serviceUrl() == null || properties.serviceUrl().isBlank()) {
			log.warn("AI_SERVICE_URL is not configured; chat is answering with the staff-handoff fallback.");
			return Optional.empty();
		}
		if (properties.internalToken() == null || properties.internalToken().isBlank()) {
			// Same refusal as .NET's TryAddInternalAuthorization: never call the AI service without
			// the shared secret.
			log.error("AI_INTERNAL_TOKEN is missing; refusing an unauthenticated AI request.");
			return Optional.empty();
		}

		String endpoint = properties.serviceUrl().replaceAll("/+$", "") + "/v1/chat";
		try {
			ChatDtos.AiChatResponse response = restClient.post()
					.uri(endpoint)
					.contentType(MediaType.APPLICATION_JSON)
					.header("Authorization", "Bearer " + properties.internalToken().trim())
					.body(new ChatDtos.AiChatRequest(question, sessionState, true))
					.retrieve()
					.body(ChatDtos.AiChatResponse.class);

			if (response == null || response.content() == null || response.content().isBlank()) {
				log.warn("AI service returned an empty answer; falling back.");
				return Optional.empty();
			}
			return Optional.of(response);
		} catch (RuntimeException e) {
			// Includes timeouts and non-2xx. Detail goes to the log, never to the customer.
			log.warn("AI service call failed ({}); chat is falling back to staff handoff.", e.getClass().getSimpleName(), e);
			return Optional.empty();
		}
	}

	/** Mirrors the fallback in {@code ai/app/service.py}: the customer is sitting at a table, so an
	 * outage must still produce a sentence they can act on, not an error screen. */
	public static ChatDtos.SendChatMessageResponse fallback() {
		return new ChatDtos.SendChatMessageResponse(
				"Mình chưa tra được thông tin này. Bạn hỏi nhân viên giúp mình nhé.",
				List.of(), List.of("internal_error"), true, false);
	}
}
