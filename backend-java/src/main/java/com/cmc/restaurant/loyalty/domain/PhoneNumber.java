package com.cmc.restaurant.loyalty.domain;

/**
 * Normalisation for the phone number a loyalty account is keyed by. Ported from
 * {@code PromotionCalculator.NormalizePhone} (.NET) — it lives in Promotions there only because
 * that is where it happened to be written first; keying loyalty accounts is a loyalty concern.
 *
 * <p>Keeping digits only matters because the same customer types their number differently every
 * visit ({@code 0901 234 567}, {@code 0901-234-567}, {@code +84901234567}). Storing what they typed
 * would silently create a second account and lose their points.
 */
public final class PhoneNumber {

	private PhoneNumber() {
	}

	/** Mã quốc gia Việt Nam, dạng chữ số. */
	private static final String MA_QUOC_GIA = "84";

	/**
	 * Chỉ giữ chữ số, và quy mã quốc gia về dạng trong nước. Trả {@code null} khi không có chữ số.
	 *
	 * <p><b>Vì sao phải bỏ mã quốc gia:</b> số vào hệ thống bằng hai đường viết khác nhau, và
	 * chuỗi này là khoá nối tài khoản với hồ sơ điểm.
	 *
	 * <pre>
	 *   thu ngân gõ ở quầy   0901234567     dạng trong nước
	 *   Firebase trả sau OTP +84901234567   dạng E.164, bắt buộc theo chuẩn, app không đổi được
	 * </pre>
	 *
	 * <p>Chỉ giữ chữ số thì hai đường cho ra {@code 0901234567} và {@code 84901234567} — hai khoá
	 * khác nhau cho cùng một người. Khách đăng ký bằng OTP xong không đăng nhập lại được bằng số
	 * mình vừa gõ, và điểm tích ở quầy không bao giờ nối được với tài khoản đó.
	 *
	 * <p>Quy về dạng TRONG NƯỚC chứ không phải E.164 vì dữ liệu đã có trong cơ sở dữ liệu là dạng
	 * trong nước — hồ sơ điểm nhập tay ở quầy có trước tính năng OTP. Đổi chiều ngược lại thì mọi
	 * hồ sơ cũ mất khoá.
	 *
	 * <p>Chốt theo ĐỘ DÀI, không chỉ theo tiền tố: số trong nước như {@code 0846123456} cũng chứa
	 * "84" ngay đầu phần thân. Số trong nước có 10 chữ số và mở đầu bằng 0; số kèm mã quốc gia thì
	 * dài hơn.
	 */
	public static String normalize(String phoneNumber) {
		if (phoneNumber == null || phoneNumber.isBlank()) {
			return null;
		}
		StringBuilder digits = new StringBuilder();
		for (char c : phoneNumber.toCharArray()) {
			if (Character.isDigit(c)) {
				digits.append(c);
			}
		}
		if (digits.isEmpty()) {
			return null;
		}

		String so = digits.toString();
		if ((so.length() == 11 || so.length() == 12) && so.startsWith(MA_QUOC_GIA)) {
			return "0" + so.substring(MA_QUOC_GIA.length());
		}
		return so;
	}
}
