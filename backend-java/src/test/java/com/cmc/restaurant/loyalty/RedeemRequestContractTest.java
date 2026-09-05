package com.cmc.restaurant.loyalty;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Hợp đồng của {@code POST /api/loyalty/me/redeem} với app di động.
 *
 * <p><b>Vì sao cần một phép kiểm riêng cho việc đọc JSON.</b> Jackson bỏ qua trường lạ mà không
 * báo gì. Đặt sai một tên trường thì request vẫn 200, vẫn trừ điểm, và chỉ có MỘT nhánh nghiệp vụ
 * lặng lẽ không chạy. Không log, không lỗi, không test nào đỏ.
 *
 * <p>Đây là lớp lỗi đã xảy ra hai lần trong dự án này: {@code email} vs {@code identifier} ở đăng
 * nhập, và {@code projectId} đọc từ thân trả về của Firebase. Cả hai chỉ lộ ra khi đo bằng dữ liệu
 * THẬT, không phải bằng chuỗi tự dựng cho khớp.
 */
class RedeemRequestContractTest {

	private static final ObjectMapper JSON = new ObjectMapper();

	@Test
	@DisplayName("Thân mà APP DI ĐỘNG thật sự gửi phải đọc ra được mã đơn")
	void readsTheBodyTheMobileAppActuallySends() throws Exception {
		// Chép từ `mobile-rn/src/core/loyalty/loyaltyApi.ts`:
		//
		//     body: JSON.stringify(orderId === undefined ? { rewardId } : { rewardId, orderId })
		//
		// App tính mã đơn đang mở, hứa với khách "Món sẽ được thêm vào đơn ORD-1001 và bếp làm
		// ngay", rồi gửi mã đó dưới tên `orderId`.
		String thanAppGui = "{\"rewardId\":\"rw_free_m_073\",\"orderId\":\"ORD-1001\"}";

		LoyaltyDtos.RedeemRequest doc = JSON.readValue(thanAppGui, LoyaltyDtos.RedeemRequest.class);

		// Đọc null ở đây nghĩa là `coDon = false`, nghĩa là món KHÔNG được gắn vào đơn, nghĩa là
		// BẾP KHÔNG BAO GIỜ BIẾT phải làm — trong khi khách đã bị trừ điểm và vừa đọc một câu hứa
		// điều ngược lại. Phiếu rơi xuống nhánh "quầy phát tay", nhưng món thì chưa ai nấu.
		assertThat(doc.orderCode())
				.as("mã đơn app gửi phải tới được backend")
				.isEqualTo("ORD-1001");
	}

	@Test
	@DisplayName("Tên trường của chính hợp đồng vẫn đọc được")
	void stillReadsItsOwnFieldName() throws Exception {
		// Đối chứng: nếu ca trên đỏ mà ca này cũng đỏ thì lỗi nằm ở phép kiểm, không phải ở hợp đồng.
		LoyaltyDtos.RedeemRequest doc = JSON.readValue(
				"{\"rewardId\":\"rw_free_m_073\",\"orderCode\":\"ORD-1001\"}",
				LoyaltyDtos.RedeemRequest.class);

		assertThat(doc.orderCode()).isEqualTo("ORD-1001");
	}

	@Test
	@DisplayName("Không có đơn thì mã đơn là null — đó là nhánh 'để dành, quầy phát tay'")
	void noOrderMeansNoCode() throws Exception {
		LoyaltyDtos.RedeemRequest doc = JSON.readValue(
				"{\"rewardId\":\"rw_free_m_073\"}", LoyaltyDtos.RedeemRequest.class);

		assertThat(doc.orderCode()).isNull();
	}
}
