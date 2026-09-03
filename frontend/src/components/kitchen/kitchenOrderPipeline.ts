import type { Order, OrderItemStatus, OrderStatus } from "@cmc/shared-types";

export type KitchenBoardColumn = "confirmed" | "preparing" | "ready" | "served";
export type KitchenPriority = "urgent" | "warning" | "normal";

export type KitchenProgress = {
  ready: number;
  total: number;
  percent: number;
  cooking: number;
  pending: number;
};

export type KitchenPrimaryAction = {
  label: string;
  detail: string;
  disabled: boolean;
};

const kitchenBoardColumns: readonly KitchenBoardColumn[] = [
  "confirmed",
  "preparing",
  "ready",
  "served",
];

const URGENT_WAIT_MS = 20 * 60_000;
const WARNING_WAIT_MS = 12 * 60_000;

export function getActiveKitchenItems(order: Order) {
  return (order.items ?? []).filter((item) => item.status !== "Cancelled");
}

export function getKitchenWaitMs(order: Order, now = Date.now()) {
  return Math.max(0, now - new Date(order.createdAt).getTime());
}

export function getKitchenPriority(order: Order, now = Date.now()): KitchenPriority {
  const waitMs = getKitchenWaitMs(order, now);
  if (waitMs >= URGENT_WAIT_MS) return "urgent";
  if (waitMs >= WARNING_WAIT_MS) return "warning";
  return "normal";
}

export function getKitchenProgress(order: Order): KitchenProgress {
  const active = getActiveKitchenItems(order);
  const ready = active.filter((item) => item.status === "Ready" || item.status === "Served").length;
  const cooking = active.filter((item) => item.status === "Preparing").length;
  const pending = active.filter((item) => item.status === "Pending").length;
  const total = active.length;
  return {
    ready,
    total,
    percent: total > 0 ? Math.round((ready / total) * 100) : 0,
    cooking,
    pending,
  };
}

