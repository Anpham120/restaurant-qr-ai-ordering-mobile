package com.cmc.restaurant.tables;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;

/**
 * Cấp mã QR mới cho một bàn — mirror {@code Data/TableQrTokenRotator.cs} (.NET), #91.
 *
 * <p>32 byte ngẫu nhiên mã hoá base64url không đệm, đúng cùng thuật toán và cùng độ dài với bản
 * .NET và với token truy cập đơn hàng ({@code OrderService.generateAccessToken}). Giữ nguyên độ
 * dài là điều kiện để hai bản backend đọc được QR do bản kia in ra.
 *
 * <p>{@link SecureRandom} chứ không phải {@code Random}: token này là chứng cứ duy nhất cho việc
 * khách đang ngồi tại bàn, nên đoán được token là ngồi được vào phiên của bàn khác.
 */
final class TableQrTokenRotator {

	private static final SecureRandom RANDOM = new SecureRandom();

	private TableQrTokenRotator() {
	}

	/** Ghi token mới vào bàn và cập nhật {@code updatedAt}. Trả về token vừa cấp. */
	static String rotate(RestaurantTableEntity table, OffsetDateTime now) {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		table.replaceQrToken(token);
		table.touch(now);
		return token;
	}
}
