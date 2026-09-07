package com.cmc.restaurant.orders.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class OrderTypeTest {

	@Test
	void docDuocCaHaiKenhVaKhongPhanBietHoaThuong() {
		assertThat(OrderType.parse("DineIn")).contains(OrderType.DineIn);
		assertThat(OrderType.parse(" takeaway ")).contains(OrderType.Takeaway);
		assertThat(OrderType.parse("Ship")).isEmpty();
	}

	/**
	 * {@code Pickup} là tên cũ của {@code Takeaway}. Đọc được nó là đường lùi cho hàng đã ghi
	 * trước lúc đổi tên — bỏ nhánh này là mọi đơn cũ trở thành không đọc nổi.
	 */
	@Test
	void docDuocTenCuPickup() {
		assertThat(OrderType.parse("Pickup")).contains(OrderType.Takeaway);
		assertThat(OrderType.parse("pickup")).contains(OrderType.Takeaway);
	}

	/**
	 * KHÔNG đọc {@code Delivery} thành loại khác. Giao tận nhà đã ra khỏi phạm vi; một đơn mang
	 * nhãn đó là dữ liệu cần người xem, không phải thứ đoán bừa thành đơn mang về.
	 */
	@Test
	void khongDocDuocDeliveryDaBoKhoiPhamVi() {
		assertThat(OrderType.parse("Delivery")).isEmpty();
	}

	@Test
	void anTaiQuanDuocLamTruocKhiTraTien() {
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.DineIn, false)).isTrue();
	}

	@Test
	void mangVePhaiTraDuTienRoiMoiDuocLam() {
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.Takeaway, false)).isFalse();
		assertThat(PreparationPaymentPolicy.allowsPreparation(OrderType.Takeaway, true)).isTrue();
	}
}
