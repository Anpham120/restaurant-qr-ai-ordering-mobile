package com.cmc.restaurant.orders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import com.cmc.restaurant.orders.adapter.in.web.OrderController;
import com.cmc.restaurant.orders.application.OrderDtos;
import com.cmc.restaurant.orders.application.OrderService;
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

/**
 * Ranh giới quyền của các endpoint quán.
 *
 * <p>Các ca về tài xế, điều phối và COD giao hàng đã bỏ cùng phạm vi giao tận nhà — xem
 * {@code docs/pm/CHOT_NGHIEP_VU_QUAN_P0.md} §1.
 */
@WebMvcTest({OrderController.class, ShopController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAccessDeniedHandler.class,
		JsonAuthenticationEntryPoint.class})
class ShopApiSecurityTest {
	@Autowired
	private MockMvc mvc;
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

	/**
	 * Thực đơn và cấu hình quán mở công khai, có chủ ý: khách vãng lai phải xem được món trước khi
	 * quyết định vào quán. Bắt đăng nhập mới thấy thực đơn là biến app thành cửa duy nhất.
	 */
	@Test
	void thucDonVaCauHinhQuanKhongCanDangNhap() throws Exception {
		when(categories.findByActiveTrueOrderByDisplayOrderAscNameAsc()).thenReturn(List.of());
		when(config.response()).thenReturn(ShopConfig.defaults());

		mvc.perform(get("/api/shop/menu")).andExpect(status().isOk())
				.andExpect(jsonPath("$.items").isArray());
		mvc.perform(get("/api/shop/config")).andExpect(status().isOk());
	}

	/** Đổi cấu hình quán là việc của quản lý. Nhân viên quầy đọc được, không sửa được. */
	@Test
	void chiQuanLyDuocDoiCauHinhQuan() throws Exception {
		mvc.perform(put("/api/shop/config").with(as("counter", "CounterStaff"))
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isForbidden());

		when(config.update(any())).thenReturn(ShopConfig.defaults());
		mvc.perform(put("/api/shop/config").with(as("admin", "Admin"))
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isOk());
	}

	@Test
	void nhanVienQuayDocDuocDanhSachDon() throws Exception {
		when(orders.listOrders(null, null, null)).thenReturn(new OrderDtos.OrderListResponse(List.of(), 0));
		mvc.perform(get("/api/orders").with(as("counter", "CounterStaff"))).andExpect(status().isOk());
	}

	/** Khách không được đọc danh sách đơn của cả quán. */
	@Test
	void khachKhongDocDuocDonCuaNguoiKhac() throws Exception {
		mvc.perform(get("/api/orders").with(as("customer", "Customer"))).andExpect(status().isForbidden());
	}
}
