package com.cmc.restaurant.tables.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Trần cho TỔNG mọi khoản giảm trên một hoá đơn.
 *
 * <p>Khác với trần đổi điểm — thứ chỉ giới hạn phần khách trả bằng điểm. Hoá đơn có thể mang cùng
 * lúc một mã của quán và một mã đổi bằng điểm, mỗi mã đều nằm trong hạn mức riêng của nó, mà cộng
 * lại vẫn ăn quá sâu vào giá vốn.
 *
 * <p>Ví dụ đã tính: hoá đơn 760.000đ, mã quán giảm 20% (152.000đ) cộng ưu đãi đổi điểm 200.000đ là
 * 352.000đ — gần một nửa hoá đơn, trong khi từng khoản đều hợp lệ.
 *
 * <p>Trần này là chốt cuối, không thay cho trần của từng nguồn. Cắt phần vượt chứ không từ chối cả
 * hoá đơn: khách đã đứng ở quầy chờ trả tiền, và bắt họ bỏ bớt một mã ở khoảnh khắc đó là đổi một
 * khoản lãi nhỏ lấy một trải nghiệm tệ.
 */
public final class TranGiamGiaHoaDon {

	/** Phần trăm hoá đơn tối đa được giảm, gộp mọi nguồn. */
	public static final BigDecimal TY_LE = new BigDecimal("0.50");

	private TranGiamGiaHoaDon() {
	}

	/** Tổng tiền giảm tối đa cho hoá đơn này. */
	public static BigDecimal toiDa(BigDecimal tamTinh) {
		if (tamTinh == null || tamTinh.signum() <= 0) {
			return BigDecimal.ZERO;
		}
		return tamTinh.multiply(TY_LE).setScale(0, RoundingMode.DOWN);
	}

	/**
	 * Cắt tổng giảm về trong trần.
	 *
	 * <p>Trả về phần được giữ lại, không bao giờ âm và không bao giờ vượt tạm tính.
	 */
	public static BigDecimal cat(BigDecimal tongGiam, BigDecimal tamTinh) {
		if (tongGiam == null || tongGiam.signum() <= 0) {
			return BigDecimal.ZERO;
		}
		return tongGiam.min(toiDa(tamTinh));
	}
}
