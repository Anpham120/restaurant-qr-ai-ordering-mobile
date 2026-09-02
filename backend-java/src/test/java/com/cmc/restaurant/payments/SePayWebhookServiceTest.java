package com.cmc.restaurant.payments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.cmc.restaurant.shared.ApiException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Cổng webhook SePay: kiểm khoá, và đọc thân request.
 *
 * <p>Phần "khớp tiền với đơn" là của {@link BankTransferReconciler} và không kiểm ở đây. Cái
 * kiểm ở đây là hai thứ dễ sai nhất và cùng dẫn tới hỏng âm thầm: nhận một request giả, và đọc
 * nhầm trường của SePay.
 *
 * <p>Chạy không cần cơ sở dữ liệu, không cần mạng — bộ đối soát được thay bằng bản ghi lại.
 */
class SePayWebhookServiceTest {

	private static final String KHOA = "khoa-sepay-that";

	/** Bản ghi lại: giữ nguyên giao dịch nhận được để phép kiểm soi việc ĐỌC trường có đúng không. */
	static final class BoDoiSoatGhiLai extends BankTransferReconciler {
		final List<BankTransferDtos.Transaction> daNhan = new ArrayList<>();

		BoDoiSoatGhiLai() {
			super(null, null, null, null, null);
		}

		@Override
		public BankTransferDtos.TransactionResult reconcile(BankTransferDtos.Transaction giaoDich) {
			daNhan.add(giaoDich);
			return new BankTransferDtos.TransactionResult(
					giaoDich.reference(), "confirmed", "ORD-1", "Đã xác nhận.");
		}
	}

	private static SePayDtos tienVao(String noiDung, String moTa, BigDecimal soTien) {
		return new SePayDtos(1L, "Vietcombank", "2026-08-28 14:02:37", "0123499999", null,
				noiDung, "in", soTien, null, null, "MBVCB.3278907687", moTa);
	}

	@Test
	@DisplayName("Chưa cấu hình khoá thì TỪ CHỐI tất cả, không nhận tất cả")
	void refusesEverythingWhenUnconfigured() {
		// Trạng thái an toàn: không có khoá thì không phân biệt được request thật với request giả,
		// mà nhận nhầm một request giả nghĩa là đánh dấu đơn đã trả tiền khi không có đồng nào vào.
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(""), new BoDoiSoatGhiLai());

