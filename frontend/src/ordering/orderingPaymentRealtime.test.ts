import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(`${root}/${relativePath}`, "utf8");
}

describe("table invoice payment realtime", () => {
  it("backend emits tableInvoice.paymentConfirmed on staff confirm", () => {
    // Đầu kia của bất biến chuyển từ .NET sang Java (#59). Vẫn là hai tệp: nơi PHÁT sự kiện, và
    // nơi ĐỊNH NGHĨA tên sự kiện — tách ra vì một tệp có tên mà không ai phát thì cũng vô dụng.
    const service = read(
      "../../backend-java/src/main/java/com/cmc/restaurant/tables/TableInvoicePaymentService.java",
    );
    expect(service).toContain("tableInvoicePaymentConfirmed");
    const contracts = read(
      "../../backend-java/src/main/java/com/cmc/restaurant/realtime/RealtimeDtos.java",
    );
    expect(contracts).toContain("tableInvoice.paymentConfirmed");
  });

  it("guest session orders page handles payment confirmed event", () => {
    const page = read("ordering/SessionOrdersPage.tsx");
    expect(page).toContain("tableInvoice.paymentConfirmed");
    expect(page).toContain("TableElectronicReceiptModal");
  });
});
