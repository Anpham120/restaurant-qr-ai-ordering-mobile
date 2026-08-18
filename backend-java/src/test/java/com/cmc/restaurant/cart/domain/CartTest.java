package com.cmc.restaurant.cart.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CartTest {

	private static Cart cart(CartLine... lines) {
		return new Cart("ts_1", List.of(lines));
	}

	private static String codeOf(Throwable t) {
		return ((CartRuleViolation) t).code();
	}

	@Test
	@DisplayName("Thêm món mới vào giỏ rỗng")
	void addsNewLine() {
		Cart c = cart();

		assertThat(c.applyDelta("m_1", 2, "ít cay", Cart.InvoiceState.None))
				.get().extracting(CartLine::quantity).isEqualTo(2);
		assertThat(c.itemCount()).isEqualTo(2);
	}

	@Test
	@DisplayName("Delta CỘNG DỒN, không phải gán — hai máy cùng bấm +1 ra 2")
	void deltasAccumulate() {
		Cart c = cart(new CartLine("m_1", 1, null));

		c.applyDelta("m_1", 1, null, Cart.InvoiceState.None);

		assertThat(c.find("m_1")).get().extracting(CartLine::quantity).isEqualTo(2);
	}

	@Test
	@DisplayName("Giảm về 0 thì xoá hẳn dòng")
	void removesLineWhenQuantityReachesZero() {
		Cart c = cart(new CartLine("m_1", 2, null));

		assertThat(c.applyDelta("m_1", -2, null, Cart.InvoiceState.None)).isEmpty();
		assertThat(c.lines()).isEmpty();
	}

	@Test
	@DisplayName("Giảm quá tay cũng chỉ xoá, không thành số âm")
	void negativeOverflowJustRemoves() {
		Cart c = cart(new CartLine("m_1", 1, null));

		assertThat(c.applyDelta("m_1", -5, null, Cart.InvoiceState.None)).isEmpty();
		assertThat(c.itemCount()).isZero();
	}

	@Test
	@DisplayName("delta = 0 bị chặn")
	void zeroDeltaRejected() {
		assertThatThrownBy(() -> cart().applyDelta("m_1", 0, null, Cart.InvoiceState.None))
				.extracting(CartTest::codeOf).isEqualTo("CART_DELTA_INVALID");
	}

	@Test
	@DisplayName("Vượt 99 bị chặn")
	void quantityCeiling() {
		Cart c = cart(new CartLine("m_1", 99, null));

		assertThatThrownBy(() -> c.applyDelta("m_1", 1, null, Cart.InvoiceState.None))
				.extracting(CartTest::codeOf).isEqualTo("CART_ITEM_QUANTITY_INVALID");
		assertThat(c.find("m_1")).get().extracting(CartLine::quantity)
				.as("bị chặn thì không được đổi gì").isEqualTo(99);
	}

	@Test
	@DisplayName("Đang chờ thanh toán: KHÔNG thêm được, nhưng VẪN bớt được")
	void pendingPaymentBlocksOnlyGrowth() {
		Cart c = cart(new CartLine("m_1", 2, null));

		assertThatThrownBy(() -> c.applyDelta("m_1", 1, null, Cart.InvoiceState.PaymentPending))
				.extracting(CartTest::codeOf).isEqualTo("TABLE_INVOICE_PAYMENT_PENDING");

		// Bỏ món phải luôn được: khách lỡ thêm nhầm thì không thể bị kẹt phải trả tiền cho nó.
		assertThat(c.applyDelta("m_1", -1, null, Cart.InvoiceState.PaymentPending))
				.get().extracting(CartLine::quantity).isEqualTo(1);
	}

	@Test
	@DisplayName("Đã thanh toán xong thì không thêm được nữa")
	void settledInvoiceBlocksGrowth() {
		assertThatThrownBy(() -> cart().applyDelta("m_1", 1, null, Cart.InvoiceState.Settled))
				.extracting(CartTest::codeOf).isEqualTo("TABLE_SESSION_SETTLED");
	}

	@Test
	@DisplayName("Xoá sạch giỏ")
	void clearEmptiesEverything() {
		Cart c = cart(new CartLine("m_1", 2, null), new CartLine("m_2", 1, null));

		c.clear();

		assertThat(c.lines()).isEmpty();
		assertThat(c.itemCount()).isZero();
	}
}
