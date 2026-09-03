import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

/*
  Hai màn của khách phải nói cùng một câu về cùng một con số.

  Ước lượng từng món CHỈ có ở màn danh sách. Khách bấm vào một đơn để xem KỸ HƠN thì lại mất thông
  tin — màn chi tiết im lặng về đúng thứ họ vào đó để hỏi.
*/
describe("cả hai màn khách đều dùng chung một cách nói về ước lượng", () => {
  const doc = (duongDan: string) =>
    readFileSync(fileURLToPath(new URL(duongDan, import.meta.url)), "utf8");

  it("màn chi tiết cũng vẽ ước lượng, và lấy từ đúng nguồn dùng chung", () => {
    const chiTiet = doc("../pages/customer/orders/OrderTrackingPage.tsx");
    expect(chiTiet).toContain('from "../../../ordering/uocLuongLenMon"');
    expect(chiTiet).toContain("item.estimatedReadyMinutesLow");
    expect(chiTiet).toContain("moTaBepDong(");
  });

  it("không màn nào tự ghép chuỗi phút riêng", () => {
    // Đối chứng. Một màn tự viết `${low}-${high} phút` sẽ trông giống nhau hôm nay rồi trôi khỏi
    // nhau ở ca suy biến (low >= high), nơi hàm chung nói "khoảng N phút" còn chuỗi tự ghép nói
    // "24-24 phút" — đọc như một lỗi hiển thị.
    for (const duongDan of [
      "./SessionOrdersPage.tsx",
      "../pages/customer/orders/OrderTrackingPage.tsx",
    ]) {
      expect(doc(duongDan)).not.toMatch(/\$\{[^}]*[Ll]ow[^}]*\}[–-]\$\{/);
    }
  });
});
