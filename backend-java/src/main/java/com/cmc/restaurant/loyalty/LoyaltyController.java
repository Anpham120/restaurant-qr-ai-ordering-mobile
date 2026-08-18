package com.cmc.restaurant.loyalty;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors {@code GET /api/loyalty/lookup} (.NET), including its authorization: staff-only, because
 * anyone able to call it could enumerate which phone numbers are customers and how much they
 * spend. Admin CRUD for members/rewards stays out of scope. */
@RestController
public class LoyaltyController {

	private final LoyaltyService loyaltyService;

	public LoyaltyController(LoyaltyService loyaltyService) {
		this.loyaltyService = loyaltyService;
	}

	@GetMapping("/api/loyalty/lookup")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public LoyaltyDtos.LookupResponse lookup(@RequestParam(required = false) String phone) {
		return loyaltyService.lookup(phone);
	}
}
