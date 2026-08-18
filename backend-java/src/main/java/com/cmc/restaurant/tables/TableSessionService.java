package com.cmc.restaurant.tables;

import com.cmc.restaurant.tables.domain.TableSessionResumeState;
import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableDtos.OpenTableSessionRequest;
import com.cmc.restaurant.tables.TableDtos.OpenTableSessionResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Mirrors {@code OpenDineInSessionAsync} in {@code TableEndpoints.cs} (.NET). Same two-layer
 * concurrency guard: an in-process lock per table (fast path, reduces the race window) plus the
 * real guarantee — the database's filtered unique index
 * {@code UX_table_sessions_active_restaurant_table} (one open session per table), enforced by
 * catching the constraint violation and re-reading whichever request actually won.
 */
@Service
public class TableSessionService {

	private static final Logger log = LoggerFactory.getLogger(TableSessionService.class);
	private static final Duration DEFAULT_SESSION_LIFETIME = Duration.ofHours(4);
	private static final Pattern TABLE_CODE_PATTERN = Pattern.compile("^T(0[1-9]|[1-9][0-9])$");

	private final RestaurantTableRepository tableRepository;
	private final TableSessionRepository sessionRepository;
	private final ResumeStateQueryService resumeStateQueryService;
	private final TableSessionCapability capability;
	private final JwtProperties jwtProperties;
	private final ConcurrentHashMap<String, ReentrantLock> sessionOpenGates = new ConcurrentHashMap<>();

	public TableSessionService(
			RestaurantTableRepository tableRepository,
			TableSessionRepository sessionRepository,
			ResumeStateQueryService resumeStateQueryService,
			TableSessionCapability capability,
			JwtProperties jwtProperties) {
		this.tableRepository = tableRepository;
		this.sessionRepository = sessionRepository;
		this.resumeStateQueryService = resumeStateQueryService;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
	}

	public OpenTableSessionResponse openOrResumeSession(OpenTableSessionRequest request) {
		String qrToken = normalizeQrToken(request == null ? null : request.qrToken());
		if (qrToken == null) {
			throw ApiException.badRequest("QR_TOKEN_INVALID", "Dine-in sessions require a QR token.");
		}

		RestaurantTableEntity table = tableRepository.findByQrTokenAndActiveTrue(qrToken)
				.orElseThrow(() -> ApiException.notFound("QR_NOT_FOUND", "QR token does not match an active table."));

		String requestedTableCode = normalizeTableCode(request.tableCode());
		if (request.tableCode() != null && !request.tableCode().isBlank() && requestedTableCode == null) {
			throw ApiException.badRequest("TABLE_CODE_INVALID", "Table code must match format T01.");
		}
		if (requestedTableCode != null && !table.getTableCode().equalsIgnoreCase(requestedTableCode)) {
			throw ApiException.badRequest("QR_TABLE_MISMATCH", "QR token does not belong to the requested table.");
		}

		ReentrantLock gate = sessionOpenGates.computeIfAbsent(table.getId(), id -> new ReentrantLock());
		gate.lock();
		try {
			OffsetDateTime now = OffsetDateTime.now();
			expireStaleSessions(table.getId(), now);

			Optional<TableSessionEntity> existing = sessionRepository.findActiveSession(table.getId(), now);
			TableSessionEntity session = existing.orElseGet(() -> createSession(table, qrToken, now));

			attachMemberIdIfAuthenticated(session);

			TableSessionResumeState resumeState = resumeStateQueryService.resolve(session.getId());
			log.info(
					"Resolved table session {} for table {}; reused={}; resumeState={}",
					session.getId(), table.getTableCode(), existing.isPresent(), resumeState);

			return toResponse(session, table, now, resumeState);
		} finally {
			gate.unlock();
		}
	}

	private TableSessionEntity createSession(RestaurantTableEntity table, String qrToken, OffsetDateTime now) {
		TableSessionEntity newSession = new TableSessionEntity(
				"ts_" + UUID.randomUUID().toString().replace("-", ""),
				table.getId(), table.getTableCode(), qrToken, now, now.plus(DEFAULT_SESSION_LIFETIME));

		try {
			return sessionRepository.saveAndFlush(newSession);
		} catch (DataIntegrityViolationException e) {
			// Lost the race to another request (multi-instance deployment, or the in-process lock
			// didn't cover it) — the unique index rejected our insert, so re-read whoever won.
			return sessionRepository.findActiveSession(table.getId(), now)
					.orElseThrow(() -> e);
		}
	}

