package com.cmc.restaurant.tables;

import com.cmc.restaurant.tables.domain.TableSession;
import com.cmc.restaurant.tables.domain.TableSessionResumeState;
import java.util.List;

/**
 * Kept as a thin delegate so existing call sites do not all have to change in one commit; the rule
 * itself moved into {@link TableSession#resolveResumeState} (issue #62).
 *
 * <p>Deliberately not deleted yet and deliberately not reimplemented here — a second copy of the
 * resume rules is exactly the drift the domain split exists to prevent.
 */
public final class TableSessionResumeStateResolver {

	private TableSessionResumeStateResolver() {
	}

	public static TableSessionResumeState resolve(
			long cartItemCount, List<String> orderStatuses, String invoiceStatus) {
		return TableSession.resolveResumeState(cartItemCount, orderStatuses, invoiceStatus);
	}
}
