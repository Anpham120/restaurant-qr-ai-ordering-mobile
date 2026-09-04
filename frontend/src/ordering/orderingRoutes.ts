export type OrderingDestination = "menu" | "cart" | "checkout" | "orders";

export const orderingNavigation = [
  { label: "Thực đơn", path: "menu" },
  { label: "Giỏ hàng", path: "cart" },
  { label: "Món đã gọi", path: "orders" },
] as const;

export function orderingPath(sessionId: string, destination: OrderingDestination | string = "menu"): string {
  return `/table-session/${encodeURIComponent(sessionId)}/${destination}`;
}

export function orderTrackingPath(sessionId: string, orderCode: string): string {
  return `${orderingPath(sessionId, "orders")}/${encodeURIComponent(orderCode)}`;
}
