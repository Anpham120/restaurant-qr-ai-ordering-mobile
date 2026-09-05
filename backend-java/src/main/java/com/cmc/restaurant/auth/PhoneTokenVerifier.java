package com.cmc.restaurant.auth;

/**
 * Đổi một token xác minh số điện thoại lấy số ĐÃ được chứng minh là của người gửi.
 *
 * <p>Là interface vì hai lý do. Thứ nhất, toàn bộ luồng đăng ký kiểm chứng được bằng bản giả —
 * không cần gọi ra Firebase, không cần một số điện thoại thật, không cần tốn tin nhắn nào cho mỗi
 * lần chạy phép kiểm. Thứ hai, nếu đổi nhà cung cấp (Firebase sang ZNS, sang Telegram Gateway) thì
 * chỉ lớp cài đặt đổi, còn luật đăng ký giữ nguyên.
 */
public interface PhoneTokenVerifier {

	/**
	 * @return số điện thoại đã xác minh, dạng đã chuẩn hoá
	 * @throws com.cmc.restaurant.shared.ApiException 401 nếu token không dùng được
	 */
	String xacMinh(String idToken);
}
