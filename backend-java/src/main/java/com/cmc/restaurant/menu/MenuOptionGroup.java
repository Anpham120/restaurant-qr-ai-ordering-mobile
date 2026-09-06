package com.cmc.restaurant.menu;

import java.math.BigDecimal;
import java.util.List;

/** Catalog choices; prices are owned by the server and snapshotted when ordered. */
public record MenuOptionGroup(
		String id, String name, int minSelections, int maxSelections, List<Option> options) {
	public record Option(String id, String name, BigDecimal price, boolean isAvailable) {
	}
}
