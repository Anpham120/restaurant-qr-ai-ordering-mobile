package com.cmc.restaurant.counter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Append-only ledger of everything that moved the drawer during a shift. */
@Entity
@Table(name = "counter_shift_transactions")
public class CounterShiftTransactionEntity {

	@Id
	private String id;

	@Column(name = "counter_shift_id", nullable = false)
	private String counterShiftId;

	@Column(nullable = false)
	private String type;

	@Column(nullable = false)
	private BigDecimal amount;

	@Column(name = "table_session_id")
	private String tableSessionId;

	@Column(name = "invoice_code")
	private String invoiceCode;

	@Column(name = "reason_code")
	private String reasonCode;

	@Column
	private String note;

	@Column(name = "created_by_user_id", nullable = false)
	private String createdByUserId;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected CounterShiftTransactionEntity() {
	}

	public CounterShiftTransactionEntity(String id, String counterShiftId, String type, BigDecimal amount,
			String reasonCode, String note, String createdByUserId, OffsetDateTime createdAt) {
		this.id = id;
		this.counterShiftId = counterShiftId;
		this.type = type;
		this.amount = amount;
		this.reasonCode = reasonCode;
		this.note = note;
		this.createdByUserId = createdByUserId;
		this.createdAt = createdAt;
	}

	/** Gán lại người tạo giao dịch khi tài khoản đó bị xoá — xem {@link CounterUserReferences}. */
	void reassignCreatedBy(String userId) {
		this.createdByUserId = userId;
	}
}
