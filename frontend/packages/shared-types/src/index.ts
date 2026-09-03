export type UserRole = "Customer" | "Staff" | "CounterStaff" | "Kitchen" | "Admin";
export type OrderType = "DineIn";
export type OrderStatus = "Draft" | "Placed" | "Confirmed" | "Preparing" | "Ready" | "Served" | "Completed" | "Cancelled";
export type OrderItemStatus = "Pending" | "Preparing" | "Ready" | "Served" | "Cancelled";
export type PaymentMethod = "Unselected" | "COD" | "VietQR";
export type PaymentStatus = "NotRequested" | "Unpaid" | "Pending" | "Paid" | "Confirmed" | "Failed" | "Cancelled" | "Refunded";
export type OrderEventSource = "Status" | "Payment";
export type ChatRole = "user" | "assistant" | "system";

export type AuthUser = { userId: string; fullName: string; email: string; role: UserRole };
// `identifier`, KHÔNG phải `email`: backend nhận một ô cho cả hai loại người dùng — khách gõ số
// điện thoại, nhân viên gõ email. Xem `AuthDtos.LoginRequest` bên Java. Gửi tên khác thì Jackson
// để null và request chết ở 400 IDENTIFIER_REQUIRED trước cả bước kiểm mật khẩu.
export type LoginRequest = { identifier: string; password: string };
export type LoginResponse = { accessToken: string; expiresAt: string; user: AuthUser };
export type ApiErrorBody = { error: { code: string; message: string; details: Record<string, unknown> } };
export type Table = { tableCode: string; displayName: string; isActive: boolean };
export type TableListResponse = { items: Table[]; total: number };
export type AdminTable = Table & { qrToken: string | null; customerPath: string };
export type AdminTableListResponse = { items: AdminTable[]; total: number };
export type AdminTableSessionSummary = { sessionId: string; tableCode: string; tableDisplayName: string | null; status: string; openedAt: string; expiresAt: string; closedAt: string | null; isExpired: boolean; activeOrderCount: number };
export type AdminTableSessionListResponse = { items: AdminTableSessionSummary[]; total: number };
export type TableSession = { sessionId: string; orderType: OrderType; status: "Open" | "Closed" | "Expired"; tableCode: string | null; tableDisplayName: string | null; openedAt: string; expiresAt: string; closedAt: string | null; isExpired: boolean };
export type TableSessionResumeState = "New" | "CartPending" | "OrderInProgress" | "ReadyForPayment" | "PaymentPending" | "Paid";
export type OpenTableSessionResponse = TableSession & { tableSessionToken: string; resumeState: TableSessionResumeState };
export type MenuCategory = { categoryId: string; name: string };
// `prepMinutes`: phút từ lúc bếp nhận món tới lúc món sẵn sàng, do BẾP khai. `null` = chưa khai
// và món đó không có ước lượng — im lặng đúng, hơn là một con số bịa. Cột `menu_items.prep_minutes`
// có từ V11 nhưng tới nay chỉ migration ghi được: entity không ánh xạ, DTO không có trường, giao
// diện không có ô. Đây là kiểu cho đường ghi vừa mở.
export type MenuItem = { id: string; name: string; description: string; price: number; categoryId: string; categoryName: string; imageUrl: string | null; isAvailable: boolean; tags: string[]; prepMinutes: number | null };
export type MenuResponse = { categories: MenuCategory[]; items: MenuItem[] };
export type CreateOrderRequest = { orderType: OrderType; tableCode?: string | null; qrToken?: string | null; tableSessionId?: string | null; items: Array<{ menuItemId: string; quantity: number }>; promotionCode?: string | null; customerPhoneNumber?: string | null };
// `estimatedReadyMinutes*` và `kitchenBusy`: máy chủ ĐÃ gửi ba trường này từ lâu (xem
// `OrderDtos.OrderItemResponse` bên Java) nhưng kiểu của web không khai, nên web vứt đi và khách
// trên web không thấy ước lượng nào — trong khi app di động có. `null` khi món không còn chờ nữa.
export type OrderItem = { orderItemId: string; menuItemId: string; name: string; unitPrice: number; quantity: number; status: OrderItemStatus; lineTotal: number; updatedAt: string; estimatedReadyMinutesLow?: number | null; estimatedReadyMinutesHigh?: number | null; kitchenBusy?: boolean };
export type OrderStatusEvent = { status: OrderStatus | PaymentStatus; source?: OrderEventSource; changedByRole?: string | null; note?: string | null; createdAt: string };
export type Order = { orderId: string; orderCode: string; orderType: OrderType; tableCode: string | null; tableSessionId?: string | null; status: OrderStatus; paymentStatus: PaymentStatus; paymentMethod: PaymentMethod; subtotalAmount: number; discountAmount: number; totalAmount: number; promotionCode?: string | null; createdAt: string; updatedAt: string; items: OrderItem[]; events: OrderStatusEvent[] };
export type CreateOrderResponse = Order & { customerAccessToken: string };
export type OrderListResponse = { orders: Order[]; total: number };
export type PaymentTransaction = { transactionId: string; method: PaymentMethod; status: PaymentStatus; amount: number; provider: string; providerTransactionId: string | null; note: string | null; createdAt: string };
export type Payment = { paymentId: string; orderCode: string; method: PaymentMethod; status: PaymentStatus; amount: number; providerTransactionId: string | null; createdAt: string; paidAt: string | null; updatedAt: string; transactions: PaymentTransaction[] };
export type VietQrPayment = { orderCode: string; amount: number; transferContent: string; bankId: string; accountNumber: string; accountName: string; quickLink: string; qrPayload: string; qrImageDataUri: string; paymentStatus: PaymentStatus };
export type PaymentRequest = { method: "COD" | "VietQR" };
export type PaymentRequestResponse = { payment: Payment; vietQr: VietQrPayment | null };
export type TableInvoiceLine = { menuItemId: string; name: string; unitPrice: number; quantity: number; lineTotal: number };
export type TableInvoiceOrderRound = { orderCode: string; status: OrderStatus; subtotalAmount: number; createdAt: string };
export type TableInvoiceVietQr = { invoiceCode: string; amount: number; transferContent: string; quickLink: string; qrImageDataUri: string };
export type TableInvoice = { tableSessionId: string; invoiceCode: string | null; tableCode: string | null; status: PaymentStatus; subtotalAmount: number; discountAmount: number; loyaltyDiscountAmount: number | null; totalAmount: number; promotionCode: string | null; customerPhoneNumber: string | null; method: PaymentMethod; orderRounds: TableInvoiceOrderRound[]; items: TableInvoiceLine[]; vietQr: TableInvoiceVietQr | null };
/** `loyaltyCode` là mã đổi bằng điểm — cùng ô nhập với `promotionCode`, cộng dồn, cắt theo trần tổng. */
export type TableInvoicePaymentRequest = { method: "COD" | "VietQR"; promotionCode?: string | null; customerPhoneNumber?: string | null; loyaltyCode?: string | null };
export type TableInvoicePaymentRequestResponse = { invoice: TableInvoice; payment: { paymentId: string; status: PaymentStatus; method: PaymentMethod; amount: number }; vietQr: TableInvoiceVietQr | null };
export type OrderCreatedEvent = { orderId: string; orderCode: string; orderType: OrderType; tableCode: string | null; status: OrderStatus; createdAt: string };
export type OrderStatusChangedEvent = { orderId: string; orderCode: string; status: OrderStatus; updatedAt: string };
export type OrderItemStatusChangedEvent = { orderId: string; orderCode: string; orderItemId: string; menuItemName: string; status: OrderItemStatus; updatedAt: string };
export type PaymentRequestedEvent = { orderId: string; orderCode: string; method: "COD" | "VietQR"; status: PaymentStatus; amount: number; updatedAt: string; tableCode: string | null };
export type RealtimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export type AdminCategory = { categoryId: string; name: string; displayOrder: number; isActive: boolean; createdAt: string; updatedAt: string };
export type AdminCategoryRequest = { name: string; displayOrder: number; isActive: boolean };
export type RegisterRequest = { fullName: string; email: string; password: string };
export type UserSummary = { userId: string; fullName: string; email: string; role: UserRole; createdAt: string };
export type UserListResponse = { users: UserSummary[] };
export type CreateUserRequest = { fullName: string; email: string; password: string; role: UserRole };
export type UpdateUserRequest = { fullName: string; email: string; role: UserRole };
export type ResetPasswordRequest = { newPassword: string };
export type ChangePasswordRequest = { currentPassword: string; newPassword: string };
export type RefundPaymentRequest = { note?: string | null };

