package com.cmc.restaurant.payments;

import com.cmc.restaurant.orders.ActorContext;
import com.cmc.restaurant.orders.OrderEntity;
import com.cmc.restaurant.orders.OrderRepository;
import com.cmc.restaurant.orders.OrderService;
import com.cmc.restaurant.orders.RequestIdempotency;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.shared.CustomerTokenGuard;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mirrors {@code PaymentEndpoints.cs} (.NET) — issue #10 scope is the COD/manual-confirmation
 * flow. {@code method == "VietQR"} is rejected for now (issue #11 wires real QR generation);
 * realtime notification and Loyalty accrual on confirm are out of scope (Realtime is issue #13;
 * Loyalty deliberately stays on .NET — see PR description).
 */
@Service
public class PaymentService {

	private static final int MAX_NOTE_LENGTH = 500;
	private static final Set<String> ALREADY_REQUESTED_STATUSES =
			Set.of("Pending", "Confirmed", "Paid", "Refunded");

	private final PaymentRepository paymentRepository;
	private final PaymentTransactionRepository transactionRepository;
	private final OrderRepository orderRepository;
	private final OrderService orderService;
	private final VietQrProvider vietQrProvider;
	private final OrderRealtimeNotifier realtimeNotifier;

	public PaymentService(
			PaymentRepository paymentRepository, PaymentTransactionRepository transactionRepository,
			OrderRepository orderRepository, OrderService orderService, VietQrProvider vietQrProvider,
			OrderRealtimeNotifier realtimeNotifier) {
		this.paymentRepository = paymentRepository;
		this.transactionRepository = transactionRepository;
		this.orderRepository = orderRepository;
		this.orderService = orderService;
		this.vietQrProvider = vietQrProvider;
		this.realtimeNotifier = realtimeNotifier;
	}

	public PaymentDtos.PaymentResponse getPayment(String orderCode, String suppliedAccessToken, boolean isOperator) {
		OrderEntity order = orderRepository.findByOrderCode(orderCode.trim()).orElse(null);
		if (order == null || (!isOperator && !CustomerTokenGuard.hasCustomerToken(
				order.getCustomerAccessToken(), suppliedAccessToken))) {
			throw ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found.");
		}
		PaymentEntity payment = paymentRepository.findByOrderId(order.getId())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));
		return toResponse(payment, order.getOrderCode());
	}

	@Transactional
	public PaymentDtos.PaymentRequestResponse requestPayment(
			String orderCode, PaymentDtos.PaymentRequestRequest request, String idempotencyKey,
			String suppliedAccessToken) {
		OrderEntity order = orderRepository.findByOrderCode(orderCode.trim()).orElse(null);
		if (order == null
				|| !CustomerTokenGuard.hasCustomerToken(order.getCustomerAccessToken(), suppliedAccessToken)) {
			throw ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found.");
		}
		PaymentEntity payment = paymentRepository.findByOrderId(order.getId())
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

		if (ALREADY_REQUESTED_STATUSES.contains(payment.getStatus())) {
			throw ApiException.conflict("PAYMENT_ALREADY_REQUESTED", "Payment was already requested or completed.");
		}

		// Built before any mutation, exactly as in .NET: an unconfigured VietQR deployment must
		// fail the request outright rather than leave the payment flipped to Pending with no QR.
		VietQrProvider.VietQrPayload payload = null;
		if ("VietQR".equals(method)) {
			try {
				payload = vietQrProvider.createPayload(order.getOrderCode(), payment.getAmount());
			} catch (IllegalStateException e) {
				throw ApiException.badRequest("VIETQR_CONFIG_MISSING", "VietQR bank configuration is missing.");
			}
		}

		OffsetDateTime now = OffsetDateTime.now();
		payment.setMethod(method);
		payment.setStatus("Pending");
		payment.setUpdatedAt(now);
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
				order.getId(), order.getOrderCode(), payment.getMethod(), payment.getStatus(),
				payment.getAmount(), payment.getUpdatedAt(), order.getTableCode()));

		return new PaymentDtos.PaymentRequestResponse(
				toResponse(payment, order.getOrderCode()),
				toVietQrResponse(payload, order.getOrderCode(), "Pending"));
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
			PaymentTransactionEntity existingRequest, PaymentEntity payment, OrderEntity order,
			String requestFingerprint) {
		if (!existingRequest.getPaymentId().equals(payment.getId())
				|| !requestFingerprint.equals(existingRequest.getRequestFingerprint())) {
			throw ApiException.conflict(
					"IDEMPOTENCY_KEY_REUSED", "Idempotency key was already used with a different request.");
		}
		return toReplayResponse(payment, existingRequest, order.getOrderCode());
	}

	@Transactional
	public PaymentDtos.PaymentResponse confirmPayment(
			String orderCode, PaymentDtos.ConfirmPaymentRequest request, ActorContext actor) {
		String requestedNote = request == null ? null : request.note();
		validateNote(requestedNote);
		OrderEntity order = orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));
		PaymentEntity payment = paymentRepository.findByOrderId(order.getId())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));

		validateManualTransition(payment, "Confirmed");

		OffsetDateTime now = OffsetDateTime.now();
		String note = isBlank(requestedNote) ? "Manual staff confirmation." : requestedNote.trim();
		String requestedProviderTransactionId = request == null ? null : request.providerTransactionId();
		payment.setStatus("Confirmed");
		if (!isBlank(requestedProviderTransactionId)) {
			payment.setProviderTransactionId(requestedProviderTransactionId.trim());
		}
		payment.setPaidAt(now);
		payment.setUpdatedAt(now);
		addTransaction(payment, "Confirmed", note, now);
		orderService.recordPaymentStatusEvent(orderCode, actor, note);

		savePaymentOrConflict(payment);
		return toResponse(payment, order.getOrderCode());
	}

	@Transactional
	public PaymentDtos.PaymentResponse failPayment(
			String orderCode, PaymentDtos.FailPaymentRequest request, ActorContext actor) {
		String requestedNote = request == null ? null : request.note();
		validateNote(requestedNote);
		OrderEntity order = orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));
		PaymentEntity payment = paymentRepository.findByOrderId(order.getId())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));

		validateManualTransition(payment, "Failed");

		OffsetDateTime now = OffsetDateTime.now();
		String note = isBlank(requestedNote) ? "Manual payment failure." : requestedNote.trim();
		payment.setStatus("Failed");
		payment.setUpdatedAt(now);
		addTransaction(payment, "Failed", note, now);
		orderService.recordPaymentStatusEvent(orderCode, actor, note);

		savePaymentOrConflict(payment);
		return toResponse(payment, order.getOrderCode());
	}

	@Transactional
	public PaymentDtos.PaymentResponse refundPayment(
			String orderCode, PaymentDtos.RefundPaymentRequest request, ActorContext actor) {
		String requestedNote = request == null ? null : request.note();
		validateNote(requestedNote);
		OrderEntity order = orderRepository.findByOrderCode(orderCode.trim())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));
		PaymentEntity payment = paymentRepository.findByOrderId(order.getId())
				.orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "Payment was not found."));

		if (!"Confirmed".equals(payment.getStatus()) && !"Paid".equals(payment.getStatus())) {
			throw ApiException.badRequest(
					"PAYMENT_NOT_REFUNDABLE", "Only a confirmed or paid payment can be refunded.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		String note = isBlank(requestedNote) ? "Manual payment refund." : requestedNote.trim();
		payment.setStatus("Refunded");
		payment.setUpdatedAt(now);
		addTransaction(payment, "Refunded", note, now);
		orderService.recordPaymentStatusEvent(orderCode, actor, note);

		savePaymentOrConflict(payment);
		return toResponse(payment, order.getOrderCode());
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

	private void addTransaction(PaymentEntity payment, String status, String note, OffsetDateTime now) {
		transactionRepository.save(new PaymentTransactionEntity(
				"ptx_" + UUID.randomUUID().toString().replace("-", ""), payment.getId(), payment.getMethod(), status,
				payment.getAmount(), payment.getMethod(), payment.getProviderTransactionId(), note, now, null, null));
	}

	private void validateManualTransition(PaymentEntity payment, String nextStatus) {
		if ("NotRequested".equals(payment.getStatus()) || "Unselected".equals(payment.getMethod())) {
			throw ApiException.badRequest("PAYMENT_NOT_REQUESTED", "Customer has not requested payment yet.");
		}
		if ("Refunded".equals(payment.getStatus())) {
			String action = "Confirmed".equals(nextStatus) ? "confirmed" : "failed";
			throw ApiException.badRequest("PAYMENT_ALREADY_REFUNDED", "Refunded payment cannot be " + action + ".");
		}
		if ("Confirmed".equals(payment.getStatus()) || "Paid".equals(payment.getStatus())) {
			String message = "Confirmed".equals(nextStatus)
					? "Payment was already confirmed." : "Confirmed payment cannot be failed.";
			throw ApiException.badRequest("PAYMENT_ALREADY_CONFIRMED", message);
		}
		if ("Failed".equals(payment.getStatus())) {
			String message = "Confirmed".equals(nextStatus)
					? "Failed payment cannot be confirmed." : "Payment was already failed.";
			throw ApiException.badRequest("PAYMENT_ALREADY_FAILED", message);
		}
	}

	private static void validateNote(String note) {
		if (note != null && note.trim().length() > MAX_NOTE_LENGTH) {
			throw ApiException.badRequest(
					"PAYMENT_NOTE_TOO_LONG", "Payment note must be " + MAX_NOTE_LENGTH + " characters or fewer.");
		}
	}

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}

	private PaymentDtos.PaymentResponse toResponse(PaymentEntity payment, String orderCode) {
		List<PaymentDtos.PaymentTransactionResponse> transactions =
				transactionRepository.findByPaymentIdOrderByCreatedAtAsc(payment.getId()).stream()
						.map(this::toTransactionResponse)
						.toList();
		return new PaymentDtos.PaymentResponse(
				payment.getId(), orderCode, payment.getMethod(), payment.getStatus(), payment.getAmount(),
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
