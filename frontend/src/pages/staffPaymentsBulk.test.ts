import { describe, expect, it } from "vitest";
import type { TableInvoice } from "@cmc/shared-types";
import { locCoTheThuHangLoat } from "./StaffPaymentsPage";

function hoaDon(over: Partial<TableInvoice>): TableInvoice {
  return {
    tableSessionId: "ts_1", invoiceCode: "INV-1", tableCode: "T01", status: "Pending",
    subtotalAmount: 100_000, discountAmount: 0, totalAmount: 100_000, promotionCode: null,
    customerPhoneNumber: null, method: "COD", orderRounds: [], items: [], vietQr: null,
    ...over,
  };
}

describe("hoá đơn nào được xác nhận hàng loạt", () => {
  it("nhận tiền mặt đang chờ thu", () => {
    expect(locCoTheThuHangLoat([hoaDon({ method: "COD", status: "Pending" })])).toHaveLength(1);
  });

  it("LOẠI VietQR kể cả khi đang chờ thu", () => {
    // Hàng rào chính. VietQR được đối soát tự động qua webhook Casso; bấm "đã thu" cho nó là khẳng
    // định tiền đã về trong khi chưa ai kiểm.
    expect(locCoTheThuHangLoat([hoaDon({ method: "VietQR", status: "Pending" })])).toHaveLength(0);
  });

  it("loại hoá đơn không ở trạng thái chờ thu", () => {
    for (const status of ["Confirmed", "Paid", "NotRequested", "Cancelled"] as const) {
      expect(locCoTheThuHangLoat([hoaDon({ method: "COD", status })]), status).toHaveLength(0);
    }
  });

  it("lọc đúng trong danh sách trộn lẫn", () => {
    const ket = locCoTheThuHangLoat([
      hoaDon({ tableSessionId: "a", method: "COD", status: "Pending" }),
      hoaDon({ tableSessionId: "b", method: "VietQR", status: "Pending" }),
      hoaDon({ tableSessionId: "c", method: "COD", status: "Confirmed" }),
      hoaDon({ tableSessionId: "d", method: "COD", status: "Pending" }),
    ]);
    expect(ket.map((i) => i.tableSessionId)).toEqual(["a", "d"]);
  });
});
