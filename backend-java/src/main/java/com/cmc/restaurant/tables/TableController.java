package com.cmc.restaurant.tables;

import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableDtos.OpenTableSessionRequest;
import com.cmc.restaurant.tables.TableDtos.OpenTableSessionResponse;
import com.cmc.restaurant.tables.TableDtos.TableResponse;
import com.cmc.restaurant.tables.TableDtos.TableSessionResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the public + session-lifecycle subset of {@code TableEndpoints.cs} (.NET). Admin table
 * management (create/list/rotate QR) is out of scope for this issue — see PR description. */
@RestController
public class TableController {

	private final RestaurantTableRepository tableRepository;
	private final TableSessionService sessionService;

	public TableController(RestaurantTableRepository tableRepository, TableSessionService sessionService) {
		this.tableRepository = tableRepository;
		this.sessionService = sessionService;
	}

	@GetMapping("/api/tables/{tableCode}")
	public TableResponse getTable(@PathVariable String tableCode) {
		String normalized = TableSessionService.normalizeTableCode(tableCode);
		if (normalized == null) {
			throw ApiException.badRequest("TABLE_CODE_INVALID", "Table code must match format T01.");
		}
		RestaurantTableEntity table = tableRepository.findByTableCodeAndActiveTrue(normalized)
				.orElseThrow(() -> ApiException.notFound("TABLE_NOT_FOUND", "Active table was not found."));
		return new TableResponse(table.getTableCode(), table.getDisplayName(), table.isActive());
	}

	@PostMapping("/api/table-sessions")
	public OpenTableSessionResponse openTableSession(@RequestBody OpenTableSessionRequest request) {
		return sessionService.openOrResumeSession(request);
	}

	@GetMapping("/api/table-sessions/{sessionId}")
	public OpenTableSessionResponse getTableSession(
			@PathVariable String sessionId, HttpServletRequest request) {
		String token = request.getHeader("X-Table-Session-Token");
		if (token == null || token.isBlank()) {
			throw new ApiException(
					org.springframework.http.HttpStatus.UNAUTHORIZED,
					"TABLE_SESSION_TOKEN_INVALID", "A valid table session token is required.");
		}
		return sessionService.getSessionForResume(sessionId, token);
	}

	@PostMapping("/api/table-sessions/{sessionId}/close")
	@PreAuthorize("hasAnyRole('Staff', 'Admin')")
	public TableSessionResponse closeTableSession(@PathVariable String sessionId) {
		return sessionService.closeSession(sessionId);
	}
}
