package com.cmc.restaurant.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Tài khoản quản trị ĐẦU TIÊN của một bản triển khai mới.
 *
 * <p>Không có giá trị mặc định cho {@code email} và {@code password}. Đặt sẵn một cặp nào đó trong
 * mã nghĩa là mọi bản triển khai chưa cấu hình đều có chung một tài khoản quản trị mà ai đọc mã
 * nguồn cũng biết mật khẩu — cùng lớp lỗi với khoá ký JWT mặc định.
 *
 * <p>Bỏ trống thì {@link AdminBootstrap} không làm gì cả. Đó là trạng thái đúng cho máy phát
 * triển và cho mọi lần khởi động sau lần đầu.
 */
@ConfigurationProperties(prefix = "admin-bootstrap")
public record AdminBootstrapProperties(String email, String password, String fullName) {
}
