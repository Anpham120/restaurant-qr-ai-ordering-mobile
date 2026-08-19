package com.cmc.restaurant.reports.domain;

import java.time.OffsetDateTime;

/**
 * The window a report covers. Ported from {@code ResolveRange} (.NET).
 *
 * <p>An inverted or empty range falls back to the last 30 days rather than returning nothing: an
 * admin who mistypes a date should see the default report, not a blank screen that looks like the
 * restaurant took no money.
 */
public record ReportRange(OffsetDateTime from, OffsetDateTime to) {

	private static final int DEFAULT_DAYS = 30;

	public static ReportRange resolve(OffsetDateTime from, OffsetDateTime to, OffsetDateTime now) {
		OffsetDateTime resolvedTo = to == null ? now : to;
		OffsetDateTime resolvedFrom = from == null ? resolvedTo.minusDays(DEFAULT_DAYS) : from;
		if (!resolvedFrom.isBefore(resolvedTo)) {
			resolvedFrom = resolvedTo.minusDays(DEFAULT_DAYS);
		}
		return new ReportRange(resolvedFrom, resolvedTo);
	}
}
