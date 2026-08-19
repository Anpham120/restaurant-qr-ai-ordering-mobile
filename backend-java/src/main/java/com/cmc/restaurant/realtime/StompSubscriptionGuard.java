package com.cmc.restaurant.realtime;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.auth.JwtService;
import com.cmc.restaurant.auth.UserRole;
import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.tables.TableSessionCapability;
import com.cmc.restaurant.tables.TableSessionEntity;
import com.cmc.restaurant.tables.TableSessionRepository;
import com.cmc.restaurant.tables.TableSessionStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * Re-imposes, at STOMP SUBSCRIBE time, the authorization the .NET {@code OrderUpdatesHub} performed
 * inside {@code WatchOrder} / {@code WatchTable} / {@code WatchTableSession}.
 *
 * <p>This class is the reason the realtime port is not a straight swap. With SignalR the server
 * owned group membership, so a client physically could not receive another table's traffic. A STOMP
 * broker inverts that: the client names the destination, and without this interceptor any connected
 * socket could subscribe to {@code /topic/order.ORD-1002} and watch a stranger's order. Every
 * rejection below therefore corresponds to a {@code HubException} in the original.
 *
 * <p>Credentials are read from the SUBSCRIBE frame's own headers rather than the CONNECT frame, so
 * one connection can hold exactly the capabilities it proves — the same shape as the .NET hub,
 * where each {@code Watch*} call carried its own token argument.
 */
@Component
public class StompSubscriptionGuard implements ChannelInterceptor {

	private static final Set<String> OPERATIONS_ROLES =
			Set.of(UserRole.STAFF, UserRole.COUNTER_STAFF, UserRole.KITCHEN, UserRole.ADMIN);

	private final JwtService jwtService;
	private final JwtProperties jwtProperties;
	private final OrderLookup orderLookup;
	private final TableSessionRepository tableSessionRepository;
	private final TableSessionCapability capability;

	public StompSubscriptionGuard(
			JwtService jwtService, JwtProperties jwtProperties, OrderLookup orderLookup,
			TableSessionRepository tableSessionRepository, TableSessionCapability capability) {
		this.jwtService = jwtService;
		this.jwtProperties = jwtProperties;
		this.orderLookup = orderLookup;
		this.tableSessionRepository = tableSessionRepository;
		this.capability = capability;
	}

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
		if (accessor == null || !StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
			return message;
		}

		String destination = accessor.getDestination();
		if (destination == null) {
			throw new IllegalArgumentException("SUBSCRIPTION_DENIED");
		}

		boolean isOperator = isOperator(first(accessor, "Authorization"));

		if (RealtimeDestinations.MENU.equals(destination)) {
			// Công khai có chủ đích — xem lý do ở RealtimeDestinations.MENU. Tương đương
			// `Clients.All` của bản .NET, và nội dung sự kiện đã công khai qua GET /api/menu.
			return message;
		}

		if (RealtimeDestinations.OPERATIONS.equals(destination)) {
			// Mirrors OnConnectedAsync: only staff roles ever joined the operations group.
			require(isOperator, "OPERATIONS_ACCESS_DENIED");
			return message;
		}

		if (destination.startsWith(RealtimeDestinations.ORDER_PREFIX)) {
			require(canWatchOrder(
					destination.substring(RealtimeDestinations.ORDER_PREFIX.length()),
					first(accessor, "X-Order-Token"), isOperator),
					"ORDER_ACCESS_DENIED");
			return message;
		}

		if (destination.startsWith(RealtimeDestinations.TABLE_PREFIX)) {
			require(canWatchTable(
					destination.substring(RealtimeDestinations.TABLE_PREFIX.length()),
					first(accessor, "X-Table-Session-Token"), isOperator),
					"TABLE_ACCESS_DENIED");
			return message;
		}

		// Unknown destinations are refused rather than ignored: a broker that silently accepts
		// them would let a typo look like a working subscription that never delivers.
		throw new IllegalArgumentException("SUBSCRIPTION_DENIED");
	}

	/** Mirrors {@code WatchOrder}: operators may watch any order; a customer must present the
	 * per-order token issued at creation. */
	private boolean canWatchOrder(String orderCode, String orderToken, boolean isOperator) {
		if (isOperator) {
			return orderLookup.findByOrderCode(orderCode).isPresent();
		}
		// Token không rời khỏi module Orders: cổng tự so sánh (thời gian hằng) và chỉ trả về
		// đúng/sai. Trước #80 chỗ này đọc thẳng customerAccessToken ra rồi tự so.
		return orderLookup.matchesCustomerToken(orderCode, orderToken);
	}

	/**
	 * Mirrors {@code WatchTable} + {@code TryJoinTableGroupWithSessionTokenAsync}: a customer's
	 * capability token is matched against the table's currently-open sessions, so a token from a
	 * finished session stops working the moment that session closes or expires.
	 */
	private boolean canWatchTable(String tableCode, String sessionToken, boolean isOperator) {
		String normalized = tableCode.trim().toUpperCase(Locale.ROOT);
		if (isOperator) {
			return true;
		}
		if (sessionToken == null || sessionToken.isBlank()) {
			return false;
		}
		OffsetDateTime now = OffsetDateTime.now();
		List<TableSessionEntity> openSessions = tableSessionRepository.findByTableCodeAndStatus(
				normalized, TableSessionStatus.Open);
		return openSessions.stream()
				.filter(session -> session.getClosedAt() == null)
				.filter(session -> session.getExpiresAt().isAfter(now))
				.anyMatch(session -> capability.isValid(session, sessionToken, jwtProperties.signingKey()));
	}

	private boolean isOperator(String authorizationHeader) {
		if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
			return false;
		}
		Optional<JwtService.AuthenticatedUser> user =
				jwtService.parseToken(authorizationHeader.substring("Bearer ".length()).trim());
		return user.map(value -> OPERATIONS_ROLES.contains(value.role())).orElse(false);
	}

	private static String first(StompHeaderAccessor accessor, String name) {
		List<String> values = accessor.getNativeHeader(name);
		return values == null || values.isEmpty() ? null : values.get(0);
	}

	private static void require(boolean allowed, String errorCode) {
		if (!allowed) {
			// Propagates to the client as a STOMP ERROR frame, the transport-level equivalent of
			// the HubException the .NET hub threw.
			throw new IllegalArgumentException(errorCode);
		}
	}
}
