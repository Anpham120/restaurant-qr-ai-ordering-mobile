package com.cmc.restaurant.orders.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The point of issue #61, demonstrated: every rule of the Order aggregate is exercised here with
 * plain {@code new Order(...)} — no Spring context, no Testcontainers, no PostgreSQL.
 *
 * <p>That matters beyond speed. Testcontainers has never run in this project's development sandbox
 * (docker-java clashes with that machine's Docker Engine API), so until now the state machine could
 * only be checked by starting the whole app against a real database and driving it over HTTP. These
 * tests run anywhere.
 */
class OrderTest {

	private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-08-18T10:00:00Z");

	private static OrderItem item(String id, OrderItemStatus status) {
		return new OrderItem(id, "m_001", "Phở bò", new BigDecimal("55000"), 1, status, T0, null);
	}

	private static Order orderWith(OrderStatus status, OrderItem... items) {
		return new Order("ord_1", "ORD-1001", "T01", "ts_1", "tok", status, T0, List.of(items));
	}

	// --- order-level transitions ---------------------------------------------------------------

	@Test
	@DisplayName("Placed -> Preparing được phép")
	void allowsForwardTransition() {
		Order order = orderWith(OrderStatus.Placed, item("oi_1", OrderItemStatus.Pending));

		order.transitionTo(OrderStatus.Preparing, Actor.SYSTEM, T0);

		assertThat(order.status()).isEqualTo(OrderStatus.Preparing);
		assertThat(order.items().getFirst().status()).isEqualTo(OrderItemStatus.Preparing);
		order.transitionTo(OrderStatus.Ready, Actor.SYSTEM, T0.plusMinutes(5));
		assertThat(order.items().getFirst().status()).isEqualTo(OrderItemStatus.Ready);
		assertThat(order.items().getFirst().readyAt()).isEqualTo(T0.plusMinutes(5));
	}

	@Test
	@DisplayName("Preparing -> Placed bị từ chối (không lùi trạng thái)")
	void rejectsBackwardTransition() {
		Order order = orderWith(OrderStatus.Preparing, item("oi_1", OrderItemStatus.Preparing));

		assertThatThrownBy(() -> order.transitionTo(OrderStatus.Placed, Actor.SYSTEM, T0))
				.isInstanceOf(OrderRuleViolation.class)
				.extracting(e -> ((OrderRuleViolation) e).code())
				.isEqualTo("ORDER_STATUS_TRANSITION_INVALID");
	}

	@Test
	@DisplayName("Không huỷ được đơn khi một món đã vào bếp")
	void locksCancellationOnceKitchenStarted() {
		Order order = orderWith(OrderStatus.Placed,
				item("oi_1", OrderItemStatus.Pending), item("oi_2", OrderItemStatus.Preparing));

		assertThatThrownBy(() -> order.transitionTo(OrderStatus.Cancelled, Actor.SYSTEM, T0))
				.isInstanceOf(OrderRuleViolation.class)
				.extracting(e -> ((OrderRuleViolation) e).code())
				.isEqualTo("ORDER_CANCEL_NOT_ALLOWED");
	}

	@Test
	@DisplayName("Huỷ đơn thì món đang Pending bị huỷ theo")
	void cancellingOrderCascadesToPendingItems() {
		Order order = orderWith(OrderStatus.Placed,
				item("oi_1", OrderItemStatus.Pending), item("oi_2", OrderItemStatus.Pending));

		order.transitionTo(OrderStatus.Cancelled, Actor.SYSTEM, T0);

		assertThat(order.items()).allSatisfy(i -> assertThat(i.status()).isEqualTo(OrderItemStatus.Cancelled));
	}

	// --- item-level transitions ----------------------------------------------------------------

	@Test
	@DisplayName("Món cuối cùng xong thì đơn tự lên Ready")
	void derivesReadyWhenAllActiveItemsDone() {
		Order order = orderWith(OrderStatus.Preparing,
				item("oi_1", OrderItemStatus.Ready), item("oi_2", OrderItemStatus.Preparing));

		order.updateItemStatus("oi_2", OrderItemStatus.Ready, Actor.SYSTEM, T0);

		assertThat(order.status()).isEqualTo(OrderStatus.Ready);
	}

	@Test
	@DisplayName("Món đã huỷ không giữ đơn lại ở Preparing")
	void cancelledItemsDoNotBlockReady() {
		Order order = orderWith(OrderStatus.Preparing,
				item("oi_1", OrderItemStatus.Ready), item("oi_2", OrderItemStatus.Cancelled));

		order.updateItemStatus("oi_1", OrderItemStatus.Served, Actor.SYSTEM, T0);

		assertThat(order.status()).isEqualTo(OrderStatus.Ready);
	}

	@Test
	@DisplayName("readyAt ghi đúng một lần, Ready -> Served không ghi đè")
	void readyAtIsRecordedOnceOnly() {
		Order order = orderWith(OrderStatus.Preparing, item("oi_1", OrderItemStatus.Preparing));
		OffsetDateTime later = T0.plusMinutes(5);

		order.updateItemStatus("oi_1", OrderItemStatus.Ready, Actor.SYSTEM, T0);
		order.updateItemStatus("oi_1", OrderItemStatus.Served, Actor.SYSTEM, later);

		assertThat(order.findItem("oi_1").orElseThrow().readyAt()).isEqualTo(T0);
	}

	@Test
	@DisplayName("Đơn đã Completed thì không đổi món được")
	void rejectsItemChangeOnTerminalOrder() {
		Order order = orderWith(OrderStatus.Completed, item("oi_1", OrderItemStatus.Served));

		assertThatThrownBy(() -> order.updateItemStatus("oi_1", OrderItemStatus.Ready, Actor.SYSTEM, T0))
				.isInstanceOf(OrderRuleViolation.class)
				.extracting(e -> ((OrderRuleViolation) e).code())
				.isEqualTo("ORDER_STATUS_TERMINAL");
	}

	// --- hạn chế #11: khách tự huỷ món ---------------------------------------------------------

	@Test
	@DisplayName("Khách huỷ được món còn Pending")
	void customerCanCancelPendingItem() {
		Order order = orderWith(OrderStatus.Placed, item("oi_1", OrderItemStatus.Pending));

		order.cancelItemAsCustomer("oi_1", T0);

		assertThat(order.findItem("oi_1").orElseThrow().status()).isEqualTo(OrderItemStatus.Cancelled);
	}

	@Test
	@DisplayName("Khách KHÔNG huỷ được món đã vào bếp, dù nhân viên thì được")
	void customerCannotCancelPreparingItemEvenThoughStaffCan() {
		Order order = orderWith(OrderStatus.Preparing, item("oi_1", OrderItemStatus.Preparing));

		assertThatThrownBy(() -> order.cancelItemAsCustomer("oi_1", T0))
				.isInstanceOf(OrderRuleViolation.class)
				.extracting(e -> ((OrderRuleViolation) e).code())
				.isEqualTo("ORDER_ITEM_CANCEL_NOT_ALLOWED");

		// Same item, staff path: allowed. This asymmetry is the whole rule of hạn chế #11.
		order.updateItemStatus("oi_1", OrderItemStatus.Cancelled, Actor.SYSTEM, T0);
		assertThat(order.findItem("oi_1").orElseThrow().status()).isEqualTo(OrderItemStatus.Cancelled);
	}

	@Test
	@DisplayName("Khoá theo TỪNG MÓN: món khác đang nấu không chặn món còn Pending")
	void customerCancelIsLockedPerItemNotPerOrder() {
		Order order = orderWith(OrderStatus.Preparing,
				item("oi_1", OrderItemStatus.Preparing), item("oi_2", OrderItemStatus.Pending));

		order.cancelItemAsCustomer("oi_2", T0);

		assertThat(order.findItem("oi_2").orElseThrow().status()).isEqualTo(OrderItemStatus.Cancelled);
		assertThat(order.findItem("oi_1").orElseThrow().status()).isEqualTo(OrderItemStatus.Preparing);
	}

	// --- audit trail ---------------------------------------------------------------------------

	@Test
	@DisplayName("Sự kiện thanh toán không đổi trạng thái đơn, from == to")
	void paymentEventDoesNotMoveTheOrder() {
		Order order = orderWith(OrderStatus.Placed, item("oi_1", OrderItemStatus.Pending));

		order.recordPaymentEvent(new Actor("u1", "Staff"), "Khách trả tiền mặt", T0);

		assertThat(order.status()).isEqualTo(OrderStatus.Placed);
		StatusChange change = order.takeNewChanges().get(0);
		assertThat(change.fromStatus()).isEqualTo(change.toStatus());
		assertThat(change.source()).isEqualTo(StatusChange.SOURCE_PAYMENT);
	}

	@Test
	@DisplayName("takeNewChanges() lấy một lần, gọi lại không nhân đôi lịch sử")
	void changesAreTakenOnlyOnce() {
		Order order = orderWith(OrderStatus.Placed, item("oi_1", OrderItemStatus.Pending));
		order.transitionTo(OrderStatus.Confirmed, Actor.SYSTEM, T0);

		assertThat(order.takeNewChanges()).hasSize(1);
		assertThat(order.takeNewChanges()).isEmpty();
	}

	@Test
	@DisplayName("So token hằng thời gian: token sai độ dài / sai nội dung đều trượt")
	void customerTokenComparison() {
		Order order = orderWith(OrderStatus.Placed, item("oi_1", OrderItemStatus.Pending));

		assertThat(order.matchesCustomerToken("tok")).isTrue();
		assertThat(order.matchesCustomerToken("to")).isFalse();
		assertThat(order.matchesCustomerToken("tox")).isFalse();
		assertThat(order.matchesCustomerToken(null)).isFalse();
	}

	@Test
	@DisplayName("subtotal bỏ qua món đã huỷ")
	void subtotalExcludesCancelledItems() {
		Order order = orderWith(OrderStatus.Placed,
				item("oi_1", OrderItemStatus.Pending), item("oi_2", OrderItemStatus.Cancelled));

		assertThat(order.subtotal()).isEqualByComparingTo("55000");
	}
}
