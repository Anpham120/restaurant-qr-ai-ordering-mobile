package com.cmc.restaurant.auth;

/**
 * Đổi một ID token Google thô lấy danh tính đã xác minh.
 *
 * <p>Là interface để {@link GoogleClaimsRule} và luật gộp tài khoản kiểm chứng được mà không cần
 * gọi ra Google thật. Không có nó thì mọi phép kiểm của tính năng này đều phụ thuộc vào mạng và
 * vào một tài khoản Google có thật — tức là trên thực tế sẽ không ai viết phép kiểm nào.
 */
public interface GoogleTokenVerifier {

	/**
	 * @throws com.cmc.restaurant.shared.ApiException 401 nếu token không dùng được
	 */
	GoogleIdentity xacMinh(String idToken);
}
