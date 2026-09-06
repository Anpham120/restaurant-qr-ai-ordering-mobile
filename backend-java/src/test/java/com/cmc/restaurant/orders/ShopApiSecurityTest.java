package com.cmc.restaurant.orders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cmc.restaurant.auth.AuthenticatedPrincipal;
import com.cmc.restaurant.auth.JsonAccessDeniedHandler;
import com.cmc.restaurant.auth.JsonAuthenticationEntryPoint;
import com.cmc.restaurant.auth.JwtAuthenticationFilter;
import com.cmc.restaurant.auth.JwtService;
import com.cmc.restaurant.auth.SecurityConfig;
import com.cmc.restaurant.menu.CategoryRepository;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.menu.ShopConfig;
import com.cmc.restaurant.menu.ShopController;
import com.cmc.restaurant.orders.adapter.in.web.DeliveryController;
import com.cmc.restaurant.orders.adapter.in.web.OrderController;
import com.cmc.restaurant.orders.application.DeliveryService;
import com.cmc.restaurant.orders.application.OrderDtos;
import com.cmc.restaurant.orders.application.OrderService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest({DeliveryController.class, OrderController.class, ShopController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAccessDeniedHandler.class, JsonAuthenticationEntryPoint.class})
class ShopApiSecurityTest {
	@Autowired
	private MockMvc mvc;
	@MockBean
	private DeliveryService delivery;
	@MockBean
	private OrderService orders;
	@MockBean
	private CategoryRepository categories;
	@MockBean
	private MenuItemRepository menu;
	@MockBean
	private ShopConfig config;
	@MockBean
	private JwtService jwt;

	private RequestPostProcessor as(String id, String role) {
		return authentication(new UsernamePasswordAuthenticationToken(
				new AuthenticatedPrincipal(id, "Test", "test@example.com", role), null,
				List.of(new SimpleGrantedAuthority("ROLE_" + role))));
	}

	@Test
	void publicMenuConfigAndQuoteDoNotRequireLogin() throws Exception {
		when(categories.findByActiveTrueOrderByDisplayOrderAscNameAsc()).thenReturn(List.of());
		when(config.response()).thenReturn(ShopConfig.defaults());
		when(config.quote(21.0, 105.8)).thenReturn(new ShopConfig.Quote(new BigDecimal("2"), BigDecimal.ZERO));
		mvc.perform(get("/api/shop/menu")).andExpect(status().isOk()).andExpect(jsonPath("$.items").isArray());
		mvc.perform(get("/api/shop/config")).andExpect(status().isOk()).andExpect(jsonPath("$.shippingFreeRadiusKm").value(5));
		mvc.perform(post("/api/shop/quote").contentType(MediaType.APPLICATION_JSON)
				.content("{\"latitude\":21,\"longitude\":105.8}"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.deliveryFee").value(0));
	}

	@Test
	void courierCanListOnlyTheirAssignmentsAndCannotReadGlobalOrders() throws Exception {
		when(delivery.assignedOrders("courier-1")).thenReturn(new OrderDtos.OrderListResponse(List.of(), 0));
		mvc.perform(get("/api/delivery/orders").with(as("courier-1", "Courier")))
				.andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
		verify(delivery).assignedOrders("courier-1");
		mvc.perform(get("/api/orders").with(as("courier-1", "Courier"))).andExpect(status().isForbidden());
		mvc.perform(get("/api/delivery/orders").with(as("customer", "Customer"))).andExpect(status().isForbidden());
	}

	@Test
	void kitchenCannotDispatchOrAcceptCodAndOnlyAdminCanChangeTariff() throws Exception {
		mvc.perform(post("/api/orders/ORD-1/accept-cod").with(as("kitchen", "Kitchen"))).andExpect(status().isForbidden());
		mvc.perform(post("/api/orders/ORD-1/dispatch").with(as("kitchen", "Kitchen"))
				.contentType(MediaType.APPLICATION_JSON).content("{\"courierId\":\"c\"}"))
				.andExpect(status().isForbidden());
		mvc.perform(put("/api/shop/config").with(as("counter", "CounterStaff"))
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isForbidden());
		when(config.update(any())).thenReturn(ShopConfig.defaults());
		mvc.perform(put("/api/shop/config").with(as("admin", "Admin"))
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isOk());
	}

	@Test
	void counterCanReadOrdersAndAcceptCod() throws Exception {
		when(orders.listOrders(null, null, null)).thenReturn(new OrderDtos.OrderListResponse(List.of(), 0));
		mvc.perform(get("/api/orders").with(as("counter", "CounterStaff"))).andExpect(status().isOk());
		mvc.perform(post("/api/orders/ORD-1/accept-cod").with(as("counter", "CounterStaff"))).andExpect(status().isOk());
	}
}
