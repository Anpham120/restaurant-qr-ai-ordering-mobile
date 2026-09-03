import { EN_COPY, translate } from "@cmc/i18n";
import { describe, expect, it } from "vitest";
import { labelGuestItemStatus } from "../utils/opsStatusLabels";

/*
  LỖI CÓ THẬT, tự gây ra. Lượt đồng bộ nhãn trạng thái món đổi bộ chữ tiếng Việt ("Sẵn sàng phục
  vụ" → "Món xong, đang mang ra bàn") mà không đổi bản tiếng Anh. Kể từ đó khách chọn English nhận
  lại NGUYÊN CÂU TIẾNG VIỆT trên cả hai màn của web.

  Không có gì đỏ lên, vì `i18nCoverage.test.ts` chỉ quét được `t(<chuỗi viết thẳng>)` trong mã. Năm
  câu này tới `t()` qua biến — `t(labelGuestItemStatus(item.status, order.status))` — nên chúng đi
  qua cửa mà cửa không thấy.

  Đây là cửa cho đúng lớp lọt đó: duyệt từ HÀM sinh nhãn, không từ mã nguồn.
*/
describe("nhãn trạng thái món của khách phải có bản tiếng Anh", () => {
  const TRANG_THAI = ["Pending", "Preparing", "Ready", "Served", "Cancelled"] as const;

  it("mọi nhãn đều có trong EN_COPY", () => {
    for (const status of TRANG_THAI) {
      const nhan = labelGuestItemStatus(status, "Preparing");
      expect(EN_COPY[nhan], `thiếu bản tiếng Anh cho "${nhan}"`).toBeTruthy();
    }
  });

  it("bản tiếng Anh KHÁC bản tiếng Việt — không phải chép nguyên sang cho qua cửa", () => {
    // Đối chứng. Thiếu ca này thì thêm `"Đã huỷ": "Đã huỷ"` vào từ điển vẫn xanh.
    for (const status of TRANG_THAI) {
      const nhan = labelGuestItemStatus(status, "Preparing");
      expect(translate("en", nhan)).not.toBe(nhan);
    }
  });

  it("câu tiến độ và câu dải báo dịch được cả tham số", () => {
    expect(translate("en", "Đã lên {daLen}/{tong} món", { daLen: 2, tong: 4 }))
      .toBe("2/4 dishes at your table");
    expect(translate("en", "{ten} đang được mang ra bàn bạn", { ten: "Pho" }))
      .toBe("Pho is on the way to your table");
  });
});
