package com.cmc.restaurant.tables;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "restaurant_tables")
public class RestaurantTableEntity {

	@Id
	private String id;

	@Column(name = "table_code", nullable = false)
	private String tableCode;

	@Column(name = "display_name", nullable = false)
	private String displayName;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	@Column(name = "qr_token")
	private String qrToken;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	protected RestaurantTableEntity() {
		// JPA
	}

	/** Bàn mới do quản trị viên tạo (#91). Mã QR do {@link TableQrTokenRotator} cấp ngay lúc tạo. */
	RestaurantTableEntity(String id, String tableCode, String displayName, OffsetDateTime now) {
		this.id = id;
		this.tableCode = tableCode;
		this.displayName = displayName;
		this.active = true;
		this.createdAt = now;
		this.updatedAt = now;
	}

	void rename(String displayName) {
		this.displayName = displayName;
	}

	void setActive(boolean active) {
		this.active = active;
	}

	/**
	 * Đổi mã QR — package-private nên chỉ module Tables gọi được, và trên thực tế chỉ
	 * {@link TableQrTokenRotator} gọi.
	 *
	 * <p>Token này là thứ duy nhất chứng minh khách đang ngồi tại bàn. Để lộ một setter công khai
	 * nghĩa là bất kỳ chỗ nào cũng ghi đè được, và một lần ghi đè nhầm sẽ vô hiệu mọi mã QR đã in.
	 */
	void replaceQrToken(String qrToken) {
		this.qrToken = qrToken;
	}

	void touch(OffsetDateTime now) {
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getTableCode() {
		return tableCode;
	}

	public String getDisplayName() {
		return displayName;
	}

	public boolean isActive() {
		return active;
	}

	public String getQrToken() {
		return qrToken;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}
}
