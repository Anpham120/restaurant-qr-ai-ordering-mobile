package com.cmc.restaurant.payments;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Nhận ra mã hoá đơn bàn trong nội dung chuyển khoản.
 *
 * <p><b>LỖI CÓ THẬT, đo trên máy chủ đang chạy trước khi sửa:</b>
 *
 * <pre>
 *   "CMC INV-20260830-E7BF30C3"  → unmatched          ← chính chuỗi mà mã QR ghi
 *   "CMC ORD-1001"               → amount_mismatch    ← nhận ra đơn
 * </pre>
 *
 * <p>Bộ đối soát chỉ hiểu mã đơn lẻ, trong khi màn thanh toán của khách đi qua hoá đơn bàn vì một
 * bàn có thể gọi nhiều lượt. Hậu quả im lặng hoàn toàn: khách chuyển tiền, tiền về thật, webhook
 * bắn về thật, máy chủ trả 200 — và không hoá đơn nào được đánh dấu đã trả. Tính năng thanh toán
 * tự động chạy đúng ở luồng không ai dùng.
 */
class DoiSoatHoaDonBanTest {

	@Test
	@DisplayName("Nhận ra mã hoá đơn bàn — chuỗi thật lấy từ máy chủ")
	void findsATableInvoiceCode() {
		assertThat(BankTransferReconciler.timMaHoaDon("CMC INV-20260830-E7BF30C3"))
				.isEqualTo("INV-20260830-E7BF30C3");
	}

	@Test
	@DisplayName("Ngân hàng bọc thêm chữ quanh nội dung thì vẫn tìm ra")
	void findsTheCodeInsideTheBankWrapper() {
		// Nội dung thật ngân hàng gửi về không sạch như khách gõ. Neo hai đầu bằng `matches` thay vì
		// `find` là hỏng mọi giao dịch thật trong khi mọi phép kiểm dựng chuỗi sạch vẫn xanh.
		assertThat(BankTransferReconciler.timMaHoaDon(
				"NHAN TU 1041485738 CMC INV-20260830-E7BF30C3 GD 123456"))
				.isEqualTo("INV-20260830-E7BF30C3");
	}

	@Test
	@DisplayName("Không phân biệt hoa thường — ngân hàng hay viết hoa toàn bộ")
	void isCaseInsensitive() {
		assertThat(BankTransferReconciler.timMaHoaDon("cmc inv-20260830-e7bf30c3"))
				.isEqualTo("INV-20260830-E7BF30C3");
	}

	@Test
	@DisplayName("Mã đơn lẻ KHÔNG bị nhận nhầm thành mã hoá đơn, và ngược lại")
	void theTwoPatternsNeverOverlap() {
		// Hai đường ghi tiền khác nhau. Nhận nhầm nghĩa là tra sai bảng rồi trả "không tìm thấy",
		// và tiền vẫn về mà đơn vẫn treo.
		assertThat(BankTransferReconciler.timMaHoaDon("CMC ORD-1001")).isNull();
		assertThat(BankTransferReconciler.extractOrderCode("CMC INV-20260830-E7BF30C3")).isNull();
	}

	@Test
	@DisplayName("Nội dung không có mã nào thì trả null, không ném")
	void returnsNullWhenThereIsNoCode() {
		assertThat(BankTransferReconciler.timMaHoaDon(null)).isNull();
		assertThat(BankTransferReconciler.timMaHoaDon("CHUYEN TIEN AN TRUA")).isNull();
		// Thiếu tiền tố CMC: đây là tiền của ai đó chuyển vì việc khác, không phải của quán.
		assertThat(BankTransferReconciler.timMaHoaDon("INV-20260830-E7BF30C3")).isNull();
	}

	@Test
	@DisplayName("Mã sai định dạng thì KHÔNG khớp — thà không nhận còn hơn nhận nhầm hoá đơn")
	void rejectsMalformedCodes() {
		// Ngày phải đủ 8 chữ số và phần đuôi đủ 8 ký tự hex. Nới lỏng ở đây nghĩa là một chuỗi gần
		// giống sẽ tra ra một hoá đơn KHÁC, tức ghi tiền của người này vào bàn của người kia.
		assertThat(BankTransferReconciler.timMaHoaDon("CMC INV-2026083-E7BF30C3")).isNull();
		assertThat(BankTransferReconciler.timMaHoaDon("CMC INV-20260830-E7BF30")).isNull();
		assertThat(BankTransferReconciler.timMaHoaDon("CMC INV-20260830-ZZZZZZZZ")).isNull();
	}
}
