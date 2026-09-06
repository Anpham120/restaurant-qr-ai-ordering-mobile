export type OrderType = "Delivery" | "Pickup" | "DineIn";
export type Option = { id: string; name: string; price: number; isAvailable: boolean };
export type OptionGroup = { id: string; name: string; minSelections: number; maxSelections: number; options: Option[] };
export type Product = { id: string; name: string; description: string; price: number; categoryId: string; categoryName: string; imageUrl: string | null; isAvailable: boolean; tags: string[]; prepMinutes?: number; optionGroups: OptionGroup[] };
export type Catalog = { categories: { categoryId: string; name: string }[]; items: Product[] };
export type ShopConfig = { name: string; address: string; phone: string; latitude: number | null; longitude: number | null; shippingFreeRadiusKm: number; shippingPerKm: number; minimumOrder: number; estimatedMinutesLow: number; estimatedMinutesHigh: number; allowCod: boolean };
export type CartLine = { key: string; menuItemId: string; quantity: number; optionIds: string[]; note: string };
export type Point = { latitude: number; longitude: number };
export type Quote = { distanceKm: number; deliveryFee: number };
export type Recipient = { recipientName: string; phoneNumber: string; address: string; note: string; latitude?: number; longitude?: number };
export type ShopOrder = { orderId: string; orderCode: string; orderType: OrderType; status: string; paymentStatus: string; paymentMethod: string; codAccepted?: boolean; subtotalAmount: number; discountAmount: number; deliveryFee: number; totalAmount: number; fulfillmentStatus: string | null; deliveryDetails: Recipient | null; tableCode?: string | null; tableSessionId?: string | null; createdAt: string; updatedAt: string; customerAccessToken?: string; items: { orderItemId: string; menuItemId: string; name: string; unitPrice: number; quantity: number; lineTotal: number; status: string; note?: string | null }[]; events?: { status: string; note?: string; createdAt: string }[] };
export type SavedOrder = { orderCode: string; token: string; createdAt: string };
export type PaymentResult = { payment: { status: string; amount: number }; vietQr: { qrImageDataUri: string; quickLink: string; transferContent: string; accountNumber: string; bankId: string; amount: number } | null };
export type Session = { accessToken: string; expiresAt: string; user: { userId: string; fullName: string; email: string; role: string } };
export const money = (amount: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
export const settled = (status: string) => status === "Paid" || status === "Confirmed";
export function lineKey(menuItemId: string, optionIds: string[], note: string) {
  return JSON.stringify([menuItemId, [...optionIds].sort(), note.trim()]);
}
export function selectedOptions(product: Product, ids: string[]) { return (product.optionGroups ?? []).flatMap(g => g.options).filter(o => ids.includes(o.id)); }
export function unitPrice(product: Product, ids: string[]) { return product.price + selectedOptions(product, ids).reduce((sum, o) => sum + o.price, 0); }
export function selectionError(product: Product, ids: string[]): string | null {
  for (const group of product.optionGroups ?? []) {
    const count = group.options.filter(o => ids.includes(o.id) && o.isAvailable).length;
    if (count < group.minSelections || count > group.maxSelections) return `${group.name}: chọn ${group.minSelections === group.maxSelections ? group.minSelections : `${group.minSelections}–${group.maxSelections}`} tùy chọn.`;
  }
  if (ids.some(id => !(product.optionGroups ?? []).some(g => g.options.some(o => o.id === id && o.isAvailable)))) return "Có tùy chọn vừa hết. Vui lòng chọn lại.";
  return null;
}
export function orderLabel(order: ShopOrder): string {
  const fulfillment: Record<string, string> = { Assigned: "Đã có người giao", OutForDelivery: "Đang giao đến bạn", Delivered: "Đã giao thành công", Failed: "Giao chưa thành công", ReadyForDispatch: "Sẵn sàng giao" };
  if (order.status === "Cancelled") return "Đã hủy";
  if (order.fulfillmentStatus && fulfillment[order.fulfillmentStatus]) return fulfillment[order.fulfillmentStatus];
  if (order.status === "Completed") return "Đã hoàn tất";
  if (order.orderType !== "DineIn" && !settled(order.paymentStatus) && !(order.paymentMethod === "COD" && order.codAccepted)) return order.paymentMethod === "COD" ? "Chờ quán tiếp nhận" : "Chờ thanh toán";
  return ({ Placed: "Chờ chuẩn bị", Confirmed: "Quán đã tiếp nhận", Preparing: "Đang chuẩn bị", Ready: "Món đã sẵn sàng", Served: "Đã nhận món" } as Record<string, string>)[order.status] ?? order.status;
}
