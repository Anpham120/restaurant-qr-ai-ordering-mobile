package com.cmc.restaurant.orders.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cmc.restaurant.orders.adapter.out.persistence.OrderItemRepository;
import com.cmc.restaurant.orders.domain.TramChuanBi;
import java.util.List;
import java.util.Map;
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
		// Món thử là món BẾP: có nhãn method nên không cần tra danh mục.
		when(repo.timNhanDanhMuc(anyString())).thenReturn(Optional.of(nhan("method:simmered", "cat_noodle")));
		service = new OrderItemEstimationService(repo, new KitchenCapacityProperties(6, 2), delay);
	}

	private static OrderItemRepository.NhanDanhMuc nhan(String nhan, String maDanhMuc) {
		return new OrderItemRepository.NhanDanhMuc() {
			@Override
			public String getNhan() {
				return nhan;
			}

			@Override
			public String getMaDanhMuc() {
				return maDanhMuc;
			}
		};
	}

	/** Tải chỉ ở trạm BẾP. */
	private static OrderItemEstimationService.TaiBep taiBep(long phut, int tre) {
		return new OrderItemEstimationService.TaiBep(Map.of(TramChuanBi.BEP, phut), tre);
	}

	/** Bếp trống: chỉ có chính món này trong hàng đợi, không có độ trễ khai. */
	private OrderItemEstimationService.TaiBep bepTrong() {
		return taiBep(20, 0);
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
				.estimate(MON, taiBep(20, 20)).orElseThrow();

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
		assertThat(service.estimate(MON, taiBep(20, 10))
				.orElseThrow().bepDong()).isTrue();
	}

	@Test
	@DisplayName("hàng đợi dài hơn thời gian nấu thì báo bếp đông, dù bếp không khai gì")
	void hangDoiDaiThiBao() {
		// 20 của chính món + 800 xếp trước; chờ = 800/6 ≈ 133 phút, lớn hơn 20 phút nấu.
		assertThat(service.estimate(MON, taiBep(820, 0))
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
		verify(repo, never()).hangDoiTheoMon();
		verify(delay, never()).phutTreHienTai();
	}

	@Test
	@DisplayName("chupTaiBep hỏi mỗi nguồn đúng một lần")
	void chupMotLan() {
		when(repo.hangDoiTheoMon()).thenReturn(List.of(
				dong("method:simmered", "cat_noodle", 120),
				dong("", "cat_drink", 8),
				dong("", "cat_alcohol", 6)));
		when(delay.phutTreHienTai()).thenReturn(15);

		OrderItemEstimationService.TaiBep tai = service.chupTaiBep();

		// Ba trạm, ba con số riêng. Bản trước gộp cả ba thành một, nên ly bia xếp sau việc bếp.
		assertThat(tai.viecCua(TramChuanBi.BEP)).isEqualTo(120);
		assertThat(tai.viecCua(TramChuanBi.QUAY)).isEqualTo(8);
		assertThat(tai.viecCua(TramChuanBi.SAN)).isEqualTo(6);
		assertThat(tai.treBepKhai()).isEqualTo(15);
		verify(repo).hangDoiTheoMon();
		verify(delay).phutTreHienTai();
	}

	private static OrderItemRepository.DongHangDoi dong(String nhan, String maDanhMuc, long phut) {
		return new OrderItemRepository.DongHangDoi() {
			@Override
			public String getNhan() {
				return nhan;
			}

			@Override
			public String getMaDanhMuc() {
				return maDanhMuc;
			}

			@Override
			public long getTongPhut() {
				return phut;
			}
		};
	}

	@Test
	@DisplayName("LY BIA không xếp sau việc bếp — đây là cả lý do tách trạm")
	void biaKhongXepSauViecBep() {
		// Đo trên thực đơn thật, ca tối 31 món: 195 phút việc bếp, 16 phút việc lấy sẵn.
		//
		// Một hàng đợi cho cả quán cho ra 30–49 phút cho ly bia. Tách hai trạm vẫn còn 14–24 phút,
		// vì mô hình hàng đợi giả định việc làm nối tiếp mà lấy sáu chai bia là mở tủ một lần.
		// Lớp LẤY SẴN bỏ hẳn hàng đợi, nên con số chỉ còn thời gian của chính món đó.
		when(repo.findPrepMinutes("m_bia")).thenReturn(Optional.of(1));
		when(repo.timNhanDanhMuc("m_bia")).thenReturn(Optional.of(nhan("region:north", "cat_alcohol")));

		OrderItemEstimationService.Estimate e = service
				.estimate("m_bia", new OrderItemEstimationService.TaiBep(
						Map.of(TramChuanBi.BEP, 195L, TramChuanBi.SAN, 16L), 0))
				.orElseThrow();

		assertThat(e.highMinutes()).isLessThanOrEqualTo(5);
		assertThat(e.bepDong()).isFalse();
	}

	@Test
	@DisplayName("cà phê xếp sau việc QUẦY, không sau việc bếp")
	void caPheXepSauViecQuay() {
		when(repo.findPrepMinutes("m_cafe")).thenReturn(Optional.of(4));
		when(repo.timNhanDanhMuc("m_cafe")).thenReturn(Optional.of(nhan("", "cat_drink")));

		OrderItemEstimationService.Estimate e = service
				.estimate("m_cafe", new OrderItemEstimationService.TaiBep(
						Map.of(TramChuanBi.BEP, 195L, TramChuanBi.QUAY, 20L), 0))
				.orElseThrow();

		// Chờ = (20 - 4) / 2 = 8 phút, cộng 4 phút của chính nó = 12, ±25% → 9–15.
		// Nếu dùng nhầm hàng đợi bếp thì con số này vượt 30.
		assertThat(e.highMinutes()).isLessThan(20);
		assertThat(e.lowMinutes()).isGreaterThan(5);
	}

	@Test
	@DisplayName("khoảng luôn có bề rộng, không bao giờ thu về một con số")
	void luonLaKhoang() {
		when(repo.findPrepMinutes("m_nhanh")).thenReturn(Optional.of(1));

		OrderItemEstimationService.Estimate e = service
				.estimate("m_nhanh", taiBep(1, 0)).orElseThrow();

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

	@Test
	@DisplayName("độ trễ BẾP tự khai KHÔNG cộng vào ly bia")
	void treBepKhongChamToiLySan() {
		// Nút khai trễ nằm ở màn BẾP và người bấm là người đứng bếp: đầu bếp nghỉ ốm, hỏng lò, đoàn
		// đặt trước đang làm ở trong. Không việc nào trong số đó làm chậm ly bia.
		//
		// Suýt bỏ sót ở chính lượt tách trạm này: bản đầu vẫn cộng độ trễ cho mọi món, nên bếp bấm
		// "+20 phút" là ly bia đọc ra 21–24 phút KÈM câu "bếp đang đông" — đúng cái vô lý mà việc
		// tách trạm sinh ra để dẹp.
		when(repo.findPrepMinutes("m_bia")).thenReturn(Optional.of(1));
		when(repo.timNhanDanhMuc("m_bia")).thenReturn(Optional.of(nhan("", "cat_alcohol")));

		OrderItemEstimationService.Estimate e = service
				.estimate("m_bia", new OrderItemEstimationService.TaiBep(
						Map.of(TramChuanBi.BEP, 195L, TramChuanBi.SAN, 16L), 20))
				.orElseThrow();

		assertThat(e.highMinutes()).isLessThanOrEqualTo(5);
		assertThat(e.bepDong()).isFalse();
	}

	@Test
	@DisplayName("độ trễ bếp VẪN cộng vào món của bếp — đối chứng")
	void treBepVanChamToiMonBep() {
		// Thiếu ca này thì một bản "sửa" bỏ hẳn độ trễ khai vẫn xanh, và cái nút ở màn bếp mất tác
		// dụng mà không ai biết.
		OrderItemEstimationService.Estimate e = service.estimate(MON, taiBep(20, 20)).orElseThrow();

		assertThat(e.lowMinutes()).isEqualTo(15 + 20);
		assertThat(e.bepDong()).isTrue();
	}
}