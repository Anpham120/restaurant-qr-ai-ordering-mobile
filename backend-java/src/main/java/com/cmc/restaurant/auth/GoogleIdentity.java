package com.cmc.restaurant.auth;

/**
 * Danh tính Google ĐÃ được xác minh.
 *
 * <p>Chỉ {@link GoogleClaimsRule} dựng được kiểu này. Nhận một giá trị kiểu này ở bất cứ đâu nghĩa
 * là các luật ở đó đã chạy qua — không có đường nào đi tắt từ chuỗi token thô sang danh tính.
 *
 * @param sub   định danh vĩnh viễn của tài khoản Google; khoá nối duy nhất đáng tin
 * @param email email đã được Google xác minh
 */
public record GoogleIdentity(String sub, String email, String fullName) {
}
