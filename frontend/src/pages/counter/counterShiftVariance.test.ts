import { describe, expect, it } from "vitest";
import { moTaLechQuy } from "./CounterShiftPanel";

describe("mô tả lệch quỹ khi chốt ca", () => {
  it("khớp thì nói khớp", () => {
    expect(moTaLechQuy(1_000_000, 1_000_000)).toBe("Khớp đúng số kỳ vọng.");
  });

  it("đếm được NHIỀU hơn kỳ vọng là THỪA", () => {
    expect(moTaLechQuy(1_050_000, 1_000_000)).toContain("THỪA");
    expect(moTaLechQuy(1_050_000, 1_000_000)).toContain("50.000đ");
  });

  it("đếm được ÍT hơn kỳ vọng là THIẾU", () => {
    // Chiều dấu là thứ dễ nhầm nhất ở đây, và nhầm chiều nghĩa là hộp thoại báo "thừa" trong khi
    // két đang thiếu — thu ngân thấy không có vấn đề gì nên bấm chốt.
    expect(moTaLechQuy(950_000, 1_000_000)).toContain("THIẾU");
    expect(moTaLechQuy(950_000, 1_000_000)).not.toContain("THỪA");
  });

  it("hiện TRỊ TUYỆT ĐỐI, không hiện dấu trừ", () => {
    // Một dấu trừ giữa câu rất dễ trôi qua mắt người vừa đếm xong két lúc cuối ca.
    expect(moTaLechQuy(950_000, 1_000_000)).not.toContain("-");
    expect(moTaLechQuy(950_000, 1_000_000)).toContain("50.000đ");
  });

  it("luôn nêu số kỳ vọng để đối chiếu", () => {
    expect(moTaLechQuy(950_000, 1_000_000)).toContain("1.000.000đ");
  });
});
