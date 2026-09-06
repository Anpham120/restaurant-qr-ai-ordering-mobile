import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readStored, shopApi, writeStored } from "./api";
import { lineKey, unitPrice, type Catalog, type CartLine, type OrderType, type Product, type SavedOrder, type ShopConfig, type ShopOrder } from "./model";

type ShopContextValue = {
  catalog: Catalog | null; config: ShopConfig | null; loading: boolean; error: string; reload: () => void;
  cart: CartLine[]; add: (p: Product, ids: string[], quantity: number, note: string) => void;
  change: (key: string, n: number) => void; clear: () => void; subtotal: number; count: number;
  orderType: OrderType; setOrderType: (type: OrderType) => void;
  saved: SavedOrder[]; remember: (order: ShopOrder) => boolean;
};
const Context = createContext<ShopContextValue | null>(null);
function initialCart(): CartLine[] {
  const raw = readStored<unknown>("may.cart.v1", []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is CartLine => l && typeof l.key === "string" && typeof l.menuItemId === "string" && Number.isInteger(l.quantity) && l.quantity > 0 && l.quantity <= 99 && Array.isArray(l.optionIds) && l.optionIds.every((id: unknown) => typeof id === "string") && typeof l.note === "string");
}
export function ShopProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartLine[]>(initialCart);
  const [orderType, setOrderType] = useState<OrderType>("Delivery");
  const [saved, setSaved] = useState<SavedOrder[]>(() => { const raw = readStored<unknown>("may.orders.v1", []); return Array.isArray(raw) ? raw.filter(o => o && typeof o.orderCode === "string" && typeof o.token === "string") : []; });
  const reload = useCallback(() => {
    setLoading(true); setError("");
    Promise.all([shopApi.catalog(), shopApi.config()]).then(([menu, store]) => { setCatalog(menu); setConfig(store); }).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload]);
  useEffect(() => { writeStored("may.cart.v1", cart); }, [cart]);
  const add = (p: Product, ids: string[], quantity: number, note: string) => {
    const key = lineKey(p.id, ids, note);
    setCart(lines => { const existing = lines.find(l => l.key === key); return existing ? lines.map(l => l.key === key ? { ...l, quantity: Math.min(99, l.quantity + quantity) } : l) : [...lines, { key, menuItemId: p.id, optionIds: [...ids].sort(), quantity, note: note.trim() }]; });
  };
  const subtotal = useMemo(() => cart.reduce((sum, line) => { const p = catalog?.items.find(item => item.id === line.menuItemId); return sum + (p ? unitPrice(p, line.optionIds) * line.quantity : 0); }, 0), [cart, catalog]);
  const remember = (order: ShopOrder) => {
    if (!order.customerAccessToken) throw new Error("Đơn đã tạo nhưng thiếu mã truy cập. Vui lòng liên hệ quầy với mã " + order.orderCode);
    const next = [{ orderCode: order.orderCode, token: order.customerAccessToken, createdAt: order.createdAt }, ...saved.filter(o => o.orderCode !== order.orderCode)].slice(0, 50);
    setSaved(next); return writeStored("may.orders.v1", next);
  };
  return <Context.Provider value={{ catalog, config, loading, error, reload, cart, add, change: (key, quantity) => setCart(lines => quantity <= 0 ? lines.filter(l => l.key !== key) : lines.map(l => l.key === key ? { ...l, quantity: Math.min(99, quantity) } : l)), clear: () => setCart([]), subtotal, count: cart.reduce((sum, l) => sum + l.quantity, 0), orderType, setOrderType, saved, remember }}>{children}</Context.Provider>;
}
export function useShop() { const value = useContext(Context); if (!value) throw new Error("ShopProvider is required"); return value; }
