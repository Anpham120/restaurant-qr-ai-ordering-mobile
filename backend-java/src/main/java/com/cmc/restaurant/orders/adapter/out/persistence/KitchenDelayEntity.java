package com.cmc.restaurant.orders.adapter.out.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

/**
 * Độ trễ bếp tự khai (#142). Bảng một dòng, {@code id} luôn bằng 1.
 *
 * <p>Không phải nhật ký mà là trạng thái hiện tại của cái bếp, nên ghi đè chứ không chèn thêm.
 * Ràng buộc {@code CHECK (id = 1)} nằm ở CSDL để một lỗi lập trình chèn dòng thứ hai thì hỏng
 * ngay tại chỗ, thay vì âm thầm tạo ra hai nguồn sự thật.
 */
@Entity
@Table(name = "kitchen_delay")
public class KitchenDelayEntity {

	/** Khoá cố định của dòng duy nhất. */
	public static final short SINGLETON_ID = 1;

	@Id
	private Short id;

	@Column(name = "delay_minutes", nullable = false)
	private int delayMinutes;

	@Column(name = "expires_at")
	private OffsetDateTime expiresAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "updated_by")
	private String updatedBy;

	/** Public vì tầng application cần tạo dòng đầu tiên; JPA cũng cần constructor rỗng. */
	public KitchenDelayEntity() {
		// JPA
	}

	public Short getId() {
		return id;
	}

	public void setId(Short id) {
		this.id = id;
	}

	public int getDelayMinutes() {
		return delayMinutes;
	}

	public void setDelayMinutes(int delayMinutes) {
		this.delayMinutes = delayMinutes;
	}

	public OffsetDateTime getExpiresAt() {
		return expiresAt;
	}

	public void setExpiresAt(OffsetDateTime expiresAt) {
		this.expiresAt = expiresAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}

	public String getUpdatedBy() {
		return updatedBy;
	}

	public void setUpdatedBy(String updatedBy) {
		this.updatedBy = updatedBy;
	}
}
