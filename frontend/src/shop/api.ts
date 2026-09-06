import type { Catalog, Point, Quote, ShopConfig, ShopOrder, PaymentResult, Session } from "./model";

const base = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
export class ShopApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const session = readStored<Session | null>("may.customer.session", null, sessionStorage);
  if (session && Date.parse(session.expiresAt) > Date.now()) headers.set("Authorization", `Bearer ${session.accessToken}`);
  let response: Response;
  try { response = await fetch(`${base}${path}`, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(15000) }); }
  catch { throw new Error("Chưa kết nối được với Mây. Kiểm tra mạng và thử lại nhé."); }
  if (!response.ok) {
    let message = `Không thực hiện được yêu cầu (${response.status}).`;
    try { const data = await response.json(); message = data?.error?.message ?? message; } catch { /* Non-JSON gateway response. */ }
    throw new ShopApiError(message, response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export function readStored<T>(key: string, fallback: T, storage: Storage = localStorage): T {
  try { return JSON.parse(storage.getItem(key) ?? "null") as T ?? fallback; } catch { return fallback; }
}
export function writeStored(key: string, value: unknown, storage: Storage = localStorage): boolean {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export const newKey = () => crypto.randomUUID();
export const shopApi = {
  catalog: () => request<Catalog>("/shop/menu"),
  config: () => request<ShopConfig>("/shop/config"),
  quote: (point: Point) => request<Quote>("/shop/quote", { method: "POST", body: JSON.stringify(point) }),
  order: (code: string, token: string) => request<ShopOrder>(`/orders/${encodeURIComponent(code)}`, { headers: { "X-Order-Token": token } }),
  create: (payload: unknown, key: string) => request<ShopOrder>("/orders", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(payload) }),
  payment: (code: string, token: string, method: string, key: string) => request<PaymentResult>(`/orders/${encodeURIComponent(code)}/payment/request`, { method: "POST", headers: { "X-Order-Token": token, "Idempotency-Key": key }, body: JSON.stringify({ method }) }),
  login: (identifier: string, password: string) => request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }),
};
