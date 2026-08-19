package com.cmc.restaurant.realtime;

import java.util.Locale;

/**
 * STOMP destinations replacing the SignalR groups in {@code OrderRealtimeContracts.cs} (.NET).
 *
 * <p>SignalR groups are server-side membership lists; STOMP topics are subscribed to by the client.
 * The names map 1:1 ({@code order:ORD-1001} → {@code /topic/order.ORD-1001}) but the security model
 * does not: with SignalR the server decided who joined a group, so a client could not listen to
 * someone else's order. A plain STOMP broker would happily let any connected client subscribe to
 * any topic — which is why {@link StompSubscriptionGuard} re-imposes the checks the .NET hub's
 * {@code WatchOrder}/{@code WatchTable} methods performed at join time.
 */
public final class RealtimeDestinations {

	public static final String OPERATIONS = "/topic/orders.operations";
	public static final String ORDER_PREFIX = "/topic/order.";
	public static final String TABLE_PREFIX = "/topic/table.";

	/**
	 * Topic CÔNG KHAI cho tình trạng còn/hết món (#92).
	 *
	 * <p>Bản .NET gửi sự kiện này tới nhóm operations <b>và</b> {@code Clients.All} — tức mọi kết
	 * nối, kể cả khách. STOMP không có "Clients.All", nên tương đương là một topic mà
	 * {@link StompSubscriptionGuard} cho phép đăng ký không cần chứng thực.
	 *
	 * <p>Mở công khai là đúng ở đây, không phải nới lỏng: tình trạng còn/hết món đã hiển thị cho
	 * mọi khách qua {@code GET /api/menu} (permitAll). Sự kiện chỉ mang tên món và cờ còn/hết —
	 * không có mã đơn, không có mã bàn, không có thông tin của bất kỳ khách nào.
	 */
	public static final String MENU = "/topic/menu";

	private RealtimeDestinations() {
	}

	public static String order(String orderCode) {
		return ORDER_PREFIX + orderCode.trim().toUpperCase(Locale.ROOT);
	}

	public static String table(String tableCode) {
		return TABLE_PREFIX + tableCode.trim().toUpperCase(Locale.ROOT);
	}
}
