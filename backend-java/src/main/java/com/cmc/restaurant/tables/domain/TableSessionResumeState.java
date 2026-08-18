package com.cmc.restaurant.tables.domain;

/** Mirrors {@code TableSessionResumeState} (.NET) enum values exactly (used as a JSON string). */
public enum TableSessionResumeState {
	New,
	CartPending,
	OrderInProgress,
	ReadyForPayment,
	PaymentPending,
	Paid
}
