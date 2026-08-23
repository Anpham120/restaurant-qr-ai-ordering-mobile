package com.cmc.restaurant.orders.application;

import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import com.cmc.restaurant.orders.domain.OrderItemStatus;
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

	public OrderItemEstimationService(
			OrderItemRepository orderItemRepository, KitchenCapacityProperties capacity) {
		this.orderItemRepository = orderItemRepository;
		this.capacity = capacity;
	}

	/**
	 * @param lowMinutes  đầu thấp của khoảng
	 * @param highMinutes đầu cao của khoảng
	 * @param bepDong     hàng đợi đang là thứ quyết định thời gian, không phải bản thân món
	 */
	public record Estimate(int lowMinutes, int highMinutes, boolean bepDong) {
	}

	public Optional<Estimate> estimate(String menuItemId) {
		Integer prep = menuItemId == null
				? null
				: orderItemRepository.findPrepMinutes(menuItemId).orElse(null);
		// Bếp chưa khai món này. KHÔNG suy từ món khác, không lấy trung bình thực đơn: một con số
		// mượn của món khác vẫn là một con số bịa, chỉ khó phát hiện hơn.
		if (prep == null || prep <= 0) {
			return Optional.empty();
		}

		// TRỪ chính món này ra khỏi tải bếp: nó cũng đang ở trạng thái Pending nên nằm trong tổng,
		// nhưng khách không phải chờ chính món mình nấu xong rồi mới bắt đầu nấu nó.
		//
		// Đo trước khi sửa: bếp trống, một món khai 15 phút, ước lượng ra 13–22 phút. Phần thừa
		// đúng bằng 15/6 = 2,5 phút của chính nó. Sai nhỏ lúc vắng, nhưng nó là loại sai khiến
		// người đọc mất tin vào cả công thức.
		long tongViecTrongBep = orderItemRepository.sumPrepMinutesInKitchenQueue();
		double viecXepTruoc = Math.max(0, tongViecTrongBep - prep);
		double cho = viecXepTruoc / capacity.parallelDishes();

		double giua = prep + cho;
		int low = (int) Math.max(1, Math.round(giua * (1 - BIEN_DO)));
		int high = (int) Math.max(low + 1, Math.round(giua * (1 + BIEN_DO)));

		return Optional.of(new Estimate(low, high, cho > prep * NGUONG_BEP_DONG));
	}

	/** Tải bếp lúc này, để màn hình bếp và báo cáo dùng chung một con số với ước lượng. */
	public long soMonDangTrongBep() {
		return orderItemRepository.countByStatusIn(IN_KITCHEN_QUEUE);
	}
}
