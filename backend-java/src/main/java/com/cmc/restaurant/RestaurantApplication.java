package com.cmc.restaurant;

import com.cmc.restaurant.auth.AdminBootstrapProperties;
import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.chat.ChatProperties;
import com.cmc.restaurant.payments.SePayProperties;
import com.cmc.restaurant.payments.VietQrProperties;
import com.cmc.restaurant.orders.application.KitchenCapacityProperties;
import com.cmc.restaurant.shared.CorsProperties;
import java.util.Arrays;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({JwtProperties.class, VietQrProperties.class, SePayProperties.class, ChatProperties.class,
		CorsProperties.class, AdminBootstrapProperties.class,
		KitchenCapacityProperties.class})
public class RestaurantApplication {

	/** Mirrors {@code --migrate-only} in the .NET {@code Program.cs}, and with it the V10 principle
	 * that schema migration is a separate step from starting the API — a rolling deploy must not
	 * have two API instances racing to migrate the same database. Here it means: run Flyway, exit
	 * with the right code, never open the web port. */
	private static final String MIGRATE_ONLY = "--migrate-only";

	public static void main(String[] args) {
		boolean migrateOnly = Arrays.stream(args).anyMatch(MIGRATE_ONLY::equalsIgnoreCase);
		SpringApplication application = new SpringApplication(RestaurantApplication.class);

		if (migrateOnly) {
			// NONE means no Tomcat: the one-shot container does its job and stops, instead of
			// lingering as a second API that compose would then have to health-check.
			application.setWebApplicationType(WebApplicationType.NONE);
			try (ConfigurableApplicationContext context = application.run(args)) {
				// Reaching here means Flyway's auto-configuration already migrated successfully;
				// a failed migration throws out of run() and exits non-zero, which is what makes
				// `depends_on: service_completed_successfully` meaningful.
				context.getBean(org.flywaydb.core.Flyway.class);
			}
			return;
		}

		application.run(args);
	}
}
