package com.cmc.restaurant.payments;

import java.math.BigDecimal;

/**
 * Thân webhook của SePay.
 *
 * <p>Tên trường lấy đúng theo tài liệu SePay. Đặt sai một tên thì Jackson gán {@code null} mà
 * không báo gì, webhook vẫn trả 200, và tiền vào tài khoản nhưng đơn không bao giờ được đánh dấu
 * đã trả — hỏng âm thầm, đúng loại lỗi tệ nhất ở chỗ này.
 *
 * @param transferType    {@code "in"} là tiền vào; {@code "out"} là tiền ra và phải bỏ qua
 * @param transferAmount  số tiền giao dịch
 * @param referenceCode   mã tham chiếu của ngân hàng — khoá chống ghi trùng
 * @param content         nội dung chuyển khoản, nơi chứa mã đơn
 * @param description     bản mô tả dài của ngân hàng; SePay đôi khi chỉ điền trường này
 */
public record SePayDtos(
		Long id,
		String gateway,
		String transactionDate,
		String accountNumber,
		String code,
		String content,
		String transferType,
		BigDecimal transferAmount,
		BigDecimal accumulated,
		String subAccount,
		String referenceCode,
		String description) {

	/** Câu trả lời SePay mong đợi. Trả 200 kèm {@code success: true} thì nó thôi gửi lại. */
	public record WebhookResponse(boolean success, String outcome, String orderCode, String detail) {
	}
}
