package com.cmc.restaurant.payments;

import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.orders.application.OrderService;
import com.cmc.restaurant.tables.TableInvoicePaymentService;
import com.cmc.restaurant.payments.domain.Payment;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reconciles ONE Casso bank transaction against its order (hạn chế #3).
 *
 * <p>Deliberately a separate bean from {@link CassoWebhookService} rather than a method on it:
 * {@code REQUIRES_NEW} is applied by a Spring proxy, and a self-invocation inside one class would
 * silently bypass that proxy — every transaction would then share the caller's transaction, so one
 * failed entry in a Casso batch would roll back the settlements that already succeeded.
 */
@Service
public class BankTransferReconciler {

	/** Matches the transfer content built by {@link VietQrProvider} ("CMC ORD-1001"). Banks often
	 * wrap their own text around the description, so this searches rather than anchors. */
	/**
	 * Nhãn nhà cung cấp ghi vào {@code payment_transactions.provider}.
	 *
	 * <p>Phải khớp với điều kiện của chỉ mục chống ghi trùng ở V23. Đổi chuỗi này mà quên chỉ mục
	 * thì lần gửi lại thứ hai của CÙNG một giao dịch sẽ ghi nhận tiền lần nữa — SePay gửi lại tới
	 * 17 lần trong 24 giờ cho tới khi nhận được 200.
	 */
	public static final String NHA_CUNG_CAP = "SePay";

	/**
	 * Mã đơn lẻ, tìm trên nội dung ĐÃ CHUẨN HOÁ — xem {@link #chuanHoa}.
	 *
	 * <p>Chặn đuôi bằng {@code (?![0-9])}: bỏ hết dấu xong, chữ số của mã có thể dính liền chữ số
	 * kế tiếp của ngân hàng, và một mã dài ra vài chữ số là tra sai đơn.
	 */
	private static final Pattern ORDER_CODE = Pattern.compile("CMCORD(\\d+)(?![0-9])");

	/**
	 * Mã hoá đơn bàn: {@code CMC INV-yyyyMMdd-XXXXXXXX}.
	 *
	 * <p>Đây mới là dạng mà app và web THẬT SỰ đưa cho khách. Luồng đơn lẻ ({@code ORD-}) chỉ còn
	 * dùng ở đường thanh toán từng đơn; màn thanh toán của khách đi qua hoá đơn bàn vì một bàn có
	 * thể gọi nhiều lượt. Thiếu mẫu này thì mọi khoản tiền về đều trả {@code unmatched} — đo trên
	 * máy chủ thật trước khi sửa.
	 */
	private static final Pattern INVOICE_CODE = Pattern.compile("CMCINV(\\d{8})([0-9A-F]{8})");

	private static final ActorContext CASSO_ACTOR = new ActorContext(null, "System");

	private final PaymentRepository paymentRepository;
	private final PaymentTransactionRepository transactionRepository;
	private final OrderLookup orderLookup;
	private final OrderService orderService;
	private final TableInvoicePaymentService hoaDonBan;

	public BankTransferReconciler(
			PaymentRepository paymentRepository, PaymentTransactionRepository transactionRepository,
			OrderLookup orderLookup, OrderService orderService,
			TableInvoicePaymentService hoaDonBan) {
		this.paymentRepository = paymentRepository;
		this.transactionRepository = transactionRepository;
		this.orderLookup = orderLookup;
		this.orderService = orderService;
		this.hoaDonBan = hoaDonBan;
	}

	/**
	 * Commits (or rolls back) on its own, so a bad entry never undoes an already-settled sibling in
	 * the same Casso batch.
	 *
	 * <p>Concurrency failures are deliberately NOT caught here. Once Hibernate raises an optimistic
	 * lock clash — or Postgres rejects a duplicate reference — this transaction can no longer
	 * commit. Swallowing that inside the transactional method would let Spring attempt a commit
	 * anyway and blow up with {@code UnexpectedRollbackException} <em>after</em> a tidy result had
	 * already been produced, turning a settled transfer into a 500 that Casso then retries 17
	 * times. Letting it propagate lets the proxy roll back cleanly;
	 * {@link CassoWebhookService#handle} classifies the outcome from outside the boundary.
	 */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public BankTransferDtos.TransactionResult reconcile(BankTransferDtos.Transaction transaction) {
		return attempt(transaction);
	}

	private BankTransferDtos.TransactionResult attempt(BankTransferDtos.Transaction transaction) {
		String reference = transaction.reference() == null ? null : transaction.reference().trim();
		if (reference == null || reference.isEmpty()) {
			return result(transaction, "ignored", null, "Transaction has no reference to deduplicate on.");
		}

		// Idempotency pre-check. The DB index is what actually guarantees this; this lookup only
		// keeps the common replay path from throwing.
		if (transactionRepository.findByProviderAndProviderTransactionId(NHA_CUNG_CAP, reference).isPresent()) {
			return result(transaction, "duplicate", null, "This bank reference was already reconciled.");
		}

		// Thử hoá đơn bàn TRƯỚC: đó là dạng mã mà màn thanh toán của khách sinh ra, nên là đường
		// đi thường gặp. Hai mẫu không thể cùng khớp một chuỗi.
		String maHoaDon = timTheoMau(INVOICE_CODE, transaction.description());
		if (maHoaDon != null) {
			return doiSoatHoaDonBan(transaction, reference, maHoaDon);
		}

		String orderCode = extractOrderCode(transaction.description());
		if (orderCode == null) {
			return result(transaction, "unmatched", null,
					"Nội dung chuyển khoản không chứa mã 'CMC INV-...' hay 'CMC ORD-...'.");
		}

		Optional<OrderLookup.OrderSummary> order = orderLookup.findByOrderCode(orderCode);
		if (order.isEmpty()) {
			return result(transaction, "unmatched", orderCode, "No order exists with this code.");
		}

		PaymentEntity payment = paymentRepository.findByOrderId(order.get().id()).orElse(null);
		if (payment == null) {
			return result(transaction, "unmatched", orderCode, "Order has no payment record.");
		}

		// Whether this transfer may settle the payment is the aggregate's decision, not a second
		// copy of "is it already settled" and "does the amount match" living here. Those two checks
		// used to be duplicated between this class and the manual counter path — the exact drift
		// the domain split exists to prevent.
		OffsetDateTime now = OffsetDateTime.now();
		com.cmc.restaurant.payments.domain.Payment domainPayment = payment.toDomain();
		Payment.ReconcileOutcome outcome = domainPayment.reconcileFromBank(reference, transaction.amount(), now);

		if (outcome == Payment.ReconcileOutcome.AlreadySettled) {
			// Usually the counter got there first via the manual fallback — expected, not an error.
			return result(transaction, "already_settled", orderCode,
					"Payment is already " + payment.getStatus() + ".");
		}
		if (outcome == Payment.ReconcileOutcome.AmountMismatch) {
			BigDecimal expected = payment.getAmount().setScale(0, RoundingMode.DOWN);
			BigDecimal received = transaction.amount() == null
					? BigDecimal.valueOf(-1) : transaction.amount().setScale(0, RoundingMode.DOWN);
			return result(transaction, "amount_mismatch", orderCode,
					"Expected " + expected.toPlainString() + " but received " + received.toPlainString() + ".");
		}

		payment.applyFrom(domainPayment);

		String note = "Auto-confirmed from Casso bank transaction " + reference + ".";
		transactionRepository.save(new PaymentTransactionEntity(
				"ptx_" + UUID.randomUUID().toString().replace("-", ""), payment.getId(),
				payment.getMethod().name(), "Confirmed", payment.getAmount(), NHA_CUNG_CAP, reference, note,
				now, null, null));
		orderService.recordPaymentStatusEvent(orderCode, CASSO_ACTOR, note);

		// Flushed here so an optimistic-lock clash or a duplicate-reference insert surfaces inside
		// reconcile()'s catch blocks, rather than at commit time where it could not be classified.
		paymentRepository.saveAndFlush(payment);
		transactionRepository.flush();

		return result(transaction, "confirmed", orderCode, "Payment confirmed automatically.");
	}

	static String extractOrderCode(String description) {
		return timTheoMau(ORDER_CODE, description);
	}

	/** Mã hoá đơn bàn trong nội dung chuyển khoản, hoặc {@code null}. */
	static String timMaHoaDon(String description) {
		return timTheoMau(INVOICE_CODE, description);
	}

	/**
	 * Bỏ MỌI thứ không phải chữ-số và viết hoa toàn bộ.
	 *
	 * <p><b>LỖI CÓ THẬT, đo bằng chính thân webhook SePay gửi về.</b> Mã QR ghi
	 * {@code CMC INV-20260902-33987CAE}. MB Bank lưu lại thành:
	 *
	 * <pre>
	 *   MBVCB.15865148942.401977.CMC INV 20260902 33987CAE.CT tu 1041485738 PHAM DUY AN
	 *   toi 003120082006 DO TUAN ANH tai MB- Ma GD ACSP/ zu401977
	 * </pre>
	 *
	 * <p>Dấu gạch bị đổi thành khoảng trắng. Mẫu cũ đòi đúng {@code INV-<8 số>-<8 hex>} nên trượt,
	 * webhook trả {@code unmatched} kèm HTTP 200, SePay ghi "thành công" — và tiền vào tài khoản
	 * thật trong khi hoá đơn nằm chờ người duyệt tay. Không có gì báo động.
	 *
	 * <p>Chuẩn hoá cả hai phía rồi mới so là cách duy nhất không phụ thuộc vào việc từng ngân hàng
	 * chọn giữ hay bỏ ký tự nào. Mã hoá đơn có độ dài CỐ ĐỊNH (8 số + 8 hex) nên bỏ dấu vẫn tách
	 * lại được chính xác — đó là thứ làm phép này an toàn.
	 */
	private static String chuanHoa(String description) {
		return description.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
	}

	private static String timTheoMau(Pattern mau, String description) {
		if (description == null) {
			return null;
		}
		// `find` chứ không `matches`: ngân hàng luôn bọc thêm chữ của họ quanh nội dung khách gõ.
		Matcher matcher = mau.matcher(chuanHoa(description));
		if (!matcher.find()) {
			return null;
		}
		// Dựng LẠI mã đúng dạng chuẩn: nội dung đã bị bỏ hết dấu, nhưng phần còn lại của hệ thống
		// tra cứu theo `INV-yyyyMMdd-XXXXXXXX`.
		return mau == INVOICE_CODE
				? "INV-" + matcher.group(1) + "-" + matcher.group(2)
				: "ORD-" + matcher.group(1);
	}

	/**
	 * Ghi nhận khoản tiền vào một hoá đơn bàn.
	 *
	 * <p>Giao toàn bộ phần ghi tiền cho {@code TableInvoicePaymentService} — nơi đã có sẵn đường
	 * xác nhận của nhân viên, kèm đóng phiên bàn, hoàn tất các đơn, thu mã đổi điểm và cộng điểm.
	 * Chép lại ở đây nghĩa là hai bản sẽ trôi khỏi nhau, và bản này im lặng bỏ sót một trong số đó.
	 */
	private BankTransferDtos.TransactionResult doiSoatHoaDonBan(
			BankTransferDtos.Transaction transaction, String reference, String maHoaDon) {
		TableInvoicePaymentService.KetQuaDoiSoat ketQua =
				hoaDonBan.xacNhanTuChuyenKhoan(maHoaDon, reference, transaction.amount());

		return switch (ketQua) {
			case DA_XAC_NHAN -> result(transaction, "confirmed", maHoaDon,
					"Hoá đơn đã được xác nhận tự động.");
			case KHONG_THAY_HOA_DON -> result(transaction, "unmatched", maHoaDon,
					"Không có hoá đơn nào mang mã này.");
			// Thường là quầy bấm xác nhận tay trước. Bình thường, không phải lỗi.
			case DA_TAT_TOAN -> result(transaction, "already_settled", maHoaDon,
					"Hoá đơn này đã được tất toán trước đó.");
			case LECH_SO_TIEN -> result(transaction, "amount_mismatch", maHoaDon,
					"Số tiền nhận được không khớp hoá đơn.");
		};
	}

	private static BankTransferDtos.TransactionResult result(
			BankTransferDtos.Transaction transaction, String outcome, String orderCode, String detail) {
		return new BankTransferDtos.TransactionResult(transaction.reference(), outcome, orderCode, detail);
	}
}
