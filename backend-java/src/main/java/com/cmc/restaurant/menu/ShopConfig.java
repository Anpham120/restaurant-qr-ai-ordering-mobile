package com.cmc.restaurant.menu;

import com.cmc.restaurant.shared.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Persisted shop origin and radius-based delivery tariff. */
@Service
public class ShopConfig {
	private final ShopSettingsRepository settings;
	private final ObjectMapper json;

	public ShopConfig(ShopSettingsRepository settings, ObjectMapper json) {
		this.settings = settings;
		this.json = json;
	}

	@Transactional(readOnly = true)
	public Response response() {
		return settings.findById("main").map(row -> {
			try {
				return json.readValue(row.getSettingsJson(), Response.class);
			} catch (JsonProcessingException e) {
				throw new IllegalStateException("Invalid shop settings", e);
			}
		}).orElseGet(ShopConfig::defaults);
	}

	public static Response defaults() {
		return new Response("Mây", BigDecimal.ZERO, BigDecimal.ZERO,
				"Đại học CMC cơ sở 2, tòa nhà Vạn Phúc, Tố Hữu, Hà Đông, Hà Nội", "",
				25, 40, true, 20.9834, 105.77267, new BigDecimal("5"), new BigDecimal("4000"));
	}

	@Transactional
	public Response update(Response request) {
		if (request == null || request.name() == null || request.name().isBlank() || request.name().length() > 200
				|| request.address() == null || request.address().length() > 1000
				|| request.phone() == null || request.phone().length() > 30
				|| (request.minimumOrder() != null && request.minimumOrder().signum() < 0)
				|| request.shippingFreeRadiusKm() == null || request.shippingFreeRadiusKm().signum() < 0
				|| request.shippingPerKm() == null || request.shippingPerKm().signum() < 0
				|| request.shippingPerKm().scale() > 0
				|| request.estimatedMinutesLow() < 1 || request.estimatedMinutesHigh() < request.estimatedMinutesLow()) {
			throw ApiException.badRequest("SHOP_CONFIG_INVALID", "Cấu hình quán không hợp lệ.");
		}
		validateCoordinates(request.latitude(), request.longitude());
		Response normalized = new Response(request.name().trim(), BigDecimal.ZERO,
				request.minimumOrder() == null ? BigDecimal.ZERO : request.minimumOrder(),
				request.address().trim(), request.phone().trim(), request.estimatedMinutesLow(),
				request.estimatedMinutesHigh(), request.allowCod(), request.latitude(), request.longitude(),
				request.shippingFreeRadiusKm(), request.shippingPerKm());
		try {
			settings.save(new ShopSettingsEntity(json.writeValueAsString(normalized)));
		} catch (JsonProcessingException e) {
			throw new IllegalStateException(e);
		}
		return normalized;
	}

	@Transactional(readOnly = true)
	public Quote quote(Double latitude, Double longitude) {
		Response config = response();
		validateCoordinates(latitude, longitude);
		if (config.latitude() == null || config.longitude() == null) {
			throw ApiException.badRequest("SHOP_LOCATION_REQUIRED", "Quản trị viên cần đặt vị trí quán trước khi giao hàng.");
		}
		double deltaLat = Math.toRadians(latitude - config.latitude());
		double deltaLng = Math.toRadians(longitude - config.longitude());
		double a = Math.pow(Math.sin(deltaLat / 2), 2)
				+ Math.cos(Math.toRadians(config.latitude())) * Math.cos(Math.toRadians(latitude))
				* Math.pow(Math.sin(deltaLng / 2), 2);
		BigDecimal distance = BigDecimal.valueOf(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
		return new Quote(distance.setScale(3, RoundingMode.HALF_UP),
				feeForDistance(distance, config.shippingFreeRadiusKm(), config.shippingPerKm()));
	}

	public static BigDecimal feeForDistance(BigDecimal distance, BigDecimal freeRadius, BigDecimal perKm) {
		return distance.subtract(freeRadius).max(BigDecimal.ZERO).setScale(0, RoundingMode.CEILING).multiply(perKm);
	}

	private static void validateCoordinates(Double latitude, Double longitude) {
		if (latitude == null || longitude == null || !Double.isFinite(latitude) || !Double.isFinite(longitude)
				|| latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
			throw ApiException.badRequest("DELIVERY_LOCATION_REQUIRED", "Vui lòng chọn vị trí giao hàng hợp lệ trên bản đồ.");
		}
	}

	public record Quote(BigDecimal distanceKm, BigDecimal deliveryFee) {
	}
	public record QuoteRequest(Double latitude, Double longitude) {
	}
	public record Response(String name, BigDecimal deliveryFee, BigDecimal minimumOrder,
			String address, String phone, int estimatedMinutesLow, int estimatedMinutesHigh, boolean allowCod,
			Double latitude, Double longitude, BigDecimal shippingFreeRadiusKm, BigDecimal shippingPerKm) {
	}
}
