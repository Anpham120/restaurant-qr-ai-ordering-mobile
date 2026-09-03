import type { OrderStatus, TableCode } from "./api";

export type CustomerOrderType = "DineIn";

export type PaymentMethod = "Unselected" | "COD" | "VietQR";
export type RequestedPaymentMethod = Exclude<PaymentMethod, "Unselected">;
export type PaymentStatus = "NotRequested" | "Unpaid" | "Pending" | "Paid" | "Confirmed" | "Failed" | "Cancelled" | "Refunded";

export type OrderItemStatus =
  | "Pending"
  | "Preparing"
  | "Ready"
  | "Served"
  | "Cancelled";

export type CreateOrderItem = {
  menuItemId: string;
  quantity: number;
};

export type CreateOrderRequest = {
  orderType: CustomerOrderType;
  tableCode?: TableCode | null;
  qrToken?: string | null;
  tableSessionId?: string | null;
  items: CreateOrderItem[];
  promotionCode?: string | null;
  customerPhoneNumber?: string | null;
};

export type PromotionType = "Percentage" | "FixedAmount";

export type ValidatePromotionResponse = {
  code: string;
  name: string;
  type: PromotionType;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  isFlashSale: boolean;
};

export type CreateOrderResponse = {
  orderId: string;
  orderCode: string;
  customerAccessToken?: string | null;
  orderType: CustomerOrderType;
  tableCode: TableCode | null;
  tableSessionId?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  promotionCode?: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    orderItemId: string;
    menuItemId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    status: OrderItemStatus;
    lineTotal: number;
    updatedAt: string;
  }>;
};

export type OrderEventSource = "Status" | "Payment";

export type OrderStatusEvent = {
  status: OrderStatus | PaymentStatus;
  source?: OrderEventSource;
  changedByRole?: string | null;
  note?: string | null;
  createdAt: string;
};

export type OrderTrackingItem = {
  orderItemId: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  status: OrderItemStatus;
  lineTotal: number;
  updatedAt: string;

  /**
   * Ước lượng thời gian lên món, do máy chủ tính (gộp tải bếp + độ trễ bếp tự khai).
   *
   * `null` khi món không còn chờ nữa. Ba trường này máy chủ ĐÃ gửi từ lâu — đo thật: một món
   * `Pending` trả về 24–41 phút — nhưng kiểu của web không khai nên web vứt đi, và khách quét QR
   * bằng trình duyệt không thấy ước lượng nào, trong khi app di động thì có.
   */
  estimatedReadyMinutesLow?: number | null;
  estimatedReadyMinutesHigh?: number | null;
  kitchenBusy?: boolean;
};

export type OrderTrackingOrder = {
  orderId: string;
  orderCode: string;
  orderType: CustomerOrderType;
  tableCode: TableCode | null;
  tableSessionId?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotalAmount: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  items: OrderTrackingItem[];
  events?: OrderStatusEvent[];
};

export type PaymentTransaction = {
  transactionId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  provider: string;
  providerTransactionId: string | null;
  note: string | null;
  createdAt: string;
};

export type PaymentResponse = {
  paymentId: string;
  orderCode: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  providerTransactionId: string | null;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
  transactions: PaymentTransaction[];
};

export type VietQrPaymentResponse = {
  orderCode: string;
  amount: number;
  transferContent: string;
  bankId: string;
  accountNumber: string;
  accountName: string;
  quickLink: string;
  qrPayload: string;
  qrImageDataUri: string;
  paymentStatus: PaymentStatus;
};

export type PaymentRequestResponse = {
  payment: PaymentResponse;
  vietQr: VietQrPaymentResponse | null;
};

