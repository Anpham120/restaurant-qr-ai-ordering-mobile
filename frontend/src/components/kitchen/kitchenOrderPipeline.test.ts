import { describe, expect, it } from "vitest";
import type { Order } from "@cmc/shared-types";
import {
  canDropKitchenOrder,
  getItemTapAdvanceStatus,
  getKitchenBoardAdvancePlan,
  getKitchenBoardColumn,
  getKitchenPrimaryAction,
  getKitchenPriority,
  getKitchenProgress,
  getNextKitchenBoardColumn,
  isKitchenActiveOrderStatus,
  sortKitchenOrdersByPriority,
} from "./kitchenOrderPipeline";

const sampleOrder = (code: string, createdAt: string, status: Order["status"]): Order => ({
  orderId: code,
  orderCode: code,
  tableCode: "T01",
  tableSessionId: null,
  status,
  paymentStatus: "Unpaid",
  paymentMethod: "COD",
  totalAmount: 100000,
  createdAt,
  updatedAt: createdAt,
  items: [
    {
      orderItemId: "i1",
      menuItemId: "m1",
      name: "Pho",
      quantity: 1,
      unitPrice: 50000,
      lineTotal: 50000,
      status: "Pending",
      updatedAt: createdAt,
    },
    {
      orderItemId: "i2",
      menuItemId: "m2",
      name: "Nuoc",
      quantity: 1,
      unitPrice: 50000,
      lineTotal: 50000,
      status: "Preparing",
      updatedAt: createdAt,
    },
  ],
});

describe("kitchen order pipeline", () => {
  it("shows newly placed orders in the new-order column", () => {
    expect(getKitchenBoardColumn("Placed")).toBe("confirmed");
    expect(getKitchenBoardColumn("Confirmed")).toBe("confirmed");
    expect(isKitchenActiveOrderStatus("Placed")).toBe(true);
  });

  it("keeps only active kitchen statuses on the board", () => {
    expect(getKitchenBoardColumn("Preparing")).toBe("preparing");
    expect(getKitchenBoardColumn("Ready")).toBe("ready");
    expect(getKitchenBoardColumn("Served")).toBe("served");
    expect(isKitchenActiveOrderStatus("Served")).toBe(true);
    expect(getKitchenBoardColumn("Completed")).toBeNull();
    expect(getKitchenBoardColumn("Cancelled")).toBeNull();
  });

  it("advances each card exactly one lane at a time", () => {
    expect(getKitchenBoardAdvancePlan("Placed")).toEqual({
      kind: "items",
      eligibleItemStatuses: ["Pending"],
      nextItemStatus: "Preparing",
    });
    expect(getKitchenBoardAdvancePlan("Preparing")).toEqual({
      kind: "items",
      eligibleItemStatuses: ["Pending", "Preparing"],
      nextItemStatus: "Ready",
    });
    expect(getKitchenBoardAdvancePlan("Ready")).toEqual({
      kind: "order",
      nextOrderStatus: "Served",
    });
    expect(getKitchenBoardAdvancePlan("Served")).toBeNull();
  });

  it("accepts drag/drop only into the immediate next lane", () => {
    expect(getNextKitchenBoardColumn("Placed")).toBe("preparing");
    expect(getNextKitchenBoardColumn("Preparing")).toBe("ready");
    expect(getNextKitchenBoardColumn("Ready")).toBe("served");
    expect(getNextKitchenBoardColumn("Served")).toBeNull();

    expect(canDropKitchenOrder("Placed", "preparing")).toBe(true);
    expect(canDropKitchenOrder("Preparing", "ready")).toBe(true);
    expect(canDropKitchenOrder("Ready", "served")).toBe(true);
    expect(canDropKitchenOrder("Placed", "ready")).toBe(false);
    expect(canDropKitchenOrder("Preparing", "confirmed")).toBe(false);
    expect(canDropKitchenOrder("Served", "ready")).toBe(false);
  });

  it("prioritizes urgent and older orders first", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const sorted = sortKitchenOrdersByPriority([
      sampleOrder("NEW", "2026-01-01T11:50:00.000Z", "Placed"),
      sampleOrder("OLD", "2026-01-01T11:20:00.000Z", "Placed"),
      sampleOrder("MID", "2026-01-01T11:35:00.000Z", "Placed"),
    ], now);
    expect(sorted.map((order) => order.orderCode)).toEqual(["OLD", "MID", "NEW"]);
    expect(getKitchenPriority(sampleOrder("OLD", "2026-01-01T11:20:00.000Z", "Placed"), now)).toBe("urgent");
  });

  it("derives progress and smart action labels", () => {
    const order = sampleOrder("O1", "2026-01-01T12:00:00.000Z", "Placed");
    expect(getKitchenProgress(order)).toEqual({
      ready: 0,
      total: 2,
      percent: 0,
      cooking: 1,
      pending: 1,
    });
    expect(getItemTapAdvanceStatus("Pending")).toBe("Preparing");
    expect(getKitchenPrimaryAction(order).label).toContain("Nấu 1 món");
  });
});

describe("chạm từng món đi hết vòng đời", () => {
  it("Ready còn đi tiếp được sang Served", () => {
    // NGHIỆP VỤ: một đơn nhiều món KHÔNG bao giờ lên cùng lúc. Bếp làm xong món nào đưa món đó,
    // và phải gạch được đúng món đó.
    //
    // Bản trước dừng ở `Ready` rồi trả `null`, nên bước "đã mang ra bàn" CHỈ có ở cấp đơn — muốn
    // đánh dấu một món đã lên thì phải đánh dấu cả 4-5 món cùng lúc. Backend không hề chặn:
    // `OrderItem.canTransitionTo` cho `Ready -> Served` từ đầu. Đây thuần là đường cụt ở giao diện.
    expect(getItemTapAdvanceStatus("Ready")).toBe("Served");
  });

  it("đi đúng thứ tự, không nhảy cóc ở giao diện", () => {
    expect(getItemTapAdvanceStatus("Pending")).toBe("Preparing");
    expect(getItemTapAdvanceStatus("Preparing")).toBe("Ready");
  });

  it("Served và Cancelled là điểm cuối — chạm nữa không làm gì", () => {
    // Đối chứng. Thiếu ca này thì một hàm luôn trả bước kế tiếp vẫn xanh, và người trực bếp chạm
    // nhầm vào món đã xong sẽ đẩy nó tới một trạng thái không tồn tại.
    expect(getItemTapAdvanceStatus("Served")).toBeNull();
    expect(getItemTapAdvanceStatus("Cancelled")).toBeNull();
  });
});
