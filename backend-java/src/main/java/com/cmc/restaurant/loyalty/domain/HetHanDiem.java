package com.cmc.restaurant.loyalty.domain;

/**
 * Điểm quá 12 tháng thì hết hạn — tính bằng số học trên sổ, không cần theo dõi từng lô.
 *
 * <p>Cách làm hiển nhiên là gắn cho mỗi lô tích một cột "còn lại" rồi trừ dần khi khách đổi. Cách
 * đó thêm một nguồn sự thật thứ hai bên cạnh {@code loyalty_members.points}, và hai nguồn thì sẽ có
 * ngày lệch nhau.
 *
 * <p>Không cần thế. Khách luôn tiêu điểm cũ trước — đó là định nghĩa của FIFO, không phải một lựa
 * chọn cần lưu lại. Nên chỉ cần hai tổng chạy:
 *
 * <pre>
 *   hết hạn = (tổng điểm tích QUÁ 12 tháng) − (tổng điểm đã tiêu từ trước tới nay)
 * </pre>
 *
 * <p>Phần đã tiêu bao giờ cũng ăn vào các lô cũ nhất, nên hiệu số này chính là phần còn sót lại
 * của các lô đã quá hạn. Âm nghĩa là khách đã tiêu hết chỗ cũ và đang tiêu sang lô mới — không có
 * gì hết hạn.
 */
public final class HetHanDiem {

	private HetHanDiem() {
	}

	/**
	 * @param tichQua12Thang tổng điểm ACCRUE có ngày tích cũ hơn 12 tháng
	 * @param daTieuTatCa    tổng điểm đã tiêu (REDEEM) và đã hết hạn (EXPIRE) từ trước tới nay
	 * @return số điểm phải xoá ngay bây giờ, không bao giờ âm
	 */
	public static int canXoa(int tichQua12Thang, int daTieuTatCa) {
		return Math.max(0, tichQua12Thang - daTieuTatCa);
	}
}
