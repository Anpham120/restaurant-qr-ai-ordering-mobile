package com.cmc.restaurant.counter;

import com.cmc.restaurant.counter.domain.CounterShift;
import com.cmc.restaurant.counter.domain.CounterShiftStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Maps the existing {@code counter_shifts} table. */
@Entity
@Table(name = "counter_shifts")
public class CounterShiftEntity {

	@Id
	private String id;

	@Column(name = "opened_by_user_id", nullable = false)
	private String openedByUserId;

	@Column(name = "closed_by_user_id")
	private String closedByUserId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private CounterShiftStatus status;

	@Column(name = "opening_cash_balance", nullable = false)
	private BigDecimal openingCashBalance;

	@Column(name = "expected_cash_total", nullable = false)
	private BigDecimal expectedCashTotal;

	@Column(name = "actual_cash_total")
	private BigDecimal actualCashTotal;

	@Column(name = "cash_variance")
	private BigDecimal cashVariance;

	@Column(name = "close_note")
	private String closeNote;

	@Column(name = "opened_at", nullable = false)
	private OffsetDateTime openedAt;

	@Column(name = "closed_at")
	private OffsetDateTime closedAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected CounterShiftEntity() {
	}

	public CounterShiftEntity(CounterShift shift, OffsetDateTime openedAt) {
		this.id = shift.id();
		this.openedByUserId = shift.openedByUserId();
		this.openedAt = openedAt;
		applyFrom(shift);
	}

	public CounterShift toDomain() {
		return new CounterShift(id, openedByUserId, status, openingCashBalance, expectedCashTotal,
				actualCashTotal, cashVariance, closedByUserId, closeNote, closedAt, updatedAt);
	}

	public void applyFrom(CounterShift shift) {
		this.status = shift.status();
		this.openingCashBalance = shift.openingCashBalance();
		this.expectedCashTotal = shift.expectedCashTotal();
		this.actualCashTotal = shift.actualCashTotal();
		this.cashVariance = shift.cashVariance();
		this.closedByUserId = shift.closedByUserId();
		this.closeNote = shift.closeNote();
		this.closedAt = shift.closedAt();
		this.updatedAt = shift.updatedAt();
	}

	public String getId() {
		return id;
	}

	public OffsetDateTime getOpenedAt() {
		return openedAt;
	}

	/**
	 * Gán lại người mở ca khi tài khoản đó bị xoá — package-private nên chỉ module Counter dùng
	 * được.
	 *
	 * <p>Không phải setter thông thường. Ca quầy là chứng từ tiền bạc, nên bản .NET giữ lịch sử ca
	 * lại và chuyển sang một Admin dự phòng thay vì xoá theo tài khoản. Xem
	 * {@link CounterUserReferences}.
	 */
	void reassignOpenedBy(String userId) {
		this.openedByUserId = userId;
	}

	/** Người đóng ca được phép trống, nên khi tài khoản đó bị xoá thì trả trường này về null. */
	void clearClosedBy() {
		this.closedByUserId = null;
	}
}
