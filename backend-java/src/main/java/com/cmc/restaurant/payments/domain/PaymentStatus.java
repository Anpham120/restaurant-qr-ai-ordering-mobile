package com.cmc.restaurant.payments.domain;

/** Mirrors {@code RestaurantQrAiOrdering.Enums.PaymentStatus} (.NET). Enum for the same reason the
 * order statuses became enums in issue #60 — names match the database strings exactly, so
 * {@code @Enumerated(STRING)} round-trips the existing column with no migration. */
public enum PaymentStatus {
	NotRequested,
	/**
	 * Có trong bản .NET nhưng THIẾU ở bản Java cho tới #96.
	 *
	 * <p>Không phải giá trị thừa: {@code @Enumerated(EnumType.STRING)} đọc theo TÊN, nên một hàng
	 * {@code payments} mang chuỗi {@code "Unpaid"} — do bản .NET ghi, hoặc do dữ liệu cũ — sẽ làm
	 * bản Java ném lỗi ngay lúc nạp entity, không phải lúc dùng. Thiếu một hằng số enum ở đây là
	 * lỗi đọc dữ liệu, không phải lỗi logic.
	 */
	Unpaid,
	Pending,
	Confirmed,
	/** Set by the counter's end-of-shift reconciliation, not by this module. Treated exactly like
	 * {@code Confirmed} everywhere here: money has arrived. */
	Paid,
	Failed,
	/** Quầy huỷ một yêu cầu thanh toán đang chờ — khách đổi ý hoặc chọn phương thức khác (#96). */
	Cancelled,
	Refunded
}
