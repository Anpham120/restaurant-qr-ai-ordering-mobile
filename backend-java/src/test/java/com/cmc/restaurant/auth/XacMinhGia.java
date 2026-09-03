package com.cmc.restaurant.auth;

import com.cmc.restaurant.shared.ApiException;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Bản giả của hai lớp xác minh ngoài, dùng chung cho mọi phép kiểm cần tạo tài khoản.
 *
 * <p>Không có nó thì mỗi phép kiểm tạo một khách là một tin nhắn OTP thật và một lời gọi ra
 * Firebase — tức là trên thực tế sẽ không ai chạy phép kiểm nào. Đây chính là lý do
 * {@link PhoneTokenVerifier} và {@link GoogleTokenVerifier} tồn tại dưới dạng interface.
 *
 * <p>Các luật thật của hai lớp đó được canh riêng ở {@code FirebasePhoneClaimsRuleTest} và
 * {@code GoogleClaimsRuleTest}, chạy không cần mạng.
 */
@TestConfiguration
public class XacMinhGia {

	/**
	 * Token MỜ ĐỤC đã phát, tra ra số. Test gọi {@link #phatToken(String)} để lấy một token.
	 *
	 * <p>Vì sao cần thay vì để token chính là số: token Firebase thật là JWT, KHÔNG phải số điện
	 * thoại. Khi bản giả coi token là chính số, phép kiểm không phân biệt được "controller có gọi
	 * bộ xác minh" với "controller đọc thẳng thân request" — hai đường ra cùng kết quả.
	 *
	 * <p>ĐÃ ĐO THẬT, hai lần. Gỡ lời gọi {@code phoneVerifier.xacMinh(...)} khỏi controller mà cả
	 * bộ ca kiểm vẫn XANH. Lần vá đầu dùng tiền tố {@code otp:} cũng không cứu được, vì
	 * {@code PhoneNumber.normalize} chỉ giữ CHỮ SỐ nên tiền tố bị nuốt và chuỗi vẫn ra đúng số.
	 *
	 * <p>Token phát ở đây KHÔNG chứa chữ số nào. Đó là tính chất khiến nó mờ đục thật: không có
	 * cách nào lấy ra số nếu không đi qua bộ xác minh.
	 */
	private static final java.util.Map<String, String> SO_THEO_TOKEN =
			new java.util.concurrent.ConcurrentHashMap<>();

	/** Phát một token mờ đục cho số này, như Firebase phát JWT sau khi khách nhập OTP. */
	public static String phatToken(String soDaXacMinh) {
		String token = "tk" + java.util.UUID.randomUUID().toString().replaceAll("[^a-z]", "");
		SO_THEO_TOKEN.put(token, soDaXacMinh);
		return token;
	}

	/**
	 * Token mờ đục thì tra bảng; ngoài ra token thô coi như chính số.
	 *
	 * <p>Giữ đường thứ hai để các phép kiểm cũ — vốn gửi thẳng số làm token — không phải sửa. Phép
	 * kiểm nào cần canh chính hàng rào xác minh thì dùng {@link #phatToken(String)}.
	 */
	@Bean
	@Primary
	public PhoneTokenVerifier phoneTokenVerifier() {
		return idToken -> {
			String daPhat = idToken == null ? null : SO_THEO_TOKEN.get(idToken);
			if (daPhat != null) {
				return daPhat;
			}
			String so = com.cmc.restaurant.loyalty.domain.PhoneNumber.normalize(idToken);
			if (so == null || so.isBlank()) {
				throw ApiException.unauthorized("PHONE_TOKEN_INVALID", "Token không hợp lệ.");
			}
			return so;
		};
	}

	/** Token thô CHÍNH LÀ chuỗi "sub|email|tên". */
	@Bean
	@Primary
	public GoogleTokenVerifier googleTokenVerifier() {
		return idToken -> {
			String[] p = idToken.split("\\|");
			if (p.length != 3) {
				throw ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Token không hợp lệ.");
			}
			return new GoogleIdentity(p[0], p[1], p[2]);
		};
	}
}
