package com.cmc.restaurant.loyalty.domain;

import java.security.SecureRandom;

/**
 * Mã sáu chữ số khách đọc cho nhân viên để nối số điện thoại vào tài khoản app.
 *
 * <p>Đây là thứ THAY CHO OTP, và nó giải quyết cùng một bài toán bằng một phương tiện khác. OTP
 * chứng minh "người này cầm cái SIM". Mã này chứng minh "người này đang mở app ở đây, trước mặt
 * nhân viên" — và với tài sản là vài chục nghìn đồng điểm, ở một quán ăn nơi khách đứng ngay quầy,
 * đó là mức tương xứng. Không tốn một đồng tin nhắn nào.
 *
 * <p>Sáu chữ số chứ không phải tám ký tự như {@link MaUuDai}: mã này ĐỌC LÊN cho người khác gõ,
 * còn mã ưu đãi thì khách tự gõ. Chữ cái đọc qua tiếng Việt rất dễ nhầm (B/P, S/X), chữ số thì
 * không.
 *
 * <p>Một triệu tổ hợp là ít so với mã ưu đãi, nhưng đủ vì mã này sống năm phút, dùng một lần, và
 * chỉ nhân viên mới gõ được — kẻ dò phải đứng ở quầy đọc số liên tục trước mặt nhân viên.
 */
public final class MaNoiSo {

	/** Năm phút: đủ để khách mở app và đọc, ngắn để một màn hình bị bỏ quên không còn giá trị. */
	public static final int PHUT_SONG = 5;

	private static final SecureRandom NGAU_NHIEN = new SecureRandom();

	private MaNoiSo() {
	}

	public static String sinh() {
		// Dải 100000–999999 để mã luôn đủ sáu chữ số. Sinh 0–999999 rồi đệm số 0 sẽ cho ra những mã
		// bắt đầu bằng 0, và khách đọc "không sáu ba..." thì nhân viên rất dễ bỏ mất chữ số đầu.
		return String.valueOf(100_000 + NGAU_NHIEN.nextInt(900_000));
	}

	/** Cắt khoảng trắng và gạch nối — khách hay đọc theo cụm và nhân viên gõ lại y như nghe. */
	public static String chuanHoa(String nhapVao) {
		if (nhapVao == null) {
			return "";
		}
		return nhapVao.trim().replace("-", "").replace(" ", "");
	}
}
