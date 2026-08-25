package com.cmc.restaurant.loyalty.domain;

import java.math.BigDecimal;

/**
 * Hạng thành viên, xét trên chi tiêu 12 THÁNG GẦN NHẤT.
 *
 * <p>Vì sao không dùng {@code lifetimeSpend} vốn đã có sẵn: nó chỉ cộng dồn và không bao giờ giảm.
 * Xếp hạng bằng nó thì một khách ghé nhiều trong năm 2024 rồi biến mất vẫn giữ hạng cao nhất vĩnh
 * viễn, tức quán trả quyền lợi cho doanh thu đã chết. Mọi chương trình khách quen chạy thật đều
 * dùng cửa sổ trượt; {@code lifetimeSpend} được giữ lại nhưng chỉ để báo cáo.
 *
 * <p>Ngưỡng không chọn cho tròn số mà suy từ hành vi: hoá đơn trung bình của quán khoảng 330.000đ,
 * nên 5 triệu ≈ 15 lần ghé một năm (hơn một lần mỗi tháng) và 15 triệu ≈ 45 lần (gần một lần mỗi
 * tuần). Đó là hai mốc thói quen có thật.
 */
public enum MemberTier {

	BAC("Bạc", 0L, "1.0"),
	VANG("Vàng", 5_000_000L, "1.25"),
	KIM_CUONG("Kim cương", 15_000_000L, "1.5");

	private final String tenHienThi;
	private final BigDecimal nguong;
	private final BigDecimal heSo;

	MemberTier(String tenHienThi, long nguong, String heSo) {
		this.tenHienThi = tenHienThi;
		this.nguong = BigDecimal.valueOf(nguong);
		this.heSo = new BigDecimal(heSo);
	}

	/**
	 * Hạng ứng với mức chi tiêu 12 tháng.
	 *
	 * <p>Duyệt từ hạng CAO xuống để một mức chi vượt nhiều ngưỡng vẫn cho đúng hạng cao nhất. Duyệt
	 * từ thấp lên rồi dừng ở ngưỡng đầu tiên khớp là lỗi kinh điển của hàm này.
	 */
	public static MemberTier theoChiTieu(BigDecimal chiTieu12Thang) {
		BigDecimal ct = chiTieu12Thang == null ? BigDecimal.ZERO : chiTieu12Thang;
		MemberTier[] tatCa = values();
		for (int i = tatCa.length - 1; i >= 0; i--) {
			if (ct.compareTo(tatCa[i].nguong) >= 0) {
				return tatCa[i];
			}
		}
		return BAC;
	}

	/** Hạng kế tiếp, hoặc rỗng khi đã ở hạng cao nhất. */
	/**
	 * Hạng này có đạt mức {@code toiThieu} không.
	 *
	 * <p>So sánh theo {@link #ordinal()}, hợp lệ vì các hằng được khai báo từ thấp lên cao và
	 * {@link #theoChiTieu} cũng dựa vào đúng thứ tự đó. Chèn một hạng mới sai chỗ sẽ phá cả hai —
	 * {@code MemberTierTest} có một phép kiểm giữ bất biến này.
	 */
	public boolean datToiThieu(MemberTier toiThieu) {
		return toiThieu == null || this.ordinal() >= toiThieu.ordinal();
	}

	public MemberTier ke() {
		int i = ordinal() + 1;
		return i < values().length ? values()[i] : null;
	}

	/**
	 * Còn phải chi bao nhiêu nữa để lên hạng kế tiếp. Trả 0 khi đã ở hạng cao nhất.
	 *
	 * <p>Không bao giờ trả số âm: màn hình hiện thẳng con số này cho khách, và "còn -200.000đ" là
	 * câu vô nghĩa.
	 */
	public static BigDecimal conThieuDeLenHang(BigDecimal chiTieu12Thang) {
		BigDecimal ct = chiTieu12Thang == null ? BigDecimal.ZERO : chiTieu12Thang;
		MemberTier ke = theoChiTieu(ct).ke();
		if (ke == null) {
			return BigDecimal.ZERO;
		}
		return ke.nguong.subtract(ct).max(BigDecimal.ZERO);
	}

	public String tenHienThi() {
		return tenHienThi;
	}

	public BigDecimal nguong() {
		return nguong;
	}

	/** Hệ số nhân điểm của hạng này. */
	public BigDecimal heSo() {
		return heSo;
	}
}
