package com.cmc.restaurant.payments;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
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

	private static final Set<String> ALREADY_SETTLED = Set.of("Confirmed", "Paid", "Refunded");
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

	/** Commits (or rolls back) on its own, so a bad entry never undoes an already-settled sibling
	 * in the same Casso batch. */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public CassoDtos.TransactionResult reconcile(CassoDtos.Transaction transaction) {
		try {
			return attempt(transaction);
		} catch (ObjectOptimisticLockingFailureException e) {
			// The counter confirmed this payment by hand between our read and our write. Their
			// write stands — report it rather than overwriting a human decision.
			return result(transaction, "already_settled", null,
					"Payment was settled by another actor while this webhook was being processed.");
		} catch (DataIntegrityViolationException e) {
			// Lost the race against a concurrent delivery of the SAME reference; the partial unique
			// index (V7) rejected the second ledger row. From Casso's side that is still success.
			return result(transaction, "duplicate", null,
					"This bank reference was already reconciled by a concurrent delivery.");
		}
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

		if (ALREADY_SETTLED.contains(payment.getStatus())) {
			// Usually the counter got there first via the manual fallback — expected, not an error.
			return result(transaction, "already_settled", orderCode, "Payment is already " + payment.getStatus() + ".");
		}

		// Whole-dong comparison: a VietQR transfer carries the truncated amount (see
		// VietQrProvider), so an order of 110000.99 legitimately receives 110000.
		BigDecimal expected = payment.getAmount().setScale(0, RoundingMode.DOWN);
		BigDecimal received = transaction.amount() == null
				? BigDecimal.valueOf(-1) : transaction.amount().setScale(0, RoundingMode.DOWN);
		if (expected.compareTo(received) != 0) {
			// Deliberately NOT confirmed: settling on a short transfer loses real money, and an
			// over-transfer needs a human to decide on a refund.
			return result(transaction, "amount_mismatch", orderCode,
					"Expected " + expected.toPlainString() + " but received " + received.toPlainString() + ".");
		}

		OffsetDateTime now = OffsetDateTime.now();
		payment.setStatus("Confirmed");
		payment.setProviderTransactionId(reference);
		payment.setPaidAt(now);
		payment.setUpdatedAt(now);

		String note = "Auto-confirmed from Casso bank transaction " + reference + ".";
		transactionRepository.save(new PaymentTransactionEntity(
				"ptx_" + UUID.randomUUID().toString().replace("-", ""), payment.getId(), payment.getMethod(),
				"Confirmed", payment.getAmount(), "Casso", reference, note, now, null, null));
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