	private void expireStaleSessions(String tableId, OffsetDateTime now) {
		List<TableSessionEntity> openSessions =
				sessionRepository.findByRestaurantTableIdAndStatus(tableId, TableSessionStatus.Open);
		for (TableSessionEntity session : openSessions) {
			if (session.expireIfPast(now)) {
				sessionRepository.save(session);
			}
		}
	}

	private void attachMemberIdIfAuthenticated(TableSessionEntity session) {
		if (session.getMemberId() != null) {
			return;
		}
		Object principal = SecurityContextHolder.getContext().getAuthentication() == null
				? null
				: SecurityContextHolder.getContext().getAuthentication().getPrincipal();
		if (principal instanceof AuthenticatedPrincipal authenticated) {
			session.setMemberId(authenticated.userId());
			sessionRepository.save(session);
		}
	}

	public OpenTableSessionResponse getSessionForResume(String sessionId, String suppliedToken) {
		TableSessionEntity session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> ApiException.notFound("TABLE_SESSION_NOT_FOUND", "Table session was not found."));

		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "TABLE_SESSION_TOKEN_INVALID",
					"A valid table session token is required.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		if (session.isExpired(now)) {
			if (session.expireIfPast(now)) {
				sessionRepository.save(session);
			}
			throw new ApiException(HttpStatus.GONE, "TABLE_SESSION_EXPIRED",
					"Table session has expired. Please scan QR again.");
		}

		RestaurantTableEntity table = tableRepository.findById(session.getRestaurantTableId()).orElse(null);
		TableSessionResumeState resumeState = resumeStateQueryService.resolve(session.getId());
		return toResponse(session, table, now, resumeState);
	}

	public TableDtos.TableSessionResponse closeSession(String sessionId) {
		TableSessionEntity session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> ApiException.notFound("TABLE_SESSION_NOT_FOUND", "Table session was not found."));

		OffsetDateTime now = OffsetDateTime.now();
		if (session.getStatus() != TableSessionStatus.Closed) {
			session.setStatus(TableSessionStatus.Closed);
			session.setClosedAt(now);
			session.setUpdatedAt(now);
			sessionRepository.save(session);
		}
		// Note: .NET also deletes chat sessions linked to this table session here
		// (IChatStore.DeleteSessionsByTableSession) — no-op until the Chat module exists (#14).

		RestaurantTableEntity table = tableRepository.findById(session.getRestaurantTableId()).orElse(null);
		return toSessionResponse(session, table, now);
	}

	private OpenTableSessionResponse toResponse(
			TableSessionEntity session, RestaurantTableEntity table, OffsetDateTime now,
			TableSessionResumeState resumeState) {
		return new OpenTableSessionResponse(
				session.getId(), session.getOrderType(), session.getStatus().name(), session.getTableCode(),
				table.getDisplayName(), session.getOpenedAt(), session.getExpiresAt(), session.getClosedAt(),
				session.isExpired(now), capability.createToken(session, jwtProperties.signingKey()),
				resumeState.name());
	}

	TableDtos.TableSessionResponse toSessionResponse(
			TableSessionEntity session, RestaurantTableEntity table, OffsetDateTime now) {
		return new TableDtos.TableSessionResponse(
				session.getId(), session.getOrderType(), session.getStatus().name(), session.getTableCode(),
				table == null ? null : table.getDisplayName(), session.getOpenedAt(), session.getExpiresAt(),
				session.getClosedAt(), session.isExpired(now));
	}

	static String normalizeTableCode(String tableCode) {
		if (tableCode == null || tableCode.isBlank()) {
			return null;
		}
		String normalized = tableCode.trim().toUpperCase(java.util.Locale.ROOT);
		return TABLE_CODE_PATTERN.matcher(normalized).matches() ? normalized : null;
	}

	static String normalizeQrToken(String qrToken) {
		return (qrToken == null || qrToken.isBlank()) ? null : qrToken.trim();
	}
}
