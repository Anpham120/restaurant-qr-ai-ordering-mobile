package com.cmc.restaurant.chat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Giới hạn tần suất cho chat — port của {@code ChatRateLimiter.cs} (.NET).
 *
 * <p>Vì sao cần: chat là endpoint DUY NHẤT gọi sang dịch vụ AI, tức mỗi lượt tốn tài nguyên mô hình
 * chứ không chỉ tốn một truy vấn cơ sở dữ liệu. Không có hàng rào thì một khách giữ token phiên chat
 * hợp lệ có thể bơm tải và chi phí không giới hạn.
 *
 * <p>Bản Java trước đây KHÔNG có lớp này. Bảng kiểm kê endpoint không thấy được chỗ thiếu: hai bản
 * cùng đường dẫn, cùng hình dạng phản hồi, chỉ khác một bên có hàng rào — đúng loại chênh lệch mà
 * phép đối chiếu 1:1 theo đường dẫn bỏ qua.
 *
 * <p>Hai hạn mức, hai mục đích khác nhau:
 *
 * <ul>
 *   <li>{@code 10 lượt/phút} chặn bơm dồn dập.</li>
 *   <li>{@code 100 lượt/phiên} chặn rút cạn từ từ — một khách gửi đều 9 tin mỗi phút suốt buổi
 *       không bao giờ chạm trần thứ nhất.</li>
 * </ul>
 *
 * <p>Khoá theo {@code chatSessionId}, và nơi gọi phải kiểm token TRƯỚC khi hỏi lớp này. Ngược lại
 * thì một người lạ đoán được mã phiên sẽ đốt hết hạn mức của khách đang ngồi ở bàn — biến một hàng
 * rào chống lạm dụng thành một công cụ tấn công. Bản .NET cũng đặt đúng thứ tự đó.
 */
@Component
public class ChatRateLimiter {

	static final int MOI_PHUT = 10;
	static final int MOI_PHIEN = 100;

	private static final Duration CUA_SO = Duration.ofMinutes(1);

	/**
	 * Bỏ hẳn một phiên khỏi bộ nhớ sau 4 giờ không dùng.
	 *
	 * <p>KHÁC bản .NET có chủ đích: nó không bao giờ dọn, nên bộ đếm phình theo tổng số phiên chat
	 * từng tồn tại và chỉ trở về 0 khi khởi động lại tiến trình. Trên một máy chủ chạy nhiều tháng
	 * đó là rò rỉ bộ nhớ chậm.
	 *
	 * <p>Chọn 4 giờ vì đó đúng bằng thời gian sống của một phiên bàn ({@code expiresAt = mở + 4h}),
	 * nên trần {@code 100 lượt/phiên} vẫn có hiệu lực suốt đời một phiên thật. Dọn sớm hơn sẽ cấp
	 * lại hạn mức cho phiên còn sống — tức tự phá chính hàng rào này.
	 */
	private static final Duration HET_HAN = Duration.ofHours(4);

	private final Clock clock;
	private final Map<String, Gio> gio = new ConcurrentHashMap<>();

	public ChatRateLimiter() {
		this(Clock.systemUTC());
	}

	/** Cho test bơm đồng hồ vào: kiểm cửa sổ trượt bằng cách CHỜ THẬT sẽ làm bộ test dài hàng phút
	 * và thỉnh thoảng đỏ vì máy chạy chậm. */
	ChatRateLimiter(Clock clock) {
		this.clock = clock;
	}

	/**
	 * @return true nếu lượt này được phép; false nghĩa là nơi gọi phải trả 429 và KHÔNG làm gì thêm
	 */
	public boolean tryAcquire(String chatSessionId) {
		Instant now = clock.instant();
		donRac(now);

		Gio g = gio.computeIfAbsent(chatSessionId, k -> new Gio());
		synchronized (g) {
			g.chamLan = now;
			// Bỏ các mốc đã ra khỏi cửa sổ một phút. Dùng hàng đợi hai đầu vì mốc thêm vào luôn mới
			// nhất, nên chỉ cần bỏ từ đầu — không phải quét cả danh sách như bản .NET.
			while (!g.mocs.isEmpty() && Duration.between(g.mocs.peekFirst(), now).compareTo(CUA_SO) > 0) {
				g.mocs.pollFirst();
			}
			if (g.mocs.size() >= MOI_PHUT || g.tong >= MOI_PHIEN) {
				return false;
			}
			g.mocs.addLast(now);
			g.tong += 1;
			return true;
		}
	}

	private void donRac(Instant now) {
		for (Iterator<Map.Entry<String, Gio>> it = gio.entrySet().iterator(); it.hasNext();) {
			Gio g = it.next().getValue();
			Instant cham;
			synchronized (g) {
				cham = g.chamLan;
			}
			if (cham != null && Duration.between(cham, now).compareTo(HET_HAN) > 0) {
				it.remove();
			}
		}
	}

	private static final class Gio {
		private final Deque<Instant> mocs = new ArrayDeque<>();
		private int tong;
		private Instant chamLan;
	}
}
