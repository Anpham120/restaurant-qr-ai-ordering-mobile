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

	/**
	 * Giao dịch tiền mặt phát sinh từ một hoá đơn bàn (#96).
	 *
	 * <p>Hàm dựng riêng vì nó mang thêm {@code tableSessionId} và {@code invoiceCode} — hai cột
	 * dùng để đối soát ngược từ sổ quỹ về đúng bàn nào, hoá đơn nào. Điều chỉnh thủ công thì không
	 * có hai thứ đó, nên nhập chung một hàm dựng sẽ buộc mọi lời gọi truyền hai {@code null}.
	 */
	public CounterShiftTransactionEntity(
			String id, String counterShiftId, BigDecimal amount, String note, String createdByUserId,
			OffsetDateTime createdAt, String tableSessionId, String invoiceCode) {
		this.id = id;
		this.counterShiftId = counterShiftId;
		this.type = "CashPayment";
		this.amount = amount;
		this.note = note;
		this.createdByUserId = createdByUserId;
		this.createdAt = createdAt;
		this.tableSessionId = tableSessionId;
		this.invoiceCode = invoiceCode;
	}

	/** Gán lại người tạo giao dịch khi tài khoản đó bị xoá — xem {@link CounterUserReferences}. */
	void reassignCreatedBy(String userId) {
		this.createdByUserId = userId;
	}
}
