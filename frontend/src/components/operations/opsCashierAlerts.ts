import type { OrderRealtimeEvent } from "../../types/order";

/** Một hoá đơn vừa tự chốt, đủ thông tin để người đứng quầy nhận ra ngay là bàn nào. */
export type ThongBaoDaThu = {
  invoiceCode: string;
  tableCode: string;
  totalAmount: number;
  paidAt: string;
};

/**
 * Lọc ra những lần thanh toán TỰ ĐỘNG đáng báo cho thu ngân.
 *
 * <p>Máy chủ phát cùng một sự kiện cho cả hai đường chốt hoá đơn: khách chuyển khoản rồi webhook
 * SePay tự xác nhận, và thu ngân bấm "Xác nhận thu" bằng tay. Chỉ đường thứ nhất đáng báo — báo
 * lại việc người ta vừa tự tay bấm là tiếng ồn, và tiếng ồn làm người ta thôi đọc thông báo, tức
 * giết luôn giá trị của cái đáng đọc.
 *
 * <p>Sự kiện KHÔNG mang thông tin ai chốt, nên không phân biệt được từ payload. Cách phân biệt là
 * ở phía trang: nó biết mình vừa bấm cho phiên nào và truyền vào {@code tuBam}.
 *
 * @param tuBam  mã phiên bàn mà CHÍNH trang này vừa xác nhận bằng tay
 * @return dữ liệu để hiện thông báo, hoặc {@code null} khi không có gì đáng báo
 */
export function locThanhToanTuDong(
  event: OrderRealtimeEvent,
  tuBam: ReadonlySet<string>,
): ThongBaoDaThu | null {
  if (event.event !== "tableInvoice.paymentConfirmed") return null;

  const invoice = event.payload?.invoice;
  if (!invoice) return null;
  if (tuBam.has(invoice.tableSessionId)) return null;

  return {
    invoiceCode: invoice.invoiceCode ?? "",
    tableCode: invoice.tableCode ?? "",
    totalAmount: invoice.totalAmount ?? 0,
    paidAt: event.payload.paidAt,
  };
}

/**
 * Thêm một thông báo vào đầu danh sách, bỏ trùng và cắt bớt.
 *
 * <p>Bỏ trùng theo mã hoá đơn vì một hoá đơn có thể được phát lại: máy chủ gửi lại sự kiện khi
 * kết nối thời gian thực nối lại, và hai dòng y hệt nhau trên màn hình khiến người đứng quầy tưởng
 * có hai bàn vừa trả tiền.
 *
 * <p>Cắt ở {@code toiDa} để một buổi tối đông khách không đẩy nút bấm ra khỏi màn hình. Cái mới
 * nhất luôn ở trên vì đó là bàn người ta cần nhìn.
 */
export function themThongBao(
  danhSach: readonly ThongBaoDaThu[],
  moi: ThongBaoDaThu,
  toiDa = 5,
): ThongBaoDaThu[] {
  return [moi, ...danhSach.filter((t) => t.invoiceCode !== moi.invoiceCode)].slice(0, toiDa);
}
