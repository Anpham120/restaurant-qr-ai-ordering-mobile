package com.cmc.restaurant.loyalty.domain;

/**
 * Normalisation for the phone number a loyalty account is keyed by. Ported from
 * {@code PromotionCalculator.NormalizePhone} (.NET) — it lives in Promotions there only because
 * that is where it happened to be written first; keying loyalty accounts is a loyalty concern.
 *
 * <p>Keeping digits only matters because the same customer types their number differently every
 * visit ({@code 0901 234 567}, {@code 0901-234-567}, {@code +84901234567}). Storing what they typed
 * would silently create a second account and lose their points.
 */
public final class PhoneNumber {

	private PhoneNumber() {
	}

	/** Digits only, or null when there are none. */
	public static String normalize(String phoneNumber) {
		if (phoneNumber == null || phoneNumber.isBlank()) {
			return null;
		}
		StringBuilder digits = new StringBuilder();
		for (char c : phoneNumber.toCharArray()) {
			if (Character.isDigit(c)) {
				digits.append(c);
			}
		}
		return digits.isEmpty() ? null : digits.toString();
	}
}
