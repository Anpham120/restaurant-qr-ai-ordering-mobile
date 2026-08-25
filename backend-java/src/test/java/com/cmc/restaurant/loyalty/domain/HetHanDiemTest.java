package com.cmc.restaurant.loyalty.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Hết hạn điểm sau 12 tháng")
class HetHanDiemTest {

	@Test
	@DisplayName("chưa tiêu gì thì toàn bộ phần quá hạn bị xoá")
	void chua_tieu_thi_xoa_het_phan_qua_han() {
		assertThat(HetHanDiem.canXoa(500, 0)).isEqualTo(500);
	}

	@Test
	@DisplayName("đã tiêu một phần thì chỉ xoá phần còn sót")
	void tieu_mot_phan_thi_xoa_phan_con_sot() {
		// Tích 500 điểm quá hạn, đã tiêu 300 — 300 đó ăn vào chính chỗ cũ, còn sót 200.
		assertThat(HetHanDiem.canXoa(500, 300)).isEqualTo(200);
	}

	@Test
	@DisplayName("tiêu vượt phần quá hạn thì không xoá gì, KHÔNG trừ sang điểm mới")
	void tieu_vuot_thi_khong_xoa_gi() {
		// Đây là chỗ dấu trừ trần sẽ ăn nhầm vào điểm khách vừa tích tháng trước.
		assertThat(HetHanDiem.canXoa(500, 800)).isZero();
	}

	@Test
	@DisplayName("tiêu đúng bằng phần quá hạn thì không còn gì để xoá")
	void tieu_dung_bang_phan_qua_han() {
		assertThat(HetHanDiem.canXoa(500, 500)).isZero();
	}

	@Test
	@DisplayName("chưa có lô nào quá hạn")
	void chua_co_lo_nao_qua_han() {
		assertThat(HetHanDiem.canXoa(0, 200)).isZero();
	}
}
