package com.cmc.restaurant.loyalty.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Trần đổi điểm cho MỘT hoá đơn.
 *
 * <p>Không có trần thì một khách gom điểm cả năm có thể đổi gần hết một bữa ăn, và quán mất trắng
 * giá vốn của bữa đó. Chương trình khách quen được thiết kế để tăng số lần ghé, không phải để tài
 * trợ một bữa miễn phí.
 *
 * <p>Hai giới hạn cùng lúc, lấy cái NHỎ HƠN:
 *
 * <ul>
 *   <li>{@code 30%} giá trị hoá đơn — giữ tỷ lệ, để hoá đơn nhỏ không bị đổi gần hết;
 *   <li>{@code 200.000đ} tuyệt đối — chặn trần trên, để một hoá đơn rất to không mở ra một khoản
 *       giảm rất to.
 * </ul>
 *
 * <p>Chỉ 30% thì hoá đơn 3 triệu cho phép giảm 900.000đ. Chỉ 200.000đ thì hoá đơn 250.000đ cho
 * phép giảm 200.000đ, tức 80%. Mỗi giới hạn một mình đều hở ở một đầu.
 */
public final class TranDoiDiem {

	/** Phần trăm tối đa của hoá đơn. */
	public static final BigDecimal TY_LE = new BigDecimal("0.30");

	/** Số tiền tối đa cho một lần đổi. */
	public static final BigDecimal TRAN_TUYET_DOI = BigDecimal.valueOf(200_000);

	private TranDoiDiem() {
	}

	/** Số tiền tối đa được phép trừ khỏi hoá đơn này. */
	public static BigDecimal toiDaChoHoaDon(BigDecimal tongHoaDon) {
		if (tongHoaDon == null || tongHoaDon.signum() <= 0) {
			return BigDecimal.ZERO;
		}
		return tongHoaDon.multiply(TY_LE).setScale(0, RoundingMode.DOWN).min(TRAN_TUYET_DOI);
	}

	/** Khoản giảm này có nằm trong trần của hoá đơn không. */
	public static boolean chapNhan(BigDecimal giaTriGiam, BigDecimal tongHoaDon) {
		if (giaTriGiam == null || giaTriGiam.signum() <= 0) {
			return false;
		}
		return giaTriGiam.compareTo(toiDaChoHoaDon(tongHoaDon)) <= 0;
	}
}
