import { describe, expect, it } from "vitest";
import { moTaTreBep, sapHetHan } from "./kitchenDelayLabel";

describe("moTaTreBep", () => {
  it("chưa bật thì nói bình thường", () => {
    expect(moTaTreBep({ delayMinutes: 0, minutesLeft: 0, updatedBy: null })).toBe("Bếp bình thường");
  });

  it("chưa tải xong cũng nói bình thường, không để trống", () => {
    // Nút trống trong lúc chờ mạng trông như hỏng. Mặc định về trạng thái đúng trong đa số thời
    // gian còn hơn để người trực bếp nhìn một ô rỗng rồi bấm loạn.
    expect(moTaTreBep(null)).toBe("Bếp bình thường");
  });

  it("đang bật thì hiện cả số phút cộng thêm lẫn thời gian còn lại", () => {
    expect(moTaTreBep({ delayMinutes: 20, minutesLeft: 74, updatedBy: "Bếp trưởng" })).toBe(
      "Đang cộng +20 phút · còn 74 phút",
    );
  });

  it("hết hạn được backend trả về 0 nên hiện như chưa bật", () => {
    // Backend xét hết hạn lúc đọc và trả delayMinutes = 0. Frontend KHÔNG tự tính lại từ
    // minutesLeft — hai nơi cùng quyết định một chuyện thì sớm muộn chúng lệch nhau.
    expect(moTaTreBep({ delayMinutes: 0, minutesLeft: 0, updatedBy: "Bếp trưởng" })).toBe(
      "Bếp bình thường",
    );
  });
});

describe("sapHetHan", () => {
  it("còn nhiều thời gian thì không cảnh báo", () => {
    expect(sapHetHan({ delayMinutes: 20, minutesLeft: 74, updatedBy: null })).toBe(false);
  });

  it("còn đúng 15 phút thì đã cảnh báo", () => {
    expect(sapHetHan({ delayMinutes: 20, minutesLeft: 15, updatedBy: null })).toBe(true);
  });

  it("không cảnh báo khi cờ đang tắt, dù minutesLeft bằng 0", () => {
    // Ca dễ sai nhất: tắt thì minutesLeft cũng là 0, mà 0 <= 15. Thiếu vế delayMinutes > 0 thì
    // bảng bếp cảnh báo "sắp hết hạn" suốt cả ngày trong lúc chẳng có gì đang bật.
    expect(sapHetHan({ delayMinutes: 0, minutesLeft: 0, updatedBy: null })).toBe(false);
  });

  it("chưa tải xong thì không cảnh báo", () => {
    expect(sapHetHan(null)).toBe(false);
  });
});
