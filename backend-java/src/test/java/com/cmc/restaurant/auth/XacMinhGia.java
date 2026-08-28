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

	/** Token thô CHÍNH LÀ số điện thoại đã xác minh. */
	@Bean
	@Primary
	public PhoneTokenVerifier phoneTokenVerifier() {
		return idToken -> {
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
