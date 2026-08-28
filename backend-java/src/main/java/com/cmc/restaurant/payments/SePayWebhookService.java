package com.cmc.restaurant.payments;

import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * Nhận giao dịch ngân hàng từ SePay và đối soát với đơn hàng.
 *
 * <p>Toàn bộ phần "khớp tiền với đơn" dùng lại {@link BankTransferReconciler} — luật tách mã
 * đơn, so số tiền, chống ghi trùng theo mã tham chiếu đã có sẵn ở đó và không phụ thuộc nhà cung
 * cấp. Lớp này chỉ làm hai việc riêng của SePay: kiểm khoá API, và đọc thân request của họ.
 */
@Service
public class SePayWebhookService {

	/** Chỉ tiền VÀO mới là thanh toán. Bỏ sót phép kiểm này thì một lệnh chuyển tiền RA khỏi tài
	 * khoản, tình cờ mang mã đơn trong nội dung, cũng đánh dấu đơn đó đã trả tiền. */
	private static final String TIEN_VAO = "in";

	private final SePayProperties properties;
	private final BankTransferReconciler reconciler;

	public SePayWebhookService(SePayProperties properties, BankTransferReconciler reconciler) {
		this.properties = properties;
		this.reconciler = reconciler;
	}

	/**
	 * Kiểm khoá API trong header {@code Authorization: Apikey ...}.
	 *
	 * <p>Phải chạy TRƯỚC khi nhìn vào thân request: nhận một thân giả nghĩa là đánh dấu đơn đã trả
	 * tiền trong khi không có đồng nào vào tài khoản.
	 */
	public void kiemKhoa(String headerAuthorization) {
		String mongDoi = properties.apiKey();
		if (mongDoi == null || mongDoi.isBlank()) {
			// Chưa cấu hình thì TỪ CHỐI tất cả. Đây là trạng thái an toàn: thà không đối soát tự
			// động còn hơn nhận payload giả. Cùng luật đã đặt cho Casso và AI_INTERNAL_TOKEN.
			throw ApiException.unauthorized("SEPAY_WEBHOOK_NOT_CONFIGURED",
					"SePay webhook chưa được cấu hình trên bản triển khai này.");
		}
		if (headerAuthorization == null) {
			throw sai();
		}
		// SePay gửi đúng dạng "Apikey <khoá>". So cả tiền tố để một header "Bearer <khoá>" gửi
		// nhầm không lọt qua.
		String tienTo = "Apikey ";
		if (!headerAuthorization.startsWith(tienTo)) {
			throw sai();
		}
		if (!soSanhDeuThoiGian(mongDoi, headerAuthorization.substring(tienTo.length()))) {
			throw sai();
		}
	}

	/**
	 * Đối soát một giao dịch.
	 *
	 * <p>SePay gửi MỘT giao dịch mỗi lần gọi, khác Casso gửi cả mảng.
	 */
	public SePayDtos.WebhookResponse xuLy(SePayDtos than) {
		if (than == null) {
			return new SePayDtos.WebhookResponse(true, "ignored", null, "Thân request rỗng.");
		}
		if (!TIEN_VAO.equalsIgnoreCase(than.transferType())) {
			// Trả success để SePay thôi gửi lại — đây không phải lỗi, chỉ là giao dịch không liên
			// quan. Trả lỗi chỉ tổ kích hoạt vòng gửi lại cho một thứ sẽ không bao giờ khớp.
			return new SePayDtos.WebhookResponse(true, "ignored", null, "Không phải tiền vào.");
		}

		BankTransferDtos.Transaction giaoDich = new BankTransferDtos.Transaction(
				than.referenceCode(),
				noiDung(than),
				than.transferAmount() == null ? BigDecimal.ZERO : than.transferAmount(),
				than.transactionDate());

		BankTransferDtos.TransactionResult kq = doiSoatPhanLoaiTranhChap(giaoDich);
		return new SePayDtos.WebhookResponse(true, kq.outcome(), kq.orderCode(), kq.detail());
	}

	/**
	 * Mã đơn có thể nằm ở {@code content} hoặc {@code description} tuỳ ngân hàng.
	 *
	 * <p>Ghép cả hai thay vì chọn một: chọn sai trường thì tiền vào tài khoản mà đơn không bao giờ
	 * được đánh dấu đã trả, và không có gì báo động — chỉ có khách đứng ở quầy nói đã chuyển rồi.
	 */
	private static String noiDung(SePayDtos than) {
		String a = than.content() == null ? "" : than.content();
		String b = than.description() == null ? "" : than.description();
		return (a + " " + b).trim();
	}

	/**
	 * Bắt lỗi tranh chấp xảy ra NGOÀI ranh giới {@code REQUIRES_NEW} của bộ đối soát.
	 *
	 * <p>Cả hai ca đều nghĩa là "người khác đã xử lý số tiền này rồi", và với SePay đó là thành
	 * công — trả lỗi chỉ kích hoạt vòng gửi lại cho một giao dịch đã đối soát xong.
	 */
	private BankTransferDtos.TransactionResult doiSoatPhanLoaiTranhChap(BankTransferDtos.Transaction giaoDich) {
		try {
			return reconciler.reconcile(giaoDich);
		} catch (DataIntegrityViolationException e) {
			return new BankTransferDtos.TransactionResult(giaoDich.reference(), "duplicate", null,
					"Mã tham chiếu này vừa được đối soát bởi một lần gửi song song.");
		}
	}

	private static ApiException sai() {
		return ApiException.unauthorized("SEPAY_KEY_INVALID", "Khoá webhook SePay không đúng.");
	}

	private static boolean soSanhDeuThoiGian(String mongDoi, String nhanDuoc) {
		byte[] a = mongDoi.getBytes(StandardCharsets.UTF_8);
		byte[] b = nhanDuoc.getBytes(StandardCharsets.UTF_8);
		if (a.length != b.length) {
			return false;
		}
		int lech = 0;
		for (int i = 0; i < a.length; i++) {
			lech |= a[i] ^ b[i];
		}
		return lech == 0;
	}
}
