import { describe, expect, it } from "vitest";
import { labelGuestItemStatus, labelGuestOrderStatus, labelOrderStatus } from "./opsStatusLabels";

/**
 * Nhãn trạng thái món mà KHÁCH đọc.
 *
 * <p>Bộ chữ này phải KHỚP TỪNG CHỮ với `nhanTrangThaiMon` bên app
 * (`mobile-rn/src/core/orders/order.ts`), và bên đó có một phép kiểm y hệt.
 *
 * <p>Hai kho không dùng chung mã được, nên ghim chuỗi ở cả hai bên là cách duy nhất khiến việc
 * trôi khỏi nhau trở nên nhìn thấy được: sửa một bên mà quên bên kia thì phép kiểm bên đó đỏ.
 *
 * <p>Trước bản này hai bên đã trôi thật — cùng trạng thái `Ready`, app nói "Nấu xong", web nói
 * "Sẵn sàng phục vụ". Nhóm khách một người mở app một người quét web thấy hai câu khác nhau cho
 * cùng một món, và sẽ đi hỏi nhân viên xem cái nào đúng.
 */
describe("nhãn món cho khách", () => {
  it("nói theo việc đã xảy ra với món, không theo tên trạng thái hệ thống", () => {
    expect(labelGuestItemStatus("Pending", "Confirmed")).toBe("Đã gửi bếp, chờ tới lượt");
    expect(labelGuestItemStatus("Preparing", "Preparing")).toBe("Đang làm món của bạn");
    expect(labelGuestItemStatus("Ready", "Preparing")).toBe("Món xong, đang mang ra bàn");
    expect(labelGuestItemStatus("Served", "Served")).toBe("Đã mang ra bàn");
    expect(labelGuestItemStatus("Cancelled", "Preparing")).toBe("Đã huỷ");
  });

  it("KHÔNG còn phụ thuộc trạng thái đơn", () => {
    // Bản trước đổi nhãn `Pending` theo trạng thái đơn để vá câu "Chờ xác nhận" vốn sai khi bếp
    // đã nhận. Sửa thẳng câu gốc thì cái vá thành thừa — và một hàm cho hai kết quả khác nhau cho
    // cùng một món là thứ sẽ làm hai màn hình lệch nhau.
    for (const trangThaiDon of ["Placed", "Confirmed", "Preparing", "Ready", "Cancelled"]) {
      expect(labelGuestItemStatus("Pending", trangThaiDon)).toBe("Đã gửi bếp, chờ tới lượt");
    }
  });

  it("không nhãn nào rơi về chuỗi tiếng Anh", () => {
    // Đúng lớp lỗi đã xảy ra thật trong app: máy chủ chốt hoá đơn bằng `Confirmed`, app chỉ biết
    // `Paid`, và khách nhìn thấy nguyên chữ "Confirmed" giữa màn hình tiếng Việt.
    for (const s of ["Pending", "Preparing", "Ready", "Served", "Cancelled"]) {
      expect(labelGuestItemStatus(s, "Preparing")).not.toBe(s);
    }
  });

  it("trạng thái lạ trả nguyên văn, không nổ", () => {
    // Máy chủ thêm một trạng thái mới thì màn hình khách không được trắng. Hiện nguyên chuỗi là
    // xấu nhưng đọc được, và nó tự tố cáo chỗ còn thiếu.
    expect(labelGuestItemStatus("TrangThaiMoi", "Preparing")).toBe("TrangThaiMoi");
  });
});

/**
 * Nhãn trạng thái ĐƠN mà KHÁCH đọc. Cùng luật với nhãn món: khớp từng chữ với `nhanTrangThaiDon`
 * bên app, và bên đó có phép kiểm y hệt.
 */
describe("nhãn đơn cho khách", () => {
  it("khớp từng chữ với bản bên app", () => {
    expect(labelGuestOrderStatus("Placed")).toBe("Đã gửi bếp");
    expect(labelGuestOrderStatus("Confirmed")).toBe("Bếp đã nhận");
    expect(labelGuestOrderStatus("Preparing")).toBe("Đang nấu");
    expect(labelGuestOrderStatus("Ready")).toBe("Nấu xong, chờ mang ra");
    expect(labelGuestOrderStatus("Served")).toBe("Đã mang ra bàn");
    expect(labelGuestOrderStatus("Completed")).toBe("Đã thanh toán");
    expect(labelGuestOrderStatus("Cancelled")).toBe("Đã huỷ");
  });

  it("KHÔNG mượn chữ của quầy", () => {
    // "Sẵn sàng" và "Đã phục vụ" là ngôn ngữ của người vận hành. Màn theo dõi đơn của khách từng
    // dùng đúng hai chữ đó ở ba chỗ khác nhau trên cùng một trang.
    for (const s of ["Placed", "Confirmed", "Preparing", "Ready", "Served", "Completed"]) {
      expect(labelGuestOrderStatus(s)).not.toBe(labelOrderStatus(s));
    }
  });

  it("Ready nói rõ là CHỜ MANG RA, không phải xong bữa", () => {
    // Dịch thành "Hoàn tất" sẽ khiến khách tưởng có thể đứng dậy đi về.
    expect(labelGuestOrderStatus("Ready")).not.toContain("Hoàn tất");
    expect(labelGuestOrderStatus("Completed")).toBe("Đã thanh toán");
  });

  it("không nhãn nào rơi về chuỗi tiếng Anh", () => {
    for (const s of ["Draft", "Placed", "Confirmed", "Preparing", "Ready", "Served", "Completed", "Cancelled"]) {
      expect(labelGuestOrderStatus(s)).not.toBe(s);
    }
  });

  it("trạng thái lạ trả nguyên văn", () => {
    expect(labelGuestOrderStatus("TrangThaiMoi")).toBe("TrangThaiMoi");
  });
});