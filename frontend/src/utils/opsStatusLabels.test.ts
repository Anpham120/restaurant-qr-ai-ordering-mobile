import { describe, expect, it } from "vitest";
import {
  labelGuestItemStatus,
  labelOrderStatus,
  labelPaymentChip,
} from "./opsStatusLabels";

describe("opsStatusLabels", () => {
  it("localizes order and payment chips", () => {
    expect(labelOrderStatus("Placed")).toBe("Đã gửi");
    expect(labelPaymentChip("Unselected", "NotRequested")).toBe("Chưa chọn · Chưa yêu cầu thu");
  });

  it("nhãn món KHÔNG còn đổi theo trạng thái đơn", () => {
    // Ca này trước đây chốt hai nhãn khác nhau cho cùng một món `Pending`: "Chờ xác nhận" khi đơn
    // mới gửi, "Chờ chế biến" sau khi bếp nhận. Đó là bản VÁ cho một câu gốc sai — không có gì để
    // khách xác nhận cả, đơn đã gửi bếp rồi.
    //
    // Sửa thẳng câu gốc thành "Đã gửi bếp, chờ tới lượt" thì cái vá thành thừa: một câu đúng cho
    // cả `Placed` lẫn `Confirmed`. Và một hàm cho hai kết quả khác nhau cho cùng một món là thứ
    // sẽ làm hai màn hình lệch nhau.
    //
    // Bộ chữ đầy đủ được ghim ở `guestStatusLabels.test.ts`, cùng với bản sinh đôi bên app.
    expect(labelGuestItemStatus("Pending", "Placed")).toBe("Đã gửi bếp, chờ tới lượt");
    expect(labelGuestItemStatus("Pending", "Confirmed")).toBe("Đã gửi bếp, chờ tới lượt");
    expect(labelGuestItemStatus("Preparing", "Confirmed")).toBe("Đang làm món của bạn");
  });
});
