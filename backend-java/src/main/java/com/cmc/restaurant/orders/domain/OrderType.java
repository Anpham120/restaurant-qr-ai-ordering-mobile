package com.cmc.restaurant.orders.domain;

import java.util.Optional;

/**
 * Cách khách nhận món. Tên được lưu nguyên văn xuống {@code orders.order_type}.
 *
 * <p>Chỉ hai kênh: khách ngồi tại quán, hoặc khách tới quầy mua mang về. Không có đặt trước từ xa
 * và không có giao tận nhà — xem {@code docs/pm/CHOT_NGHIEP_VU_QUAN_P0.md} §1.
 */
public enum OrderType {
	DineIn,
	Takeaway;

	/**
	 * Đọc giá trị client gửi, hoặc giá trị đã lưu trong cơ sở dữ liệu.
	 *
	 * <p>{@code Pickup} là tên CŨ của {@code Takeaway}, nhận ở đây làm đường lùi cho hàng đã ghi
	 * trước lúc đổi tên. Không nhận {@code Delivery}: giao tận nhà đã ra khỏi phạm vi, và một đơn
	 * mang nhãn đó là dữ liệu cần người xem chứ không phải thứ đọc bừa thành loại khác.
	 */
	public static Optional<OrderType> parse(String value) {
		if (value == null) {
			return Optional.empty();
		}
		String tho = value.trim();
		if ("Pickup".equalsIgnoreCase(tho)) {
			return Optional.of(Takeaway);
		}
		for (OrderType candidate : values()) {
			if (candidate.name().equalsIgnoreCase(tho)) {
				return Optional.of(candidate);
			}
		}
		return Optional.empty();
	}

	/** Đơn mang về phải thu đủ tiền rồi mới được vào hàng chuẩn bị. */
	public boolean requiresPrepayment() {
		return this == Takeaway;
	}
}
