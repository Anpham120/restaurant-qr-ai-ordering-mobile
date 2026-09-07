package com.cmc.restaurant.orders.adapter.out.persistence;

import com.cmc.restaurant.orders.domain.OrderStatus;
import com.cmc.restaurant.orders.domain.OrderType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.CascadeType;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
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

	@Enumerated(EnumType.STRING)
	@Column(name = "order_type", nullable = false)
	private OrderType orderType;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private OrderStatus status;

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

	// Both the code and the id are stored: the code is what the customer typed and what appears on
	// their receipt, the id is what a later report joins on. Keeping only the code would break if a
	// promotion is renamed; keeping only the id would lose what the customer was actually told.
	@Column(name = "promotion_code")
	private String promotionCode;

	@Column(name = "promotion_id")
	private String promotionId;

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

	@Column(name = "recipient_name")
	private String recipientName;

	@Column(name = "recipient_phone")
	private String recipientPhone;

	@Column(name = "customer_user_id")
	private String customerUserId;

	// Các cột giao hàng của V29/V30 — delivery_address, delivery_note, delivery_fee, courier_id,
	// fulfillment_status, cod_accepted, delivery_latitude/longitude/distance_km — CỐ Ý không ánh xạ
	// ở đây nữa: giao tận nhà đã ra khỏi phạm vi.
	//
	// Cột vẫn còn trong lược đồ, không xoá. Migration chỉ mở rộng, không co lại: một cột đã tồn tại
	// mà bị DROP là đường một chiều, còn để nguyên thì không tốn gì. Hai cột NOT NULL trong nhóm đó
	// (`delivery_fee`, `cod_accepted`) đều có DEFAULT, nên INSERT không nhắc tới chúng vẫn chạy.

	// mappedBy, not @JoinColumn: the child owns the FK (see OrderItemEntity). Cascade means saving
	// an order saves its lines in one unit of work, and loading one brings them along — so nothing
	// has to remember to fetch them, which is what the old @Transient version required.
	// @BatchSize turns the kitchen board's N+1 into ceil(N/50) queries: listing 100 orders would
	// otherwise fire one extra SELECT per order for its lines. Two List collections cannot both be
	// join-fetched in one query (MultipleBagFetchException), so batching is the fix that works for
	// both of them.
	@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
	@OrderBy("createdAt asc")
	@org.hibernate.annotations.BatchSize(size = 50)
	private List<OrderItemEntity> items = new ArrayList<>();

	@OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
	@OrderBy("createdAt asc")
	@org.hibernate.annotations.BatchSize(size = 50)
	private List<OrderStatusHistoryEntity> statusHistory = new ArrayList<>();

	protected OrderEntity() {
		// JPA
	}

	public OrderEntity(String id, String orderCode, OrderType orderType, String restaurantTableId, String tableCode,
			String tableSessionId, String customerAccessToken, String idempotencyKey, String requestFingerprint,
			String customerPhoneNumber, OffsetDateTime now) {
		this.id = id;
		this.orderCode = orderCode;
		this.orderType = orderType;
		this.status = OrderStatus.Placed;
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

	/** Attaches a line and sets both sides. Adding to {@code getItems()} directly would leave the
	 * child's FK null and the insert would fail — so the aggregate offers the safe way instead. */
	public void addItem(OrderItemEntity item) {
		items.add(item);
		item.setOrder(this);
	}

	public void addStatusChange(OrderStatusHistoryEntity event) {
		statusHistory.add(event);
		event.setOrder(this);
	}

	public String getId() {
		return id;
	}

	public String getOrderCode() {
		return orderCode;
	}

	public String getOrderType() {
		return orderType.name();
	}

	public OrderType getOrderTypeValue() {
		return orderType;
	}

	public OrderStatus getStatus() {
		return status;
	}

	public void setStatus(OrderStatus status) {
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

	public void setDiscountAmount(BigDecimal discountAmount) {
		this.discountAmount = discountAmount;
	}

	public String getPromotionCode() {
		return promotionCode;
	}

	public void applyPromotion(String promotionCode, String promotionId) {
		this.promotionCode = promotionCode;
		this.promotionId = promotionId;
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

	public String getRecipientName() {
		return recipientName;
	}

	public String getRecipientPhone() {
		return recipientPhone;
	}

	public void setCustomerUserId(String customerUserId) {
		this.customerUserId = customerUserId;
	}

	/**
	 * Tên và số điện thoại người nhận, cho đơn mang về.
	 *
	 * <p>Vẫn cần cho {@code Takeaway} dù đã bỏ giao hàng: quầy phải gọi được khách khi món xong.
	 * Đơn {@code DineIn} để trống — khách đang ngồi ngay đó.
	 */
	public void setRecipient(String recipientName, String recipientPhone) {
		this.recipientName = recipientName;
		this.recipientPhone = recipientPhone;
	}

	public List<OrderItemEntity> getItems() {
		return items;
	}

	public List<OrderStatusHistoryEntity> getStatusHistory() {
		return statusHistory;
	}
}