		assertThatThrownBy(() -> dv.kiemKhoa("Apikey " + KHOA))
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("chưa được cấu hình");
	}

	@Test
	@DisplayName("Khoá sai, thiếu header, hay sai tiền tố đều bị từ chối")
	void rejectsABadKey() {
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(KHOA), new BoDoiSoatGhiLai());

		assertThatThrownBy(() -> dv.kiemKhoa(null)).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> dv.kiemKhoa("Apikey sai")).isInstanceOf(ApiException.class);
		// Gửi đúng khoá nhưng sai tiền tố cũng không lọt.
		assertThatThrownBy(() -> dv.kiemKhoa("Bearer " + KHOA)).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> dv.kiemKhoa(KHOA)).isInstanceOf(ApiException.class);
	}

	@Test
	@DisplayName("Khoá đúng thì đi tiếp")
	void acceptsTheRightKey() {
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(KHOA), new BoDoiSoatGhiLai());

		dv.kiemKhoa("Apikey " + KHOA);
	}

	@Test
	@DisplayName("Tiền RA thì bỏ qua, không đối soát")
	void ignoresOutgoingTransfers() {
		// Thiếu phép kiểm này thì một lệnh chuyển tiền RA khỏi tài khoản, tình cờ mang mã đơn
		// trong nội dung, cũng đánh dấu đơn đó đã trả tiền.
		BoDoiSoatGhiLai bo = new BoDoiSoatGhiLai();
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(KHOA), bo);
		SePayDtos tienRa = new SePayDtos(1L, "VCB", "2026-08-28 14:02:37", "0123", null,
				"CMC ORD-1", "out", BigDecimal.valueOf(100_000), null, null, "REF1", null);

		SePayDtos.WebhookResponse kq = dv.xuLy(tienRa);

		assertThat(kq.outcome()).isEqualTo("ignored");
		assertThat(bo.daNhan).isEmpty();
	}

	@Test
	@DisplayName("Đọc ĐÚNG các trường của SePay: mã tham chiếu, số tiền, nội dung")
	void readsSePayFields() {
		// Đọc nhầm tên trường thì Jackson gán null, webhook vẫn trả 200, và tiền vào tài khoản
		// nhưng đơn không bao giờ được đánh dấu đã trả — hỏng âm thầm, loại tệ nhất ở chỗ này.
		BoDoiSoatGhiLai bo = new BoDoiSoatGhiLai();
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(KHOA), bo);

		dv.xuLy(tienVao("CMC ORD-42", null, BigDecimal.valueOf(250_000)));

		assertThat(bo.daNhan).hasSize(1);
		assertThat(bo.daNhan.get(0).reference()).isEqualTo("MBVCB.3278907687");
		assertThat(bo.daNhan.get(0).amount()).isEqualByComparingTo("250000");
		assertThat(bo.daNhan.get(0).description()).contains("CMC ORD-42");
	}

	@Test
	@DisplayName("Mã đơn nằm ở description thay vì content vẫn khớp")
	void findsTheOrderCodeInEitherField() {
		// Ngân hàng khác nhau điền nội dung vào trường khác nhau. Chọn cứng một trường nghĩa là
		// đổi ngân hàng nhận tiền là hỏng đối soát, mà không có gì báo động.
		BoDoiSoatGhiLai bo = new BoDoiSoatGhiLai();
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(KHOA), bo);

		dv.xuLy(tienVao(null, "CMC ORD-42 chuyen khoan", BigDecimal.valueOf(250_000)));

		assertThat(bo.daNhan.get(0).description()).contains("CMC ORD-42");
	}

	@Test
	@DisplayName("Số tiền thiếu thì thành 0, KHÔNG phải null")
	void aMissingAmountBecomesZero() {
		// null lọt xuống bộ đối soát sẽ ném NPE giữa chừng, và SePay sẽ gửi lại 17 lần cho một
		// giao dịch không bao giờ xử lý được. Số 0 thì lệch số tiền và bị từ chối tử tế.
		BoDoiSoatGhiLai bo = new BoDoiSoatGhiLai();
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(KHOA), bo);

		dv.xuLy(tienVao("CMC ORD-42", null, null));

		assertThat(bo.daNhan.get(0).amount()).isEqualByComparingTo("0");
	}

	@Test
	@DisplayName("Thân rỗng thì trả success, không ném")
	void anEmptyBodyIsNotAnError() {
		// Ném ở đây khiến SePay coi là lỗi và gửi lại nhiều lần cho một thứ sẽ không bao giờ khớp.
		SePayWebhookService dv = new SePayWebhookService(new SePayProperties(KHOA), new BoDoiSoatGhiLai());

		assertThat(dv.xuLy(null).success()).isTrue();
	}
	/** Bản trả về một kết quả CHỌN TRƯỚC, để soi việc ghi log theo từng loại kết quả. */
	static final class BoDoiSoatTraSan extends BankTransferReconciler {
		private final String outcome;

		BoDoiSoatTraSan(String outcome) {
			super(null, null, null, null, null);
			this.outcome = outcome;
		}

		@Override
		public BankTransferDtos.TransactionResult reconcile(BankTransferDtos.Transaction giaoDich) {
			return new BankTransferDtos.TransactionResult(
					giaoDich.reference(), outcome, null, "chi tiết của " + outcome);
		}
	}

	/** Gắn tai nghe vào logger của lớp đang kiểm, trả lại danh sách sự kiện đã ghi. */
	private static ListAppender<ILoggingEvent> ngheLog() {
		ch.qos.logback.classic.Logger logger =
				(ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(SePayWebhookService.class);
		ListAppender<ILoggingEvent> tai = new ListAppender<>();
		tai.start();
		logger.addAppender(tai);
		return tai;
	}

	@Test
	@DisplayName("Tiền vào mà KHÔNG chốt được hoá đơn thì phải ghi log kèm nội dung chuyển khoản")
	void logsEveryTransferThatSettlesNothing() {
		// Đường này hỏng ÂM THẦM: tiền vào thật, webhook trả 200, SePay ghi "thành công", hoá đơn
		// vẫn chờ duyệt tay. Đã xảy ra thật, và lý do chỉ đọc được bằng cách vào bảng điều khiển
		// SePay soi thân trả về của MỘT lượt gọi — thứ không tra cứu được và sẽ hết hạn.
		//
		// Nội dung chuyển khoản PHẢI có trong log: nghi ngờ số một là ngân hàng sửa nội dung nên mã
		// không còn khớp mẫu, và không có chuỗi thật thì mọi lần sửa mẫu đều là đoán.
		for (String outcome : new String[] {"unmatched", "amount_mismatch", "duplicate", "ignored"}) {
			ListAppender<ILoggingEvent> tai = ngheLog();
			SePayWebhookService dv =
					new SePayWebhookService(new SePayProperties(KHOA), new BoDoiSoatTraSan(outcome));

			dv.xuLy(tienVao("CMC INV-20260902-5B732382", null, new BigDecimal("35000")));

			assertThat(tai.list)
					.as("kết quả %s phải được ghi log", outcome)
					.hasSize(1);
			ILoggingEvent su = tai.list.get(0);
			assertThat(su.getLevel()).isEqualTo(Level.WARN);
			assertThat(su.getFormattedMessage())
					.contains(outcome)
					.contains("CMC INV-20260902-5B732382")
					.contains("35000");
		}
	}

	@Test
	@DisplayName("Chốt được hoá đơn thì KHÔNG ghi log cảnh báo")
	void staysQuietWhenTheMoneyIsRecorded() {
		// Không có ca này thì phép kiểm trên vẫn xanh dù lớp ghi log MỌI giao dịch — và một cảnh
		// báo bắn ở mọi lượt là một cảnh báo không ai đọc nữa.
		ListAppender<ILoggingEvent> tai = ngheLog();
		SePayWebhookService dv =
				new SePayWebhookService(new SePayProperties(KHOA), new BoDoiSoatTraSan("confirmed"));

		dv.xuLy(tienVao("CMC INV-20260902-5B732382", null, new BigDecimal("35000")));

		assertThat(tai.list).isEmpty();
	}
}
