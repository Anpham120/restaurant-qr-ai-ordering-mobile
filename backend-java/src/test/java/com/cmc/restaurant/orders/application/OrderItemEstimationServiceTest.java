package com.cmc.restaurant.orders.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Công thức ước lượng lên món (#10, #141, #142). */
class OrderItemEstimationServiceTest {

	private static final String MON = "m_011";

	private OrderItemRepository repo;
	private KitchenDelayService delay;
	private OrderItemEstimationService service;

	@BeforeEach
	void setUp() {
		repo = mock(OrderItemRepository.class);
		delay = mock(KitchenDelayService.class);
		when(repo.findPrepMinutes(MON)).thenReturn(Optional.of(20));
		service = new OrderItemEstimationService(repo, new KitchenCapacityProperties(6), delay);
	}

	/** Bếp trống: chỉ có chính món này trong hàng đợi, không có độ trễ khai. */
	private OrderItemEstimationService.TaiBep bepTrong() {
		return new OrderItemEstimationService.TaiBep(20, 0);
	}

	@Test
	@DisplayName("món bếp chưa khai prep_minutes thì KHÔNG có ước lượng")
	void khongDoanBua() {
		when(repo.findPrepMinutes("m_chua_khai")).thenReturn(Optional.empty());

		assertThat(service.estimate("m_chua_khai", bepTrong())).isEmpty();
	}

	@Test
	@DisplayName("món không tự tính chính nó vào hàng đợi")
	void khongTinhChinhMinh() {
		OrderItemEstimationService.Estimate e = service.estimate(MON, bepTrong()).orElseThrow();

		// Bếp trống nghĩa là chờ = 0, nên khoảng phải quanh đúng 20 phút của chính món đó. Bản đầu
		// quên trừ chính nó ra và cho ra khoảng rộng hơn ngay cả lúc bếp chẳng có gì.
		assertThat(e.lowMinutes()).isEqualTo(15);
		assertThat(e.highMinutes()).isEqualTo(25);
		assertThat(e.bepDong()).isFalse();
	}

	@Test
	@DisplayName("độ trễ bếp khai KHÔNG bị biên độ ±25% nới rộng")
	void beKhaiThiGiuNguyenConSo() {
		OrderItemEstimationService.Estimate khong = service.estimate(MON, bepTrong()).orElseThrow();
		OrderItemEstimationService.Estimate co = service
				.estimate(MON, new OrderItemEstimationService.TaiBep(20, 20)).orElseThrow();

		// Bếp nói "+20 phút" thì cả hai đầu khoảng dịch đúng 20, không hơn không kém.
		assertThat(co.lowMinutes() - khong.lowMinutes()).isEqualTo(20);
		assertThat(co.highMinutes() - khong.highMinutes()).isEqualTo(20);

		// Và bề rộng khoảng KHÔNG đổi. Bản trước cộng trước rồi mới nhân biên độ, nên "+20" biến
		// thành "khoảng 15 tới 25" — tức hệ thống tự nghi ngờ lời người vừa khai.
		assertThat(co.highMinutes() - co.lowMinutes())
				.isEqualTo(khong.highMinutes() - khong.lowMinutes());
	}

	@Test
	@DisplayName("bếp tự khai trễ thì luôn báo cho khách, kể cả khi hàng đợi trống")
	void khaiTreThiLuonBao() {
		assertThat(service.estimate(MON, new OrderItemEstimationService.TaiBep(20, 10))
				.orElseThrow().bepDong()).isTrue();
	}

	@Test
	@DisplayName("hàng đợi dài hơn thời gian nấu thì báo bếp đông, dù bếp không khai gì")
	void hangDoiDaiThiBao() {
		// 20 của chính món + 800 xếp trước; chờ = 800/6 ≈ 133 phút, lớn hơn 20 phút nấu.
		assertThat(service.estimate(MON, new OrderItemEstimationService.TaiBep(820, 0))
				.orElseThrow().bepDong()).isTrue();
	}

	@Test
	@DisplayName("estimate KHÔNG tự đi hỏi tải bếp — ảnh chụp phải do nơi gọi truyền vào")
	void khongTuHoiTaiBep() {
		service.estimate(MON, bepTrong());
		service.estimate(MON, bepTrong());
		service.estimate(MON, bepTrong());

		// Đây là cổng chặn N+1. Trước khi sửa, mỗi món tự gọi hai truy vấn này, nên một đơn tám món
		// sinh tám câu tổng tải bếp trả về đúng một kết quả — và Bảng Bếp trả về hàng chục đơn,
		// tự làm mới mỗi năm giây.
		verify(repo, never()).sumPrepMinutesInKitchenQueue();
		verify(delay, never()).phutTreHienTai();
	}

	@Test
	@DisplayName("chupTaiBep hỏi mỗi nguồn đúng một lần")
	void chupMotLan() {
		when(repo.sumPrepMinutesInKitchenQueue()).thenReturn(120L);
		when(delay.phutTreHienTai()).thenReturn(15);

		OrderItemEstimationService.TaiBep tai = service.chupTaiBep();

		assertThat(tai.tongViecTrongBep()).isEqualTo(120);
		assertThat(tai.treBepKhai()).isEqualTo(15);
		verify(repo).sumPrepMinutesInKitchenQueue();
		verify(delay).phutTreHienTai();
	}

	@Test
	@DisplayName("khoảng luôn có bề rộng, không bao giờ thu về một con số")
	void luonLaKhoang() {
		when(repo.findPrepMinutes("m_nhanh")).thenReturn(Optional.of(1));

		OrderItemEstimationService.Estimate e = service
				.estimate("m_nhanh", new OrderItemEstimationService.TaiBep(1, 0)).orElseThrow();

		// Món 1 phút, bếp trống: làm tròn có thể cho low = high = 1. Một con số chính xác giả tạo
		// hứa nhiều hơn thứ hệ thống biết, nên phải luôn còn ít nhất một phút bề rộng.
		assertThat(e.highMinutes()).isGreaterThan(e.lowMinutes());
	}

	@Test
	@DisplayName("any() không nuốt mất ca menuItemId null")
	void menuItemIdNull() {
		when(repo.findPrepMinutes(any())).thenReturn(Optional.of(20));

		assertThat(service.estimate(null, bepTrong())).isEmpty();
	}
}
