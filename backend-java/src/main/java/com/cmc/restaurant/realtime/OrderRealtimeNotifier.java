package com.cmc.restaurant.realtime;

import java.util.Map;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Mirrors {@code SignalROrderRealtimeNotifier} (.NET) — fans an event out to the order topic, the
 * operations topic, and (when known) the table topic.
 *
 * <p>Every publish is wrapped in a try/catch: realtime is an enhancement on top of the polling
 * fallback (V53), so a broker hiccup must never roll back or fail the order/payment operation that
 * triggered it. The .NET version has the same property by virtue of being called after
 * {@code SaveChanges}; here it is explicit because these run inside {@code @Transactional} methods.
 */
@Component
public class OrderRealtimeNotifier {

	private final SimpMessagingTemplate messagingTemplate;

	public OrderRealtimeNotifier(SimpMessagingTemplate messagingTemplate) {
		this.messagingTemplate = messagingTemplate;
	}

	public void orderCreated(RealtimeDtos.OrderCreatedEvent payload) {
		fanOut(RealtimeDtos.EventNames.ORDER_CREATED, payload, payload.orderCode(), payload.tableCode());
	}

	public void orderStatusChanged(RealtimeDtos.OrderStatusChangedEvent payload, String tableCode) {
		fanOut(RealtimeDtos.EventNames.ORDER_STATUS_CHANGED, payload, payload.orderCode(), tableCode);
	}

	public void orderItemStatusChanged(RealtimeDtos.OrderItemStatusChangedEvent payload, String tableCode) {
		fanOut(RealtimeDtos.EventNames.ORDER_ITEM_STATUS_CHANGED, payload, payload.orderCode(), tableCode);
	}

	public void paymentRequested(RealtimeDtos.PaymentRequestedEvent payload) {
		fanOut(RealtimeDtos.EventNames.PAYMENT_REQUESTED, payload, payload.orderCode(), payload.tableCode());
	}

	/** Mirrors {@code SendToOrderAndOperationsAsync}. The event name travels in an {@code event}
	 * header because STOMP has no equivalent of SignalR's named method invocation. */
	private void fanOut(String eventName, Object payload, String orderCode, String tableCode) {
		Map<String, Object> headers = Map.of("event", eventName);
		send(RealtimeDestinations.order(orderCode), payload, headers);
		send(RealtimeDestinations.OPERATIONS, payload, headers);
		if (tableCode != null && !tableCode.isBlank()) {
			send(RealtimeDestinations.table(tableCode), payload, headers);
		}
	}

	private void send(String destination, Object payload, Map<String, Object> headers) {
		try {
			messagingTemplate.convertAndSend(destination, payload, headers);
		} catch (RuntimeException e) {
			// Swallowed on purpose — see the class comment. Clients still converge via polling.
			org.slf4j.LoggerFactory.getLogger(OrderRealtimeNotifier.class)
					.warn("Realtime publish to {} failed; clients fall back to polling.", destination, e);
		}
	}
}
