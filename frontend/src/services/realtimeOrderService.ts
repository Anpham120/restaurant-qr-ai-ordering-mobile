import { authStorage } from "@cmc/auth";
import { createOrderHubClient } from "@cmc/realtime-client";
import type { OrderItemStatus, OrderRealtimeEvent, OrderTrackingOrder } from "../types";

export type RealtimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
type RealtimeListener = (event: OrderRealtimeEvent) => void;
type ConnectionListener = (status: RealtimeConnectionStatus) => void;
const realtimeListeners = new Set<RealtimeListener>();
const connectionListeners = new Set<ConnectionListener>();
let connectionStatus: RealtimeConnectionStatus = "disconnected";

/**
 * SignalR event names supported by the order hub:
 * - order.created
 * - order.statusChanged
 * - order.itemStatusChanged
 * - payment.requested
 * - tableInvoice.paymentConfirmed
 * - cart.updated
 * - assistance.requested
 * - menu.availabilityChanged (reserved; may not be emitted on all deployments)
 */
const client = createOrderHubClient({
  accessTokenFactory: authStorage.token,
  handlers: {
    onOrderCreated: payload => notifyRealtimeListeners({ event: "order.created", payload }),
    onOrderStatusChanged: payload => notifyRealtimeListeners({ event: "order.statusChanged", payload }),
    onOrderItemStatusChanged: payload => notifyRealtimeListeners({ event: "order.itemStatusChanged", payload }),
    onPaymentRequested: payload => notifyRealtimeListeners({ event: "payment.requested", payload }),
    onTableInvoicePaymentConfirmed: payload =>
      notifyRealtimeListeners({
        event: "tableInvoice.paymentConfirmed",
        payload: {
          invoice: {
            ...payload.invoice,
            status: payload.invoice.status as import("../types").PaymentStatus,
            method: payload.invoice.method as import("../types").PaymentMethod,
            orderRounds: payload.invoice.orderRounds.map(round => ({
              ...round,
              status: round.status as import("../types").OrderStatus,
            })),
            vietQr: payload.invoice.vietQr as import("../types").TableInvoice["vietQr"],
          },
          paidAt: payload.paidAt,
        },
      }),
    onCartUpdated: payload => notifyRealtimeListeners({ event: "cart.updated", payload }),
    onAssistanceRequested: payload => notifyRealtimeListeners({ event: "assistance.requested", payload }),
    onMenuAvailabilityChanged: payload => notifyRealtimeListeners({ event: "menu.availabilityChanged", payload }),
    onStatusChanged: setConnectionStatus,
  },
});

export async function connectOrderRealtime() { await client.connect(); }
export async function disconnectOrderRealtime() { await client.disconnect(); }
export async function watchOrderRealtime(orderCode: string, orderToken: string) { await client.watchOrder(orderCode, orderToken); }
export async function watchTableRealtime(tableCode: string, sessionToken = "") { await client.watchTable(tableCode, sessionToken); }

/**
 * Theo dõi realtime của một phiên bàn.
 *
 * Bản .NET có hẳn một lượt gọi `WatchTableSession(sessionId, token)`: hub xác thực token rồi tự
 * thêm kết nối vào nhóm của BÀN. Bản Java không có đích riêng cho phiên bàn — sự kiện vẫn phát tới
 * `/topic/table.<mã bàn>` — nên nơi gọi phải đưa mã bàn, và token phiên đi kèm khung SUBSCRIBE để
 * `StompSubscriptionGuard` đối chiếu với các phiên đang mở của đúng bàn đó.
 *
 * Giữ tên hàm cũ vì nó mô tả đúng ý định của nơi gọi (theo dõi phiên bàn của tôi); chỉ tham số đổi.
 */
export async function watchTableSessionRealtime(tableCode: string, sessionToken: string) { await client.watchTable(tableCode, sessionToken); }
export function subscribeOrderRealtime(listener: RealtimeListener) { realtimeListeners.add(listener); return () => realtimeListeners.delete(listener); }
export function subscribeRealtimeConnection(listener: ConnectionListener) { connectionListeners.add(listener); listener(connectionStatus); return () => connectionListeners.delete(listener); }

// Kept for optimistic local updates and cross-tab compatibility only. Server events remain authoritative.
export function publishOrderRealtimeEvent(event: OrderRealtimeEvent) { notifyRealtimeListeners(event); }
export function createItemStatusChangedEvent(order: OrderTrackingOrder, orderItemId: string, status: OrderItemStatus): OrderRealtimeEvent {
  const item = order.items.find(orderItem => orderItem.orderItemId === orderItemId);
  return { event: "order.itemStatusChanged", payload: { orderId: order.orderId, orderCode: order.orderCode, orderItemId, menuItemName: item?.name ?? orderItemId, status, updatedAt: new Date().toISOString() } };
}
function setConnectionStatus(status: RealtimeConnectionStatus) { connectionStatus = status; connectionListeners.forEach(listener => listener(status)); }
function notifyRealtimeListeners(event: OrderRealtimeEvent) { realtimeListeners.forEach(listener => listener(event)); }
