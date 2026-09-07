package com.cmc.restaurant.menu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.cmc.restaurant.shared.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ShopRulesTest {
	private MenuItemEntity drink() {
		MenuItemEntity item = new MenuItemEntity("matcha", "shop_matcha", "Matcha", "", new BigDecimal("45000"),
				null, true, List.of(), OffsetDateTime.now());
		item.setOptionGroups(List.of(new MenuOptionGroup("size", "Kích cỡ", 1, 1, List.of(
				new MenuOptionGroup.Option("m", "M", BigDecimal.ZERO, true),
				new MenuOptionGroup.Option("l", "L", new BigDecimal("10000"), true),
				new MenuOptionGroup.Option("xl", "XL", new BigDecimal("20000"), false)))));
		return item;
	}

	@Test
	void menuSelectionSnapshotsServerPriceAndDescription() {
		MenuItemEntity item = drink();
		MenuSelection selected = MenuSelection.price(item, List.of("l"), "  Ít ngọt  ");
		assertThat(selected.unitPrice()).isEqualByComparingTo("55000");
		assertThat(selected.note()).isEqualTo("Kích cỡ: L · Ít ngọt");
		item.setPrice(new BigDecimal("100000"));
		assertThat(selected.unitPrice()).isEqualByComparingTo("55000");
	}

	@Test
	void rejectsMissingDuplicateForeignAndUnavailableChoices() {
		for (List<String> choices : List.of(List.<String>of(), List.of("m", "l"), List.of("m", "m"),
				List.of("m", "free_discount"), List.of("xl"))) {
			assertThatThrownBy(() -> MenuSelection.price(drink(), choices, null)).isInstanceOf(ApiException.class);
		}
	}

	@Test
	void optionsRoundTripAndLegacyNullIsEmpty() {
		MenuOptionsConverter converter = new MenuOptionsConverter();
		assertThat(converter.convertToEntityAttribute(converter.convertToDatabaseColumn(drink().getOptionGroups())))
				.isEqualTo(drink().getOptionGroups());
		assertThat(converter.convertToEntityAttribute(null)).isEmpty();
	}

	/**
	 * Hàng {@code shop_settings} đã lưu còn mang các khoá của biểu phí giao hàng cũ
	 * ({@code shippingPerKm}, {@code allowCod}, toạ độ...). Đọc lại phải bỏ qua chúng, không vỡ.
	 */
	@Test
	void docDuocCauHinhCuConMangKhoaBieuPhiShip() {
		ShopSettingsRepository settings = mock(ShopSettingsRepository.class);
		when(settings.findById("main")).thenReturn(Optional.of(new ShopSettingsEntity(
				"{\"name\":\"Mây\",\"address\":\"Hà Đông\",\"phone\":\"\",\"estimatedMinutesLow\":25,"
				+ "\"estimatedMinutesHigh\":40,\"shippingPerKm\":4000,\"allowCod\":true,\"latitude\":20.98}")));

		ShopConfig.Response doc = new ShopConfig(settings, new ObjectMapper()).response();

		assertThat(doc.name()).isEqualTo("Mây");
		assertThat(doc.estimatedMinutesHigh()).isEqualTo(40);
	}

	@Test
	void rejectsDuplicateOptionIdsAcrossGroupsToPreventDoubleCharging() {
		MenuOptionGroup group = drink().getOptionGroups().getFirst();
		MenuOptionGroup duplicate = new MenuOptionGroup("other", "Khác", 0, 1, group.options());
		assertThatThrownBy(() -> MenuItemService.validateOptions(List.of(group, duplicate))).isInstanceOf(ApiException.class);
	}
}
