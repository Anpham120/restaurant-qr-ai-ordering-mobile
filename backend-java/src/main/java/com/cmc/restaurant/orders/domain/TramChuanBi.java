package com.cmc.restaurant.orders.domain;

import java.util.Set;

/**
 * Nơi món được làm ra. Quyết định món xếp hàng SAU những món nào.
 *
 * <h2>Vì sao phải có</h2>
 *
 * <p>Bản trước dùng MỘT hàng đợi cho cả quán: mọi món đang chờ cộng dồn vào một con số, chia cho
 * số món bếp làm song song. Đo trên thực đơn thật, một ca tối 31 món (195 phút việc bếp):
 *
 * <pre>
 *   Bia Hà Nội  →  30–49 phút
 * </pre>
 *
 * <p>Ly bia phải xếp sau ba tiếng việc bếp, trong khi việc thật là mở tủ lạnh. Đây đúng là điều
 * người dùng phàn nàn: "có những món làm rất nhanh nhưng lại ước lượng thời gian lên quá lâu".
 *
 * <h2>Ba trạm, không phải hai</h2>
 *
 * <p>Bản nháp đầu tách hai trạm — bếp và quầy. Chạy thử thì ly bia vẫn ra <b>14–24 phút</b>, vì mô
 * hình hàng đợi giả định việc làm NỐI TIẾP, mà người pha chế lấy sáu chai bia là mở tủ MỘT lần.
 * Nên lớp thứ ba tồn tại: món lấy sẵn KHÔNG xếp hàng, thời gian của nó gần như cố định.
 *
 * <h2>Suy từ dữ liệu sẵn có, không đặt thêm bộ nhãn</h2>
 *
 * <p>Thực đơn 91 món đã tự chia: 57 món mang nhãn {@code method:} (cách chế biến), 34 món không —
 * và 34 món đó rơi đúng vào năm danh mục không món nào chạm tới bếp.
 *
 * <p>Đã cân nhắc thêm ba giá trị {@code method:} mới ({@code brewed}, {@code blended},
 * {@code chilled}) rồi BỎ. {@code method} là nhóm "cách chế biến", có bộ soát CI đối chiếu với TÊN
 * món và nuôi cả dữ liệu AI; "ướp lạnh" không phải một cách chế biến, và khách lọc theo cách chế
 * biến sẽ thấy nó đứng cạnh "Nướng". Một bộ nhãn nói dối để dùng lại cơ chế thì rẻ hôm nay, đắt
 * về sau.
 */
public enum TramChuanBi {

	/** Qua lửa. Xếp hàng thật, và hàng này dài. */
	BEP,

	/** Pha chế tại quầy: cà phê, trà, nước ép, sinh tố. Có xếp hàng nhưng hàng riêng và ngắn. */
	QUAY,

	/** Lấy sẵn: bia, trái cây gọt sẵn, chè và bánh làm theo mẻ. KHÔNG xếp hàng. */
	SAN;

	private static final Set<String> DANH_MUC_QUAY = Set.of("cat_drink", "cat_juice");

	private static final Set<String> DANH_MUC_SAN = Set.of("cat_alcohol", "cat_fruit", "cat_dessert");

	/**
	 * Trạm của một món.
	 *
	 * <p>Có nhãn {@code method:} nghĩa là món qua bếp — nhãn đó CHÍNH LÀ dấu hiệu, không cần hỏi
	 * thêm. Chỉ những món không có nhãn nào mới cần tra danh mục.
	 *
	 * <p>Danh mục lạ rơi về {@link #BEP}. Đó là hướng sai AN TOÀN: báo lâu hơn thực tế thì khách
	 * ngạc nhiên dễ chịu, báo nhanh hơn thực tế thì khách ngồi đợi và mất tin.
	 *
	 * @param nhan       nhãn của món, có thể rỗng
	 * @param maDanhMuc  mã danh mục, có thể {@code null}
	 */
	public static TramChuanBi cua(Iterable<String> nhan, String maDanhMuc) {
		if (nhan != null) {
			for (String t : nhan) {
				if (t != null && t.startsWith("method:")) {
					return BEP;
				}
			}
		}
		if (maDanhMuc == null) {
			return BEP;
		}
		if (DANH_MUC_QUAY.contains(maDanhMuc)) {
			return QUAY;
		}
		if (DANH_MUC_SAN.contains(maDanhMuc)) {
			return SAN;
		}
		return BEP;
	}

	/** Trạm này có xếp hàng không. {@link #SAN} thì không — mở tủ lạnh không phải hàng đợi. */
	public boolean coHangDoi() {
		return this != SAN;
	}
}
