package com.cmc.restaurant.menu;

import com.cmc.restaurant.menu.MenuDtos.MenuResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors {@code GET /api/menu} in {@code MenuEndpoints.cs} (.NET) — public, no auth required. */
@RestController
public class MenuController {

	private final MenuQueryService menuQueryService;

	public MenuController(MenuQueryService menuQueryService) {
		this.menuQueryService = menuQueryService;
	}

	@GetMapping("/api/menu")
	public MenuResponse getMenu() {
		return menuQueryService.getPublicMenu();
	}
}
