package com.cmc.restaurant.orders.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Bếp làm được bao nhiêu món CÙNG LÚC.
 *
 * <p>Vì sao con số này phải tồn tại: công thức cũ tính chờ thêm bằng
 * {@code soMonDangCho × trungViMotMon}, tức giả định bếp nấu từng món MỘT. Giờ cao điểm 20 món
 * trong hàng đợi, trung vị 10 phút, sẽ cho ra +200 phút — ba tiếng rưỡi cho một bát phở. Mô hình
 * đó sai đúng vào lúc nó cần đúng nhất.
 *
 * <p>Bếp thật có nhiều tay và nhiều bếp lửa: món nướng, món xào, món nước chạy song song. Chia tải
 * cho số món làm được cùng lúc là mô hình gần thực tế hơn nhiều, và chỉ cần MỘT con số.
 *
 * <p>Mặc định 6 là ước lượng cho một bếp cỡ vừa. Đây là con số NGHIỆP VỤ, không suy được từ mã —
 * quán tự đo rồi chỉnh qua biến môi trường {@code KITCHEN_PARALLEL_DISHES}. Đặt quá cao thì app
 * hứa nhanh hơn thực tế; đặt quá thấp thì khách bỏ đi vì tưởng phải chờ lâu.
 */
@ConfigurationProperties(prefix = "kitchen")
public record KitchenCapacityProperties(Integer parallelDishes, Integer parallelBarItems) {

	public KitchenCapacityProperties {
		// Không cho 0 hoặc âm: cả hai đều làm phép chia bên dưới vô nghĩa, và một cấu hình sai
		// không được phép biến thành ước lượng vô hạn hiện lên màn hình khách.
		if (parallelDishes == null || parallelDishes < 1) {
			parallelDishes = 6;
		}
		// Quầy pha chế nhỏ hơn bếp nhiều: một người làm được vài ly cùng lúc, không phải sáu. Đặt
		// bằng bếp thì mọi ly cà phê đọc ra nhanh gấp ba lần sự thật lúc quán đông.
		if (parallelBarItems == null || parallelBarItems < 1) {
			parallelBarItems = 2;
		}
	}
}
