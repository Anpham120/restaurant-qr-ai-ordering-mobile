package com.cmc.restaurant.tables;

import com.cmc.restaurant.tables.domain.TableSessionResumeState;
import java.time.OffsetDateTime;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Tables.TableContracts} (.NET) — public surface only
 * (admin table management is out of scope for this issue, see PR description). */
public final class TableDtos {

	private TableDtos() {
	}

	public record TableResponse(String tableCode, String displayName, boolean isActive) {
	}

	public record OpenTableSessionRequest(String qrToken, String tableCode) {
	}

	public record TableSessionResponse(
			String sessionId, String orderType, String status, String tableCode, String tableDisplayName,
			OffsetDateTime openedAt, OffsetDateTime expiresAt, OffsetDateTime closedAt, boolean isExpired) {
	}

	public record OpenTableSessionResponse(
			String sessionId, String orderType, String status, String tableCode, String tableDisplayName,
			OffsetDateTime openedAt, OffsetDateTime expiresAt, OffsetDateTime closedAt, boolean isExpired,
			String tableSessionToken, String resumeState) {
	}
}
