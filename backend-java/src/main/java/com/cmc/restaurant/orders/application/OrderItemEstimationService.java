package com.cmc.restaurant.orders.application;

import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
import com.cmc.restaurant.orders.domain.TramChuanBi;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * Ước lượng bao giờ món lên bàn (hạn chế #10).
 *
 * <h2>Vì sao viết lại</h2>
 *
 * <p>Bản đầu thuần thống kê: cần 20 mẫu lịch sử cho TỪNG món. Đo trên hệ thống đang chạy khi viết
 * lại — <b>0 mẫu</b>, nên tính năng chưa từng hiện một con số nào. Với quán mới mở hoặc món ít
 * gọi, nó sẽ im lặng hàng tuần.
 *
 * <p>Và phần tính tải bếp có một lỗi mô hình nặng hơn:
 *
 * <pre>choThem = soMonDangCho × trungViMotMon</pre>
 *
 * <p>Công thức đó giả định bếp nấu <b>từng món một</b>. Giờ cao điểm 20 món trong hàng đợi, trung
 * vị 10 phút, cho ra <b>+200 phút</b> — ba tiếng rưỡi cho một bát phở. Nó sai đúng vào lúc cần
 * đúng nhất, tức lúc quán đông.
 *
 * <h2>Mô hình mới</h2>
 *
 * <pre>
 *   chờ  = tổng prep_minutes của mọi món bếp đang làm ÷ số món bếp làm song song
 *   ước lượng = chờ + prep_minutes của món này
 * </pre>
 *
 * <p>Ba điều kiện của #10 vẫn giữ nguyên:
 * <ol>
 *   <li><b>Không đoán bừa</b> — món chưa khai {@code prep_minutes} thì KHÔNG có ước lượng. Ngưỡng
 *       "20 mẫu" đổi thành "bếp đã khai chưa", nhưng tinh thần y hệt: thà im lặng còn hơn bịa.</li>
 *   <li><b>Luôn là khoảng</b>, không bao giờ một con số chính xác giả tạo.</li>
 *   <li><b>Có tính tải bếp</b> — giờ tính đúng, theo tổng công việc chứ không theo đầu món.</li>
 * </ol>
 */
@Service
public class OrderItemEstimationService {

	/** Món đã nhận nhưng bếp chưa trả xong — chính là tải của bếp lúc này. */
	private static final Set<OrderItemStatus> IN_KITCHEN_QUEUE =
			Set.of(OrderItemStatus.Pending, OrderItemStatus.Preparing);

	/**
	 * Bề rộng khoảng: ±25% quanh giá trị ước tính.
	 *
	 * <p>Không lấy từ dữ liệu vì chưa có dữ liệu. Đây là cách nói "chúng tôi không biết chính xác"
	 * bằng con số — và nó phải đủ rộng để không hứa hão, đủ hẹp để còn có ích. Một khoảng 5–45
	 * phút thì thà đừng hiện.
	 */
	private static final double BIEN_DO = 0.25;

	/**
	 * Ngưỡng báo "bếp đang đông": chờ hàng đợi vượt quá thời gian nấu chính món đó.
	 *
	 * <p>Đặt theo TỶ LỆ chứ không theo phút cố định, vì "chờ thêm 10 phút" nghĩa khác hẳn nhau
	 * giữa món cuốn 5 phút và món quay 35 phút. Khi phần chờ đã lớn hơn phần nấu, thứ quyết định
	 * thời gian không còn là món ăn nữa mà là hàng người đang xếp trước — và khách có quyền biết
	 * điều đó.
	 */
	private static final double NGUONG_BEP_DONG = 1.0;

	private final OrderItemRepository orderItemRepository;
	private final KitchenCapacityProperties capacity;
	private final KitchenDelayService kitchenDelay;

	public OrderItemEstimationService(
			OrderItemRepository orderItemRepository,
			KitchenCapacityProperties capacity,
			KitchenDelayService kitchenDelay) {
		this.orderItemRepository = orderItemRepository;
		this.capacity = capacity;
		this.kitchenDelay = kitchenDelay;
	}

	/**
	 * @param lowMinutes  đầu thấp của khoảng
	 * @param highMinutes đầu cao của khoảng
	 * @param bepDong     hàng đợi đang là thứ quyết định thời gian, không phải bản thân món
	 */
	public record Estimate(int lowMinutes, int highMinutes, boolean bepDong) {
	}

	/**
	 * Trạng thái bếp tại một thời điểm, chụp MỘT lần rồi dùng cho mọi món trong cùng một lượt trả.
	 *
	 * <p>Trước đây mỗi món tự đi hỏi hai con số này. Chúng giống hệt nhau cho mọi món trong cùng
	 * một yêu cầu, nên đơn tám món sinh tám câu tổng tải bếp trả về đúng một kết quả. Trên Bảng Bếp
	 * — nơi trả về hàng chục đơn và tự làm mới mỗi năm giây — con số đó nhân lên rất nhanh.
	 *
	 * <p>Chụp một lần còn đúng hơn về nghĩa: mọi món trong một lượt trả phải được tính trên CÙNG
	 * một trạng thái bếp. Hỏi lại giữa chừng thì hai món cạnh nhau có thể dựa trên hai tải khác
	 * nhau, và không có gì nói cho người đọc biết vì sao.
	 *
	 * @param viecTheoTram tổng prep_minutes đang chờ, tách theo TRẠM
	 * @param treBepKhai       số phút bếp tự khai thêm (#142)
	 */
	public record TaiBep(Map<TramChuanBi, Long> viecTheoTram, int treBepKhai) {

		public long viecCua(TramChuanBi tram) {
			return viecTheoTram.getOrDefault(tram, 0L);
		}
	}

	/** Chụp trạng thái các trạm. Gọi một lần cho mỗi lượt trả, không phải cho mỗi món. */
	public TaiBep chupTaiBep() {
		Map<TramChuanBi, Long> theoTram = new EnumMap<>(TramChuanBi.class);
		for (OrderItemRepository.DongHangDoi d : orderItemRepository.hangDoiTheoMon()) {
			TramChuanBi tram = TramChuanBi.cua(tachNhan(d.getNhan()), d.getMaDanhMuc());
			theoTram.merge(tram, d.getTongPhut(), Long::sum);
		}
		return new TaiBep(theoTram, kitchenDelay.phutTreHienTai());
	}

	/** Chuỗi nhãn nối bằng dấu phẩy, dạng cơ sở dữ liệu trả về. Rỗng thì không có nhãn nào. */
	private static List<String> tachNhan(String noiBangPhay) {
		if (noiBangPhay == null || noiBangPhay.isBlank()) {
			return List.of();
		}
		return List.of(noiBangPhay.split(","));
	}

	public Optional<Estimate> estimate(String menuItemId, TaiBep tai) {
		Integer prep = menuItemId == null
				? null
				: orderItemRepository.findPrepMinutes(menuItemId).orElse(null);
		// Bếp chưa khai món này. KHÔNG suy từ món khác, không lấy trung bình thực đơn: một con số
		// mượn của món khác vẫn là một con số bịa, chỉ khó phát hiện hơn.
		if (prep == null || prep <= 0) {
			return Optional.empty();
		}

		TramChuanBi tram = orderItemRepository.timNhanDanhMuc(menuItemId)
				.map(n -> TramChuanBi.cua(tachNhan(n.getNhan()), n.getMaDanhMuc()))
				.orElse(TramChuanBi.BEP);

		// Món LẤY SẴN không xếp hàng. Mở tủ lạnh lấy sáu chai bia là mở tủ MỘT lần, không phải sáu
		// lần nối tiếp — mô hình hàng đợi không mô tả được việc đó, nên đừng áp nó vào.
		//
		// Đo trên thực đơn thật, ca tối 31 món: một hàng đợi cho cả quán báo ly bia 30–49 phút; tách
		// hai trạm vẫn còn 14–24 phút; chỉ khi bỏ hẳn hàng đợi cho lớp này mới ra 2–4 phút.
		double cho;
		if (tram.coHangDoi()) {
			// TRỪ chính món này ra khỏi tải trạm: nó cũng đang Pending nên nằm trong tổng, nhưng
			// khách không phải chờ chính món mình nấu xong rồi mới bắt đầu nấu nó.
			double viecXepTruoc = Math.max(0, tai.viecCua(tram) - prep);
			cho = viecXepTruoc / soLamSongSong(tram);
		} else {
			cho = 0;
		}

		// Phần bếp tự khai (#142). Hàng đợi ở trên chỉ đo được thứ đã đi qua ứng dụng; đầu bếp
		// nghỉ ốm, hỏng lò, đoàn đặt trước đang làm ở trong thì không nằm trong bất kỳ đơn nào.
		// Đây là chỗ duy nhất con người nói ra được phần máy không thấy.
		// CHỈ áp cho món của BẾP. Nút này nằm ở màn bếp và người bấm là người đứng bếp — đầu bếp
		// nghỉ ốm, hỏng lò, đoàn đặt trước đang làm ở trong. Không việc nào trong số đó làm chậm ly
		// bia hay ly cà phê.
		//
		// Suýt bỏ sót: bản đầu của chính lượt tách trạm này vẫn cộng độ trễ cho mọi món, nên bếp bấm
		// "+20 phút" là ly bia đọc ra 21–24 phút KÈM câu "bếp đang đông" — đúng cái vô lý mà cả
		// việc tách trạm sinh ra để dẹp.
		int treBepKhai = tram == TramChuanBi.BEP ? tai.treBepKhai() : 0;

		// Biên độ ±25% CHỈ áp lên phần máy tự tính, rồi mới cộng phần bếp khai vào cả hai đầu.
		//
		// Bản trước cộng trước rồi mới nhân biên độ, nên bếp bấm "+20 phút" bị hệ thống dịch thành
		// "khoảng 15 tới 25 phút". Biên độ sinh ra để nói MÁY KHÔNG CHẮC, không phải để nghi ngờ
		// lời người vừa khai. Người trực bếp nói một con số dứt khoát thì phải giữ nguyên con số
		// đó, nếu không cái nút mất ý nghĩa: bấm 20 mà ra 25 thì lần sau họ bấm 30.
		double giua = prep + cho;
		int low = (int) Math.max(1, Math.round(giua * (1 - BIEN_DO))) + treBepKhai;
		int high = (int) Math.round(giua * (1 + BIEN_DO)) + treBepKhai;
		if (high <= low) {
			high = low + 1;
		}

		// Bếp đã tự khai trễ thì luôn báo cho khách, không xét thêm ngưỡng: người trực bếp bấm nút
		// đó chính là để khách biết. Bỏ vế này đi thì con số nhảy lên mà không kèm lý do, và khách
		// sẽ kết luận ứng dụng hỏng chứ không kết luận quán đang đông.
		boolean bepDong = treBepKhai > 0 || cho > prep * NGUONG_BEP_DONG;
		return Optional.of(new Estimate(low, high, bepDong));
	}

	/**
	 * Số món một trạm làm được cùng lúc.
	 *
	 * <p>Hai con số này là CẤU HÌNH, không phải hằng số của nghiệp vụ — quán tự đo rồi chỉnh. Quầy
	 * nhỏ hơn bếp nhiều: một người pha chế làm được vài ly cùng lúc, không phải sáu.
	 */
	private int soLamSongSong(TramChuanBi tram) {
		return tram == TramChuanBi.QUAY ? capacity.parallelBarItems() : capacity.parallelDishes();
	}

	/** Tải bếp lúc này, để màn hình bếp và báo cáo dùng chung một con số với ước lượng. */
	public long soMonDangTrongBep() {
		return orderItemRepository.countByStatusIn(IN_KITCHEN_QUEUE);
	}
}