export function sortKitchenOrdersByPriority(orders: Order[], now = Date.now()): Order[] {
  const priorityWeight: Record<KitchenPriority, number> = { urgent: 3, warning: 2, normal: 1 };
  return [...orders].sort((left, right) => {
    const priorityDiff =
      priorityWeight[getKitchenPriority(right, now)] - priorityWeight[getKitchenPriority(left, now)];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

/**
 * Bước kế tiếp khi người trực bếp chạm vào MỘT món.
 *
 * <p>Một đơn nhiều món không bao giờ lên cùng lúc: bếp làm xong món nào đưa món đó, và phải gạch
 * được đúng món đó. Bản trước dừng ở {@code Ready}, nên bước "đã mang ra bàn" chỉ có ở cấp ĐƠN —
 * muốn đánh dấu một món đã lên thì phải đánh dấu cả 4-5 món cùng lúc.
 *
 * <p>Backend không hề chặn: {@code OrderItem.canTransitionTo} cho {@code Ready -> Served} từ đầu,
 * và còn cho nhảy cóc ({@code Pending -> Ready}) cho lúc bếp làm xong mà không kịp bấm "đang nấu".
 * Giao diện thì đi từng bước một, để mỗi lần chạm là một việc có thật ngoài đời.
 *
 * <p>{@code Served} nghĩa là "đã đưa món đi", và người bấm là BẾP — chạy bàn không cầm máy, họ
 * nhận lệnh qua bộ đàm. Lệch vài phút so với lúc món chạm mặt bàn, đổi lại người bấm đúng là
 * người đang cầm món.
 */
export function getItemTapAdvanceStatus(status: OrderItemStatus): OrderItemStatus | null {
  if (status === "Pending") return "Preparing";
  if (status === "Preparing") return "Ready";
  if (status === "Ready") return "Served";
  return null;
}

export function getKitchenPrimaryAction(order: Order): KitchenPrimaryAction {
  const column = getKitchenBoardColumn(order.status);
  const progress = getKitchenProgress(order);

  if (column === "confirmed") {
    if (progress.pending === 0) {
      return {
        label: "Tất cả đã vào bếp",
        detail: `${progress.cooking} món đang nấu`,
        disabled: progress.cooking === 0,
      };
    }
    return {
      label: progress.pending === progress.total ? "Bắt đầu nấu" : `Nấu ${progress.pending} món còn lại`,
      detail: `${progress.ready}/${progress.total} món đã xong`,
      disabled: false,
    };
  }

  if (column === "preparing") {
    const remaining = progress.total - progress.ready;
    if (remaining <= 0) {
      return {
        label: "Chuyển sẵn sàng",
        detail: "Tất cả món đã xong",
        disabled: false,
      };
    }
    return {
      label: remaining === 1 ? "Xong món cuối" : `Xong ${remaining} món còn lại`,
      detail: `${progress.ready}/${progress.total} món đã sẵn sàng`,
      disabled: false,
    };
  }

  if (column === "ready") {
    return {
      label: "Báo đã phục vụ",
      detail: "Gửi thông báo cho quầy / phục vụ",
      disabled: false,
    };
  }

  return { label: "Hoàn tất", detail: "", disabled: true };
}

export function getKitchenBoardColumn(status: OrderStatus): KitchenBoardColumn | null {
  if (status === "Placed" || status === "Confirmed") return "confirmed";
  if (status === "Preparing") return "preparing";
  if (status === "Ready") return "ready";
  if (status === "Served") return "served";
  return null;
}

export function isKitchenActiveOrderStatus(status: OrderStatus): boolean {
  return getKitchenBoardColumn(status) !== null;
}

export type KitchenBoardAdvancePlan =
  | {
      kind: "items";
      eligibleItemStatuses: readonly OrderItemStatus[];
      nextItemStatus: OrderItemStatus;
    }
  | {
      kind: "order";
      nextOrderStatus: OrderStatus;
    };

export function getKitchenBoardAdvancePlan(status: OrderStatus): KitchenBoardAdvancePlan | null {
  const column = getKitchenBoardColumn(status);
  if (column === "confirmed") {
    return {
      kind: "items",
      eligibleItemStatuses: ["Pending"],
      nextItemStatus: "Preparing",
    };
  }
  if (column === "preparing") {
    return {
      kind: "items",
      eligibleItemStatuses: ["Pending", "Preparing"],
      nextItemStatus: "Ready",
    };
  }
  if (column === "ready") {
    return { kind: "order", nextOrderStatus: "Served" };
  }
  return null;
}

export function getNextKitchenBoardColumn(status: OrderStatus): KitchenBoardColumn | null {
  const currentColumn = getKitchenBoardColumn(status);
  if (!currentColumn) return null;

  const currentIndex = kitchenBoardColumns.indexOf(currentColumn);
  return kitchenBoardColumns[currentIndex + 1] ?? null;
}

export function canDropKitchenOrder(
  status: OrderStatus,
  targetColumn: KitchenBoardColumn,
): boolean {
  return getNextKitchenBoardColumn(status) === targetColumn;
}

/**
 * Chữ trên nút hành động của MỘT món, ở bảng chi tiết đơn.
 *
 * <p>Phải đi kèm {@link getItemTapAdvanceStatus}: mở rộng vòng đời mà quên hàm này thì nút hiện
 * RỖNG. Đã xảy ra thật khi thêm bước `Ready -> Served` — món đã xong hiện một nút không có chữ,
 * và người trực bếp không biết bấm vào thì chuyện gì xảy ra.
 *
 * <p>Trả chuỗi rỗng CHỈ khi món đã tới điểm cuối; nơi gọi không vẽ nút trong ca đó.
 */
export function itemActionLabel(current: OrderItemStatus): string {
  const next = getItemTapAdvanceStatus(current);
  if (next === "Preparing") return "Bắt đầu nấu";
  if (next === "Ready") return "Xong món";
  if (next === "Served") return "Đưa món đi";
  return "";
}

/**
 * Nhãn trạng thái món cho NGƯỜI TRỰC BẾP — ngắn, nói về việc của bếp.
 *
 * <p>Khác hẳn nhãn cho khách (`labelGuestItemStatus`): khách cần "Đang làm món của bạn", bếp cần
 * "Đang nấu". Cùng một trạng thái, hai người, hai việc khác nhau — và một bảng bếp dùng câu viết
 * cho khách sẽ dài gấp ba lần chỗ nó có.
 *
 * <p>Trước bản này bảng chi tiết in thẳng giá trị enum: `Ready`, `Served` bằng tiếng Anh giữa một
 * màn hình tiếng Việt.
 */
export function labelKitchenItemStatus(status: string): string {
  if (status === "Pending") return "Chờ nấu";
  if (status === "Preparing") return "Đang nấu";
  if (status === "Ready") return "Xong, chờ đưa";
  if (status === "Served") return "Đã đưa đi";
  if (status === "Cancelled") return "Đã huỷ";
  return status;
}
