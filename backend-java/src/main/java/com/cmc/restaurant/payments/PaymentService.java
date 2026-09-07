package com.cmc.restaurant.payments;

import com.cmc.restaurant.shared.ActorContext;
import com.cmc.restaurant.shared.RequestIdempotency;
import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.orders.application.OrderService;
import com.cmc.restaurant.payments.domain.Payment;
import com.cmc.restaurant.payments.domain.PaymentMethod;
import com.cmc.restaurant.payments.domain.PaymentStatus;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors {@code PaymentEndpoints.cs} (.NET) — issue #10 scope is the COD/manual-confirmation
 * flow. {@code method == "VietQR"} is rejected for now (issue #11 wires real QR generation);
 * realtime notification is out of scope here (Realtime is issue #13). Loyalty accrual on confirm
 * was added in issue #54, when the Loyalty module was ported.
 */
@Service
public class PaymentService {

	private static final int MAX_NOTE_LENGTH = 500;
	private final PaymentRepository paymentRepository;
	private final PaymentTransactionRepository transactionRepository;
	private final OrderLookup orderLookup;
	private final OrderService orderService;
	private final VietQrProvider vietQrProvider;
	private final OrderRealtimeNotifier realtimeNotifier;
	private final com.cmc.restaurant.loyalty.LoyaltyService loyaltyService;

	public PaymentService(
			PaymentRepository paymentRepository, PaymentTransactionRepository transactionRepository,
			OrderLookup orderLookup, OrderService orderService, VietQrProvider vietQrProvider,
			OrderRealtimeNotifier realtimeNotifier,
			com.cmc.restaurant.loyalty.LoyaltyService loyaltyService) {
		this.loyaltyService = loyaltyService;
		this.paymentRepository = paymentRepository;
		this.transactionRepository = transactionRepository;
		this.orderLookup = orderLookup;
		this.orderService = orderService;
		this.vietQrProvider = vietQrProvider;
		this.realtimeNotifier = realtimeNotifier;
	}

	public PaymentDtos.PaymentResponse getPayment(String orderCode, String suppliedAccessToken, boolean isOperator) {
		OrderLookup.OrderSummary order = orderLookup.findByOrderCode(orderCode).orElse(null);
		if (order == null || (!isOperator && !orderLookup.matchesCustomerToken(orderCode, suppliedAccessToken))) {
			throw ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found.");
		}
		PaymentEntity payment = paymentRepository.findByOrderId(order.id())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));
		return toResponse(payment, order.orderCode());
	}

	@Transactional
	public PaymentDtos.PaymentRequestResponse requestPayment(
			String orderCode, PaymentDtos.PaymentRequestRequest request, String idempotencyKey,
			String suppliedAccessToken) {
		OrderLookup.OrderSummary order = orderLookup.findByOrderCode(orderCode).orElse(null);
		if (order == null || !orderLookup.matchesCustomerToken(orderCode, suppliedAccessToken)) {
			throw ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found.");
		}
		orderService.requirePayableOrder(orderCode);
		PaymentEntity payment = paymentRepository.findByOrderId(order.id())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));

		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		String method = request.method();
		if (!"COD".equals(method) && !"VietQR".equals(method)) {
			throw ApiException.badRequest("PAYMENT_METHOD_INVALID", "Payment method must be COD or VietQR.");
		}
		String requestFingerprint = RequestIdempotency.computeFingerprint(new MethodFingerprint(method));
		Optional<PaymentTransactionEntity> existingRequest =
				transactionRepository.findByIdempotencyKey(idempotencyKey);
		if (existingRequest.isPresent()) {
			return replayOrConflict(existingRequest.get(), payment, order, requestFingerprint);
		}


		// Built before any mutation, exactly as in .NET: an unconfigured VietQR deployment must
		// fail the request outright rather than leave the payment flipped to Pending with no QR.
		VietQrProvider.VietQrPayload payload = null;
		if ("VietQR".equals(method)) {
			try {
				payload = vietQrProvider.createPayload(order.orderCode(), payment.getAmount());
			} catch (IllegalStateException e) {
				throw ApiException.badRequest("VIETQR_CONFIG_MISSING", "VietQR bank configuration is missing.");
			}
		}

		OffsetDateTime now = OffsetDateTime.now();
		com.cmc.restaurant.payments.domain.Payment domainPayment = payment.toDomain();
		domainPayment.request(PaymentMethod.valueOf(method), payload == null ? null : payload.transferContent(), now);
		payment.applyFrom(domainPayment);
		PaymentTransactionEntity transaction = new PaymentTransactionEntity(
				"ptx_" + UUID.randomUUID().toString().replace("-", ""), payment.getId(), method, "Pending",
				payment.getAmount(), method, payload == null ? null : payload.transferContent(),
				payload == null ? "Customer requested cash payment." : "Customer requested VietQR payment.",
				now, idempotencyKey, requestFingerprint);

		try {
			paymentRepository.save(payment);
			transactionRepository.save(transaction);
		} catch (DataIntegrityViolationException e) {
			// Race: two concurrent requests with the same Idempotency-Key both passed the
			// up-front lookup above; the DB's unique index on idempotency_key caught the loser
			// here. Postgres has already aborted this transaction at the wire level, so we don't
			// attempt to re-query on this connection — just roll back and tell the client to
			// retry; the winner's row is committed by then, so the retry resolves via the
			// up-front idempotency lookup above instead of racing the insert again.
			throw ApiException.conflict(
					"CONFLICT_STALE", "Payment was modified by another request. Reload and try again.");
		}

		// Tells the counter a table is waiting to pay without them refreshing the list.
		realtimeNotifier.paymentRequested(new RealtimeDtos.PaymentRequestedEvent(
				order.id(), order.orderCode(), payment.getMethod().name(), payment.getStatus().name(),
				payment.getAmount(), payment.getUpdatedAt(), order.tableCode()));

		return new PaymentDtos.PaymentRequestResponse(
				toResponse(payment, order.orderCode()),
				toVietQrResponse(payload, order.orderCode(), "Pending"));
	}

	private static PaymentDtos.VietQrResponse toVietQrResponse(
			VietQrProvider.VietQrPayload payload, String orderCode, String paymentStatus) {
		if (payload == null) {
			return null;
		}
		return new PaymentDtos.VietQrResponse(
				orderCode, payload.amount(), payload.transferContent(), payload.bankId(), payload.accountNumber(),
				payload.accountName(), payload.quickLink(), payload.qrPayload(), payload.qrImageDataUri(),
				paymentStatus);
	}

	private PaymentDtos.PaymentRequestResponse replayOrConflict(
			PaymentTransactionEntity existingRequest, PaymentEntity payment, OrderLookup.OrderSummary order,
			String requestFingerprint) {
		if (!existingRequest.getPaymentId().equals(payment.getId())
				|| !requestFingerprint.equals(existingRequest.getRequestFingerprint())) {
			throw ApiException.conflict(
					"IDEMPOTENCY_KEY_REUSED", "Idempotency key was already used with a different request.");
		}
		return toReplayResponse(payment, existingRequest, order.orderCode());
	}

	/** The three manual counter actions share one shape: load, let the aggregate decide, record the
	 * ledger entry and the order-side audit event, then save under optimistic locking. */
	private PaymentDtos.PaymentResponse applyManualAction(
			String orderCode, String requestedNote, String defaultNote, ActorContext actor,
			java.util.function.BiConsumer<Payment, OffsetDateTime> action) {
		Payment.validateNote(requestedNote);
		OrderLookup.OrderSummary order = orderLookup.findByOrderCode(orderCode)
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));
		PaymentEntity entity = paymentRepository.findByOrderId(order.id())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));

		OffsetDateTime now = OffsetDateTime.now();
		Payment payment = entity.toDomain();
		action.accept(payment, now);
		entity.applyFrom(payment);

		String note = isBlank(requestedNote) ? defaultNote : requestedNote.trim();
		addTransaction(entity, payment.status(), note, now);
		orderService.recordPaymentStatusEvent(orderCode, actor, note);

		savePaymentOrConflict(entity);
		return toResponse(entity, order.orderCode());
	}

	@Transactional
	public PaymentDtos.PaymentResponse confirmPayment(
			String orderCode, PaymentDtos.ConfirmPaymentRequest request, ActorContext actor) {
		String providerTransactionId = request == null ? null : request.providerTransactionId();
		PaymentDtos.PaymentResponse response = applyManualAction(
				orderCode, request == null ? null : request.note(), "Manual staff confirmation.", actor,
				(payment, now) -> payment.confirmManually(providerTransactionId, now));
		accrueLoyalty(orderCode, response.amount());
		return response;
	}

	@Transactional
	public PaymentDtos.PaymentResponse failPayment(
			String orderCode, PaymentDtos.FailPaymentRequest request, ActorContext actor) {
		return applyManualAction(
				orderCode, request == null ? null : request.note(), "Manual payment failure.", actor,
				(payment, now) -> payment.failManually(now));
	}

	@Transactional
	public PaymentDtos.PaymentResponse refundPayment(
			String orderCode, PaymentDtos.RefundPaymentRequest request, ActorContext actor) {
		return applyManualAction(
				orderCode, request == null ? null : request.note(), "Manual payment refund.", actor,
				(payment, now) -> payment.refund(now));
	}

	/**
	 * Awards loyalty points once the money is in. Deliberately after the payment has been saved and
	 * never in a way that can fail the payment: a customer who paid must not see an error because a
	 * points row could not be written, and points can always be added later by hand.
	 */
	private void accrueLoyalty(String orderCode, java.math.BigDecimal amount) {
		try {
			orderLookup.findByOrderCode(orderCode)
					.map(OrderLookup.OrderSummary::customerPhoneNumber)
					.ifPresent(phone -> loyaltyService.accrue(phone, amount, OffsetDateTime.now()));
		} catch (RuntimeException e) {
			org.slf4j.LoggerFactory.getLogger(PaymentService.class)
					.warn("Loyalty accrual failed for {}; payment stands.", orderCode, e);
		}
	}

	// --- helpers -----------------------------------------------------------------------------

	private void savePaymentOrConflict(PaymentEntity payment) {
		try {
			paymentRepository.saveAndFlush(payment);
		} catch (ObjectOptimisticLockingFailureException e) {
			throw ApiException.conflict(
					"CONFLICT_STALE", "Payment was modified by another request. Reload and try again.");
		}
	}

	private void addTransaction(PaymentEntity payment, PaymentStatus status, String note, OffsetDateTime now) {
		transactionRepository.save(new PaymentTransactionEntity(
				"ptx_" + UUID.randomUUID().toString().replace("-", ""), payment.getId(),
				payment.getMethod().name(), status.name(), payment.getAmount(), payment.getMethod().name(),
				payment.getProviderTransactionId(), note, now, null, null));
	}

	// validateManualTransition / validateNote / ALREADY_REQUESTED_STATUSES used to live here.
	// They are now on the Payment aggregate (issue #63) so the manual counter path and the Casso
	// webhook path cannot drift apart — before, each had its own copy of "is this already settled".

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}

	private PaymentDtos.PaymentResponse toResponse(PaymentEntity payment, String orderCode) {
		List<PaymentDtos.PaymentTransactionResponse> transactions =
				transactionRepository.findByPaymentIdOrderByCreatedAtAsc(payment.getId()).stream()
						.map(this::toTransactionResponse)
						.toList();
		return new PaymentDtos.PaymentResponse(
				payment.getId(), orderCode, payment.getMethod().name(), payment.getStatus().name(), payment.getAmount(),
				payment.getProviderTransactionId(), payment.getCreatedAt(), payment.getPaidAt(),
				payment.getUpdatedAt(), transactions);
	}

	/** Mirrors {@code CreatePaymentRequestReplayResponse} (.NET) — reconstructs the payment as it
	 * looked right after the ORIGINAL request, not the current (possibly since-confirmed) state,
	 * so an idempotent retry doesn't appear to "redo" something staff already acted on. */
	private PaymentDtos.PaymentRequestResponse toReplayResponse(
			PaymentEntity payment, PaymentTransactionEntity requestTransaction, String orderCode) {
		List<PaymentDtos.PaymentTransactionResponse> transactions =
				transactionRepository.findByPaymentIdOrderByCreatedAtAsc(payment.getId()).stream()
						.filter(t -> t.getCreatedAt().isBefore(requestTransaction.getCreatedAt())
								|| t.getId().equals(requestTransaction.getId()))
						.map(this::toTransactionResponse)
						.toList();
		PaymentDtos.PaymentResponse original = new PaymentDtos.PaymentResponse(
				payment.getId(), orderCode, requestTransaction.getMethod(), requestTransaction.getStatus(),
				payment.getAmount(), null, payment.getCreatedAt(), null, requestTransaction.getCreatedAt(),
				transactions);

		// Regenerated rather than stored: the QR is a pure function of (orderCode, amount, bank
		// config), so a replay reproduces the same quick link the customer already scanned.
		VietQrProvider.VietQrPayload payload = "VietQR".equals(requestTransaction.getMethod())
				? vietQrProvider.createPayload(orderCode, payment.getAmount())
				: null;
		return new PaymentDtos.PaymentRequestResponse(
				original, toVietQrResponse(payload, orderCode, requestTransaction.getStatus()));
	}

	private PaymentDtos.PaymentTransactionResponse toTransactionResponse(PaymentTransactionEntity transaction) {
		return new PaymentDtos.PaymentTransactionResponse(
				transaction.getId(), transaction.getMethod(), transaction.getStatus(), transaction.getAmount(),
				transaction.getProvider(), transaction.getProviderTransactionId(), transaction.getNote(),
				transaction.getCreatedAt());
	}

	private record MethodFingerprint(String method) {
	}
}
