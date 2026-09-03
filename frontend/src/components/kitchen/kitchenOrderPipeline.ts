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
        label: "Cả đơn đã nấu xong",
        detail: "Chuyển đơn sang chờ ra món",
        disabled: false,
      };
    }
    return {
      label: remaining === 1 ? "Nấu xong món cuối" : `Nấu xong ${remaining} món`,
      detail: `${progress.ready}/${progress.total} món đã xong`,
      disabled: false,
    };
  }

  if (column === "ready") {
    return {
      label: "Ra hết món",
      detail: "Cả đơn rời bếp",
      disabled: false,
    };
  }

  return { label: "Đã ra hết món", detail: "", disabled: true };
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
 * TỪ VỰNG CỦA BẾP — một trạng thái, một tên gọi, trên toàn màn hình.
 *
 * <p>Trước bản này màn bếp nói bốn thứ tiếng cho cùng một trạng thái, và cả bốn cùng hiện một lúc:
 * tiêu đề cột "Sẵn sàng", badge trong bảng "Xong, chờ đưa", nút "Đưa món đi", còn chip trên thẻ thì
 * KHÔNG nói gì — chỉ đổi màu. Người trực bếp phải tự dịch giữa chúng.
 *
 * <p>Bộ từ này lấy theo lời của người đứng bếp, không phải lời của quầy hay của khách. "Ra món" chứ
 * không "phục vụ": người ở bếp không phục vụ ai cả, họ đẩy món qua cửa ra. Và giữ như vậy thì chữ
 * của bếp không đụng chữ của khách ("Đã mang ra bàn") — hai việc khác nhau, hai người khác nhau.
 *
 * <p>Quy tắc: NÚT là động từ, TRẠNG THÁI là chỗ món đang đứng. Bấm "Nấu xong" thì món sang "Chờ ra
 * món"; bấm "Ra món" thì món sang "Đã ra món". Động từ trên nút luôn dẫn thẳng tới danh từ kế tiếp,
 * nên đọc nút là biết bấm xong sẽ thấy gì.
 */
const NHAN_MON_BEP: Record<string, string> = {
  Pending: "Chờ nấu",
  Preparing: "Đang nấu",
  Ready: "Chờ ra món",
  Served: "Đã ra món",
  Cancelled: "Đã huỷ",
};

/** Trạng thái ĐƠN, cũng bằng từ của bếp. `Placed` và `Confirmed` với bếp là một: chưa động vào. */
const NHAN_DON_BEP: Record<string, string> = {
  Draft: "Nháp",
  Placed: "Đơn mới",
  Confirmed: "Đơn mới",
  Preparing: "Đang nấu",
  Ready: "Chờ ra món",
  Served: "Đã ra món",
  Completed: "Xong, đã tính tiền",
  Cancelled: "Đã huỷ",
};

/** Khoá là trạng thái SẼ TỚI, để nút và bước đi không thể lệch nhau. */
const NHAN_NUT_MON: Partial<Record<OrderItemStatus, string>> = {
  Preparing: "Bắt đầu nấu",
  Ready: "Nấu xong",
  Served: "Ra món",
};

const NHAN_COT_BEP: Record<KitchenBoardColumn, string> = {
  confirmed: "Đơn mới",
  preparing: "Đang nấu",
  ready: "Chờ ra món",
  served: "Đã ra món",
};

/**
 * Chữ trên nút hành động của MỘT món.
 *
 * <p>Phải đi kèm {@link getItemTapAdvanceStatus}: mở rộng vòng đời mà quên hàm này thì nút hiện
 * RỖNG. Đã xảy ra thật khi thêm bước `Ready -> Served` — món đã xong hiện một nút không có chữ, và
 * người trực bếp không biết bấm vào thì chuyện gì xảy ra.
 *
 * <p>Trả chuỗi rỗng CHỈ khi món đã tới điểm cuối; nơi gọi không vẽ nút trong ca đó.
 */
export function itemActionLabel(current: OrderItemStatus): string {
  const next = getItemTapAdvanceStatus(current);
  return next ? (NHAN_NUT_MON[next] ?? "") : "";
}

/** Trạng thái MÓN bằng từ của bếp. Xem {@link NHAN_MON_BEP}. */
export function labelKitchenItemStatus(status: string): string {
  return NHAN_MON_BEP[status] ?? status;
}

/**
 * Trạng thái ĐƠN bằng từ của bếp.
 *
 * <p>Bảng chi tiết trước đây in thẳng giá trị enum — `Placed`, `Ready` bằng tiếng Anh giữa một màn
 * hình tiếng Việt. Không dùng `labelOrderStatus` của web được: bộ đó viết cho quầy và cho khách
 * ("Sẵn sàng", "Đã phục vụ"), đúng cột từ mà bản này đang gỡ khỏi màn bếp.
 */
export function labelKitchenOrderStatus(status: string): string {
  return NHAN_DON_BEP[status] ?? status;
}

/** Tiêu đề cột. Cùng nguồn với nhãn món, để cột và món trong cột không gọi khác tên nhau. */
export function labelKitchenColumn(column: KitchenBoardColumn): string {
  return NHAN_COT_BEP[column];
}

/**
 * Câu đọc được cho MỘT chip món trên thẻ.
 *
 * <p>Chip chỉ vẽ "2× Phở" và để MÀU nói trạng thái; chữ trạng thái nằm trong `title`, mà `title`
 * chỉ hiện khi rê chuột — màn bếp là màn chạm, không có chuột. Nên với trình đọc màn hình trạng
 * thái của chip trước đây không tồn tại.
 *
 * <p>Đây mới chỉ vá phần đọc được. Với người nhìn, chip vẫn phân biệt bằng màu là chính (Served có
 * thêm gạch ngang, các trạng thái khác thì không) — chưa đạt yêu cầu "đừng dùng riêng màu để truyền
 * tin", và cần một dấu hiệu về HÌNH ở lần sau.
 */
export function moTaChipMon(
  soLuong: number,
  ten: string,
  status: OrderItemStatus,
): string {
  const nut = itemActionLabel(status);
  const goc = `${soLuong}× ${ten} — ${labelKitchenItemStatus(status)}`;
  return nut ? `${goc}. Chạm để ${nut.toLowerCase()}` : goc;
}
