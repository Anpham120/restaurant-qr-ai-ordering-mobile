package com.cmc.restaurant;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.payments.CassoProperties;
import com.cmc.restaurant.payments.VietQrProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({JwtProperties.class, VietQrProperties.class, CassoProperties.class})
public class RestaurantApplication {

	public static void main(String[] args) {
		SpringApplication.run(RestaurantApplication.class, args);
	}
}
