package com.cmc.restaurant.menu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.cmc.restaurant.menu.MenuDtos.MenuItemRequest;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Đường GHI cho thời gian lên món.
 *
 * <p><b>Nghiệp vụ được canh ở đây.</b> V11 tạo cột {@code prep_minutes}, điền giá trị khởi tạo suy
 * từ nhãn {@code method:}, và ghi trong chính migration rằng "bếp sửa lại qua PATCH khi thấy sai".
 * Lời hứa đó chưa bao giờ thành: entity không ánh xạ cột, DTO không có trường, giao diện không có
 * ô. Con số mà MỌI ước lượng thời gian lên món dựa vào chỉ có một người ghi được — người viết
 * migration, một lần duy nhất, bằng ước lượng của chính họ chứ không phải của bếp.
 */
class MenuItemPrepMinutesTest {

	private MenuItemRepository monAn;
	private CategoryRepository danhMuc;
	private MenuItemService service;

	@BeforeEach
	void setUp() {
		monAn = mock(MenuItemRepository.class);
		danhMuc = mock(CategoryRepository.class);
		service = new MenuItemService(monAn, danhMuc);

		CategoryEntity category = mock(CategoryEntity.class);
		when(category.isActive()).thenReturn(true);
		when(danhMuc.findById("cat_pho")).thenReturn(Optional.of(category));
		when(monAn.save(any(MenuItemEntity.class))).thenAnswer(call -> call.getArgument(0));
		when(monAn.findAll()).thenReturn(List.of());
	}

	private static MenuItemEntity monPho(Integer prepMinutes) {
		MenuItemEntity item = new MenuItemEntity(
				"m_001", "cat_pho", "Phở bò", "", new BigDecimal("65000"), null, true,
				List.of("method:simmered"), OffsetDateTime.now());
		item.setPrepMinutes(prepMinutes);
		return item;
	}

	private static MenuItemRequest yeuCau(Integer prepMinutes) {
		return new MenuItemRequest(
				"cat_pho", "Phở bò", "", new BigDecimal("65000"), null, true,
				List.of("method:simmered"), prepMinutes);
	}

	@Test
	@DisplayName("bếp đặt được thời gian lên món — thứ trước đây chỉ migration làm được")
	void ghiDuocThoiGianLenMon() {
		when(monAn.findById("m_001")).thenReturn(Optional.of(monPho(6)));

		MenuItemEntity sau = service.update("m_001", yeuCau(9));

		assertThat(sau.getPrepMinutes()).isEqualTo(9);
	}

	@Test
	@DisplayName("SỬA TÊN MÓN KHÔNG ĐƯỢC XOÁ con số bếp đã khai")
	void suaTruongKhacKhongLamMatThoiGian() {
		// Đây là ca quan trọng nhất của bản này.
		//
		// `PUT` thay TOÀN BỘ bản ghi. Nếu `null` nghĩa là xoá, thì bất kỳ client nào chưa biết tới
		// trường mới — giao diện quản trị cũ, một lệnh curl, một script nhập liệu — cũng thổi bay
		// con số bếp đã khai chỉ vì sửa cái tên, im lặng, và mọi ước lượng của món đó biến mất.
		//
		// Nên `null` ở đây là GIỮ NGUYÊN, khác với mọi trường khác của bản ghi. Đó là chủ ý, và ca
		// này là thứ giữ nó khỏi bị "dọn cho nhất quán" về sau.
		when(monAn.findById("m_001")).thenReturn(Optional.of(monPho(6)));

		MenuItemEntity sau = service.update("m_001", yeuCau(null));

		assertThat(sau.getPrepMinutes()).isEqualTo(6);
	}

	@Test
	@DisplayName("món mới chưa khai thì để trống, không đoán hộ một con số")
	void monMoiKhongCoThiDeTrong() {
		// Một ước lượng bịa còn tệ hơn không có ước lượng: khách tin nó, rồi thôi không tin app nữa.
		assertThat(service.create(yeuCau(null)).getPrepMinutes()).isNull();
		assertThat(service.create(yeuCau(12)).getPrepMinutes()).isEqualTo(12);
	}

	@Test
	@DisplayName("chặn LỖI GÕ: 0, số âm, và số ba chữ số")
	void chanLoiGo() {
		when(monAn.findById("m_001")).thenReturn(Optional.of(monPho(6)));

		for (int sai : new int[] { 0, -5, 241, 9000 }) {
			assertThatThrownBy(() -> service.update("m_001", yeuCau(sai)))
					.isInstanceOf(ApiException.class)
					.hasMessageContaining("Prep minutes");
		}
	}

	@Test
	@DisplayName("ngưỡng rộng hơn nhiều lần món lâu nhất — chặn lỗi gõ, không cãi nhau với bếp")
	void nguongDuRong() {
		// Món lâu nhất trong thực đơn hiện tại là 35 phút (quay nguyên con). Đối chứng: thiếu ca này
		// thì một ngưỡng bị siết xuống 30 vẫn xanh, và bếp không khai nổi món quay.
		when(monAn.findById("m_001")).thenReturn(Optional.of(monPho(6)));

		assertThat(service.update("m_001", yeuCau(1)).getPrepMinutes()).isEqualTo(1);
		assertThat(service.update("m_001", yeuCau(35)).getPrepMinutes()).isEqualTo(35);
		assertThat(service.update("m_001", yeuCau(240)).getPrepMinutes()).isEqualTo(240);
	}
}
