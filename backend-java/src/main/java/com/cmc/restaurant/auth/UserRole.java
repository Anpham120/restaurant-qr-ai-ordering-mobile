package com.cmc.restaurant.auth;

import java.util.List;

/** Mirrors {@code RestaurantQrAiOrdering.Api.Users.UserRole} in the .NET backend. */
public final class UserRole {

	public static final String CUSTOMER = "Customer";
	public static final String STAFF = "Staff";
	public static final String COUNTER_STAFF = "CounterStaff";
	public static final String KITCHEN = "Kitchen";
	public static final String ADMIN = "Admin";
	public static final String COURIER = "Courier";

	public static final List<String> ALL = List.of(CUSTOMER, STAFF, COUNTER_STAFF, KITCHEN, ADMIN, COURIER);

	/**
	 * Vai trò mà quản trị viên được phép gán khi tạo hoặc sửa tài khoản nhân sự.
	 *
	 * <p>Hẹp hơn {@link #ALL} có chủ ý: `Customer` do người dùng tự đăng ký, `Staff` là vai trò cũ
	 * không còn cấp mới. Thông báo lỗi ROLE_INVALID của bản .NET liệt kê đúng ba giá trị này.
	 */
	public static final List<String> ADMIN_ASSIGNABLE = List.of(ADMIN, COUNTER_STAFF, KITCHEN, COURIER);

	private UserRole() {
	}
}
