package com.cmc.restaurant.orders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** Maps the {@code orders} table. Only the columns this issue's scope actually reads/writes are
 * mapped (promotion/pickup columns are left for whichever module owns them). */
@Entity
@Table(name = "orders")
public class OrderEntity {

	@Id
	private String id;

	@Column(name = "order_code", nullable = false, unique = true)
	private String orderCode;

	@Column(name = "order_type", nullable = false)
	private String orderType;

	@Column(nullable = false)
	private String status;

	@Column(name = "restaurant_table_id")
	private String restaurantTableId;

	@Column(name = "table_code")
	private String tableCode;

	@Column(name = "table_session_id")
	private String tableSessionId;

	@Column(name = "subtotal_amount", nullable = false)
	private BigDecimal subtotalAmount;

	@Column(name = "total_amount", nullable = false)
	private BigDecimal totalAmount;

	@Column(name = "discount_amount", nullable = false)
	private BigDecimal discountAmount = BigDecimal.ZERO;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private OffsetDateTime updatedAt;

	@Column(name = "customer_access_token")
	private String customerAccessToken;

	@Column(name = "idempotency_key")
	private String idempotencyKey;

	@Column(name = "request_fingerprint")
	private String requestFingerprint;

	@Column(name = "customer_phone_number")
	private String customerPhoneNumber;

	// Not a JPA relationship on purpose: mapping the same order_id FK from both this side
	// (@OneToMany @JoinColumn) and the child's own @Column caused Hibernate to insert the child
	// row before the FK was set, violating the NOT NULL constraint. OrderService populates these
	// explicitly via OrderItemRepository/OrderStatusHistoryRepository instead.
	@Transient
	private List<OrderItemEntity> items = new ArrayList<>();

	@Transient
	private List<OrderStatusHistoryEntity> statusHistory = new ArrayList<>();

	protected OrderEntity() {
		// JPA
	}

	public OrderEntity(String id, String orderCode, String orderType, String restaurantTableId, String tableCode,
			String tableSessionId, String customerAccessToken, String idempotencyKey, String requestFingerprint,
			String customerPhoneNumber, OffsetDateTime now) {
		this.id = id;
		this.orderCode = orderCode;
		this.orderType = orderType;
		this.status = OrderStatus.PLACED;
		this.restaurantTableId = restaurantTableId;
		this.tableCode = tableCode;
		this.tableSessionId = tableSessionId;
		this.customerAccessToken = customerAccessToken;
		this.idempotencyKey = idempotencyKey;
		this.requestFingerprint = requestFingerprint;
		this.customerPhoneNumber = customerPhoneNumber;
		this.subtotalAmount = BigDecimal.ZERO;
		this.totalAmount = BigDecimal.ZERO;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public String getId() {
		return id;
	}

	public String getOrderCode() {
		return orderCode;
	}

	public String getOrderType() {
		return orderType;
	}

	public String getStatus() {
		return status;
	}

	public void setStatus(String status) {
		this.status = status;
	}

	public String getRestaurantTableId() {
		return restaurantTableId;
	}

	public String getTableCode() {
		return tableCode;
	}

	public String getTableSessionId() {
		return tableSessionId;
	}

	public BigDecimal getSubtotalAmount() {
		return subtotalAmount;
	}

	public void setSubtotalAmount(BigDecimal subtotalAmount) {
		this.subtotalAmount = subtotalAmount;
	}

	public BigDecimal getTotalAmount() {
		return totalAmount;
	}

	public void setTotalAmount(BigDecimal totalAmount) {
		this.totalAmount = totalAmount;
	}

	public BigDecimal getDiscountAmount() {
		return discountAmount;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

	public OffsetDateTime getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(OffsetDateTime updatedAt) {
		this.updatedAt = updatedAt;
	}

	public String getCustomerAccessToken() {
		return customerAccessToken;
	}

	public String getIdempotencyKey() {
		return idempotencyKey;
	}

	public String getRequestFingerprint() {
		return requestFingerprint;
	}

	public String getCustomerPhoneNumber() {
		return customerPhoneNumber;
	}

	public List<OrderItemEntity> getItems() {
		return items;
	}

	public List<OrderStatusHistoryEntity> getStatusHistory() {
		return statusHistory;
	}
}
