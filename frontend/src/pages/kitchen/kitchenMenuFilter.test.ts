import { describe, expect, it } from "vitest";
import { locMonTheoTen } from "./kitchenMenuFilter";

// THỨ TỰ VÀ TÌNH TRẠNG CỦA FIXTURE NÀY CÓ CHỦ Ý — đừng "dọn cho gọn".
//
// Trong các món khớp "sả", món CÒN HÀNG (id 2) phải đứng TRƯỚC món ĐÃ HẾT (id 4). Nếu xếp ngược
// lại, phép kiểm thứ tự ổn định bên dưới không bao giờ đỏ được: đẩy món hết lên đầu sẽ cho ra
// đúng thứ tự cũ, và cổng chặn trở thành đồ trang trí.
const MENU = [
  { id: "1", name: "Phở bò tái", isAvailable: true },
  { id: "2", name: "Đậu hũ chiên sả", isAvailable: true },
  { id: "3", name: "Cơm gà xối mỡ", isAvailable: false },
  { id: "4", name: "Trà đào cam sả", isAvailable: false },
];

describe("locMonTheoTen", () => {
  it("gõ KHÔNG DẤU vẫn tìm ra món có dấu", () => {
    // Bàn phím máy bếp thường không có bộ gõ tiếng Việt. Nếu ca này hỏng thì ô tìm kiếm vô dụng
    // đúng vào giờ nó cần chạy.
    expect(locMonTheoTen(MENU, "pho").map((m) => m.id)).toEqual(["1"]);
  });

  it("tìm được chữ 'đ' — NFD không tách được ký tự này", () => {
    // Đây là ca duy nhất bắt được việc quên dòng .replace(/đ/gi, "d").
    expect(locMonTheoTen(MENU, "dau hu").map((m) => m.id)).toEqual(["2"]);
  });

  it("GIỮ NGUYÊN thứ tự đầu vào, không đẩy món hết lên trước", () => {
    // Nếu xếp lại theo tình trạng, bấm tắt một món sẽ khiến nó nhảy chỗ và cú bấm kế tiếp trúng
    // nhầm món. Ca này là phép chặn cho việc đó.
    expect(locMonTheoTen(MENU, "sả").map((m) => m.id)).toEqual(["2", "4"]);
  });

  it("từ khoá rỗng hoặc chỉ khoảng trắng trả về cả danh sách", () => {
    expect(locMonTheoTen(MENU, "")).toHaveLength(4);
    expect(locMonTheoTen(MENU, "   ")).toHaveLength(4);
  });

  it("không khớp thì trả mảng rỗng, không trả cả danh sách", () => {
    // Trả nguyên danh sách khi gõ sai trông "thân thiện" nhưng khiến bếp tưởng đã lọc xong rồi
    // bấm nhầm dòng đầu tiên.
    expect(locMonTheoTen(MENU, "bit tet")).toEqual([]);
  });

  it("khớp cả khi gõ CÓ DẤU và khác hoa thường", () => {
    expect(locMonTheoTen(MENU, "PHỞ").map((m) => m.id)).toEqual(["1"]);
  });
});
