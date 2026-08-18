package com.cmc.restaurant.tables;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.TableSessionStatus} (.NET) — stored as the string
 * value itself in the {@code status} column, same as the .NET string-backed enum. */
public final class TableSessionStatus {

	public static final String OPEN = "Open";
	public static final String CLOSED = "Closed";
	public static final String EXPIRED = "Expired";

	private TableSessionStatus() {
	}
}