export type TableInvoiceLine = {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type TableInvoiceOrderRound = {
  orderCode: string;
  status: OrderStatus;
  subtotalAmount: number;
  createdAt: string;
};

export type TableInvoice = {
  tableSessionId: string;
  invoiceCode: string | null;
  tableCode: TableCode | null;
  status: PaymentStatus;
  subtotalAmount: number;
  /** TỔNG mọi khoản giảm — mã của quán cộng ưu đãi đổi điểm, đã cắt theo trần. */
  discountAmount: number;
  /** Phần do đổi điểm, tách ra để biên nhận giải thích được con số tổng. */
  loyaltyDiscountAmount: number | null;
  totalAmount: number;
  promotionCode: string | null;
  customerPhoneNumber: string | null;
  method: PaymentMethod;
  orderRounds: TableInvoiceOrderRound[];
  items: TableInvoiceLine[];
  vietQr: TableInvoiceVietQr | null;
};

export type TableInvoiceVietQr = {
  invoiceCode: string;
  amount: number;
  transferContent: string;
  quickLink: string;
  qrImageDataUri: string;
};

export type TableInvoicePaymentRequest = {
  method: RequestedPaymentMethod;
  promotionCode?: string | null;
  customerPhoneNumber?: string | null;
  /** Mã đổi bằng điểm — cùng ô nhập với promotionCode, cộng dồn rồi cắt theo trần tổng. */
  loyaltyCode?: string | null;
};

export type TableInvoicePaymentRequestResponse = {
  invoice: TableInvoice;
  payment: { paymentId: string; status: PaymentStatus; method: PaymentMethod; amount: number };
  vietQr: TableInvoiceVietQr | null;
};

export type OrderCreatedRealtimeEvent = {
  event: "order.created";
  payload: {
    orderId: string;
    orderCode: string;
    orderType: CustomerOrderType;
    tableCode: TableCode | null;
    status: OrderStatus;
    createdAt: string;
  };
};

export type OrderStatusChangedRealtimeEvent = {
  event: "order.statusChanged";
  payload: {
    orderId: string;
    orderCode: string;
    status: OrderStatus;
    updatedAt: string;
  };
};

export type OrderItemStatusChangedRealtimeEvent = {
  event: "order.itemStatusChanged";
  payload: {
    orderId: string;
    orderCode: string;
    orderItemId: string;
    menuItemName: string;
    status: OrderItemStatus;
    updatedAt: string;
  };
};

export type PaymentRequestedRealtimeEvent = {
  event: "payment.requested";
  payload: {
    orderId: string;
    orderCode: string;
    method: RequestedPaymentMethod;
    status: PaymentStatus;
    amount: number;
    updatedAt: string;
    tableCode: string | null;
  };
};

export type CartUpdatedRealtimeEvent = {
  event: "cart.updated";
  payload: {
    tableSessionId: string;
    tableCode: string | null;
    itemCount: number;
    subtotal: number;
    updatedAt: string;
  };
};

export type AssistanceRequestedRealtimeEvent = {
  event: "assistance.requested";
  payload: {
    tableCode: string;
    tableSessionId: string | null;
    note: string | null;
    requestedAt: string;
  };
};

/** Backend event name: menu.availabilityChanged (not yet emitted by all deployments). */
export type MenuAvailabilityChangedRealtimeEvent = {
  event: "menu.availabilityChanged";
  payload: {
    menuItemId: string;
    isAvailable: boolean;
    updatedAt: string;
  };
};

export type TableInvoicePaymentConfirmedRealtimeEvent = {
  event: "tableInvoice.paymentConfirmed";
  payload: {
    invoice: TableInvoice;
    paidAt: string;
  };
};

export type OrderRealtimeEvent =
  | OrderCreatedRealtimeEvent
  | OrderStatusChangedRealtimeEvent
  | OrderItemStatusChangedRealtimeEvent
  | PaymentRequestedRealtimeEvent
  | TableInvoicePaymentConfirmedRealtimeEvent
  | CartUpdatedRealtimeEvent
  | AssistanceRequestedRealtimeEvent
  | MenuAvailabilityChangedRealtimeEvent;
