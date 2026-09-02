import { describe, expect, it } from "vitest";
import { moTaBepDong, moTaUocLuong } from "./uocLuongLenMon";

describe("ước lượng thời gian lên món", () => {
  it("hiện khoảng thời gian máy chủ trả về", () => {
    // Con số thật đo trên máy chủ đang chạy cho một món Pending.
    expect(moTaUocLuong(24, 41)).toBe("24–41 phút");
  });

  it("hai số bằng nhau thì nói một con số", () => {
    // "24–24 phút" đọc như một lỗi hiển thị.
    expect(moTaUocLuong(24, 24)).toBe("khoảng 24 phút");
    expect(moTaUocLuong(30, 20)).toBe("khoảng 30 phút");
  });

  it("món không còn chờ thì không hiện gì", () => {
    // Máy chủ trả null khi món đã Ready/Served. Hiện "0 phút" ở đó là nói sai.
    expect(moTaUocLuong(null, null)).toBeNull();
    expect(moTaUocLuong(undefined, undefined)).toBeNull();
    expect(moTaUocLuong(24, null)).toBeNull();
    expect(moTaUocLuong(null, 41)).toBeNull();
  });

  it("chỉ nói bếp đông khi CÓ kèm con số", () => {
    // Báo "bếp đang đông" mà không kèm ước lượng nào là gieo lo lắng mà không cho khách thứ gì để
    // quyết định — họ không biết nên chờ hay đổi món.
    expect(moTaBepDong(true, "24–41 phút")).toBe("Bếp đang đông nên món lâu hơn thường ngày.");
    expect(moTaBepDong(true, null)).toBeNull();
    expect(moTaBepDong(false, "24–41 phút")).toBeNull();
    expect(moTaBepDong(undefined, "24–41 phút")).toBeNull();
  });
});
