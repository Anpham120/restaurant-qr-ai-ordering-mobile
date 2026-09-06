export type Role = "Admin" | "CounterStaff" | "Staff" | "Kitchen" | "Courier";
export type User = { userId: string; fullName: string; email: string; role: Role; createdAt?: string };
export type Option = { id: string; name: string; price: number; isAvailable: boolean };
export type OptionGroup = { id: string; name: string; minSelections: number; maxSelections: number; options: Option[] };
export type MenuItem = { id: string; name: string; description: string; price: number; categoryId: string; categoryName: string; imageUrl?: string; isAvailable: boolean; tags: string[]; prepMinutes?: number | null; optionGroups?: OptionGroup[] };
export type Category = { categoryId: string; name: string; displayOrder?: number; isActive?: boolean };
export type OrderItem = { orderItemId: string; menuItemId: string; name: string; unitPrice: number; quantity: number; status: string; lineTotal: number; note?: string };
export type Order = { orderId: string; orderCode: string; orderType: string; status: string; paymentStatus: string; paymentMethod: string; totalAmount: number; deliveryFee?: number; fulfillmentStatus?: string; codAccepted?: boolean; tableCode?: string; createdAt: string; deliveryDetails?: { recipientName: string; phoneNumber: string; address?: string; note?: string }; items: OrderItem[] };
export type ShopConfig = { name: string; deliveryFee: number; minimumOrder: number; address: string; phone: string; latitude: number; longitude: number; shippingFreeRadiusKm: number; shippingPerKm: number; estimatedMinutesLow: number; estimatedMinutesHigh: number; allowCod: boolean };

const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8081/api";
export const TOKEN_KEY = "may-ops-access-token";

export async function request<T>(path: string, init: RequestInit = {}, customerToken?: string): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (customerToken) headers.set("X-Order-Token", customerToken);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(body.message ?? body.error ?? `Yêu cầu thất bại (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  login: (identifier: string, password: string) => request<{ accessToken: string; expiresAt: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }),
  config: () => request<ShopConfig>("/shop/config"),
  saveConfig: (body: ShopConfig) => request<ShopConfig>("/shop/config", { method: "PUT", body: JSON.stringify(body) }),
  quote: (latitude: number, longitude: number) => request<{ distanceKm: number; deliveryFee: number }>("/shop/quote", { method: "POST", body: JSON.stringify({ latitude, longitude }) }),
  menu: () => request<{ categories: Category[]; items: MenuItem[] }>("/shop/menu"),
  orders: () => request<{ orders: Order[]; total: number }>("/orders"),
  courierOrders: () => request<{ orders: Order[]; total: number }>("/delivery/orders"),
  updateItem: (code: string, itemId: string, status: string) => request<Order>(`/orders/${encodeURIComponent(code)}/items/${encodeURIComponent(itemId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateOrder: (code: string, status: string) => request<Order>(`/orders/${encodeURIComponent(code)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  acceptCod: (code: string) => request<Order>(`/orders/${encodeURIComponent(code)}/accept-cod`, { method: "POST" }),
  couriers: () => request<{ users: User[] }>("/delivery/couriers"),
  dispatch: (code: string, courierId: string) => request<Order>(`/orders/${encodeURIComponent(code)}/dispatch`, { method: "POST", body: JSON.stringify({ courierId }) }),
  courierStatus: (code: string, body: { status: string; note?: string; amountCollected?: number }) => request<Order>(`/delivery/orders/${encodeURIComponent(code)}/status`, { method: "PATCH", body: JSON.stringify(body) }),
  createOrder: (body: unknown, key: string) => request<Order & { customerAccessToken: string }>("/orders", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) }),
  requestPayment: (code: string, method: "COD" | "VietQR", key: string, customerToken: string) => request<unknown>(`/orders/${encodeURIComponent(code)}/payment/request`, { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ method }) }, customerToken),
  confirmPayment: (code: string, note: string) => request<unknown>(`/orders/${encodeURIComponent(code)}/payment/confirm`, { method: "POST", body: JSON.stringify({ note }) }),
  adminItems: () => request<MenuItem[]>("/admin/menu-items"),
  saveItem: (item: Partial<MenuItem>, id?: string) => request<MenuItem>(id ? `/admin/menu-items/${encodeURIComponent(id)}` : "/admin/menu-items", { method: id ? "PUT" : "POST", body: JSON.stringify(item) }),
  deleteItem: (id: string) => request<void>(`/admin/menu-items/${encodeURIComponent(id)}`, { method: "DELETE" }),
  categories: () => request<Category[]>("/admin/categories"),
  users: () => request<{ users: User[] }>("/users"),
  saveUser: (user: Partial<User> & { password?: string }, id?: string) => request<User>(id ? `/users/${encodeURIComponent(id)}` : "/users", { method: id ? "PUT" : "POST", body: JSON.stringify(user) }),
  deleteUser: (id: string) => request<void>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const money = (value = 0) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
