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
	@DisplayName("CHUỖI THẬT của MB Bank — dấu gạch bị đổi thành khoảng trắng")
	void findsTheCodeInTheRealMbBankContent() {
		// Chép NGUYÊN VĂN từ thân webhook SePay gửi về, giao dịch #78606855 lúc 21:35:14.
		//
		// Mã QR ghi "CMC INV-20260902-33987CAE". MB Bank lưu thành "CMC INV 20260902 33987CAE" —
		// dấu gạch thành khoảng trắng. Mẫu cũ đòi đúng dấu gạch nên trượt, webhook trả `unmatched`
		// kèm HTTP 200, SePay ghi "thành công", và tiền vào tài khoản thật trong khi hoá đơn nằm
		// chờ duyệt tay. Không có gì báo động — đây là lý do phải có chuỗi THẬT trong phép kiểm,
		// chứ không phải chuỗi tự bịa cho đẹp.
		String thatSuNhanDuoc = "MBVCB.15865148942.401977.CMC INV 20260902 33987CAE.CT tu "
				+ "1041485738 PHAM DUY AN toi 003120082006 DO TUAN ANH tai MB- Ma GD ACSP/ zu401977";

		assertThat(BankTransferReconciler.timMaHoaDon(thatSuNhanDuoc))
				.isEqualTo("INV-20260902-33987CAE");
	}

	@Test
	@DisplayName("Mọi kiểu ngân hàng cắt dấu đều phải tìm ra")
	void survivesEverySeparatorTheBankMightStrip() {
		// Mỗi ngân hàng chuẩn hoá nội dung một kiểu. Chỉ khớp đúng một dạng nghĩa là đổi ngân hàng
		// là hỏng lại, và hỏng ÂM THẦM.
		for (String noiDung : new String[] {
			"CMC INV-20260902-33987CAE",
			"CMC INV 20260902 33987CAE",
			"CMCINV202609023 3987CAE".replace(" ", ""),
			"CMC-INV-20260902-33987CAE",
			"cmc inv 20260902 33987cae",
			"NHAN TU 104 CMC INV 20260902 33987CAE CT tu ABC",
		}) {
			assertThat(BankTransferReconciler.timMaHoaDon(noiDung))
					.as("nội dung: %s", noiDung)
					.isEqualTo("INV-20260902-33987CAE");
		}
	}

	@Test
	@DisplayName("Mã đơn lẻ cũng chịu được việc bị cắt dấu")
	void findsAnOrderCodeWithStrippedSeparators() {
		assertThat(BankTransferReconciler.extractOrderCode("CMC ORD 1001 CT tu ABC"))
				.isEqualTo("ORD-1001");
		assertThat(BankTransferReconciler.extractOrderCode("CMC ORD-1001")).isEqualTo("ORD-1001");
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
