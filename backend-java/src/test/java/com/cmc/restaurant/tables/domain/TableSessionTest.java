package com.cmc.restaurant.tables.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.cmc.restaurant.tables.TableSessionStatus;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Lifecycle and resume rules of the table session, exercised without Spring or a database — same
 * property the Orders aggregate gained in issue #61. */
class TableSessionTest {

	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-18T12:00:00Z");

	private static TableSession session(TableSessionStatus status, OffsetDateTime expiresAt) {
		return new TableSession("ts_1", "tbl_1", "T01", status, expiresAt, null, NOW);
	}

	// --- lifecycle ---------------------------------------------------------------------------

	@Test
	@DisplayName("Phiên còn hạn và đang mở thì dùng được")
	void openAndUnexpiredIsActive() {
		assertThat(session(TableSessionStatus.Open, NOW.plusHours(1)).isActiveAt(NOW)).isTrue();
	}

	@Test
	@DisplayName("Quá hạn thì coi như hết hạn NGAY, không chờ ai ghi nhận")
	void expiryIsEffectiveBeforeItIsWrittenDown() {
		TableSession stale = session(TableSessionStatus.Open, NOW.minusMinutes(1));

		assertThat(stale.isActiveAt(NOW)).isFalse();
		assertThat(stale.isExpiredAt(NOW)).isTrue();
		assertThat(stale.status()).isEqualTo(TableSessionStatus.Open);
	}

	@Test
	@DisplayName("expireIfPast chỉ báo true khi thật sự có chuyển trạng thái")
	void expireIfPastReportsOnlyRealTransitions() {
		TableSession stale = session(TableSessionStatus.Open, NOW.minusMinutes(1));
		TableSession fresh = session(TableSessionStatus.Open, NOW.plusHours(1));

		assertThat(stale.expireIfPast(NOW)).isTrue();
		assertThat(stale.status()).isEqualTo(TableSessionStatus.Expired);
		assertThat(stale.closedAt()).isEqualTo(NOW);

		assertThat(fresh.expireIfPast(NOW)).isFalse();
		assertThat(stale.expireIfPast(NOW)).as("gọi lần hai không đổi gì nữa").isFalse();
	}

	@Test
	@DisplayName("Đóng phiên hai lần: lần hai là no-op, không phải lỗi")
	void closingTwiceIsIdempotent() {
		TableSession open = session(TableSessionStatus.Open, NOW.plusHours(1));

		assertThat(open.close(NOW)).isTrue();
		assertThat(open.status()).isEqualTo(TableSessionStatus.Closed);
		assertThat(open.close(NOW)).as("nhân viên thứ hai bấm nút không được nhận lỗi").isFalse();
	}

	// --- resume state (V51-V52) ---------------------------------------------------------------

	@Test
	@DisplayName("Chưa có gì -> New; có món trong giỏ -> CartPending")
	void newVersusCartPending() {
		assertThat(TableSession.resolveResumeState(0, List.of(), null))
				.isEqualTo(TableSessionResumeState.New);
		assertThat(TableSession.resolveResumeState(3, List.of(), null))
				.isEqualTo(TableSessionResumeState.CartPending);
	}

	@Test
	@DisplayName("Đơn đang chạy -> OrderInProgress; đơn đã xong hết -> ReadyForPayment")
	void orderInProgressVersusReadyForPayment() {
		assertThat(TableSession.resolveResumeState(0, List.of("Preparing"), null))
				.isEqualTo(TableSessionResumeState.OrderInProgress);
		assertThat(TableSession.resolveResumeState(0, List.of("Served"), null))
				.isEqualTo(TableSessionResumeState.ReadyForPayment);
	}

	@Test
	@DisplayName("Đơn đã huỷ không tính là đơn đang chạy")
	void cancelledOrdersDoNotCount() {
		assertThat(TableSession.resolveResumeState(0, List.of("Cancelled"), null))
				.isEqualTo(TableSessionResumeState.New);
		assertThat(TableSession.resolveResumeState(2, List.of("Cancelled"), null))
				.isEqualTo(TableSessionResumeState.CartPending);
	}

	@Test
	@DisplayName("Đang chờ thanh toán thì KHÔNG đẩy khách về giỏ hàng — chống trả tiền hai lần")
	void paymentPendingWinsOverCartAndOrders() {
		assertThat(TableSession.resolveResumeState(5, List.of("Preparing"), "Pending"))
				.isEqualTo(TableSessionResumeState.PaymentPending);
	}

	@Test
	@DisplayName("Đã thanh toán thì thắng mọi trạng thái khác")
	void paidWinsOverEverything() {
		assertThat(TableSession.resolveResumeState(5, List.of("Preparing"), "Paid"))
				.isEqualTo(TableSessionResumeState.Paid);
		assertThat(TableSession.resolveResumeState(5, List.of("Preparing"), "Confirmed"))
				.isEqualTo(TableSessionResumeState.Paid);
	}
}
