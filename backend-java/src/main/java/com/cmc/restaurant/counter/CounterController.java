package com.cmc.restaurant.counter;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the counter-shift routes of .NET, including their {@code CounterOrAdmin} policy. */
@RestController
@PreAuthorize("hasAnyRole('CounterStaff', 'Admin')")
public class CounterController {

	private final CounterService counterService;

	public CounterController(CounterService counterService) {
		this.counterService = counterService;
	}

	@GetMapping("/api/counter/shifts/current")
	public ResponseEntity<CounterDtos.ShiftSummaryResponse> current() {
		// 204 rather than 404 when no shift is open: "nobody is on the till right now" is a normal
		// state the UI renders, not a missing resource.
		return counterService.current().map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.noContent().build());
	}

	@PostMapping("/api/counter/shifts/open")
	public CounterDtos.ShiftSummaryResponse open(
			@RequestBody(required = false) CounterDtos.OpenShiftRequest body,
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return counterService.open(body, principal == null ? null : principal.userId());
	}

	@PostMapping("/api/counter/shifts/{shiftId}/close")
	public CounterDtos.ShiftSummaryResponse close(
			@PathVariable String shiftId,
			@RequestBody(required = false) CounterDtos.CloseShiftRequest body,
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return counterService.close(shiftId, body, principal == null ? null : principal.userId());
	}

	@PostMapping("/api/counter/shifts/{shiftId}/adjustments")
	public CounterDtos.ShiftSummaryResponse adjust(
			@PathVariable String shiftId,
			@RequestBody(required = false) CounterDtos.AdjustmentRequest body,
			@AuthenticationPrincipal AuthenticatedPrincipal principal) {
		return counterService.adjust(shiftId, body, principal == null ? null : principal.userId());
	}
}