export type PromotionType = "Percentage" | "FixedAmount";
export type Promotion = { promotionId: string; code: string; name: string; description: string | null; type: PromotionType; discountValue: number; minOrderAmount: number | null; maxDiscountAmount: number | null; isFlashSale: boolean; startsAt: string | null; endsAt: string | null; isActive: boolean; createdAt: string; updatedAt: string };
export type PromotionRequest = { code: string; name: string; description?: string | null; type: PromotionType; discountValue: number; minOrderAmount?: number | null; maxDiscountAmount?: number | null; isFlashSale: boolean; startsAt?: string | null; endsAt?: string | null; isActive: boolean };
export type ValidatePromotionRequest = { code: string; subtotalAmount: number };
export type ValidatePromotionResponse = { code: string; name: string; type: PromotionType; subtotalAmount: number; discountAmount: number; totalAmount: number; isFlashSale: boolean };

export type LoyaltyMember = { memberId: string; phoneNumber: string; fullName: string | null; points: number; lifetimeSpend: number; createdAt: string; updatedAt: string };
export type LoyaltyMemberRequest = { phoneNumber: string; fullName?: string | null; points: number };
/** FREE_ITEM tặng một món; DISCOUNT trừ thẳng tiền vào hoá đơn. */
export type LoyaltyRewardType = "FREE_ITEM" | "DISCOUNT";

