package com.cmc.restaurant.menu;

import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Validates choices against this item, never trusting a price sent by a client. */
public record MenuSelection(BigDecimal unitPrice, String note) {
	public static MenuSelection price(MenuItemEntity item, List<String> requested, String note) {
		List<String> ids = requested == null ? List.of() : requested;
		if (ids.size() > 30 || ids.stream().anyMatch(id -> id == null || id.isBlank())
				|| new HashSet<>(ids).size() != ids.size()) {
			throw ApiException.badRequest("MENU_OPTIONS_INVALID", "Tùy chọn món không hợp lệ.");
		}
		if (note != null && note.trim().length() > 500) {
			throw ApiException.badRequest("ORDER_ITEM_NOTE_TOO_LONG", "Ghi chú món tối đa 500 ký tự.");
		}
		Set<String> remaining = new HashSet<>(ids);
		BigDecimal unitPrice = item.getPrice();
		List<String> descriptions = new ArrayList<>();
		for (MenuOptionGroup group : item.getOptionGroups()) {
			List<MenuOptionGroup.Option> chosen = group.options().stream()
					.filter(option -> ids.contains(option.id())).toList();
			if (chosen.size() < group.minSelections() || chosen.size() > group.maxSelections()) {
				throw ApiException.badRequest("MENU_OPTIONS_REQUIRED", "Vui lòng chọn đúng số lượng: " + group.name());
			}
			for (MenuOptionGroup.Option option : chosen) {
				if (!option.isAvailable()) {
					throw ApiException.badRequest("MENU_OPTION_UNAVAILABLE", "Tùy chọn đã hết: " + option.name());
				}
				remaining.remove(option.id());
				unitPrice = unitPrice.add(option.price());
				descriptions.add(group.name() + ": " + option.name());
			}
		}
		if (!remaining.isEmpty()) {
			throw ApiException.badRequest("MENU_OPTIONS_INVALID", "Tùy chọn không thuộc món này.");
		}
		if (note != null && !note.isBlank()) {
			descriptions.add(note.trim());
		}
		return new MenuSelection(unitPrice, descriptions.isEmpty() ? null : String.join(" · ", descriptions));
	}
}
