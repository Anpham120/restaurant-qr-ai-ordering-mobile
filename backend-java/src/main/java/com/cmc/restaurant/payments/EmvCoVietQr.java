package com.cmc.restaurant.payments;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;

/**
 * Dựng chuỗi VietQR theo chuẩn EMVCo — thứ mà app ngân hàng thật sự đọc được.
 *
 * <p><b>LỖI CÓ THẬT lớp này sinh ra để chữa.</b> Trước đây ảnh QR gửi cho khách mã hoá chính
 * đường dẫn ảnh của nhà cung cấp:
 *
 * <pre>
 *   app hiển thị : https://qr.sepay.vn/img?acc=1041485738&bank=VCB&amount=110000&des=...
 *   cần phải là  : 00020101021238540010A0000007270124000697043601101041485738...6304E93C
 * </pre>
 *
 * <p>Ảnh hiện ra trông hoàn toàn bình thường — vẫn là một mã QR quét được. Nhưng app ngân hàng
 * đọc ra một địa chỉ web thay vì lệnh chuyển tiền, nên nó báo "mã QR không hợp lệ". Không có lỗi
 * nào ở máy chủ, không có gì đỏ trong bộ kiểm; hỏng chỉ lộ ra khi có người cầm điện thoại quét
 * thật. Đo bằng cách giải mã cả hai ảnh mới thấy.
 *
 * <p>Dựng tại chỗ thay vì tải ảnh của SePay về: mã QR thanh toán KHÔNG nên phụ thuộc vào việc một
 * dịch vụ bên ngoài có sống đúng lúc khách muốn trả tiền hay không. Chuỗi này tất định, và
 * {@code EmvCoVietQrTest} so từng ký tự với chuỗi thật lấy từ SePay.
 *
 * <p>Cấu trúc là TLV: mỗi trường gồm mã hai chữ số, độ dài hai chữ số, rồi giá trị.
 */
final class EmvCoVietQr {

	private EmvCoVietQr() {
	}

	/** Định danh hệ thống VietQR của NAPAS. Cố định cho mọi mã. */
	private static final String GUID_NAPAS = "A000000727";

	/** Chuyển khoản nhanh tới tài khoản. */
	private static final String DICH_VU_CHUYEN_KHOAN = "QRIBFTTA";

	/** 704 = đồng Việt Nam, theo ISO 4217. */
	private static final String TIEN_TE_VND = "704";

	private static final String QUOC_GIA = "VN";

	/**
	 * @param bin     mã BIN 6 chữ số của ngân hàng nhận (Vietcombank là 970436)
	 * @param soTaiKhoan số tài khoản nhận
	 * @param soTien  số tiền; phần lẻ bị CẮT chứ không làm tròn, khớp cách tính ở
	 *                {@code VietQrProvider}
	 * @param noiDung nội dung chuyển khoản — đây là chuỗi mà phần đối soát tự động dò để nhận ra
	 *                đơn nào đã được trả
	 */
	static String taoChuoi(String bin, String soTaiKhoan, BigDecimal soTien, String noiDung) {
		// Trường 38: thông tin người nhận, gồm GUID của NAPAS + (BIN, số tài khoản) + dịch vụ.
		String nganHang = truong("00", bin) + truong("01", soTaiKhoan);
		String nguoiNhan = truong("00", GUID_NAPAS)
				+ truong("01", nganHang)
				+ truong("02", DICH_VU_CHUYEN_KHOAN);

		String than = truong("00", "01")
				// 12 = mã ĐỘNG, dùng một lần cho một số tiền cụ thể. 11 là mã tĩnh dán ở quầy.
				+ truong("01", "12")
				+ truong("38", nguoiNhan)
				+ truong("53", TIEN_TE_VND)
				+ truong("54", soTien.setScale(0, RoundingMode.DOWN).toPlainString())
				+ truong("58", QUOC_GIA)
				+ truong("62", truong("08", noiDung));

		// CRC tính TRÊN CẢ "6304" ở cuối. Bỏ bốn ký tự đó ra khỏi phép tính là lỗi kinh điển:
		// chuỗi vẫn đúng hình dạng, app ngân hàng vẫn đọc được các trường, rồi từ chối ở bước
		// cuối vì mã kiểm sai — và câu báo lỗi không nói gì về CRC.
		String coCrc = than + "6304";
		return coCrc + String.format("%04X", crc16(coCrc));
	}

	/** Một trường TLV: mã hai chữ số, độ dài hai chữ số, giá trị. */
	private static String truong(String ma, String giaTri) {
		return ma + String.format("%02d", giaTri.length()) + giaTri;
	}

	/**
	 * CRC-16/CCITT-FALSE: đa thức 0x1021, khởi tạo 0xFFFF, không đảo bit, không XOR đầu ra.
	 *
	 * <p>Đây là biến thể EMVCo quy định. Có vài biến thể CRC-16 khác cùng đa thức nhưng khác giá
	 * trị khởi tạo, và chọn nhầm cho ra một chuỗi trông y hệt nhưng bốn ký tự cuối sai.
	 */
	private static int crc16(String duLieu) {
		int crc = 0xFFFF;
		for (byte b : duLieu.getBytes(StandardCharsets.UTF_8)) {
			crc ^= (b & 0xFF) << 8;
			for (int i = 0; i < 8; i++) {
				crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
				crc &= 0xFFFF;
			}
		}
		return crc;
	}
}
