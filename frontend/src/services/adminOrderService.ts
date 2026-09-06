import type { AdminOrder, OrderTrackingOrder, PaymentResponse } from "../types";
import { api } from "./apiClient";

export async function getAdminOrders(): Promise<AdminOrder[]> {
  const response = await api.orders.list();
  return response.orders.map(toAdminOrder);
}

export async function failOrderPayment(orderCode: string, note?: string): Promise<PaymentResponse> {
  return api.payments.fail(orderCode, { note }) as Promise<PaymentResponse>;
}

export async function getOrderPaymentDetail(orderCode: string): Promise<PaymentResponse> {
  return api.payments.get(orderCode) as Promise<PaymentResponse>;
}

function toAdminOrder(order: OrderTrackingOrder): AdminOrder {
  return {
    id: order.orderId,
    code: order.orderCode,
    type: order.orderType,
    tableCode: order.tableCode ?? undefined,
    customerName: order.deliveryDetails?.recipientName ?? (order.tableCode ? `Bàn ${order.tableCode}` : "Khách mang đi"),
    status: order.status,
    total: order.totalAmount,
    deliveryDetails: order.deliveryDetails,
    deliveryFee: order.deliveryFee,
    fulfillmentStatus: order.fulfillmentStatus,
    placedAt: new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(order.createdAt)),
    paymentStatus: order.paymentStatus,
    items: order.items.map((item) => ({
      id: item.orderItemId,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
    })),
  };
}
