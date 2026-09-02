import { describe, expect, it } from "vitest";
import { docTienDua, thieuTien, tinhThoiLai } from "./opsCashTendered";

describe("tiền khách đưa ở quầy", () => {
  it("để trống KHÔNG phải là 0 đồng", () => {
    // Trả 0 ở đây làm máy chủ từ chối mọi hoá đơn mà người ta không buồn nhập gì — tức chặn đúng
    // đường thường gặp nhất: khách đưa đủ tiền.
    expect(docTienDua(undefined)).toBeUndefined();
    expect(docTienDua("")).toBeUndefined();
    expect(docTienDua("   ")).toBeUndefined();
    expect(docTienDua("0")).toBe(0);
  });

  it("tính đúng tiền thối", () => {
    expect(tinhThoiLai("50000", 35000)).toBe(15000);
    expect(tinhThoiLai("200000", 110000)).toBe(90000);
    expect(tinhThoiLai("35000", 35000)).toBe(0);
  });

  it("chưa nhập thì chưa có gì để thối", () => {
    expect(tinhThoiLai("", 35000)).toBeNull();
  });

  it("nhập thiếu thì không hiện một con số thối ÂM", () => {
    // Một dòng "thối lại -5.000đ" là thứ người đang vội sẽ đọc lướt qua thành 5.000.
    expect(tinhThoiLai("30000", 35000)).toBeNull();
  });

  it("nút bị tắt khi đang nhập thiếu, và CHỈ khi đó", () => {
    // Ca thứ hai mới là ca giữ cho tính năng dùng được: chưa nhập gì không phải là thiếu, vì đó
    // đúng là "khách đưa đúng tiền" — tắt nút ở đó là chặn đường thường gặp nhất.
    expect(thieuTien("30000", 35000)).toBe(true);
    expect(thieuTien("", 35000)).toBe(false);
    expect(thieuTien(undefined, 35000)).toBe(false);
    expect(thieuTien("35000", 35000)).toBe(false);
    expect(thieuTien("50000", 35000)).toBe(false);
  });

  it("thiếu đúng một đồng cũng là thiếu", () => {
    expect(thieuTien("34999", 35000)).toBe(true);
  });

  it("phần lẻ bị cắt, giống hệt luật của máy chủ", () => {
    // Hai bên phải nói CÙNG một điều. Lệch nhau nghĩa là quầy bấm được rồi máy chủ mới báo lỗi —
    // đúng cái nhầm lẫn mà tính năng này sinh ra để chặn.
    expect(thieuTien("35000", 34999.5)).toBe(false);
    expect(tinhThoiLai("35000.99", 35000)).toBe(0);
  });
});