export type LoyaltyMemberTier = "BAC" | "VANG" | "KIM_CUONG";

export type LoyaltyReward = {
  rewardId: string;
  name: string;
  description: string | null;
  pointsRequired: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rewardType: LoyaltyRewardType;
  menuItemId: string | null;
  discountAmount: number | null;
  minTier: LoyaltyMemberTier;
};

/**
 * Mỗi loại chỉ mang dữ liệu của nó: FREE_ITEM cần `menuItemId`, DISCOUNT cần `discountAmount`.
 * Gửi thiếu thì backend trả 400 nói rõ thiếu gì — trước đây nó nổ 500 vì ràng buộc cơ sở dữ liệu.
 */
export type LoyaltyRewardRequest = {
  name: string;
  description?: string | null;
  pointsRequired: number;
  isActive: boolean;
  rewardType: LoyaltyRewardType;
  menuItemId?: string | null;
  discountAmount?: number | null;
  minTier?: LoyaltyMemberTier;
};
/** Một phiếu khách đã đổi. `honouredAt` khác null nghĩa là đã phát rồi. */
export type LoyaltyVoucher = {
  redemptionId: string;
  rewardName: string;
  pointsSpent: number;
  redeemedAt: string;
  honouredAt: string | null;
};

export type LoyaltyLookupResponse = {
  phoneNumber: string;
  /** Số này đã có HỒ SƠ tích điểm chưa — khác với việc đã nối vào một tài khoản app. */
  hasProfile: boolean;
  points: number;
  lifetimeSpend: number;
  spend12m: number;
  tier: string;
  tierName: string;
  availableRewards: LoyaltyReward[];
  pendingVouchers: LoyaltyVoucher[];
};

/**
 * Kết quả một lần quầy đổi thưởng HỘ khách.
 *
 * Ba kết cục, và chúng khác nhau ở việc nhân viên phải LÀM GÌ tiếp:
 *   - `code` có     → giảm tiền: đọc mã cho khách, khách tự nhập ở màn thanh toán
 *   - `orderCode` có → tặng món đã vào đơn: bếp đang làm, không phải đọc gì
 *   - cả hai null    → tặng món chưa gắn đơn: phiếu nằm chờ, quầy phát bằng tay
 */
export type LoyaltyCounterRedeem = {
  redemptionId: string;
  rewardName: string;
  pointsSpent: number;
  code: string | null;
  orderCode: string | null;
  /** Điểm còn lại, để quầy đọc lại cho khách ngay. */
  soDuMoi: number;
};

export type TopMenuItemReport = { menuItemId: string; name: string; quantitySold: number; revenue: number };
export type DailyRevenueReport = { date: string; orderCount: number; revenue: number };
export type ReportSummaryResponse = { from: string; to: string; totalOrders: number; paidOrders: number; grossRevenue: number; totalDiscount: number; netRevenue: number; topItems: TopMenuItemReport[]; dailyRevenue: DailyRevenueReport[] };
