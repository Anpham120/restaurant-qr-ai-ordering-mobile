package com.cmc.restaurant.tables.domain;

import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Tiền khách đưa và tiền phải thối, cho đường thanh toán tiền mặt tại quầy.
 *
 * <p>Tách khỏi service vì đây là toàn bộ phần dễ sai, và nó phải kiểm được mà không cần cơ sở dữ
 * liệu: một phép trừ sai ở đây là quầy thối nhầm tiền cho khách thật.
 */
public final class TienKhachDua {

	private TienKhachDua() {
	}

	/**
	 * Tiền phải thối lại.
	 *
	 * @param tongHoaDon số tiền hoá đơn
	 * @param khachDua   số tiền khách đưa; {@code null} nghĩa là khách đưa đúng, không phải 0 đồng
	 * @return số tiền thối, hoặc {@code null} khi không có gì để thối
	 */
	public static BigDecimal thoiLai(BigDecimal tongHoaDon, BigDecimal khachDua) {
		if (khachDua == null) {
			// "Không nhập" khác hẳn "nhập 0". Bắt buộc nhập làm chậm quầy ở ca thường gặp nhất —
			// khách đưa đúng tiền — mà không chặn thêm nhầm lẫn nào.
			return null;
		}
		if (tongHoaDon == null) {
			throw ApiException.badRequest("TABLE_INVOICE_TOTAL_MISSING",
					"Hoá đơn chưa có số tiền, không tính được tiền thối.");
		}
		if (khachDua.signum() < 0) {
			throw ApiException.badRequest("CASH_TENDERED_NEGATIVE",
					"Số tiền khách đưa không thể âm.");
		}

		// So sau khi CẮT phần lẻ, đúng cách tiền Việt được đếm ở quầy. Không cắt thì một hoá đơn
		// 35.000,00 và tờ 35.000 có thể lệch nhau vì phần thập phân của kiểu số.
		BigDecimal dua = khachDua.setScale(0, RoundingMode.DOWN);
		BigDecimal can = tongHoaDon.setScale(0, RoundingMode.DOWN);

		if (dua.compareTo(can) < 0) {
			// Cho qua nghĩa là ghi "đã thu đủ" cho một hoá đơn khách trả thiếu, và cuối ca ngăn kéo
			// lệch mà không ai biết lệch ở đâu.
			throw ApiException.badRequest("CASH_TENDERED_TOO_LOW",
					"Khách đưa " + dua.toPlainString() + "đ, thiếu so với hoá đơn "
							+ can.toPlainString() + "đ.");
		}
		return dua.subtract(can);
	}
}
