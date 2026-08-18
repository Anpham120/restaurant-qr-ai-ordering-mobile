package com.cmc.restaurant.payments;

import com.cmc.restaurant.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.UnexpectedRollbackException;

/**
 * Hạn chế #3 — auto-reconciles VietQR transfers reported by Casso, replacing the counter's manual
 * "I looked at the bank statement" step. The manual confirm endpoint from issue #10 stays
 * permanently as the fallback (plan §6 mục #3), so this must lose gracefully when both fire.
 *
 * <p>Per-transaction settlement lives in {@link CassoTransactionReconciler} so each entry commits
 * independently — see that class for why it is a separate bean.
 */
@Service
public class CassoWebhookService {

	private final CassoProperties properties;
	private final CassoTransactionReconciler reconciler;

	public CassoWebhookService(CassoProperties properties, CassoTransactionReconciler reconciler) {
		this.properties = properties;
		this.reconciler = reconciler;
	}

	/**
	 * Constant-time comparison of the {@code Secure-Token} header. Must run before the payload is
	 * looked at at all: accepting a forged body would mark orders paid without money arriving.
	 */
	public void verifyToken(String suppliedToken) {
		String expected = properties.secureToken();
		if (expected == null || expected.isBlank()) {
			throw ApiException.unauthorized(
					"CASSO_WEBHOOK_NOT_CONFIGURED", "Casso webhook is not configured on this deployment.");
		}
		if (suppliedToken == null || !constantTimeEquals(expected, suppliedToken)) {
			throw ApiException.unauthorized("CASSO_TOKEN_INVALID", "Invalid Casso webhook token.");
		}
	}

	private static boolean constantTimeEquals(String expected, String supplied) {
		byte[] a = expected.getBytes(StandardCharsets.UTF_8);
		byte[] b = supplied.getBytes(StandardCharsets.UTF_8);
		if (a.length != b.length) {
			return false;
		}
		int diff = 0;
		for (int i = 0; i < a.length; i++) {
			diff |= a[i] ^ b[i];
		}
		return diff == 0;
	}

	public CassoDtos.WebhookResponse handle(CassoDtos.WebhookRequest request) {
		List<CassoDtos.Transaction> transactions =
				request == null || request.data() == null ? List.of() : request.data();

		List<CassoDtos.TransactionResult> results = new ArrayList<>();
		int confirmed = 0;
		for (CassoDtos.Transaction transaction : transactions) {
			CassoDtos.TransactionResult result = reconcileClassifyingRaces(transaction);
			results.add(result);
			if ("confirmed".equals(result.outcome())) {
				confirmed++;
			}
		}
		return new CassoDtos.WebhookResponse(transactions.size(), confirmed, results);
	}

	/**
	 * Catches concurrency failures <em>outside</em> {@link CassoTransactionReconciler#reconcile}'s
	 * {@code REQUIRES_NEW} boundary, so that transaction has already rolled back by the time we
	 * classify it. Both outcomes below mean "someone else already handled this money", which is a
	 * success as far as Casso is concerned — answering non-200 would only trigger its 17-retry
	 * cycle for a transfer that is already settled.
	 */
	private CassoDtos.TransactionResult reconcileClassifyingRaces(CassoDtos.Transaction transaction) {
		try {
			return reconciler.reconcile(transaction);
		} catch (ObjectOptimisticLockingFailureException e) {
			// The counter confirmed this payment by hand between our read and our write. Their
			// write stands — report it rather than overwriting a human decision.
			return new CassoDtos.TransactionResult(transaction.reference(), "already_settled", null,
					"Payment was settled by another actor while this webhook was being processed.");
		} catch (DataIntegrityViolationException | UnexpectedRollbackException e) {
			// Lost the race against a concurrent delivery of the SAME reference; the partial unique
			// index (V7) rejected the second ledger row. UnexpectedRollbackException is included
			// because a constraint violation detected at commit time surfaces under that type.
			return new CassoDtos.TransactionResult(transaction.reference(), "duplicate", null,
					"This bank reference was already reconciled by a concurrent delivery.");
		}
	}
}
