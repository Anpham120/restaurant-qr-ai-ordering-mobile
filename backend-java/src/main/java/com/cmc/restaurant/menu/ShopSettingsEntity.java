package com.cmc.restaurant.menu;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "shop_settings")
public class ShopSettingsEntity {
	@Id
	private String id = "main";
	@Column(name = "settings_json", nullable = false, columnDefinition = "text")
	private String settingsJson;

	protected ShopSettingsEntity() {
	}

	public ShopSettingsEntity(String settingsJson) {
		this.settingsJson = settingsJson;
	}

	public String getSettingsJson() {
		return settingsJson;
	}
}
