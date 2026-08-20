import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Order } from "@cmc/shared-types";
import type { OrderRealtimeEvent } from "../../types";
import {
  mergeOrderItemStatusChanged,
  mergeOrderStatusChanged,
} from "../../components/operations/opsRealtimeMerge";
import { KitchenBoard } from "../../components/kitchen/KitchenBoard";
import {
  getKitchenBoardColumn,
  getKitchenPriority,
  isKitchenActiveOrderStatus,
} from "../../components/kitchen/kitchenOrderPipeline";
import { OpsConnectionBadge } from "../../components/operations/OpsConnectionBadge";
import { useOpsRealtime } from "../../hooks/useOpsRealtime";
import { getKitchenOrders } from "../../services/orderService";
import { fetchKitchenMenuItems, toggleMenuItemAvailability } from "../../services/adminMenuService";
import { locMonTheoTen } from "./kitchenMenuFilter";
import { ChefHat, RefreshCw, UtensilsCrossed } from "lucide-react";
import "../../components/operations/operations.css";

type MenuItemSummary = { id: string; name: string; isAvailable: boolean };

export function KitchenRealtimePage() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMenuPanel, setShowMenuPanel] = useState(searchParams.get("menu") === "1");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [timMon, setTimMon] = useState("");

  // Filter orders relevant to kitchen
  const kitchenOrders = useMemo(
    () => orders.filter((o) => isKitchenActiveOrderStatus(o.status)),
    [orders],
  );

  const stats = useMemo(() => {
    const confirmed = kitchenOrders.filter(
      (o) => getKitchenBoardColumn(o.status) === "confirmed",
    ).length;
    const preparing = kitchenOrders.filter((o) => o.status === "Preparing").length;
    const ready = kitchenOrders.filter((o) => o.status === "Ready").length;
    const served = kitchenOrders.filter((o) => o.status === "Served").length;
    const urgent = kitchenOrders.filter((o) => getKitchenPriority(o) === "urgent").length;
    const totalItems = kitchenOrders.reduce(
      (sum, o) => sum + o.items.filter((i) => i.status !== "Cancelled").length,
      0,
    );
    return [
      { label: "Đơn chờ nấu", value: String(confirmed), detail: "Confirmed" },
      { label: "Đang nấu", value: String(preparing), detail: "Đơn đang chế biến" },
      { label: "Sẵn sàng", value: String(ready), detail: "Chờ mang ra" },
      { label: "Đã phục vụ", value: String(served), detail: "Đã giao tại bàn" },
      { label: "Cần gấp", value: String(urgent), detail: "Chờ > 20 phút" },
      { label: "Tổng món", value: String(totalItems), detail: "Trong pipeline" },
    ];
  }, [kitchenOrders]);

  const monHienThi = useMemo(() => locMonTheoTen(menuItems, timMon), [menuItems, timMon]);

  const unavailableCount = useMemo(
    () => menuItems.filter((m) => !m.isAvailable).length,
    [menuItems],
  );

  // Load data
  const loadOrders = useCallback(async () => {
    try {
      const data = await getKitchenOrders();
      setOrders(data as unknown as Order[]);
    } catch {
      setError("Không tải được đơn hàng.");
    }
  }, []);

  const loadMenu = useCallback(async () => {
    try {
      // Role Kitchen không có quyền /admin/menu-items (403) nên dùng endpoint
      // /kitchen/menu-items riêng (bao gồm cả món đang tắt để mở lại được).
      const items = await fetchKitchenMenuItems();
      setMenuItems(
        items.map((i) => ({
          id: i.id,
          name: i.name,
          isAvailable: i.isAvailable,
        })),
      );
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    Promise.all([loadOrders(), loadMenu()]).finally(() => setIsLoading(false));
  }, [loadOrders, loadMenu]);

  const { connectionStatus } = useOpsRealtime({
    refresh: loadOrders,
    pollIntervalMs: 5_000,
    onEvent: (event: OrderRealtimeEvent) => {
      try {
        if (event.event === "order.statusChanged") {
          setOrders((current) => mergeOrderStatusChanged(current, event.payload));
          return;
        }
        if (event.event === "order.itemStatusChanged") {
          setOrders((current) => mergeOrderItemStatusChanged(current, event.payload));
        }
      } catch (error) {
        // Gộp sự kiện thất bại thì tải lại cả danh sách — bảng bếp thà chậm một nhịp còn hơn hiện
        // trạng thái sai. Vẫn ghi log: nếu chuyện này xảy ra liên tục thì tải lại chỉ là băng dán,
        // và không ai biết nếu nó im lặng.
        console.error("Không gộp được sự kiện realtime vào bảng bếp:", event.event, error);
        void loadOrders();
      }
    },
  });

  // Toggle dish availability
  async function handleToggleAvailability(itemId: string, currentlyAvailable: boolean) {
    setTogglingId(itemId);
    try {
      await toggleMenuItemAvailability(itemId, !currentlyAvailable);
      setMenuItems((prev) =>
        prev.map((m) => (m.id === itemId ? { ...m, isAvailable: !currentlyAvailable } : m)),
      );
    } catch {
      setError("Không thể cập nhật trạng thái món.");
    } finally {
      setTogglingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="ops-empty">
        <div className="ops-empty-icon"><ChefHat aria-hidden="true" /></div>
        Đang tải bảng bếp...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="ops-page-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1>Bảng Bếp</h1>
            <p>Theo dõi và cập nhật trạng thái đơn hàng realtime</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <OpsConnectionBadge status={connectionStatus} />
            <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={loadOrders} type="button">
              <RefreshCw aria-hidden="true" size={14} /> Làm mới
            </button>
            <button
              className="ops-btn ops-btn--ghost ops-btn--sm"
              onClick={() => {
                const moRa = !showMenuPanel;
                setShowMenuPanel(moRa);
                // Xoá từ khoá mỗi lần đóng/mở. Mở lại mà còn dính bộ lọc cũ thì danh sách trông
                // như bị mất món, và người trực ca sẽ báo là "hệ thống mất dữ liệu".
                setTimMon("");
                if (moRa) loadMenu();
              }}
              type="button"
            >
              <UtensilsCrossed aria-hidden="true" size={14} /> Tắt/Mở món {unavailableCount > 0 ? `(${unavailableCount} hết)` : ""}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}

      {/* Stats */}
      <div className="ops-stats">
        {stats.map((s) => (
          <div className="ops-stat-card" key={s.label}>
            <div className="ops-stat-label">{s.label}</div>
            <div className="ops-stat-value">{s.value}</div>
            <div className="ops-stat-detail">{s.detail}</div>
          </div>
        ))}
      </div>

      {/* Toggle menu panel */}
      {showMenuPanel ? (
        <div style={{ marginBottom: 20, padding: 16, background: "var(--color-bg-subtle)", borderRadius: 12, maxHeight: 300, overflowY: "auto" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Quản lý tình trạng món</h3>
          <input
            className="ops-form-input"
            style={{ marginBottom: 12 }}
            autoFocus
            type="search"
            value={timMon}
            onChange={(event) => setTimMon(event.target.value)}
            onKeyDown={(event) => {
              // Esc xoá từ khoá thay vì đóng cả panel: bếp gõ nhầm thì muốn gõ lại, không muốn
              // panel biến mất rồi phải bấm mở lần nữa.
              if (event.key === "Escape") {
                event.preventDefault();
                setTimMon("");
              }
            }}
            placeholder="Tìm món — gõ không dấu cũng được (pho, dau hu)"
            aria-label="Tìm món theo tên"
          />
          {monHienThi.length === 0 ? (
            <p className="ops-stat-detail" style={{ margin: 0 }}>
              Không có món nào khớp “{timMon}”. Nhấn Esc để xoá ô tìm.
            </p>
          ) : null}
          {monHienThi.map((item) => (
            <div className="ops-toggle-row" key={item.id}>
              <span className="ops-toggle-label">
                {item.name}
                {!item.isAvailable ? <span className="ops-badge ops-badge--cancelled" style={{ marginLeft: 8 }}>Hết</span> : null}
              </span>
              <button
                className={`ops-toggle-switch ${item.isAvailable ? "ops-toggle-switch--on" : ""}`}
                disabled={togglingId === item.id}
                onClick={() => handleToggleAvailability(item.id, item.isAvailable)}
                type="button"
                aria-label={`${item.isAvailable ? "Tắt" : "Mở"} ${item.name}`}
              />
            </div>
          ))}
        </div>
      ) : null}

      {/* Board */}
      <KitchenBoard orders={kitchenOrders} onRefresh={loadOrders} />
    </div>
  );
}
