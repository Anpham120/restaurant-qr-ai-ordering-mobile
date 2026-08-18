package com.cmc.restaurant.payments;

import com.cmc.restaurant.payments.domain.Payment;
import com.cmc.restaurant.orders.ActorContext;
import com.cmc.restaurant.orders.OrderEntity;
import com.cmc.restaurant.orders.OrderRepository;
import com.cmc.restaurant.orders.OrderService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
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
public class CassoTransactionReconciler {

	/** Matches the transfer content built by {@link VietQrProvider} ("CMC ORD-1001"). Banks often
	 * wrap their own text around the description, so this searches rather than anchors. */
	private static final Pattern ORDER_CODE = Pattern.compile("CMC\\s+(ORD-\\d+)", Pattern.CASE_INSENSITIVE);

	private static final ActorContext CASSO_ACTOR = new ActorContext(null, "System");

	private final PaymentRepository paymentRepository;
	private final PaymentTransactionRepository transactionRepository;
	private final OrderRepository orderRepository;
	private final OrderService orderService;

	public CassoTransactionReconciler(
			PaymentRepository paymentRepository, PaymentTransactionRepository transactionRepository,
			OrderRepository orderRepository, OrderService orderService) {
		this.paymentRepository = paymentRepository;
		this.transactionRepository = transactionRepository;
		this.orderRepository = orderRepository;
		this.orderService = orderService;
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
	public CassoDtos.TransactionResult reconcile(CassoDtos.Transaction transaction) {
		return attempt(transaction);
	}

	private CassoDtos.TransactionResult attempt(CassoDtos.Transaction transaction) {
		String reference = transaction.reference() == null ? null : transaction.reference().trim();
		if (reference == null || reference.isEmpty()) {
			return result(transaction, "ignored", null, "Transaction has no reference to deduplicate on.");
		}

		// Idempotency pre-check. The DB index is what actually guarantees this; this lookup only
		// keeps the common replay path from throwing.
		if (transactionRepository.findByProviderAndProviderTransactionId("Casso", reference).isPresent()) {
			return result(transaction, "duplicate", null, "This bank reference was already reconciled.");
		}

		String orderCode = extractOrderCode(transaction.description());
		if (orderCode == null) {
			return result(transaction, "unmatched", null,
					"Description does not contain a 'CMC ORD-xxxx' transfer content.");
		}

		Optional<OrderEntity> order = orderRepository.findByOrderCode(orderCode);
		if (order.isEmpty()) {
			return result(transaction, "unmatched", orderCode, "No order exists with this code.");
		}

		PaymentEntity payment = paymentRepository.findByOrderId(order.get().getId()).orElse(null);
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
				payment.getMethod().name(), "Confirmed", payment.getAmount(), "Casso", reference, note,
				now, null, null));
		orderService.recordPaymentStatusEvent(orderCode, CASSO_ACTOR, note);

		// Flushed here so an optimistic-lock clash or a duplicate-reference insert surfaces inside
		// reconcile()'s catch blocks, rather than at commit time where it could not be classified.
		paymentRepository.saveAndFlush(payment);
		transactionRepository.flush();

		return result(transaction, "confirmed", orderCode, "Payment confirmed automatically.");
	}

	static String extractOrderCode(String description) {
		if (description == null) {
			return null;
		}
		Matcher matcher = ORDER_CODE.matcher(description);
		return matcher.find() ? matcher.group(1).toUpperCase(Locale.ROOT) : null;
	}

	private static CassoDtos.TransactionResult result(
			CassoDtos.Transaction transaction, String outcome, String orderCode, String detail) {
		return new CassoDtos.TransactionResult(transaction.reference(), outcome, orderCode, detail);
	}
}
