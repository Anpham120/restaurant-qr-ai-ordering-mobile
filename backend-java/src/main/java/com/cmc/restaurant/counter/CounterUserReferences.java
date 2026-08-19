package com.cmc.restaurant.counter;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Trả lời hai câu hỏi mà module Auth cần khi xoá một tài khoản, và giữ cả hai bên trong Counter.
 *
 * <p>Vì sao không để Auth tự truy vấn bảng ca quầy: luật ở đây là luật về CHỨNG TỪ TIỀN BẠC, không
 * phải luật về tài khoản. Ca quầy ghi ai mở, ai đóng, ai tạo giao dịch điều chỉnh; xoá một tài
 * khoản không được phép làm mất vết đó. Module sở hữu bảng là chỗ duy nhất biết "gán lại" nghĩa là
 * gì cho từng cột — cùng lý do với cổng {@code OrderLookup} ở #80.
 */
@Service
public class CounterUserReferences {

	private final CounterShiftRepository shiftRepository;
	private final CounterShiftTransactionRepository transactionRepository;

	public CounterUserReferences(
			CounterShiftRepository shiftRepository,
			CounterShiftTransactionRepository transactionRepository) {
		this.shiftRepository = shiftRepository;
		this.transactionRepository = transactionRepository;
	}

	/** True khi còn ca hoặc giao dịch quầy trỏ tới tài khoản này. */
	public boolean existFor(String userId) {
		return shiftRepository.existsByOpenedByUserIdOrClosedByUserId(userId, userId)
				|| transactionRepository.existsByCreatedByUserId(userId);
	}

	/**
	 * Chuyển mọi tham chiếu từ {@code userId} sang {@code fallbackUserId}.
	 *
	 * <p>Ba cột xử lý KHÁC nhau, và đây là chỗ port dễ sai nhất:
	 * <ul>
	 *   <li>{@code opened_by_user_id} — NOT NULL, nên phải gán sang tài khoản dự phòng.</li>
	 *   <li>{@code created_by_user_id} của giao dịch — NOT NULL, gán sang tài khoản dự phòng.</li>
	 *   <li>{@code closed_by_user_id} — cho phép NULL, nên trả về null chứ KHÔNG gán sang người
	 *       khác. Gán bừa sẽ ghi rằng một Admin đã đóng ca mà họ chưa từng đóng.</li>
	 * </ul>
	 */
	@Transactional
	public void reassign(String userId, String fallbackUserId) {
		for (CounterShiftEntity shift : shiftRepository.findByOpenedByUserId(userId)) {
			shift.reassignOpenedBy(fallbackUserId);
		}
		for (CounterShiftEntity shift : shiftRepository.findByClosedByUserId(userId)) {
			shift.clearClosedBy();
		}
		for (CounterShiftTransactionEntity tx : transactionRepository.findByCreatedByUserId(userId)) {
			tx.reassignCreatedBy(fallbackUserId);
		}
	}
}
