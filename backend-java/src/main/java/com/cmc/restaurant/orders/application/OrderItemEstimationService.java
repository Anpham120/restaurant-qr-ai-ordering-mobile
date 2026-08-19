package com.cmc.restaurant.orders.application;

import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Hạn chế #10 — measures per-OrderItem prep duration ({@code ready_at - created_at}, see
 * {@link OrderItemEntity#getReadyAt()}) and turns it into a customer-facing estimate. No .NET
 * equivalent exists — the original team deliberately shipped without one ("a wrong estimate hurts
 * trust more than no estimate"). This ports the plan's three required risk controls (§6 mục #10)
 * so that decision isn't repeated blindly:
 * <ol>
 *   <li>Only returned once the menu item has {@value #MIN_SAMPLES}+ historical samples — a new or
 *       rarely-ordered item yields {@link Optional#empty()} rather than a guess.</li>
 *   <li>Always a range (p25–p75 of historical samples), never a single fabricated-precision
 *       number.</li>
 *   <li>Adjusted for the kitchen's current queue depth, not just the item's own historical
 *       average — the range is shifted by {@code queueDepth * global median item time}.</li>
 * </ol>
 */
@Service
public class OrderItemEstimationService {

	private static final int MIN_SAMPLES = 20;
	private static final int MAX_ITEM_SAMPLES = 200;
	private static final int MAX_GLOBAL_SAMPLES = 500;

	private final JdbcTemplate jdbcTemplate;

	public OrderItemEstimationService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public record Estimate(int lowMinutes, int highMinutes) {
	}

	public Optional<Estimate> estimate(String menuItemId) {
		List<Double> itemSamples = jdbcTemplate.queryForList(
				"select extract(epoch from (ready_at - created_at)) from order_items "
						+ "where menu_item_id = ? and ready_at is not null order by ready_at desc limit ?",
				Double.class, menuItemId, MAX_ITEM_SAMPLES);

		if (itemSamples.size() < MIN_SAMPLES) {
			return Optional.empty();
		}

		List<Double> sortedItemSamples = itemSamples.stream().sorted().toList();
		double p25Seconds = percentile(sortedItemSamples, 0.25);
		double p75Seconds = percentile(sortedItemSamples, 0.75);

		long queueDepth = jdbcTemplate.queryForObject(
				"select count(*) from order_items where status in ('Pending', 'Preparing')", Long.class);

		// Guaranteed non-empty: itemSamples (>= MIN_SAMPLES rows with ready_at not null) is a subset
		// of this query's result set.
		List<Double> globalSamples = jdbcTemplate.queryForList(
				"select extract(epoch from (ready_at - created_at)) from order_items "
						+ "where ready_at is not null order by ready_at desc limit ?",
				Double.class, MAX_GLOBAL_SAMPLES);
		double medianSeconds = percentile(globalSamples.stream().sorted().toList(), 0.5);
		double queueDelaySeconds = queueDepth * medianSeconds;

		int low = toMinutes(p25Seconds + queueDelaySeconds);
		int high = Math.max(toMinutes(p75Seconds + queueDelaySeconds), low + 1);
		return Optional.of(new Estimate(low, high));
	}

	private static double percentile(List<Double> sorted, double fraction) {
		if (sorted.size() == 1) {
			return sorted.get(0);
		}
		double index = fraction * (sorted.size() - 1);
		int lower = (int) Math.floor(index);
		int upper = (int) Math.ceil(index);
		if (lower == upper) {
			return sorted.get(lower);
		}
		double weight = index - lower;
		return sorted.get(lower) * (1 - weight) + sorted.get(upper) * weight;
	}

	private static int toMinutes(double seconds) {
		return Math.max(1, (int) Math.round(seconds / 60.0));
	}
}
