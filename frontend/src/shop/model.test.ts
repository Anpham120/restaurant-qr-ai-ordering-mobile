import { describe, expect, it } from "vitest";
import { lineKey, orderLabel, selectionError, unitPrice, type Product, type ShopOrder } from "./model";

const product: Product = { id: "matcha", name: "Matcha", price: 45000, description: "", categoryId: "tea", categoryName: "Trà", imageUrl: null, isAvailable: true, tags: [], optionGroups: [
  { id: "size", name: "Kích cỡ", minSelections: 1, maxSelections: 1, options: [{ id: "m", name: "M", price: 0, isAvailable: true }, { id: "l", name: "L", price: 10000, isAvailable: true }] },
  { id: "topping", name: "Topping", minSelections: 0, maxSelections: 1, options: [{ id: "pearl", name: "Trân châu", price: 5000, isAvailable: true }, { id: "cheese", name: "Cheese", price: 10000, isAvailable: false }] },
] };
describe("Mây cart and order presentation", () => {
  it("prices each selected supplement once", () => expect(unitPrice(product, ["l", "pearl"])).toBe(60000));
  it("requires size and rejects extra sizes", () => { expect(selectionError(product, [])).toContain("Kích cỡ"); expect(selectionError(product, ["m", "l"])).toContain("Kích cỡ"); });
  it("rejects unavailable or removed choices", () => { expect(selectionError(product, ["m", "cheese"])).not.toBeNull(); expect(selectionError(product, ["m", "unknown"])).not.toBeNull(); });
  it("allows optional topping omission", () => expect(selectionError(product, ["m"])).toBeNull());
  it("merges equivalent selections but preserves different notes and size", () => {
    expect(lineKey("matcha", ["l", "pearl"], " ít ngọt ")).toBe(lineKey("matcha", ["pearl", "l"], "ít ngọt"));
    expect(lineKey("matcha", ["m"], "")).not.toBe(lineKey("matcha", ["l"], ""));
    expect(lineKey("matcha", ["m"], "riêng đá")).not.toBe(lineKey("matcha", ["m"], ""));
  });
  it("uses actual Confirmed payment enum and delivery progress", () => {
    const order = { orderType: "Delivery", paymentStatus: "Confirmed", paymentMethod: "VietQR", status: "Preparing" } as ShopOrder;
    expect(orderLabel(order)).toBe("Đang chuẩn bị");
    expect(orderLabel({ ...order, fulfillmentStatus: "OutForDelivery" })).toBe("Đang giao đến bạn");
    expect(orderLabel({ ...order, status: "Cancelled", fulfillmentStatus: "Assigned" })).toBe("Đã hủy");
  });
  it("does not mistake a pending COD request for counter acceptance", () => {
    const order = { orderType: "Delivery", paymentStatus: "Pending", paymentMethod: "COD", status: "Placed" } as ShopOrder;
    expect(orderLabel(order)).toBe("Chờ quán tiếp nhận");
    expect(orderLabel({ ...order, codAccepted: true })).toBe("Chờ chuẩn bị");
  });
});
