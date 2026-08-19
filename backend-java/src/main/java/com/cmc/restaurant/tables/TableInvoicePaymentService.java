package com.cmc.restaurant.tables;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.chat.ChatSessionRepository;
import com.cmc.restaurant.counter.CounterService;
import com.cmc.restaurant.loyalty.LoyaltyService;
import com.cmc.restaurant.loyalty.domain.PhoneNumber;
import com.cmc.restaurant.orders.application.OrderDtos;
import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.orders.application.OrderService;
import com.cmc.restaurant.payments.PaymentEntity;
import com.cmc.restaurant.payments.PaymentRepository;
import com.cmc.restaurant.payments.PaymentTransactionEntity;
import com.cmc.restaurant.payments.PaymentTransactionRepository;
import com.cmc.restaurant.payments.VietQrProvider;
import com.cmc.restaurant.payments.domain.PaymentMethod;
import com.cmc.restaurant.payments.domain.PaymentStatus;
import com.cmc.restaurant.promotions.PromotionService;
import com.cmc.restaurant.promotions.domain.Promotion;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.shared.RequestIdempotency;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Luồng thanh toán hoá đơn bàn (#96, phần 2) — mirror {@code TableInvoiceEndpoints.cs} (.NET).
 *
 * <p>Đây là đường TIỀN BẠC, nên ba tính chất sau là bắt buộc chứ không phải tuỳ chọn:
 * <ul>
 *   <li><b>Bất biến theo khoá idempotency.</b> Khách bấm hai lần, hoặc mạng chập chờn gửi lại —
 *       không được tạo hai hoá đơn. Khoá trùng và cùng nội dung thì phát lại kết quả cũ; khoá
 *       trùng nhưng khác nội dung là 409.</li>
 *   <li><b>Khoá lạc quan.</b> Hai nhân viên cùng bấm xác nhận thì đúng một người thắng, người kia
 *       nhận {@code CONFLICT_STALE} chứ không phải cả hai cùng ghi đè.</li>
 *   <li><b>Ghi tiền trước, việc phụ trợ sau.</b> Cộng điểm, xoá phiên chat, ghi sổ quỹ và bắn
 *       realtime đều chạy SAU khi khoản thu đã ghi xong. Một trong số đó hỏng không được phép làm
 *       mất khoản thu.</li>
 * </ul>
 */
@Service
public class TableInvoicePaymentService {

	private static final DateTimeFormatter INVOICE_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
	private static final int MAX_NOTE_LENGTH = 500;

	private final TableSessionRepository sessionRepository;
	private final TableInvoiceRepository invoiceRepository;
	private final RestaurantTableRepository tableRepository;
	private final PaymentRepository paymentRepository;
	private final PaymentTransactionRepository transactionRepository;
	private final TableSessionCapability capability;
	private final JwtProperties jwtProperties;
	private final VietQrProvider vietQrProvider;
	private final PromotionService promotionService;
	private final LoyaltyService loyaltyService;
	private final CounterService counterService;
	private final ChatSessionRepository chatSessionRepository;
	private final OrderLookup orderLookup;
	private final OrderService orderService;
	private final OrderRealtimeNotifier realtimeNotifier;
	private final TableInvoiceService invoiceReader;

	public TableInvoicePaymentService(
			TableSessionRepository sessionRepository, TableInvoiceRepository invoiceRepository,
			RestaurantTableRepository tableRepository, PaymentRepository paymentRepository,
			PaymentTransactionRepository transactionRepository, TableSessionCapability capability,
			JwtProperties jwtProperties, VietQrProvider vietQrProvider, PromotionService promotionService,
			LoyaltyService loyaltyService, CounterService counterService,
			ChatSessionRepository chatSessionRepository, OrderLookup orderLookup, OrderService orderService,
			OrderRealtimeNotifier realtimeNotifier, TableInvoiceService invoiceReader) {
		this.sessionRepository = sessionRepository;
		this.invoiceRepository = invoiceRepository;
		this.tableRepository = tableRepository;
		this.paymentRepository = paymentRepository;
		this.transactionRepository = transactionRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.vietQrProvider = vietQrProvider;
		this.promotionService = promotionService;
		this.loyaltyService = loyaltyService;
		this.counterService = counterService;
		this.chatSessionRepository = chatSessionRepository;
		this.orderLookup = orderLookup;
		this.orderService = orderService;
		this.realtimeNotifier = realtimeNotifier;
		this.invoiceReader = invoiceReader;
	}

	// --- khách yêu cầu thanh toán ---------------------------------------------------------------

	@Transactional
	public TableInvoiceDtos.PaymentRequestResponse requestPayment(
			String sessionId, TableInvoiceDtos.TableInvoicePaymentRequest request,
			String suppliedToken, String idempotencyKey) {

		TableSessionEntity session = sessionRepository.findById(sessionId.trim())
				.orElseThrow(() -> ApiException.notFound(
						"TABLE_SESSION_NOT_FOUND", "Table session was not found."));
		if (suppliedToken == null
				|| !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "TABLE_SESSION_TOKEN_INVALID",
					"A valid table session token is required.");
		}
		if (!session.isActiveAt(OffsetDateTime.now())) {
			throw ApiException.badRequest("TABLE_SESSION_NOT_OPEN",
					"Only an open table session can request payment.");
		}

		PaymentMethod method = parseMethod(request == null ? null : request.method());
		if (idempotencyKey == null) {
			throw ApiException.badRequest("IDEMPOTENCY_KEY_REQUIRED",
					"A valid Idempotency-Key header is required.");
		}

		List<OrderLookup.OrderRound> rounds = orderLookup.findRoundsForTableSession(sessionId);
		BigDecimal subtotal = rounds.stream()
				.map(OrderLookup.OrderRound::subtotalAmount)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		if (rounds.isEmpty() || subtotal.signum() <= 0) {
			throw ApiException.badRequest("TABLE_INVOICE_EMPTY",
					"The table session has no order rounds to settle.");
		}

		String promotionCode = Promotion.normalizeCode(request == null ? null : request.promotionCode());
		String phone = PhoneNumber.normalize(request == null ? null : request.customerPhoneNumber());
		String fingerprint = RequestIdempotency.computeFingerprint(
				new Fingerprint(sessionId, method.name(), promotionCode, phone, subtotal));

		Optional<TableInvoiceEntity> existing = invoiceRepository.findByTableSessionId(sessionId);

		// Phát lại: cùng khoá, cùng nội dung, hoá đơn còn Pending thì trả nguyên kết quả cũ.
		Optional<PaymentTransactionEntity> replay =
				transactionRepository.findByIdempotencyKey(idempotencyKey);
		if (replay.isPresent()) {
			if (!fingerprint.equals(replay.get().getRequestFingerprint())) {
				throw ApiException.conflict("IDEMPOTENCY_KEY_REUSED",
						"The idempotency key was already used with a different payment request.");
			}
			TableInvoiceEntity invoice = existing.orElseThrow(
					TableInvoicePaymentService::attemptClosed);
			if (!"Pending".equals(invoice.getStatus())) {
				throw attemptClosed();
			}
			return buildRequestResponse(session, invoice);
		}

		if (existing.isPresent() && "Pending".equals(existing.get().getStatus())) {
			throw ApiException.conflict("TABLE_INVOICE_PAYMENT_PENDING",
					"Payment has already been requested for this table invoice.");
		}

		Optional<Promotion.Discount> discount =
				promotionService.tryApply(promotionCode, subtotal, OffsetDateTime.now());
		BigDecimal discountAmount = discount.map(Promotion.Discount::discountAmount).orElse(BigDecimal.ZERO);
		BigDecimal total = discount.map(Promotion.Discount::totalAmount).orElse(subtotal);

		OffsetDateTime now = OffsetDateTime.now();
		TableInvoiceEntity invoice = existing.orElseGet(() -> new TableInvoiceEntity(
				"tinv_" + UUID.randomUUID().toString().replace("-", ""),
				buildInvoiceCode(now), sessionId, now));
		invoice.applyPaymentRequest(
				subtotal, discountAmount, total, promotionCode, phone, method.name(), now);
		invoiceRepository.save(invoice);

		PaymentEntity payment = paymentRepository.findByTableInvoiceId(invoice.getId())
				.orElseGet(() -> PaymentEntity.forTableInvoice(
						"pay_" + UUID.randomUUID().toString().replace("-", ""), invoice.getId(),
						method, total, now));
		payment.setMethod(method);
		payment.setStatus(PaymentStatus.Pending);
		payment.setAmount(total);
		payment.setUpdatedAt(now);
		paymentRepository.save(payment);

		VietQrProvider.VietQrPayload payload = method == PaymentMethod.VietQR
				? vietQrProvider.createPayload(invoice.getInvoiceCode(), total)
				: null;

		transactionRepository.save(new PaymentTransactionEntity(
				"ptx_" + UUID.randomUUID().toString().replace("-", ""), payment.getId(), method.name(),
				"Pending", total, method.name(), payload == null ? null : payload.transferContent(),
				"Customer requested settlement of the table invoice.", now, idempotencyKey, fingerprint));

		return buildRequestResponse(session, invoice);
	}

	// --- nhân viên xác nhận hoặc huỷ -------------------------------------------------------------

	@Transactional
	public TableInvoiceDtos.InvoiceResponse confirm(
			String sessionId, TableInvoiceDtos.PaymentActionRequest request, ActorContext actor) {
		Settlement s = loadForSettlement(sessionId, request);
		OffsetDateTime now = OffsetDateTime.now();
		String note = noteOr(request, "Staff confirmed table invoice payment.");

		s.invoice().settle("Confirmed", now);
		s.payment().setStatus(PaymentStatus.Confirmed);
		s.payment().setPaidAt(now);
		s.payment().setUpdatedAt(now);
		s.session().closeAt(now);

		try {
			invoiceRepository.saveAndFlush(s.invoice());
			paymentRepository.saveAndFlush(s.payment());
			sessionRepository.saveAndFlush(s.session());
		} catch (ObjectOptimisticLockingFailureException e) {
			throw ApiException.conflict("CONFLICT_STALE",
					"Payment was modified by another request. Reload and try again.");
		}

		transactionRepository.save(settlementTransaction(s.payment(), "Confirmed", note, now));

		// Từ đây trở xuống là việc PHỤ TRỢ — tiền đã ghi xong. Thứ tự theo bản .NET.
		List<OrderDtos.OrderResponse> completed =
				orderService.completeOrdersForTableSession(sessionId, actor);
		loyaltyService.accrue(s.invoice().getCustomerPhoneNumber(), s.invoice().getTotalAmount(), now);
		chatSessionRepository.deleteAll(
				chatSessionRepository.findByTableSessionIdAndClosedFalse(sessionId));
		if (PaymentMethod.COD.name().equals(s.invoice().getMethod())) {
			counterService.recordTableInvoiceCash(
					s.invoice().getTotalAmount(), sessionId, s.invoice().getInvoiceCode(), actor.userId());
		}

		TableInvoiceDtos.InvoiceResponse response = invoiceReader.buildInvoice(sessionId, s.session());
		for (OrderDtos.OrderResponse order : completed) {
			realtimeNotifier.orderStatusChanged(
					new RealtimeDtos.OrderStatusChangedEvent(
							order.orderId(), order.orderCode(), order.status(), order.updatedAt()),
					s.tableCode());
		}
		realtimeNotifier.tableInvoicePaymentConfirmed(
				new RealtimeDtos.TableInvoicePaymentConfirmedEvent(response, now), s.tableCode());
		return response;
	}

	@Transactional
	public TableInvoiceDtos.InvoiceResponse cancel(
			String sessionId, TableInvoiceDtos.PaymentActionRequest request) {
		Settlement s = loadForSettlement(sessionId, request);
		OffsetDateTime now = OffsetDateTime.now();
		String note = noteOr(request, "Staff cancelled table invoice payment.");

		s.invoice().settle("Cancelled", now);
		s.payment().setStatus(PaymentStatus.Cancelled);
		s.payment().setUpdatedAt(now);

		try {
			invoiceRepository.saveAndFlush(s.invoice());
			paymentRepository.saveAndFlush(s.payment());
		} catch (ObjectOptimisticLockingFailureException e) {
			throw ApiException.conflict("CONFLICT_STALE",
					"Payment was modified by another request. Reload and try again.");
		}
		transactionRepository.save(settlementTransaction(s.payment(), "Cancelled", note, now));

		// Huỷ KHÔNG đóng phiên bàn: khách vẫn ngồi đó và có thể chọn phương thức khác.
		return invoiceReader.buildInvoice(sessionId, s.session());
	}

	// --- danh sách cho quầy ----------------------------------------------------------------------

	@Transactional(readOnly = true)
	public List<TableInvoiceDtos.InvoiceResponse> list(String status) {
		String normalized = normalizeStatusFilter(status);
		List<TableInvoiceEntity> invoices = normalized == null
				? invoiceRepository.findAllByOrderByUpdatedAtDesc()
				: invoiceRepository.findByStatusOrderByUpdatedAtDesc(normalized);
		return invoices.stream()
				.map(invoice -> invoiceReader.buildInvoice(
						invoice.getTableSessionId(),
						sessionRepository.findById(invoice.getTableSessionId()).orElse(null)))
				.toList();
	}

	// --- helper ----------------------------------------------------------------------------------

	private record Fingerprint(
			String sessionId, String method, String promotionCode, String phone, BigDecimal subtotal) {
	}

	private record Settlement(
			TableSessionEntity session, TableInvoiceEntity invoice, PaymentEntity payment, String tableCode) {
	}

	private Settlement loadForSettlement(String sessionId, TableInvoiceDtos.PaymentActionRequest request) {
		validateNote(request);
		TableInvoiceEntity invoice = invoiceRepository.findByTableSessionId(sessionId)
				.orElseThrow(TableInvoicePaymentService::paymentNotFound);
		PaymentEntity payment = paymentRepository.findByTableInvoiceId(invoice.getId())
				.orElseThrow(TableInvoicePaymentService::paymentNotFound);
		if (!"Pending".equals(invoice.getStatus())) {
			throw ApiException.conflict("PAYMENT_TRANSITION_INVALID",
					"Only a pending table invoice payment can be settled.");
		}
		TableSessionEntity session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> ApiException.notFound(
						"TABLE_SESSION_NOT_FOUND", "Table session was not found."));
		String tableCode = tableRepository.findById(session.getRestaurantTableId())
				.map(RestaurantTableEntity::getTableCode)
				.orElse(session.getTableCode());
		return new Settlement(session, invoice, payment, tableCode);
	}

	private TableInvoiceDtos.PaymentRequestResponse buildRequestResponse(
			TableSessionEntity session, TableInvoiceEntity invoice) {
		TableInvoiceDtos.InvoiceResponse response = invoiceReader.buildInvoice(session.getId(), session);
		PaymentEntity payment = paymentRepository.findByTableInvoiceId(invoice.getId()).orElseThrow();
		return new TableInvoiceDtos.PaymentRequestResponse(
				response,
				new TableInvoiceDtos.PaymentSummaryResponse(
						payment.getId(), payment.getStatus().name(), payment.getMethod().name(),
						payment.getAmount()),
				response.vietQr());
	}

	private PaymentTransactionEntity settlementTransaction(
			PaymentEntity payment, String status, String note, OffsetDateTime now) {
		return new PaymentTransactionEntity(
				"ptx_" + UUID.randomUUID().toString().replace("-", ""), payment.getId(),
				payment.getMethod().name(), status, payment.getAmount(), payment.getMethod().name(),
				null, note, now, null, null);
	}

	private static ApiException paymentNotFound() {
		return ApiException.notFound(
				"TABLE_INVOICE_PAYMENT_NOT_FOUND", "Table invoice payment was not found.");
	}

	private static ApiException attemptClosed() {
		return ApiException.conflict("PAYMENT_REQUEST_ATTEMPT_CLOSED",
				"This payment request attempt is closed. Start a new request with a new idempotency key.");
	}

	private static void validateNote(TableInvoiceDtos.PaymentActionRequest request) {
		if (request != null && request.note() != null && request.note().trim().length() > MAX_NOTE_LENGTH) {
			throw ApiException.badRequest("PAYMENT_NOTE_TOO_LONG", "Note must be 500 characters or fewer.");
		}
	}

	private static String noteOr(TableInvoiceDtos.PaymentActionRequest request, String fallback) {
		if (request == null || request.note() == null || request.note().isBlank()) {
			return fallback;
		}
		return request.note().trim();
	}

	private static PaymentMethod parseMethod(String raw) {
		if (raw != null) {
			for (PaymentMethod candidate : List.of(PaymentMethod.COD, PaymentMethod.VietQR)) {
				if (candidate.name().equalsIgnoreCase(raw.trim())) {
					return candidate;
				}
			}
		}
		throw ApiException.badRequest("PAYMENT_METHOD_INVALID", "Payment method must be COD or VietQR.");
	}

	private static String normalizeStatusFilter(String status) {
		if (status == null || status.isBlank()) {
			return null;
		}
		for (PaymentStatus candidate : PaymentStatus.values()) {
			if (candidate.name().equalsIgnoreCase(status.trim())) {
				return candidate.name();
			}
		}
		throw ApiException.badRequest("PAYMENT_STATUS_INVALID", "Payment status is invalid.");
	}

	/** {@code INV-yyyyMMdd-XXXXXXXX} — cùng dạng và cùng độ dài 21 ký tự với bản .NET. */
	private static String buildInvoiceCode(OffsetDateTime now) {
		String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
		return ("INV-" + INVOICE_DATE.format(now) + "-" + suffix).toUpperCase(Locale.ROOT);
	}
}
