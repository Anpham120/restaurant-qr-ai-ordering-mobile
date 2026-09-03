import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import type { Order, OrderItemStatus } from "@cmc/shared-types";
import { CheckCircle2, Circle, Clock3, Flame, GripVertical, X } from "lucide-react";
import { updateOrderItemStatus, updateOrderStatus } from "../../services/orderService";
import {
  canDropKitchenOrder,
  getItemTapAdvanceStatus,
  itemActionLabel,
  labelKitchenItemStatus,
  getKitchenBoardAdvancePlan,
  getKitchenBoardColumn,
  getKitchenPrimaryAction,
  getKitchenPriority,
  getKitchenProgress,
  sortKitchenOrdersByPriority,
  type KitchenBoardColumn,
} from "./kitchenOrderPipeline";
import "../operations/operations.css";

/* ---------- helpers ---------- */
function timeAgo(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h${Math.floor((diff % 3600) / 60)}m`;
}

function formatVnd(v: number) {
  return v.toLocaleString("vi-VN") + "đ";
}

function statusBadgeClass(status: string): string {
  return `ops-badge ops-badge--${status.toLowerCase()}`;
}

/* ---------- types ---------- */
interface KitchenBoardProps {
  orders: Order[];
  onRefresh: () => void | Promise<void>;
}

function SmartKitchenActionButton({
  order,
  isPending,
  onMoveNext,
  compact = false,
}: {
  order: Order;
  isPending: boolean;
  onMoveNext: (order: Order) => void;
  compact?: boolean;
}) {
  const action = getKitchenPrimaryAction(order);
  const column = getKitchenBoardColumn(order.status);

  return (
    <button
      className={`ops-btn${column === "confirmed" ? " ops-btn--warning" : " ops-btn--primary"}${compact ? " ops-btn--sm" : ""}`}
      disabled={isPending || action.disabled}
      onClick={() => onMoveNext(order)}
      title={action.detail}
      type="button"
    >
      {column === "confirmed" ? <Flame aria-hidden="true" size={compact ? 14 : 16} /> : null}
      {column === "preparing" || column === "ready" ? <CheckCircle2 aria-hidden="true" size={compact ? 14 : 16} /> : null}
      {action.label}
    </button>
  );
}

/* ---------- Order Card ---------- */
function OrderCard({
  order,
  column,
  onOpenDetail,
  onMoveNext,
  onItemTap,
  onDragStart,
  onDragEnd,
  isPending,
  isDragging,
  pendingItemId,
}: {
  order: Order;
  column: KitchenBoardColumn;
  onOpenDetail: (order: Order) => void;
  onMoveNext: (order: Order) => void;
  onItemTap: (order: Order, itemId: string, nextStatus: OrderItemStatus) => void;
  onDragStart: (order: Order, event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  isPending: boolean;
  isDragging: boolean;
  pendingItemId: string | null;
}) {
  const [elapsed, setElapsed] = useState(timeAgo(order.createdAt));
  const touchStartX = useRef(0);
  const progress = getKitchenProgress(order);
  const priority = getKitchenPriority(order);
  const primaryAction = getKitchenPrimaryAction(order);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(timeAgo(order.createdAt)), 10_000);
    return () => clearInterval(timer);
  }, [order.createdAt]);

  const isDraggable = column !== "served" && !isPending;

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? 0;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (!isDraggable || primaryAction.disabled) return;
    const endX = event.changedTouches[0]?.clientX ?? 0;
    if (endX - touchStartX.current >= 72) {
      onMoveNext(order);
    }
  }

  return (
    <article
      className={`ops-card ops-card--${order.status.toLowerCase()} ops-card--priority-${priority}${isDragging ? " ops-card--dragging" : ""}`}
      draggable={isDraggable}
      onClick={() => onOpenDetail(order)}
      onDragEnd={onDragEnd}
      onDragStart={isDraggable ? (event) => onDragStart(order, event) : undefined}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      role="button"
      tabIndex={0}
      title={isDraggable ? "Chạm món để cập nhật · Vuốt phải hoặc kéo sang cột kế tiếp" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpenDetail(order);
        if (e.key === " " && !primaryAction.disabled) {
          e.preventDefault();
          onMoveNext(order);
        }
      }}
    >
      <div className="ops-card-header">
        <span className="ops-card-code">
          {isDraggable ? <GripVertical aria-hidden="true" className="ops-card-drag-handle" size={15} /> : null}
          {order.orderCode}
        </span>
        {order.tableCode ? (
          <span className="ops-card-table">Bàn {order.tableCode}</span>
        ) : null}
      </div>

      <div className="ops-card-meta">
        <span className={priority !== "normal" ? "ops-timer ops-timer--urgent" : "ops-timer ops-timer--normal"}>
          <Clock3 aria-hidden="true" size={14} /> {elapsed}
        </span>
        <span>{progress.ready}/{progress.total} món xong</span>
        <span>{formatVnd(order.totalAmount)}</span>
      </div>

      <div className="kitchen-progress" aria-hidden="true">
        <div className="kitchen-progress-bar" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="kitchen-progress-label">{primaryAction.detail}</p>

      <div className="ops-card-items">
        {order.items.map((item) => {
          if (item.status === "Cancelled") return null;
          const next = getItemTapAdvanceStatus(item.status);
          // TÁCH Ready khỏi Served. Gộp hai cái làm một là lý do món xong rồi vẫn trông y hệt món
          // đã đưa đi, và người trực bếp không biết còn phải bưng cái nào.
          const daXong = item.status === "Ready";
          const daDuaDi = item.status === "Served";
          const isItemPending = pendingItemId === item.orderItemId;
          return (
            <button
              key={item.orderItemId}
              type="button"
              className={
                daDuaDi
                  ? "ops-card-item-chip ops-card-item-chip--done kitchen-item-chip"
                  : daXong
                    ? "ops-card-item-chip ops-card-item-chip--ready kitchen-item-chip"
                    : item.status === "Preparing"
                      ? "ops-card-item-chip ops-card-item-chip--active kitchen-item-chip"
                      : "ops-card-item-chip kitchen-item-chip"
              }
              disabled={!next || isPending || isItemPending}
              onClick={(event) => {
                event.stopPropagation();
                if (next) onItemTap(order, item.orderItemId, next);
              }}
              title={
                next === "Preparing"
                  ? "Chạm để bắt đầu nấu"
                  : next === "Ready"
                    ? "Chạm khi món xong"
                    : next === "Served"
                      ? "Chạm khi đưa món đi"
                      : undefined
              }
            >
              {isItemPending ? "..." : `${item.quantity}× ${item.name}`}
            </button>
          );
        })}
      </div>

      {column !== "served" ? (
        <div className="ops-card-actions" onClick={(e) => e.stopPropagation()}>
          <SmartKitchenActionButton compact isPending={isPending} onMoveNext={onMoveNext} order={order} />
        </div>
      ) : null}
    </article>
  );
}

/* ---------- Order Detail Modal ---------- */
function OrderDetailModal({
  order,
  onClose,
  onItemAction,
  onMoveNext,
  isPending,
}: {
  order: Order;
  onClose: () => void;
  onItemAction: (order: Order, itemId: string, nextStatus: OrderItemStatus) => void;
  onMoveNext: (order: Order) => void;
  isPending: boolean;
}) {
  const column = getKitchenBoardColumn(order.status) ?? "confirmed";

  return (
    <div className="ops-modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="kitchen-order-title"
        aria-modal="true"
        className="ops-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="ops-modal-header">
          <div>
            <h2 id="kitchen-order-title">{order.orderCode}</h2>
            <div className="ops-card-meta" style={{ marginTop: 4 }}>
              <span className={statusBadgeClass(order.status)}>{order.status}</span>
              {order.tableCode ? <span>Bàn {order.tableCode}</span> : null}
              <span>{formatVnd(order.totalAmount)}</span>
            </div>
          </div>
          <button aria-label="Đóng" className="ops-modal-close" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </div>

        <div className="ops-modal-body">
          <div className="ops-item-list">
            {order.items.map((item) => {
              const next = getItemTapAdvanceStatus(item.status);
              return (
                <div className="ops-item-row" key={item.orderItemId}>
                  <div className="ops-item-info">
                    <div className="ops-item-name">
                      <span>{item.quantity}× {item.name}</span>
                      <span className={statusBadgeClass(item.status)}>{labelKitchenItemStatus(item.status)}</span>
                    </div>
                    <span className="ops-item-qty">{formatVnd(item.lineTotal)}</span>
                  </div>
                  <div className="ops-item-actions">
                    {next ? (
                      <button
                        className="ops-btn ops-btn--sm ops-btn--primary"
                        disabled={isPending}
                        onClick={() => onItemAction(order, item.orderItemId, next)}
                        type="button"
                      >
                        {itemActionLabel(item.status)}
                      </button>
                    ) : null}
                    {item.status === "Pending" || item.status === "Preparing" ? (
                      <button
                        className="ops-btn ops-btn--sm ops-btn--ghost"
                        disabled={isPending}
                        onClick={() => onItemAction(order, item.orderItemId, "Cancelled")}
                        type="button"
                      >
                        Hủy
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {column !== "served" ? (
          <div className="ops-modal-footer">
            <SmartKitchenActionButton isPending={isPending} onMoveNext={onMoveNext} order={order} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Column ---------- */
function KitchenColumn({
  title,
  icon,
  column,
  orders,
  onOpenDetail,
  onMoveNext,
  onItemTap,
  onCardDragStart,
  onCardDragEnd,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  pendingCode,
  pendingItemId,
  draggedOrderCode,
  isDropTarget,
}: {
  title: string;
  icon: ReactNode;
  column: KitchenBoardColumn;
  orders: Order[];
  onOpenDetail: (o: Order) => void;
  onMoveNext: (o: Order) => void;
  onItemTap: (order: Order, itemId: string, nextStatus: OrderItemStatus) => void;
  onCardDragStart: (order: Order, event: ReactDragEvent<HTMLElement>) => void;
  onCardDragEnd: () => void;
  onColumnDragOver: (column: KitchenBoardColumn, event: ReactDragEvent<HTMLDivElement>) => void;
  onColumnDragLeave: (column: KitchenBoardColumn, event: ReactDragEvent<HTMLDivElement>) => void;
  onColumnDrop: (column: KitchenBoardColumn, event: ReactDragEvent<HTMLDivElement>) => void;
  pendingCode: string | null;
  pendingItemId: string | null;
  draggedOrderCode: string | null;
  isDropTarget: boolean;
}) {
  return (
    <div
      className={`ops-column ops-column--${column}${isDropTarget ? " ops-column--drop-target" : ""}`}
      onDragLeave={(event) => onColumnDragLeave(column, event)}
      onDragOver={(event) => onColumnDragOver(column, event)}
      onDrop={(event) => onColumnDrop(column, event)}
    >
      <div className="ops-column-header">
        <h3>{icon} {title}</h3>
        <span className="ops-count">{orders.length}</span>
      </div>
      {isDropTarget ? <div className="ops-drop-hint">Thả vào đây để chuyển trạng thái</div> : null}
      <div className="ops-column-body">
        {orders.length === 0 ? (
          <div className="ops-column-empty">Không có đơn</div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              column={column}
              onOpenDetail={onOpenDetail}
              onMoveNext={onMoveNext}
              onItemTap={onItemTap}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              isPending={pendingCode === order.orderCode}
              isDragging={draggedOrderCode === order.orderCode}
              pendingItemId={pendingItemId}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Main Board ---------- */
export function KitchenBoard({ orders, onRefresh }: KitchenBoardProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [draggedOrderCode, setDraggedOrderCode] = useState<string | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<KitchenBoardColumn | null>(null);

  const confirmed = useMemo(
    () => sortKitchenOrdersByPriority(orders.filter((o) => getKitchenBoardColumn(o.status) === "confirmed")),
    [orders],
  );
  const preparing = useMemo(
    () => sortKitchenOrdersByPriority(orders.filter((o) => getKitchenBoardColumn(o.status) === "preparing")),
    [orders],
  );
  const ready = useMemo(
    () => sortKitchenOrdersByPriority(orders.filter((o) => getKitchenBoardColumn(o.status) === "ready")),
    [orders],
  );
  const served = useMemo(
    () => sortKitchenOrdersByPriority(orders.filter((o) => getKitchenBoardColumn(o.status) === "served")),
    [orders],
  );

  // Sync selected order with fresh data
  useEffect(() => {
    if (selectedOrder) {
      const fresh = orders.find((o) => o.orderCode === selectedOrder.orderCode);
      if (fresh) {
        setSelectedOrder(fresh);
      } else {
        setSelectedOrder(null);
      }
    }
  }, [orders]);

  const handleMoveNext = useCallback(async (order: Order) => {
    setPendingCode(order.orderCode);
    setNotice("");
    try {
      const plan = getKitchenBoardAdvancePlan(order.status);
      if (!plan) {
        return;
      }

      if (plan.kind === "order") {
        await updateOrderStatus(order.orderCode, plan.nextOrderStatus);
        setNotice(`${order.orderCode}: đã phục vụ`);
        return;
      }

      const eligibleItems = order.items.filter((item) =>
        plan.eligibleItemStatuses.some((status) => status === item.status),
      );

      // SONG SONG, không tuần tự. Bản trước dùng `for ... await`, nên một đơn 6 món là 6 lượt gọi
      // nối đuôi nhau — bếp bấm một nút rồi đứng nhìn. Thứ tự giữa các món không mang ý nghĩa gì
      // (mỗi món là một dòng độc lập), nên chờ lần lượt là chờ vô ích.
      //
      // `allSettled` chứ không `all`: với `all`, một món hỏng sẽ ném ngay trong khi những món khác
      // VẪN ĐANG CHẠY và phần lớn sẽ thành công — rồi giao diện báo "Cập nhật thất bại" cho một
      // thao tác đã làm được 5/6. Nói sai như thế khiến bếp bấm lại và làm rối trạng thái.
      const ketQua = await Promise.allSettled(
        eligibleItems.map((item) =>
          updateOrderItemStatus(order.orderCode, item.orderItemId, plan.nextItemStatus),
        ),
      );
      const hong = ketQua.filter((r) => r.status === "rejected").length;
      const xong = eligibleItems.length - hong;

      if (hong > 0) {
        setNotice(`${order.orderCode}: ${xong}/${eligibleItems.length} món cập nhật được, ${hong} món lỗi.`);
      } else if (plan.nextItemStatus === "Preparing") {
        setNotice(`${order.orderCode}: đã bắt đầu nấu ${xong} món`);
      } else {
        setNotice(`${order.orderCode}: ${xong} món đã sẵn sàng`);
      }
    } catch {
      setNotice("Cập nhật thất bại. Thử lại.");
    } finally {
      await onRefresh();
      setPendingCode(null);
    }
  }, [onRefresh]);

  const handleCardDragStart = useCallback((order: Order, event: ReactDragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", order.orderCode);
    setDraggedOrderCode(order.orderCode);
    setDropTargetColumn(null);
  }, []);

  const handleCardDragEnd = useCallback(() => {
    setDraggedOrderCode(null);
    setDropTargetColumn(null);
  }, []);

  const handleColumnDragOver = useCallback((
    column: KitchenBoardColumn,
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const draggedOrder = orders.find((order) => order.orderCode === draggedOrderCode);
    const isAllowed = Boolean(
      draggedOrder
      && draggedOrder.orderCode !== pendingCode
      && canDropKitchenOrder(draggedOrder.status, column),
    );
    event.dataTransfer.dropEffect = isAllowed ? "move" : "none";
    setDropTargetColumn(isAllowed ? column : null);
  }, [draggedOrderCode, orders, pendingCode]);

  const handleColumnDragLeave = useCallback((
    column: KitchenBoardColumn,
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDropTargetColumn((current) => current === column ? null : current);
  }, []);

  const handleColumnDrop = useCallback((
    column: KitchenBoardColumn,
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedOrder = orders.find((order) => order.orderCode === draggedOrderCode);
    setDraggedOrderCode(null);
    setDropTargetColumn(null);

    if (
      !draggedOrder
      || draggedOrder.orderCode === pendingCode
      || !canDropKitchenOrder(draggedOrder.status, column)
    ) {
      setNotice("Chỉ có thể chuyển thẻ sang cột trạng thái kế tiếp.");
      return;
    }

    void handleMoveNext(draggedOrder);
  }, [draggedOrderCode, handleMoveNext, orders, pendingCode]);

  const handleItemAction = useCallback(async (order: Order, itemId: string, nextStatus: OrderItemStatus) => {
    setPendingItemId(itemId);
    setPendingCode(order.orderCode);
    setNotice("");
    try {
      await updateOrderItemStatus(order.orderCode, itemId, nextStatus);
      const label = nextStatus === "Preparing" ? "đang nấu" : nextStatus === "Ready" ? "đã xong" : nextStatus;
      setNotice(`${order.orderCode}: 1 món ${label}`);
    } catch {
      setNotice("Cập nhật món thất bại.");
    } finally {
      await onRefresh();
      setPendingItemId(null);
      setPendingCode(null);
    }
  }, [onRefresh]);

  const kitchenDragHandlers = {
    onCardDragStart: handleCardDragStart,
    onCardDragEnd: handleCardDragEnd,
    onColumnDragOver: handleColumnDragOver,
    onColumnDragLeave: handleColumnDragLeave,
    onColumnDrop: handleColumnDrop,
    draggedOrderCode,
  };

  return (
    <>
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className="ops-board ops-board--kitchen">
        <KitchenColumn
          title="Đơn mới"
          icon={<Circle aria-hidden="true" fill="currentColor" size={12} />}
          column="confirmed"
          orders={confirmed}
          onOpenDetail={setSelectedOrder}
          onMoveNext={handleMoveNext}
          onItemTap={handleItemAction}
          {...kitchenDragHandlers}
          pendingCode={pendingCode}
          pendingItemId={pendingItemId}
          isDropTarget={dropTargetColumn === "confirmed"}
        />
        <KitchenColumn
          title="Đang nấu"
          icon={<Circle aria-hidden="true" fill="currentColor" size={12} />}
          column="preparing"
          orders={preparing}
          onOpenDetail={setSelectedOrder}
          onMoveNext={handleMoveNext}
          onItemTap={handleItemAction}
          {...kitchenDragHandlers}
          pendingCode={pendingCode}
          pendingItemId={pendingItemId}
          isDropTarget={dropTargetColumn === "preparing"}
        />
        <KitchenColumn
          title="Sẵn sàng"
          icon={<Circle aria-hidden="true" fill="currentColor" size={12} />}
          column="ready"
          orders={ready}
          onOpenDetail={setSelectedOrder}
          onMoveNext={handleMoveNext}
          onItemTap={handleItemAction}
          {...kitchenDragHandlers}
          pendingCode={pendingCode}
          pendingItemId={pendingItemId}
          isDropTarget={dropTargetColumn === "ready"}
        />
        <KitchenColumn
          title="Đã phục vụ"
          icon={<Circle aria-hidden="true" fill="currentColor" size={12} />}
          column="served"
          orders={served}
          onOpenDetail={setSelectedOrder}
          onMoveNext={handleMoveNext}
          onItemTap={handleItemAction}
          {...kitchenDragHandlers}
          pendingCode={pendingCode}
          pendingItemId={pendingItemId}
          isDropTarget={dropTargetColumn === "served"}
        />
      </div>

      {selectedOrder ? (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onItemAction={handleItemAction}
          onMoveNext={handleMoveNext}
          isPending={pendingCode === selectedOrder.orderCode || pendingItemId !== null}
        />
      ) : null}
    </>
  );
}
