package com.cmc.restaurant.reports.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RevenueLedgerTest {

	private static final OffsetDateTime DAY1 = OffsetDateTime.parse("2026-08-17T10:00:00Z");
	private static final OffsetDateTime DAY2 = OffsetDateTime.parse("2026-08-18T10:00:00Z");

	private static RevenueLedger.Settlement settlement(OffsetDateTime at, String total) {
		return new RevenueLedger.Settlement(at, new BigDecimal(total), BigDecimal.ZERO, new BigDecimal(total));
	}

	// --- chống đếm hai lần ----------------------------------------------------------------------

	@Test
	@DisplayName("Đơn thuộc phiên ĐÃ có hoá đơn -> KHÔNG tính lại")
	void ordersInsideASettledInvoiceAreNotCountedTwice() {
		List<RevenueLedger.Settlement> perOrder = List.of(
				settlement(DAY1, "100000"), settlement(DAY1, "200000"));
		List<String> sessions = List.of("ts_paid", "ts_other");

		List<RevenueLedger.Settlement> kept =
				RevenueLedger.excludeAlreadyInvoiced(perOrder, sessions, Set.of("ts_paid"));

		assertThat(kept).hasSize(1);
		assertThat(kept.get(0).total()).isEqualByComparingTo("200000");
	}

	@Test
	@DisplayName("Đơn KHÔNG thuộc phiên bàn nào (mang về) vẫn được tính")
	void ordersWithoutASessionStillCount() {
		List<RevenueLedger.Settlement> perOrder = List.of(settlement(DAY1, "50000"));
		List<String> sessions = java.util.Collections.singletonList(null);

		assertThat(RevenueLedger.excludeAlreadyInvoiced(perOrder, sessions, Set.of("ts_paid"))).hasSize(1);
	}

	@Test
	@DisplayName("Không có hoá đơn nào đã thanh toán -> giữ nguyên tất cả")
	void nothingExcludedWhenNoInvoicesSettled() {
		List<RevenueLedger.Settlement> perOrder = List.of(settlement(DAY1, "100000"), settlement(DAY1, "50000"));

		assertThat(RevenueLedger.excludeAlreadyInvoiced(perOrder, List.of("a", "b"), Set.of())).hasSize(2);
	}

	// --- top món --------------------------------------------------------------------------------

	@Test
	@DisplayName("Gộp cùng món qua nhiều đơn, xếp theo số lượng")
	void topItemsGroupAndRank() {
		List<RevenueLedger.SoldItem> items = List.of(
				new RevenueLedger.SoldItem("m1", "Phở", 2, new BigDecimal("110000")),
				new RevenueLedger.SoldItem("m2", "Chè", 5, new BigDecimal("100000")),
				new RevenueLedger.SoldItem("m1", "Phở", 1, new BigDecimal("55000")));

		List<RevenueLedger.TopItem> top = RevenueLedger.topItems(items, 10);

		assertThat(top).hasSize(2);
		assertThat(top.get(0).name()).as("Chè bán 5 phần, hơn Phở 3 phần").isEqualTo("Chè");
		assertThat(top.get(1).quantitySold()).isEqualTo(3);
		assertThat(top.get(1).revenue()).isEqualByComparingTo("165000");
	}

	@Test
	@DisplayName("Giới hạn top N")
	void topItemsRespectLimit() {
		List<RevenueLedger.SoldItem> items = List.of(
				new RevenueLedger.SoldItem("m1", "A", 3, new BigDecimal("30000")),
				new RevenueLedger.SoldItem("m2", "B", 2, new BigDecimal("20000")),
				new RevenueLedger.SoldItem("m3", "C", 1, new BigDecimal("10000")));

		assertThat(RevenueLedger.topItems(items, 2)).hasSize(2);
	}

	// --- doanh thu theo ngày --------------------------------------------------------------------

	@Test
	@DisplayName("Gộp theo ngày, cũ trước mới sau")
	void perDayGroupsAndSorts() {
		List<RevenueLedger.DailyRevenue> days = RevenueLedger.perDay(List.of(
				settlement(DAY2, "300000"), settlement(DAY1, "100000"), settlement(DAY1, "200000")));

		assertThat(days).hasSize(2);
		assertThat(days.get(0).date()).isEqualTo("2026-08-17");
		assertThat(days.get(0).orderCount()).isEqualTo(2);
		assertThat(days.get(0).revenue()).isEqualByComparingTo("300000");
		assertThat(days.get(1).date()).isEqualTo("2026-08-18");
	}

	// --- khoảng thời gian -----------------------------------------------------------------------

	@Test
	@DisplayName("Không truyền gì -> 30 ngày gần nhất")
	void defaultsToLastThirtyDays() {
		ReportRange range = ReportRange.resolve(null, null, DAY2);

		assertThat(range.to()).isEqualTo(DAY2);
		assertThat(range.from()).isEqualTo(DAY2.minusDays(30));
	}

	@Test
	@DisplayName("Khoảng ngược (from sau to) -> quay về mặc định, KHÔNG trả rỗng")
	void invertedRangeFallsBackInsteadOfReturningNothing() {
		ReportRange range = ReportRange.resolve(DAY2.plusDays(5), DAY2, DAY2);

		assertThat(range.from()).as("gõ nhầm ngày không được ra báo cáo trống")
				.isEqualTo(DAY2.minusDays(30));
	}
}
