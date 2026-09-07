package com.cmc.restaurant.auth;

import java.util.List;

/**
 * Vai trò tài khoản. Chuỗi được lưu nguyên văn xuống {@code users.role}.
 *
 * <p>Ba vai đang dùng: {@code Customer}, {@code CounterStaff}, {@code Admin}. Quán nước không có
 * bếp riêng — người pha chế chính là người đứng quầy.
 *
 * <p>{@code Staff} và {@code Kitchen} là dữ liệu CŨ: tài khoản đã tồn tại vẫn đăng nhập được,
 * nhưng không cấp mới. Chúng còn trong {@link #ALL} để đọc được hàng cũ, không phải để dùng tiếp.
 */
public final class UserRole {

	public static final String CUSTOMER = "Customer";
	public static final String STAFF = "Staff";
	public static final String COUNTER_STAFF = "CounterStaff";
	public static final String KITCHEN = "Kitchen";
	public static final String ADMIN = "Admin";

	public static final List<String> ALL = List.of(CUSTOMER, STAFF, COUNTER_STAFF, KITCHEN, ADMIN);

	/**
	 * Vai trò mà quản trị viên được phép gán khi tạo hoặc sửa tài khoản nhân sự.
	 *
	 * <p>Hẹp hơn {@link #ALL} có chủ ý: {@code Customer} do người dùng tự đăng ký, còn {@code Staff}
	 * và {@code Kitchen} là vai cũ không cấp mới.
	 */
	public static final List<String> ADMIN_ASSIGNABLE = List.of(ADMIN, COUNTER_STAFF);

	private UserRole() {
	}
}
