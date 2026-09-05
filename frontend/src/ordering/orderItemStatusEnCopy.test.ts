import { EN_COPY, translate } from "@cmc/i18n";
import { describe, expect, it } from "vitest";
import { labelGuestItemStatus, labelGuestOrderStatus } from "../utils/opsStatusLabels";
import { moTaBepDong } from "./uocLuongLenMon";

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

describe("nhãn trạng thái ĐƠN của khách cũng phải có bản tiếng Anh", () => {
  // Cùng lớp lọt: `t(labelGuestOrderStatus(order.status))` là gọi qua biến, cửa phủ ngôn ngữ
  // không thấy. Màn theo dõi đơn dùng bộ này ở ba chỗ — ô đầu trang, badge, và tiêu đề từng bước.
  const TRANG_THAI = ["Draft", "Placed", "Confirmed", "Preparing", "Ready", "Served", "Completed", "Cancelled"] as const;

  it("mọi nhãn đều có trong EN_COPY", () => {
    for (const status of TRANG_THAI) {
      const nhan = labelGuestOrderStatus(status);
      expect(EN_COPY[nhan], `thiếu bản tiếng Anh cho "${nhan}"`).toBeTruthy();
    }
  });

  it("bản tiếng Anh KHÁC bản tiếng Việt", () => {
    for (const status of TRANG_THAI) {
      const nhan = labelGuestOrderStatus(status);
      expect(translate("en", nhan)).not.toBe(nhan);
    }
  });
});

describe("câu mô tả từng bước tiến trình cũng phải có bản tiếng Anh", () => {
  // Bốn câu này tới `t` qua `getTimelineCopy(status)` — cũng qua biến.
  const CAU = [
    "Đơn đã tới bếp.",
    "Bếp đang làm các món.",
    "Món đã xong, đang được mang ra.",
    "Bếp đã đưa hết món ra bàn.",
  ];

  it("đủ bốn câu, và bản tiếng Anh khác bản tiếng Việt", () => {
    for (const cau of CAU) {
      expect(EN_COPY[cau], `thiếu bản tiếng Anh cho "${cau}"`).toBeTruthy();
      expect(translate("en", cau)).not.toBe(cau);
    }
  });
});
describe("câu ước lượng và câu bếp đông cũng phải có bản tiếng Anh", () => {
  // `moTaBepDong` sinh câu rồi màn danh sách đưa thẳng vào `t()` qua biến. Cửa phủ ngôn ngữ không
  // thấy, nên câu đó nói tiếng Việt với khách chọn English suốt từ khi có tính năng — chỉ lộ ra khi
  // màn chi tiết viết cùng câu ấy bằng chuỗi nguyên văn và cửa mới đỏ.
  it("câu bếp đông dịch được", () => {
    const cau = moTaBepDong(true, "15–25 phút");
    expect(cau).not.toBeNull();
    expect(EN_COPY[cau as string], `thiếu bản tiếng Anh cho "${cau}"`).toBeTruthy();
    expect(translate("en", cau as string)).not.toBe(cau);
  });

  it("câu dự kiến dịch được cả tham số", () => {
    expect(translate("en", "Dự kiến {khoang}", { khoang: "15–25 phút" }))
      .toBe("Expected in 15–25 phút");
  });
});
