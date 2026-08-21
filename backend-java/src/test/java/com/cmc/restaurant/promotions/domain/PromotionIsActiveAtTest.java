package com.cmc.restaurant.promotions.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link Promotion#isActiveAt} — luật lọc cho {@code GET /api/promotions/active} (§9.10 M1 mục 3).
 *
 * <p>Phần đáng kiểm nhất không phải từng điều kiện riêng lẻ mà là SỰ ĂN KHỚP với {@link
 * Promotion#applyTo}: một mã đã hiện trong danh sách rồi lúc gõ vào lại bị chối là lỗi tệ nhất của
 * màn hình khuyến mãi. Hai hàm nằm ở hai chỗ nên không có gì bắt buộc chúng đồng ý với nhau ngoài
 * các phép kiểm dưới đây.
 */
class PromotionIsActiveAtTest {

	private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-18T12:00:00Z");

	private static Promotion mua(OffsetDateTime startsAt, OffsetDateTime endsAt, boolean active) {
		return new Promotion("p1", "SALE", "Sale", PromotionType.Percentage,
				BigDecimal.TEN, null, null, startsAt, endsAt, active);
	}

	private static String codeOf(Throwable t) {
		return ((PromotionRuleViolation) t).code();
	}

	// --- từng điều kiện -------------------------------------------------------------------------

	@Test
	@DisplayName("Không giới hạn thời gian và đang bật thì đang chạy")
	void alwaysOnIsActive() {
		assertThat(mua(null, null, true).isActiveAt(NOW)).isTrue();
	}

	@Test
	@DisplayName("Đã tắt thì không chạy, dù còn trong khoảng thời gian")
	void inactiveIsNotActive() {
		assertThat(mua(NOW.minusDays(1), NOW.plusDays(1), false).isActiveAt(NOW)).isFalse();
	}

	@Test
	@DisplayName("Chưa tới giờ bắt đầu thì chưa chạy")
	void notStartedIsNotActive() {
		assertThat(mua(NOW.plusMinutes(1), null, true).isActiveAt(NOW)).isFalse();
	}

	@Test
	@DisplayName("Đã quá giờ kết thúc thì hết chạy")
	void expiredIsNotActive() {
		assertThat(mua(null, NOW.minusMinutes(1), true).isActiveAt(NOW)).isFalse();
	}

	@Test
	@DisplayName("Đúng khoảnh khắc bắt đầu thì ĐÃ chạy")
	void startBoundaryIsInclusive() {
		// Biên nào cũng phải chọn một phía. Chọn phía có lợi cho khách và khớp với applyTo: hàm kia
		// chỉ ném khi now TRƯỚC startsAt, nên đúng lúc bắt đầu là dùng được.
		assertThat(mua(NOW, null, true).isActiveAt(NOW)).isTrue();
	}

	@Test
	@DisplayName("Đúng khoảnh khắc kết thúc thì VẪN chạy")
	void endBoundaryIsInclusive() {
		// applyTo chỉ ném khi now SAU endsAt. Nếu ở đây dùng isBefore thì mã biến khỏi danh sách
		// sớm hơn lúc nó thật sự hết — khách mất một phút cuối mà không hiểu vì sao.
		assertThat(mua(null, NOW, true).isActiveAt(NOW)).isTrue();
	}

	// --- ăn khớp với applyTo --------------------------------------------------------------------

	@Test
	@DisplayName("Đang chạy thì áp được — không mã nào hiện ra rồi bị chối")
	void listedMeansUsable() {
		for (Promotion p : new Promotion[] {
				mua(null, null, true),
				mua(NOW.minusDays(1), NOW.plusDays(1), true),
				mua(NOW, null, true),
				mua(null, NOW, true) }) {
			assertThat(p.isActiveAt(NOW)).isTrue();
			assertThatCode(() -> p.applyTo(new BigDecimal("200000"), NOW)).doesNotThrowAnyException();
		}
	}

	@Test
	@DisplayName("Không chạy thì applyTo ném đúng một trong ba mã lỗi tương ứng")
	void notListedMeansRejectedWithMatchingCode() {
		// Chiều ngược lại cũng phải đúng, nếu không danh sách sẽ GIẤU những mã thật ra dùng được.
		assertThatThrownBy(() -> mua(NOW.minusDays(1), NOW.plusDays(1), false)
				.applyTo(new BigDecimal("200000"), NOW))
				.satisfies(t -> assertThat(codeOf(t)).isEqualTo("PROMOTION_INACTIVE"));

		assertThatThrownBy(() -> mua(NOW.plusMinutes(1), null, true)
				.applyTo(new BigDecimal("200000"), NOW))
				.satisfies(t -> assertThat(codeOf(t)).isEqualTo("PROMOTION_NOT_STARTED"));

		assertThatThrownBy(() -> mua(null, NOW.minusMinutes(1), true)
				.applyTo(new BigDecimal("200000"), NOW))
				.satisfies(t -> assertThat(codeOf(t)).isEqualTo("PROMOTION_EXPIRED"));
	}

	@Test
	@DisplayName("Chưa đủ tiền tối thiểu VẪN nằm trong danh sách")
	void minOrderDoesNotHideThePromotion() {
		// minOrderAmount là điều kiện của TỪNG ĐƠN, không phải của khuyến mãi. Ẩn mã chỉ vì giỏ
		// hiện tại chưa đủ tiền là giấu đi đúng thông tin khách cần để quyết định gọi thêm món.
		Promotion p = new Promotion("p1", "SALE", "Sale", PromotionType.Percentage,
				BigDecimal.TEN, new BigDecimal("500000"), null, null, null, true);

		assertThat(p.isActiveAt(NOW)).isTrue();
		assertThatThrownBy(() -> p.applyTo(new BigDecimal("100000"), NOW))
				.satisfies(t -> assertThat(codeOf(t)).isEqualTo("PROMOTION_MIN_ORDER_NOT_MET"));
	}
}
