import type {
  CreateOrderRequest,
  CreateOrderResponse,
  OrderItemStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentRequestResponse,
  PaymentResponse,
  TableInvoice,
  TableInvoicePaymentRequest,
  TableInvoicePaymentRequestResponse,
  OrderTrackingOrder,
  ValidatePromotionResponse,
  VietQrPaymentResponse,
} from "../types";
import { api } from "./apiClient";

// Per-order customer access tokens, keyed by order code. Issued by the backend at create
// time and replayed (X-Order-Token) on customer reads so guessable order codes can't be
// enumerated. Operators read via their bearer token instead and don't need this.
const ORDER_TOKENS_KEY = "cmc.orderTokens";
const ORDER_IDEMPOTENCY_KEY = "cmc.orderIdempotency";
const PAYMENT_IDEMPOTENCY_KEY = "cmc.paymentIdempotency";
const TABLE_INVOICE_PAYMENT_IDEMPOTENCY_KEY = "cmc.tableInvoicePaymentIdempotency";
const VIETQR_CACHE_KEY = "cmc.vietQrPayments";

type PendingIdempotency = { fingerprint: string; key: string };

function readOrderTokens(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(ORDER_TOKENS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberOrderToken(orderCode: string, token: string | null | undefined): void {
  if (typeof window === "undefined" || !token) return;
  const tokens = readOrderTokens();
  tokens[orderCode] = token;
  window.localStorage.setItem(ORDER_TOKENS_KEY, JSON.stringify(tokens));
}

export function getCustomerOrderToken(orderCode: string): string | undefined {
  return readOrderTokens()[orderCode];
}

export function hasCustomerOrderToken(orderCode: string): boolean {
  return Boolean(getCustomerOrderToken(orderCode));
}

function createIdempotencyKey(prefix: "order" | "payment" | "table-invoice") {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function createStableFingerprint(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createOrderFingerprint({
  orderType,
  tableCode,
  items,
  promotionCode,
  deliveryDetails,
}: CreateOrderRequest): string {
  return createStableFingerprint({ orderType, tableCode, items, promotionCode, deliveryDetails });
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function getOrderIdempotency(payload: CreateOrderRequest): PendingIdempotency {
  // Hash the payload identity so delivery contact/address affects retry identity without
  // persisting those sensitive values or table access credentials in browser storage.
  const fingerprint = createOrderFingerprint(payload);
  const pending = readJson<PendingIdempotency | null>(ORDER_IDEMPOTENCY_KEY, null);
  if (pending?.fingerprint === fingerprint) return pending;
  const next = { fingerprint, key: createIdempotencyKey("order") };
  window.localStorage.setItem(ORDER_IDEMPOTENCY_KEY, JSON.stringify(next));
  return next;
}

function clearOrderIdempotency(pending: PendingIdempotency) {
  const current = readJson<PendingIdempotency | null>(ORDER_IDEMPOTENCY_KEY, null);
  if (current?.fingerprint === pending.fingerprint && current.key === pending.key) {
    window.localStorage.removeItem(ORDER_IDEMPOTENCY_KEY);
  }
}

function getPaymentIdempotency(orderCode: string, method: PaymentMethod) {
  const records = readJson<Record<string, string>>(PAYMENT_IDEMPOTENCY_KEY, {});
  const fingerprint = `${orderCode}:${method}`;
  const existing = records[fingerprint];
  if (existing) return existing;
  const key = createIdempotencyKey("payment");
  records[fingerprint] = key;
  window.localStorage.setItem(PAYMENT_IDEMPOTENCY_KEY, JSON.stringify(records));
  return key;
}

function getTableInvoicePaymentIdempotency(
  sessionId: string,
  payload: TableInvoicePaymentRequest,
): string {
  const records = readJson<Record<string, string>>(TABLE_INVOICE_PAYMENT_IDEMPOTENCY_KEY, {});
  const fingerprint = createStableFingerprint({
    sessionId,
    method: payload.method,
    promotionCode: payload.promotionCode?.trim().toUpperCase() || null,
    customerPhoneNumber: payload.customerPhoneNumber?.trim() || null,
  });
  const storageKey = `${sessionId}:${fingerprint}`;
  const existing = records[storageKey];
  if (existing) return existing;
  const key = createIdempotencyKey("table-invoice");
  records[storageKey] = key;
  window.localStorage.setItem(TABLE_INVOICE_PAYMENT_IDEMPOTENCY_KEY, JSON.stringify(records));
  return key;
}

function clearTableInvoicePaymentIdempotency(sessionId: string): void {
  if (typeof window === "undefined") return;
  const records = readJson<Record<string, string>>(TABLE_INVOICE_PAYMENT_IDEMPOTENCY_KEY, {});
  for (const key of Object.keys(records)) {
    if (key.startsWith(`${sessionId}:`)) delete records[key];
  }
  window.localStorage.setItem(TABLE_INVOICE_PAYMENT_IDEMPOTENCY_KEY, JSON.stringify(records));
}

function rememberVietQrPayment(data: VietQrPaymentResponse | null) {
  if (!data || typeof window === "undefined") return;
  const records = readJson<Record<string, VietQrPaymentResponse>>(VIETQR_CACHE_KEY, {});
  records[data.orderCode] = data;
  window.localStorage.setItem(VIETQR_CACHE_KEY, JSON.stringify(records));
}

export function getStoredVietQrPayment(orderCode: string): VietQrPaymentResponse | null {
  return readJson<Record<string, VietQrPaymentResponse>>(VIETQR_CACHE_KEY, {})[orderCode] ?? null;
}

export async function createOrder(
  payload: CreateOrderRequest,
): Promise<CreateOrderResponse> {
  const pending = getOrderIdempotency(payload);
  const response = (await api.orders.create(payload, pending.key)) as CreateOrderResponse;
  rememberOrderToken(response.orderCode, response.customerAccessToken);
  clearOrderIdempotency(pending);
  return response;
}

export async function validatePromotion(
  code: string,
  subtotalAmount: number,
): Promise<ValidatePromotionResponse> {
  return api.promotions.validate({ code, subtotalAmount }) as Promise<ValidatePromotionResponse>;
}

export async function getKitchenOrders(): Promise<OrderTrackingOrder[]> {
  const response = await api.orders.list();
  return response.orders as OrderTrackingOrder[];
}

export async function getOrderTracking(orderCode: string): Promise<OrderTrackingOrder> {
  return api.orders.get(orderCode, getCustomerOrderToken(orderCode)) as Promise<OrderTrackingOrder>;
}

export async function getTableSessionOrders(
  sessionId: string,
  sessionToken: string,
): Promise<OrderTrackingOrder[]> {
  const response = await api.tables.listSessionOrders(sessionId, sessionToken);
  return response.orders as OrderTrackingOrder[];
}

export async function updateOrderItemStatus(
  orderCode: string,
  orderItemId: string,
  status: OrderItemStatus,
): Promise<OrderTrackingOrder> {
  return api.orders.updateItemStatus(orderCode, orderItemId, status) as Promise<OrderTrackingOrder>;
}

export async function updateOrderStatus(
  orderCode: string,
  status: OrderTrackingOrder["status"],
): Promise<OrderTrackingOrder> {
  return api.orders.updateStatus(orderCode, status) as Promise<OrderTrackingOrder>;
}

export async function getOrderPayment(orderCode: string): Promise<PaymentResponse> {
  return api.payments.get(orderCode, getCustomerOrderToken(orderCode)) as Promise<PaymentResponse>;
}

export async function requestOrderPayment(
  orderCode: string,
  method: Exclude<PaymentMethod, "Unselected">,
): Promise<PaymentRequestResponse> {
  const orderToken = getCustomerOrderToken(orderCode);
  if (!orderToken) {
    throw new Error("Không còn quyền truy cập đơn này.");
  }
  const idempotencyKey = getPaymentIdempotency(orderCode, method);
  const response = await api.payments.request(
    orderCode,
    { method },
    orderToken,
    idempotencyKey,
  ) as PaymentRequestResponse;
  rememberVietQrPayment(response.vietQr);
  return response;
}

export async function getTableInvoice(
  sessionId: string,
  sessionToken: string,
): Promise<TableInvoice> {
  const invoice = await api.tableInvoices.get(sessionId, sessionToken) as TableInvoice;
  if (["Cancelled", "Confirmed", "Paid"].includes(invoice.status)) {
    clearTableInvoicePaymentIdempotency(sessionId);
  }
  return invoice;
}

export async function requestTableAssistance(
  sessionId: string,
  sessionToken: string,
  payload: { note?: string | null } = {},
): Promise<{ ok: boolean; tableCode: string }> {
  return api.tables.requestAssistance(sessionId, sessionToken, payload);
}

export async function listTableInvoices(status?: PaymentStatus): Promise<TableInvoice[]> {
  return api.tableInvoices.list(status) as Promise<TableInvoice[]>;
}

export async function requestTableInvoicePayment(
  sessionId: string,
  sessionToken: string,
  payload: TableInvoicePaymentRequest,
): Promise<TableInvoicePaymentRequestResponse> {
  const key = getTableInvoicePaymentIdempotency(sessionId, payload);
  return api.tableInvoices.requestPayment(
    sessionId,
    payload,
    sessionToken,
    key,
  ) as Promise<TableInvoicePaymentRequestResponse>;
}

/**
 * @param amountTendered tiền khách đưa, CHỈ dùng cho tiền mặt. Bỏ trống nghĩa là khách đưa đúng —
 *                       khác hẳn 0 nghĩa là khách đưa 0 đồng. Máy chủ từ chối nếu đưa thiếu.
 */
export async function confirmTableInvoicePayment(
  sessionId: string,
  note?: string,
  amountTendered?: number,
): Promise<TableInvoice> {
  return api.tableInvoices.confirmPayment(sessionId, { note, amountTendered }) as Promise<TableInvoice>;
}

export async function cancelTableInvoicePayment(sessionId: string, note?: string): Promise<TableInvoice> {
  return api.tableInvoices.cancelPayment(sessionId, { note }) as Promise<TableInvoice>;
}

export async function confirmOrderPayment(orderCode: string, note?: string): Promise<PaymentResponse> {
  return api.payments.confirm(orderCode, { note }) as Promise<PaymentResponse>;
}

export async function refundOrderPayment(orderCode: string, note?: string): Promise<PaymentResponse> {
  return api.payments.refund(orderCode, { note }) as Promise<PaymentResponse>;
}

// A collected payment (Confirmed/Paid) can be reversed by staff/admin; once Refunded it is terminal.
export function isRefundable(order: OrderTrackingOrder): boolean {
  return order.paymentStatus === "Confirmed" || order.paymentStatus === "Paid";
}

// An order needs staff to collect/resolve payment when it is not already paid and
// either a payment attempt is open (Pending/Failed) or the order has reached the
// table (Served/Completed) still unpaid.
export function isAwaitingPayment(order: OrderTrackingOrder): boolean {
  if (order.status === "Cancelled") return false;
  if (
    order.paymentStatus === "Paid" ||
    order.paymentStatus === "Confirmed" ||
    order.paymentStatus === "Cancelled"
  ) {
    return false;
  }
  if (order.paymentStatus === "Pending" || order.paymentStatus === "Failed") return true;
  return (
    order.status === "Served" ||
    order.status === "Completed"
  );
}
