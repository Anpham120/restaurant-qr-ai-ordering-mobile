package com.cmc.restaurant.reports;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Mirrors the report contracts of .NET. */
public final class ReportDtos {

	private ReportDtos() {
	}

	public record TopItemResponse(String menuItemId, String name, int quantitySold, BigDecimal revenue) {
	}

	public record DailyRevenueResponse(String date, int orderCount, BigDecimal revenue) {
	}

	public record SummaryResponse(
			OffsetDateTime from, OffsetDateTime to, int totalOrders, int paidOrders,
			BigDecimal grossRevenue, BigDecimal totalDiscount, BigDecimal netRevenue,
			List<TopItemResponse> topItems, List<DailyRevenueResponse> dailyRevenue) {
	}
}
