import { describe, expect, it } from "vitest";
import type { OrderRealtimeEvent } from "../../types/order";
import { locThanhToanTuDong, themThongBao } from "./opsCashierAlerts";

function suKienChot(
  tableSessionId: string,
  invoiceCode: string,
  tableCode: string,
  totalAmount: number,
): OrderRealtimeEvent {
  return {
    event: "tableInvoice.paymentConfirmed",
    payload: {
      // Chỉ khai những trường phép kiểm này đọc; phần còn lại của hoá đơn không liên quan.
      invoice: { tableSessionId, invoiceCode, tableCode, totalAmount } as never,
      paidAt: "2026-09-02T10:34:38Z",
    },
  } as OrderRealtimeEvent;
}

describe("thông báo cho thu ngân khi hoá đơn tự chốt", () => {
  it("báo bàn nào, bao nhiêu tiền", () => {
    // Người đứng quầy cần biết ĐÚNG hai thứ để hành động: bàn nào, và bao nhiêu. Thiếu mã bàn thì
    // thông báo vô dụng — họ không biết mang hoá đơn ra đâu.
    const tb = locThanhToanTuDong(suKienChot("ts_1", "INV-20260902-92852AB0", "T02", 35000), new Set());

    expect(tb).toEqual({
      invoiceCode: "INV-20260902-92852AB0",
      tableCode: "T02",
      totalAmount: 35000,
      paidAt: "2026-09-02T10:34:38Z",
    });
  });

  it("KHÔNG báo lại việc chính thu ngân vừa bấm tay", () => {
    // Máy chủ phát cùng một sự kiện cho cả hai đường chốt. Báo lại thao tác người ta vừa tự làm là
    // tiếng ồn, và tiếng ồn khiến họ thôi đọc thông báo — tức giết luôn cái đáng đọc.
    const tb = locThanhToanTuDong(
      suKienChot("ts_1", "INV-1", "T02", 35000),
      new Set(["ts_1"]),
    );

    expect(tb).toBeNull();
  });

  it("bỏ qua mọi sự kiện khác", () => {
    const khac = { event: "order.created", payload: {} } as unknown as OrderRealtimeEvent;

    expect(locThanhToanTuDong(khac, new Set())).toBeNull();
  });

  it("thân thiếu hoá đơn thì trả null, không nổ", () => {
    // Một sự kiện méo mó không được phép làm trắng màn hình của quầy đang đông khách.
    const meo = {
      event: "tableInvoice.paymentConfirmed",
      payload: { paidAt: "2026-09-02T10:34:38Z" },
    } as unknown as OrderRealtimeEvent;

    expect(locThanhToanTuDong(meo, new Set())).toBeNull();
  });
});

describe("danh sách thông báo", () => {
  const tb = (ma: string, ban: string) => ({
    invoiceCode: ma,
    tableCode: ban,
    totalAmount: 1000,
    paidAt: "2026-09-02T10:00:00Z",
  });

  it("cái mới nhất nằm trên", () => {
    const ds = themThongBao([tb("INV-1", "T01")], tb("INV-2", "T02"));

    expect(ds.map((t) => t.invoiceCode)).toEqual(["INV-2", "INV-1"]);
  });

  it("cùng một hoá đơn KHÔNG hiện hai dòng", () => {
    // Máy chủ phát lại sự kiện khi kết nối thời gian thực nối lại. Hai dòng y hệt khiến người đứng
    // quầy tưởng có hai bàn vừa trả tiền.
    const ds = themThongBao([tb("INV-1", "T01")], tb("INV-1", "T01"));

    expect(ds).toHaveLength(1);
  });

  it("không dài quá giới hạn", () => {
    // Một buổi tối đông khách không được đẩy nút bấm ra khỏi màn hình.
    let ds = [] as ReturnType<typeof tb>[];
    for (let i = 0; i < 12; i += 1) ds = themThongBao(ds, tb(`INV-${i}`, "T01"));

    expect(ds).toHaveLength(5);
    expect(ds[0].invoiceCode).toBe("INV-11");
  });
});
