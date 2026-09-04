import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("ordering experience", () => {
  it("keeps the selected cart summary visible while browsing the menu", () => {
    const menu = read("./OrderingMenuPage.tsx");
    const styles = read("../components/customer/customer-menu.css");

    expect(menu).toContain("ordering-cart-dock");
    expect(menu).toContain("summary.count");
    expect(menu).toContain("summary.total");
    expect(styles).toContain("position: fixed");
  });

  it("keeps promotion and loyalty out of an order round", () => {
    const cart = read("../pages/customer/CustomerCartPage.tsx");

    expect(cart).not.toContain('aria-label="Mã khuyến mãi"');
    expect(cart).not.toContain('aria-label="Số điện thoại tích điểm"');
    expect(cart).toContain("promotionCode: null");
    expect(cart).toContain("customerPhoneNumber: null");
    expect(cart).toContain("Gửi món tới bếp");
  });

  it("shows the current cart separately from the full table session total", () => {
    const cart = read("../pages/customer/CustomerCartPage.tsx");

    expect(cart).toContain("getTableInvoice");
    expect(cart).toContain("Đã gọi trong phiên");
    expect(cart).toContain("Đang chọn thêm");
    expect(cart).toContain("Tổng sau khi gửi");
    expect(cart).toContain("summary.projectedTotal");
  });

  it("exposes call-staff from the ordering shell", () => {
    const orderingLayout = read("./OrderingLayout.tsx");
    const orderService = read("../services/orderService.ts");

    expect(orderingLayout).toContain("OrderingCallStaffFab");
    expect(orderService).toContain("requestTableAssistance");
  });
});
