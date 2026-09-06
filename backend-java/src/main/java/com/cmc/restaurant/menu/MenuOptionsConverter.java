package com.cmc.restaurant.menu;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.List;

@Converter
public class MenuOptionsConverter implements AttributeConverter<List<MenuOptionGroup>, String> {
	private static final ObjectMapper JSON = new ObjectMapper();

	@Override
	public String convertToDatabaseColumn(List<MenuOptionGroup> groups) {
		try {
			return JSON.writeValueAsString(groups == null ? List.of() : groups);
		} catch (com.fasterxml.jackson.core.JsonProcessingException e) {
			throw new IllegalArgumentException("Invalid menu options", e);
		}
	}

	@Override
	public List<MenuOptionGroup> convertToEntityAttribute(String json) {
		try {
			return json == null ? List.of() : JSON.readValue(json, new TypeReference<>() { });
		} catch (com.fasterxml.jackson.core.JsonProcessingException e) {
			throw new IllegalArgumentException("Invalid stored menu options", e);
		}
	}
}
