package com.cmc.restaurant.loyalty.domain;

import java.security.SecureRandom;

/**
 * Mã của một lần đổi điểm — thứ khách đọc ra ở quầy hoặc gõ vào ô nhập.
 *
 * <p>Đây là VẬT MANG QUYỀN: ai cầm mã thì dùng được, giống phiếu giấy. Đó là chủ ý — nó cho phép
 * hội viên nhờ người khác thanh toán hộ. Nhưng nó cũng có nghĩa mã phải KHÓ ĐOÁN: đoán trúng một
 * mã là tiêu điểm của người khác.
 *
 * <p>Vì thế dùng {@link SecureRandom} chứ không phải {@code Math.random}. Khác với khoá idempotency
 * ở {@code KhoaDatDon} — khoá đó chỉ cần duy nhất, không cần bí mật; mã này cần cả hai.
 *
 * <p>Bảng chữ bỏ {@code O I L U V} và {@code 0 1}: khách đọc mã qua điện thoại hoặc nhân viên gõ
 * lại từ màn hình khách, và một chữ O nhầm thành số 0 là một mã hỏng không ai hiểu vì sao. Bỏ
 * {@code U V} vì đọc tiếng Việt dễ lẫn.
 */
public final class MaUuDai {

	private static final char[] BANG_CHU = "ABCDEFGHJKMNPQRSTWXYZ23456789".toCharArray();

	/**
	 * Tám ký tự trên bảng chữ 29 ký tự ≈ 5·10¹¹ tổ hợp.
	 *
	 * <p>Đủ để dò mã bằng cách thử là vô vọng, và vẫn ngắn để đọc qua điện thoại thành hai cụm bốn.
	 */
	private static final int DO_DAI = 8;

	private static final SecureRandom NGAU_NHIEN = new SecureRandom();

	private MaUuDai() {
	}

	public static String sinh() {
		StringBuilder sb = new StringBuilder(DO_DAI);
		for (int i = 0; i < DO_DAI; i++) {
			sb.append(BANG_CHU[NGAU_NHIEN.nextInt(BANG_CHU.length)]);
		}
		return sb.toString();
	}

	/**
	 * Chuẩn hoá thứ người dùng gõ vào.
	 *
	 * <p>Khách gõ chữ thường, dán kèm khoảng trắng, hoặc đọc mã có gạch nối cho dễ. Từ chối vì một
	 * dấu cách thừa là bắt họ sửa một thứ đáng lẽ hệ thống tự hiểu.
	 */
	public static String chuanHoa(String nhapVao) {
		if (nhapVao == null) {
			return "";
		}
		return nhapVao.trim().toUpperCase().replace("-", "").replace(" ", "");
	}
}
